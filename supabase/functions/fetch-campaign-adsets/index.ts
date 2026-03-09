import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdSetInsight {
  id: string;
  name: string;
  status: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  conversions?: number;
  conversion_value?: number;
  roas?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { connection_id, campaign_id, platform } = await req.json();
    
    if (!connection_id || !campaign_id || !platform) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching ad sets for campaign ${campaign_id} on ${platform}`);

    // Fetch connection details
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', platform)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Date range: last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    let adSets: AdSetInsight[] = [];

    if (platform === 'meta') {
      // Fetch ad sets for this campaign with insights
      const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${campaign_id}/adsets`);
      adsetsUrl.searchParams.set('access_token', decryptedToken);
      adsetsUrl.searchParams.set('fields', 'id,name,status');
      adsetsUrl.searchParams.set('limit', '100');

      const adsetsRes = await fetch(adsetsUrl.toString());
      if (!adsetsRes.ok) {
        const errorText = await adsetsRes.text();
        console.error('Meta adsets fetch error:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch ad sets', details: errorText }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adsetsData = await adsetsRes.json();
      const rawAdsets = adsetsData.data || [];

      console.log(`Found ${rawAdsets.length} ad sets for campaign ${campaign_id}`);

      // Fetch insights for each adset
      for (const adset of rawAdsets) {
        const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adset.id}/insights`);
        insightsUrl.searchParams.set('access_token', decryptedToken);
        insightsUrl.searchParams.set('fields', 'spend,impressions,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas');
        insightsUrl.searchParams.set('time_range', JSON.stringify({
          since: formatDate(startDate),
          until: formatDate(endDate)
        }));

        try {
          const insightsRes = await fetch(insightsUrl.toString());
          if (!insightsRes.ok) continue;

          const insightsData = await insightsRes.json();
          const insights = insightsData.data?.[0] || {};

          const purchases = insights.actions?.find((a: any) => 
            a.action_type === 'purchase' || a.action_type === 'omni_purchase'
          );
          const purchaseValue = insights.action_values?.find((a: any) => 
            a.action_type === 'purchase' || a.action_type === 'omni_purchase'
          );
          const roas = insights.purchase_roas?.find((a: any) => 
            a.action_type === 'purchase' || a.action_type === 'omni_purchase'
          );

          // Fetch ads for this ad set
          let ads: Array<{ id: string; name: string; status: string; creative_id?: string; thumbnail_url?: string; body?: string; title?: string; image_url?: string }> = [];
          try {
            const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adset.id}/ads`);
            adsUrl.searchParams.set('access_token', decryptedToken);
            adsUrl.searchParams.set('fields', 'id,name,status,creative{id,name,thumbnail_url,body,title,image_url}');
            adsUrl.searchParams.set('limit', '50');

            const adsRes = await fetch(adsUrl.toString());
            if (adsRes.ok) {
              const adsData = await adsRes.json();
              ads = (adsData.data || []).map((ad: any) => ({
                id: ad.id,
                name: ad.name,
                status: ad.status,
                creative_id: ad.creative?.id || null,
                thumbnail_url: ad.creative?.thumbnail_url || null,
                body: ad.creative?.body || '',
                title: ad.creative?.title || '',
                image_url: ad.creative?.image_url || null,
              }));
            }
          } catch (adsErr) {
            console.error(`Error fetching ads for adset ${adset.id}:`, adsErr);
          }

          adSets.push({
            id: adset.id,
            name: adset.name,
            status: adset.status,
            spend: insights.spend || '0',
            impressions: insights.impressions || '0',
            clicks: insights.clicks || '0',
            cpm: insights.cpm || '0',
            cpc: insights.cpc || '0',
            ctr: insights.ctr || '0',
            conversions: parseFloat(purchases?.value || '0'),
            conversion_value: parseFloat(purchaseValue?.value || '0'),
            roas: parseFloat(roas?.value || '0'),
            ads,
          });
        } catch (e) {
          console.error(`Error fetching insights for adset ${adset.id}:`, e);
        }
      }
    } else if (platform === 'google') {
      // Google Ads doesn't have the exact same structure, but we can fetch ad groups
      // For now, return empty array for Google
      adSets = [];
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ad_sets: adSets,
        campaign_id,
        platform
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fetch ad sets error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
