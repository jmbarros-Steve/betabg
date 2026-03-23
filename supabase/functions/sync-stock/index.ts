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

    const { variantId, newStock, sourcePlatform } = await req.json();
    if (!variantId || newStock == null) {
      return new Response(JSON.stringify({ error: 'variantId and newStock required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get variant with product and all listings
    const { data: variant, error: varError } = await supabase
      .from('product_variants')
      .select(`
        *,
        products!inner(client_id),
        product_platform_listings(*)
      `)
      .eq('id', variantId)
      .single();

    if (varError || !variant) {
      return new Response(JSON.stringify({ error: 'Variant not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientId = (variant.products as any).client_id;

    // Verify ownership
    const { data: client } = await supabase
      .from('clients')
      .select('user_id, client_user_id')
      .eq('id', clientId)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && client.user_id !== user.id && client.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update local variant stock
    await supabase
      .from('product_variants')
      .update({ stock: newStock })
      .eq('id', variantId);

    const listings = variant.product_platform_listings || [];
    const results: any[] = [];

    for (const listing of listings) {
      // Skip the source platform (the one that triggered the sync)
      if (listing.platform === sourcePlatform) {
        // Just update the local listing record
        await supabase
          .from('product_platform_listings')
          .update({ platform_stock: newStock, last_synced_at: new Date().toISOString() })
          .eq('id', listing.id);
        results.push({ platform: listing.platform, status: 'source', skipped: true });
        continue;
      }

      try {
        if (listing.platform === 'mercadolibre' && listing.platform_item_id) {
          // Get ML connection
          const { data: mlConn } = await supabase
            .from('platform_connections')
            .select('access_token_encrypted')
            .eq('client_id', clientId)
            .eq('platform', 'mercadolibre')
            .eq('is_active', true)
            .limit(1)
            .single();

          if (mlConn?.access_token_encrypted) {
            const { data: mlToken } = await supabase
              .rpc('decrypt_platform_token', { encrypted_token: mlConn.access_token_encrypted });

            if (mlToken) {
              const res = await fetch(`https://api.mercadolibre.com/items/${listing.platform_item_id}`, {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${mlToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ available_quantity: newStock }),
              });

              const ok = res.ok;
              await supabase
                .from('product_platform_listings')
                .update({
                  platform_stock: newStock,
                  sync_status: ok ? 'synced' : 'error',
                  last_synced_at: new Date().toISOString(),
                })
                .eq('id', listing.id);

              results.push({ platform: 'mercadolibre', status: ok ? 'synced' : 'error' });
            }
          }
        }

        if (listing.platform === 'shopify' && listing.platform_item_id) {
          // Get Shopify connection
          const { data: shopifyConn } = await supabase
            .from('platform_connections')
            .select('store_url, access_token_encrypted')
            .eq('client_id', clientId)
            .eq('platform', 'shopify')
            .eq('is_active', true)
            .limit(1)
            .single();

          if (shopifyConn?.access_token_encrypted && shopifyConn?.store_url) {
            const { data: shopifyToken } = await supabase
              .rpc('decrypt_platform_token', { encrypted_token: shopifyConn.access_token_encrypted });

            if (shopifyToken) {
              const cleanStore = shopifyConn.store_url.replace(/^https?:\/\//, '');
              const inventoryItemId = listing.metadata?.inventory_item_id;

              if (inventoryItemId) {
                // Get inventory level
                const levelsRes = await fetch(
                  `https://${cleanStore}/admin/api/2025-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
                  { headers: { 'X-Shopify-Access-Token': shopifyToken } }
                );

                if (levelsRes.ok) {
                  const { inventory_levels } = await levelsRes.json();
                  if (inventory_levels?.[0]) {
                    const locationId = inventory_levels[0].location_id;
                    const setRes = await fetch(
                      `https://${cleanStore}/admin/api/2025-01/inventory_levels/set.json`,
                      {
                        method: 'POST',
                        headers: {
                          'X-Shopify-Access-Token': shopifyToken,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          location_id: locationId,
                          inventory_item_id: parseInt(inventoryItemId),
                          available: newStock,
                        }),
                      }
                    );

                    const ok = setRes.ok;
                    await supabase
                      .from('product_platform_listings')
                      .update({
                        platform_stock: newStock,
                        sync_status: ok ? 'synced' : 'error',
                        last_synced_at: new Date().toISOString(),
                      })
                      .eq('id', listing.id);

                    results.push({ platform: 'shopify', status: ok ? 'synced' : 'error' });
                  }
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`[sync-stock] Error syncing ${listing.platform}:`, err);
        results.push({ platform: listing.platform, status: 'error', error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[sync-stock] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
