import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdLibraryAd {
  id: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  estimated_audience_size?: { lower_bound?: number; upper_bound?: number };
  impressions?: { lower_bound?: number; upper_bound?: number };
  spend?: { lower_bound?: number; upper_bound?: number };
  bylines?: string;
  collation_count?: number;
  collation_id?: string;
  currency?: string;
  languages?: string[];
}

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
      return new Response(JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub as string;
    const user = { id: userId };

    const { client_id, ig_handles } = await req.json();
    if (!client_id || !ig_handles || !Array.isArray(ig_handles) || ig_handles.length === 0) {
      return new Response(JSON.stringify({ error: 'client_id and ig_handles[] required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify ownership
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (client.user_id !== user.id && client.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Limit to 5 handles
    const handles = ig_handles.slice(0, 5).map((h: string) => 
      h.trim().replace(/^@/, '').toLowerCase()
    );

    console.log(`[sync-competitor-ads] Processing ${handles.length} handles for client ${client_id}`);

    // Get Meta access token — PRIORITIZE the client's user token (already has ads_read)
    const { data: metaConn } = await supabase
      .from('platform_connections')
      .select('access_token_encrypted')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let accessToken = '';
    let tokenSource = '';
    
    // Priority 1: Client's own Meta OAuth token (already approved with ads_read)
    if (metaConn?.access_token_encrypted) {
      const { data: decrypted } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: metaConn.access_token_encrypted });
      if (decrypted) {
        accessToken = decrypted;
        tokenSource = 'user_token';
      }
    }
    
    // Priority 2: App access token (requires Marketing API approval on Meta App)
    if (!accessToken) {
      const metaAppId = Deno.env.get('META_APP_ID');
      const metaAppSecret = Deno.env.get('META_APP_SECRET');
      if (metaAppId && metaAppSecret) {
        try {
          const tokenRes = await fetch(
            `https://graph.facebook.com/oauth/access_token?client_id=${metaAppId}&client_secret=${metaAppSecret}&grant_type=client_credentials`
          );
          const tokenData = await tokenRes.json();
          if (tokenData.access_token) {
            accessToken = tokenData.access_token;
            tokenSource = 'app_token';
          }
        } catch (e) {
          console.error('[sync-competitor-ads] App token fetch failed:', e);
        }
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ 
        error: 'meta_not_connected',
        message: 'Debes conectar tu cuenta de Meta Ads primero para poder rastrear competidores.'
      }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[sync-competitor-ads] Using ${tokenSource} for Ad Library queries`);

    const results: { handle: string; ads_found: number; status: string }[] = [];

    for (const handle of handles) {
      try {
        // Step 1: Upsert competitor tracking record
        const { data: tracking, error: trackError } = await supabase
          .from('competitor_tracking')
          .upsert({
            client_id,
            ig_handle: handle,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id,ig_handle' })
          .select('id, meta_page_id, last_sync_at')
          .single();

        if (trackError) {
          console.error(`Error upserting tracking for ${handle}:`, trackError);
          results.push({ handle, ads_found: 0, status: 'error: ' + trackError.message });
          continue;
        }

        // Check if synced recently (< 24h)
        if (tracking.last_sync_at) {
          const lastSync = new Date(tracking.last_sync_at);
          const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            console.log(`[sync-competitor-ads] ${handle} synced ${hoursSince.toFixed(1)}h ago, skipping`);
            // Count existing ads
            const { count } = await supabase
              .from('competitor_ads')
              .select('id', { count: 'exact', head: true })
              .eq('tracking_id', tracking.id);
            results.push({ handle, ads_found: count || 0, status: 'cached' });
            continue;
          }
        }

        // Step 2: Search Ad Library
        const adLibraryUrl = new URL('https://graph.facebook.com/v21.0/ads_archive');
        adLibraryUrl.searchParams.set('access_token', accessToken);
        adLibraryUrl.searchParams.set('search_terms', handle);
        adLibraryUrl.searchParams.set('ad_type', 'ALL');
        adLibraryUrl.searchParams.set('ad_reached_countries', 'CL,MX,CO,AR,PE,US');
        adLibraryUrl.searchParams.set('ad_active_status', 'ALL');
        adLibraryUrl.searchParams.set('fields', 
          'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,ad_snapshot_url,bylines,collation_count,languages'
        );
        adLibraryUrl.searchParams.set('limit', '25');

        console.log(`[sync-competitor-ads] Fetching Ad Library for: ${handle}`, adLibraryUrl.toString().replace(accessToken, '***'));
        const adResponse = await fetch(adLibraryUrl.toString());
        
        // Handle non-JSON responses
        const responseText = await adResponse.text();
        let adResponseJson: any;
        try {
          adResponseJson = JSON.parse(responseText);
        } catch {
          console.error(`Non-JSON response for ${handle}:`, responseText.slice(0, 500));
          results.push({ handle, ads_found: 0, status: 'api_error: Non-JSON response from Meta' });
          continue;
        }

        if (!adResponse.ok || adResponseJson.error) {
          const errMsg = adResponseJson.error?.message || 'Unknown error';
          const errCode = adResponseJson.error?.code || 0;
          console.error(`Ad Library API error for ${handle}: code=${errCode}, msg=${errMsg}`);
          
          // Provide actionable error messages
          let statusMsg = `api_error: ${errMsg}`;
          if (errCode === 190) statusMsg = 'token_expired: El token de Meta expiró. Reconecta Meta Ads en Conexiones.';
          if (errCode === 10 || errCode === 200) statusMsg = 'permission_denied: La app necesita permisos de Ad Library. Contacta soporte.';
          
          results.push({ handle, ads_found: 0, status: statusMsg });
          continue;
        }

        const ads: AdLibraryAd[] = adResponseJson.data || [];
        console.log(`[sync-competitor-ads] Found ${ads.length} ads for ${handle}`);

        // Update page info if found
        if (ads.length > 0 && ads[0].page_id) {
          await supabase
            .from('competitor_tracking')
            .update({
              meta_page_id: ads[0].page_id,
              display_name: ads[0].page_name || handle,
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', tracking.id);
        } else {
          await supabase
            .from('competitor_tracking')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', tracking.id);
        }

        // Step 3: Upsert ads
        const adsToUpsert = ads.map((ad) => {
          const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null;
          const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
          const isActive = !endDate || endDate > new Date();
          const daysRunning = startDate
            ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          // Determine ad type from content
          let adType = 'image';
          if (ad.collation_count && ad.collation_count > 1) adType = 'carousel';

          // Extract CTA from link titles
          const ctaMap: Record<string, string> = {
            'comprar': 'SHOP_NOW',
            'shop': 'SHOP_NOW',
            'learn more': 'LEARN_MORE',
            'más información': 'LEARN_MORE',
            'sign up': 'SIGN_UP',
            'registrarse': 'SIGN_UP',
            'descargar': 'DOWNLOAD',
            'download': 'DOWNLOAD',
          };
          let ctaType = 'OTHER';
          const linkTitle = (ad.ad_creative_link_titles?.[0] || '').toLowerCase();
          for (const [key, value] of Object.entries(ctaMap)) {
            if (linkTitle.includes(key)) { ctaType = value; break; }
          }

          return {
            tracking_id: tracking.id,
            client_id,
            ad_library_id: ad.id,
            ad_text: ad.ad_creative_bodies?.[0] || null,
            ad_headline: ad.ad_creative_link_titles?.[0] || null,
            ad_description: ad.ad_creative_link_descriptions?.[0] || null,
            image_url: ad.ad_snapshot_url || null,
            ad_type: adType,
            cta_type: ctaType,
            started_at: ad.ad_delivery_start_time || null,
            is_active: isActive,
            days_running: daysRunning,
          };
        });

        if (adsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('competitor_ads')
            .upsert(adsToUpsert, { onConflict: 'tracking_id,ad_library_id', ignoreDuplicates: false });

          if (upsertError) {
            console.error(`Upsert error for ${handle}:`, upsertError);
            results.push({ handle, ads_found: 0, status: 'upsert_error: ' + upsertError.message });
            continue;
          }
        }

        results.push({ handle, ads_found: adsToUpsert.length, status: 'synced' });
      } catch (err: any) {
        console.error(`Error processing ${handle}:`, err);
        results.push({ handle, ads_found: 0, status: 'error: ' + err.message });
      }
    }

    console.log('[sync-competitor-ads] Complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
