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

    const { variantId, newBasePrice, sourcePlatform } = await req.json();
    if (!variantId || newBasePrice == null) {
      return new Response(JSON.stringify({ error: 'variantId and newBasePrice required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get variant with all listings
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

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && client?.user_id !== user.id && client?.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update local variant price
    await supabase
      .from('product_variants')
      .update({ price: newBasePrice })
      .eq('id', variantId);

    const listings = variant.product_platform_listings || [];
    const results: any[] = [];

    for (const listing of listings) {
      if (listing.platform === sourcePlatform) continue;

      try {
        // Calculate price with markup from listing metadata
        const meta = listing.metadata || {};
        let targetPrice = newBasePrice;

        if (meta.auto_sync_price !== false && meta.markup_type) {
          switch (meta.markup_type) {
            case 'percent':
              targetPrice = Math.round(newBasePrice * (1 + (meta.markup_value || 0) / 100));
              break;
            case 'fixed':
              targetPrice = Math.round(newBasePrice + (meta.markup_value || 0));
              break;
            case 'manual':
              // Manual means the price was set manually, don't auto-sync
              results.push({ platform: listing.platform, status: 'skipped', reason: 'manual_price' });
              continue;
          }
        }

        if (listing.platform === 'mercadolibre' && listing.platform_item_id) {
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
                body: JSON.stringify({ price: targetPrice }),
              });

              const ok = res.ok;
              await supabase
                .from('product_platform_listings')
                .update({
                  platform_price: targetPrice,
                  sync_status: ok ? 'synced' : 'error',
                  last_synced_at: new Date().toISOString(),
                })
                .eq('id', listing.id);

              results.push({ platform: 'mercadolibre', status: ok ? 'synced' : 'error', price: targetPrice });
            }
          }
        }

        // Could add Shopify price update here if needed
      } catch (err: any) {
        console.error(`[sync-prices] Error syncing ${listing.platform}:`, err);
        results.push({ platform: listing.platform, status: 'error', error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[sync-prices] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
