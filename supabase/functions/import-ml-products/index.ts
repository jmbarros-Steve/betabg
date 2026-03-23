import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { connectionId } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get ML connection with ownership check
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(id, user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'mercadolibre')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'ML connection not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientData = connection.clients as { id: string; user_id: string; client_user_id: string | null };

    // Check super admin or ownership
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get ML access token
    const { access_token_encrypted, account_id } = connection;
    if (!access_token_encrypted) {
      return new Response(JSON.stringify({ error: 'Missing ML credentials' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: mlToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });
    if (decryptError || !mlToken) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientId = clientData.id;
    const mlUserId = account_id;

    if (!mlUserId) {
      return new Response(JSON.stringify({ error: 'ML account_id not configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch all ML items with pagination
    let allItems: any[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const searchUrl = `https://api.mercadolibre.com/users/${mlUserId}/items/search?offset=${offset}&limit=${limit}`;
      console.log(`[import-ml] Fetching items offset=${offset}`);

      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${mlToken}` },
      });

      if (!searchRes.ok) {
        console.error('[import-ml] Search failed:', searchRes.status);
        break;
      }

      const searchData = await searchRes.json();
      const itemIds = searchData.results || [];

      if (itemIds.length === 0) break;

      // Multiget items (up to 20 at a time)
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const multigetUrl = `https://api.mercadolibre.com/items?ids=${batch.join(',')}&attributes=id,title,price,available_quantity,sold_quantity,condition,category_id,pictures,attributes,variations,status,permalink,seller_custom_field`;

        const itemsRes = await fetch(multigetUrl, {
          headers: { Authorization: `Bearer ${mlToken}` },
        });

        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          for (const wrapper of itemsData) {
            if (wrapper.code === 200 && wrapper.body) {
              allItems.push(wrapper.body);
            }
          }
        }
      }

      offset += limit;
      if (offset >= (searchData.paging?.total || 0)) break;
    }

    console.log(`[import-ml] Total fetched: ${allItems.length} items`);

    // Import to DB
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const item of allItems) {
      try {
        const images = (item.pictures || []).map((pic: any, idx: number) => ({
          src: pic.secure_url || pic.url,
          alt: '',
          position: idx,
        }));

        const brand = (item.attributes || []).find((a: any) => a.id === 'BRAND')?.value_name || null;

        // If item has variations, each variation becomes a variant
        const hasVariations = item.variations && item.variations.length > 0;
        const productSku = `ml-${item.id}`;

        // Fetch description separately
        let description = '';
        try {
          const descRes = await fetch(`https://api.mercadolibre.com/items/${item.id}/description`, {
            headers: { Authorization: `Bearer ${mlToken}` },
          });
          if (descRes.ok) {
            const descData = await descRes.json();
            description = descData.plain_text || descData.text || '';
          }
        } catch { /* ignore */ }

        // Upsert product
        const { data: existingProduct } = await supabase
          .from('products')
          .select('id')
          .eq('client_id', clientId)
          .eq('sku', productSku)
          .maybeSingle();

        let productId: string;

        if (existingProduct) {
          await supabase
            .from('products')
            .update({
              name: item.title,
              brand,
              category: item.category_id || null,
              description,
              images,
              base_price: Math.round(item.price || 0),
              status: item.status === 'active' ? 'active' : 'paused',
              metadata: { ml_item_id: item.id, permalink: item.permalink, condition: item.condition },
            })
            .eq('id', existingProduct.id);

          productId = existingProduct.id;
          updated++;
        } else {
          const { data: newProduct, error: prodError } = await supabase
            .from('products')
            .insert({
              client_id: clientId,
              sku: productSku,
              name: item.title,
              brand,
              category: item.category_id || null,
              description,
              images,
              base_price: Math.round(item.price || 0),
              status: item.status === 'active' ? 'active' : 'paused',
              metadata: { ml_item_id: item.id, permalink: item.permalink, condition: item.condition },
            })
            .select('id')
            .single();

          if (prodError || !newProduct) {
            errors.push(`Item ${item.title}: ${prodError?.message || 'insert failed'}`);
            continue;
          }
          productId = newProduct.id;
          imported++;
        }

        // Handle variants
        if (hasVariations) {
          for (const variation of item.variations) {
            const variantSku = variation.seller_custom_field || `ml-${item.id}-${variation.id}`;
            const attributes: Record<string, string> = {};
            for (const combo of (variation.attribute_combinations || [])) {
              attributes[combo.id] = combo.value_name;
            }

            const { data: upsertedVariant } = await supabase
              .from('product_variants')
              .upsert({
                product_id: productId,
                sku: variantSku,
                title: Object.values(attributes).join(' / ') || null,
                attributes,
                price: Math.round(variation.price || item.price || 0),
                stock: variation.available_quantity ?? 0,
                is_default: false,
              }, { onConflict: 'product_id,sku' })
              .select('id')
              .single();

            if (upsertedVariant) {
              await supabase
                .from('product_platform_listings')
                .upsert({
                  variant_id: upsertedVariant.id,
                  platform: 'mercadolibre',
                  platform_item_id: item.id,
                  platform_sku: variantSku,
                  platform_price: Math.round(variation.price || item.price || 0),
                  platform_stock: variation.available_quantity ?? 0,
                  platform_url: item.permalink || null,
                  sync_status: 'synced',
                  is_published: item.status === 'active',
                  last_synced_at: new Date().toISOString(),
                  metadata: { variation_id: variation.id },
                }, { onConflict: 'variant_id,platform' });
            }
          }
        } else {
          // Single variant (no variations)
          const variantSku = item.seller_custom_field || `ml-${item.id}-default`;

          const { data: upsertedVariant } = await supabase
            .from('product_variants')
            .upsert({
              product_id: productId,
              sku: variantSku,
              title: null,
              attributes: {},
              price: Math.round(item.price || 0),
              stock: item.available_quantity ?? 0,
              is_default: true,
            }, { onConflict: 'product_id,sku' })
            .select('id')
            .single();

          if (upsertedVariant) {
            await supabase
              .from('product_platform_listings')
              .upsert({
                variant_id: upsertedVariant.id,
                platform: 'mercadolibre',
                platform_item_id: item.id,
                platform_sku: variantSku,
                platform_price: Math.round(item.price || 0),
                platform_stock: item.available_quantity ?? 0,
                platform_url: item.permalink || null,
                sync_status: 'synced',
                is_published: item.status === 'active',
                last_synced_at: new Date().toISOString(),
              }, { onConflict: 'variant_id,platform' });
          }
        }
      } catch (err: any) {
        errors.push(`Item ${item.title}: ${err.message}`);
      }
    }

    console.log(`[import-ml] Done: imported=${imported}, updated=${updated}, errors=${errors.length}`);

    return new Response(
      JSON.stringify({ imported, updated, total: allItems.length, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[import-ml] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
