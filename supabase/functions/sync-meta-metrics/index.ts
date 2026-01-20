import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaInsightsResponse {
  data: Array<{
    date_start: string;
    date_stop: string;
    spend?: string;
    impressions?: string;
    cpm?: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    cost_per_action_type?: Array<{ action_type: string; value: string }>;
    purchase_roas?: Array<{ action_type: string; value: string }>;
  }>;
  paging?: {
    cursors: { after?: string };
    next?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
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

    // Get connection_id from request
    const { connection_id } = await req.json();
    
    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing Meta metrics for connection: ${connection_id}`);

    // Fetch connection details and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        client_id,
        clients!inner(user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      console.error('Connection fetch error:', connError);
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this connection
    const clientData = connection.clients as unknown as { user_id: string };
    if (clientData.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return new Response(
        JSON.stringify({ error: 'Missing Meta credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('Token decryption error:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Prepare ad account ID (Meta requires act_ prefix)
    const adAccountId = connection.account_id.startsWith('act_') 
      ? connection.account_id 
      : `act_${connection.account_id}`;

    // Fetch insights from Meta Marketing API
    const fields = [
      'spend',
      'impressions', 
      'cpm',
      'actions',
      'action_values',
      'cost_per_action_type',
      'purchase_roas'
    ].join(',');

    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/insights`);
    insightsUrl.searchParams.set('access_token', decryptedToken);
    insightsUrl.searchParams.set('fields', fields);
    insightsUrl.searchParams.set('time_range', JSON.stringify({
      since: formatDate(startDate),
      until: formatDate(endDate)
    }));
    insightsUrl.searchParams.set('time_increment', '1'); // Daily breakdown
    insightsUrl.searchParams.set('level', 'account');

    console.log(`Fetching Meta insights for account ${adAccountId}`);

    const metaResponse = await fetch(insightsUrl.toString());
    
    if (!metaResponse.ok) {
      const errorData = await metaResponse.json();
      console.error('Meta API error:', errorData);
      return new Response(
        JSON.stringify({ 
          error: 'Meta API error', 
          details: errorData.error?.message || 'Unknown error' 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const insightsData: MetaInsightsResponse = await metaResponse.json();
    console.log(`Received ${insightsData.data?.length || 0} days of insights`);

    // Process and store metrics
    const metricsToUpsert: Array<{
      connection_id: string;
      metric_date: string;
      metric_type: string;
      metric_value: number;
      currency: string;
    }> = [];

    for (const dayData of insightsData.data || []) {
      const metricDate = dayData.date_start;

      // Ad Spend
      if (dayData.spend) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'ad_spend',
          metric_value: parseFloat(dayData.spend),
          currency: 'USD'
        });
      }

      // Impressions
      if (dayData.impressions) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'impressions',
          metric_value: parseFloat(dayData.impressions),
          currency: 'USD'
        });
      }

      // CPM
      if (dayData.cpm) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'cpm',
          metric_value: parseFloat(dayData.cpm),
          currency: 'USD'
        });
      }

      // Purchases (from actions array)
      const purchases = dayData.actions?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (purchases) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'purchases',
          metric_value: parseFloat(purchases.value),
          currency: 'USD'
        });
      }

      // Purchase Value / Revenue (from action_values array)
      const purchaseValue = dayData.action_values?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (purchaseValue) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'purchase_value',
          metric_value: parseFloat(purchaseValue.value),
          currency: 'USD'
        });
      }

      // Cost per Purchase
      const costPerPurchase = dayData.cost_per_action_type?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (costPerPurchase) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'cost_per_purchase',
          metric_value: parseFloat(costPerPurchase.value),
          currency: 'USD'
        });
      }

      // ROAS
      const roas = dayData.purchase_roas?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (roas) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'roas',
          metric_value: parseFloat(roas.value),
          currency: 'USD'
        });
      }
    }

    console.log(`Upserting ${metricsToUpsert.length} metrics`);

    // Upsert metrics in batches
    if (metricsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('platform_metrics')
        .upsert(metricsToUpsert, {
          onConflict: 'connection_id,metric_date,metric_type',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return new Response(
          JSON.stringify({ error: 'Failed to store metrics', details: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update last_sync_at
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection_id);

    console.log('Meta sync completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        metrics_synced: metricsToUpsert.length,
        days_processed: insightsData.data?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
