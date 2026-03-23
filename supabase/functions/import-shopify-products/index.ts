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

    // Get connection with ownership check
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(id, user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return new Response(JSON.stringify({ error: 'Missing store credentials' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });
    if (decryptError || !decryptedToken) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const clientId = clientData.id;

    // Fetch ALL products from Shopify with pagination
    let allProducts: any[] = [];
    let sinceId: string | null = null;
    let page = 0;

    while (true) {
      const params = new URLSearchParams({
        limit: '250',
        status: 'active',
      });
      if (sinceId) params.set('since_id', sinceId);

      const url = `https://${cleanStoreUrl}/admin/api/2025-01/products.json?${params}`;
      console.log(`[import-shopify] Page ${++page}, since_id=${sinceId || 'none'}`);

      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': decryptedToken, 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[import-shopify] API error:', res.status, errorText);
        break;
      }

      const { products } = await res.json();
      if (!products || products.length === 0) break;

      allProducts = allProducts.concat(products);
      sinceId = products[products.length - 1].id.toString();

      if (products.length < 250) break;
    }

    console.log(`[import-shopify] Total fetched: ${allProducts.length} products`);

    // Fetch costs for all variants
    const allVariants = allProducts.flatMap((p: any) => p.variants || []);
    const inventoryItemIds = allVariants.map((v: any) => v.inventory_item_id).filter(Boolean);
    const costMap = new Map<number, number | null>();

    for (let i = 0; i < inventoryItemIds.length; i += 100) {
      const batchIds = inventoryItemIds.slice(i, i + 100).join(',');
      const invRes = await fetch(
        `https://${cleanStoreUrl}/admin/api/2025-01/inventory_items.json?ids=${batchIds}`,
        { headers: { 'X-Shopify-Access-Token': decryptedToken, 'Content-Type': 'application/json' } }
      );
      if (invRes.ok) {
        const { inventory_items } = await invRes.json();
        for (const item of (inventory_items || [])) {
          costMap.set(item.id, item.cost ? Math.round(parseFloat(item.cost)) : null);
        }
      }
    }

    // Import to DB
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const product of allProducts) {
      try {
        const variants = product.variants || [];
        const cheapestVariant = variants.reduce((min: any, v: any) =>
          parseFloat(v.price) < parseFloat(min.price) ? v : min, variants[0]);

        const images = (product.images || []).map((img: any) => ({
          src: img.src,
          alt: img.alt || '',
          position: img.position,
        }));

        const tags = product.tags
          ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

        // Upsert product (match by client_id + sku using shopify product id)
        const productSku = `shopify-${product.id}`;
        const { data: upsertedProduct, error: prodError } = await supabase
          .from('products')
          .upsert({
            client_id: clientId,
            sku: productSku,
            name: product.title,
            brand: product.vendor || null,
            category: product.product_type || null,
            description: product.body_html || null,
            images,
            cost_price: costMap.get(cheapestVariant?.inventory_item_id) || 0,
            base_price: Math.round(parseFloat(cheapestVariant?.price || '0')),
            status: product.status || 'active',
            tags,
            metadata: { shopify_product_id: product.id.toString(), handle: product.handle },
          }, { onConflict: 'client_id,sku' })
          .select('id')
          .single();

        if (prodError) {
          // If unique conflict on upsert, try finding existing
          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('client_id', clientId)
            .eq('sku', productSku)
            .single();

          if (!existing) {
            errors.push(`Product ${product.title}: ${prodError.message}`);
            continue;
          }

          // Update existing
          await supabase
            .from('products')
            .update({
              name: product.title,
              brand: product.vendor || null,
              category: product.product_type || null,
              description: product.body_html || null,
              images,
              cost_price: costMap.get(cheapestVariant?.inventory_item_id) || 0,
              base_price: Math.round(parseFloat(cheapestVariant?.price || '0')),
              status: product.status || 'active',
              tags,
              metadata: { shopify_product_id: product.id.toString(), handle: product.handle },
            })
            .eq('id', existing.id);

          const productId = existing.id;

          // Upsert variants for existing product
          for (const variant of variants) {
            const variantSku = variant.sku || `shopify-${product.id}-${variant.id}`;
            const attributes: Record<string, string> = {};
            if (variant.option1) attributes['option1'] = variant.option1;
            if (variant.option2) attributes['option2'] = variant.option2;
            if (variant.option3) attributes['option3'] = variant.option3;

            const { data: upsertedVariant } = await supabase
              .from('product_variants')
              .upsert({
                product_id: productId,
                sku: variantSku,
                title: variant.title !== 'Default Title' ? variant.title : null,
                attributes,
                price: Math.round(parseFloat(variant.price || '0')),
                cost_price: costMap.get(variant.inventory_item_id) || 0,
                stock: variant.inventory_quantity ?? 0,
                barcode: variant.barcode || null,
                weight_kg: variant.weight ? variant.weight / 1000 : null,
                is_default: variants.length === 1,
              }, { onConflict: 'product_id,sku', ignoreDuplicates: false })
              .select('id')
              .single();

            if (upsertedVariant) {
              await supabase
                .from('product_platform_listings')
                .upsert({
                  variant_id: upsertedVariant.id,
                  platform: 'shopify',
                  platform_item_id: variant.id.toString(),
                  platform_sku: variant.sku || null,
                  platform_price: Math.round(parseFloat(variant.price || '0')),
                  platform_stock: variant.inventory_quantity ?? 0,
                  sync_status: 'synced',
                  is_published: product.status === 'active',
                  last_synced_at: new Date().toISOString(),
                  metadata: { inventory_item_id: variant.inventory_item_id },
                }, { onConflict: 'variant_id,platform' });
            }
          }

          updated++;
          continue;
        }

        const productId = upsertedProduct!.id;

        // Insert variants
        for (const variant of variants) {
          const variantSku = variant.sku || `shopify-${product.id}-${variant.id}`;
          const attributes: Record<string, string> = {};
          if (variant.option1) attributes['option1'] = variant.option1;
          if (variant.option2) attributes['option2'] = variant.option2;
          if (variant.option3) attributes['option3'] = variant.option3;

          const { data: upsertedVariant } = await supabase
            .from('product_variants')
            .upsert({
              product_id: productId,
              sku: variantSku,
              title: variant.title !== 'Default Title' ? variant.title : null,
              attributes,
              price: Math.round(parseFloat(variant.price || '0')),
              cost_price: costMap.get(variant.inventory_item_id) || 0,
              stock: variant.inventory_quantity ?? 0,
              barcode: variant.barcode || null,
              weight_kg: variant.weight ? variant.weight / 1000 : null,
              is_default: variants.length === 1,
            }, { onConflict: 'product_id,sku', ignoreDuplicates: false })
            .select('id')
            .single();

          if (upsertedVariant) {
            await supabase
              .from('product_platform_listings')
              .upsert({
                variant_id: upsertedVariant.id,
                platform: 'shopify',
                platform_item_id: variant.id.toString(),
                platform_sku: variant.sku || null,
                platform_price: Math.round(parseFloat(variant.price || '0')),
                platform_stock: variant.inventory_quantity ?? 0,
                sync_status: 'synced',
                is_published: product.status === 'active',
                last_synced_at: new Date().toISOString(),
                metadata: { inventory_item_id: variant.inventory_item_id },
              }, { onConflict: 'variant_id,platform' });
          }
        }

        imported++;
      } catch (err: any) {
        errors.push(`Product ${product.title}: ${err.message}`);
      }
    }

    console.log(`[import-shopify] Done: imported=${imported}, updated=${updated}, errors=${errors.length}`);

    return new Response(
      JSON.stringify({ imported, updated, total: allProducts.length, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[import-shopify] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
