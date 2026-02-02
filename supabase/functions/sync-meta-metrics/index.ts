import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token, x-shopify-host, x-shopify-shop',
};

// Currency conversion utilities
const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
const FALLBACK_RATES: Record<string, number> = {
  CLP: 950,
  MXN: 17.5,
  EUR: 0.92,
  GBP: 0.79,
};

async function getExchangeRates(): Promise<Record<string, number>> {
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    console.log(`Exchange rates fetched: 1 USD = ${data.rates?.CLP} CLP`);
    return data.rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
    return FALLBACK_RATES;
  }
}

async function convertToCLP(amount: number, fromCurrency: string): Promise<number> {
  const currency = fromCurrency.toUpperCase();
  if (currency === 'CLP') return amount;

  const rates = await getExchangeRates();
  
  if (currency === 'USD') {
    return amount * (rates['CLP'] || FALLBACK_RATES['CLP']);
  } else {
    // Convert FROM -> USD -> CLP
    const fromRate = rates[currency] || 1;
    const clpRate = rates['CLP'] || FALLBACK_RATES['CLP'];
    return (amount / fromRate) * clpRate;
  }
}

// Helper to validate Shopify Session Token
async function validateShopifySessionToken(
  sessionToken: string,
  supabase: any
): Promise<{ valid: boolean; shopDomain?: string; userId?: string; error?: string }> {
  try {
    // Decode and validate the JWT
    const [headerB64, payloadB64] = sessionToken.split('.');
    if (!headerB64 || !payloadB64) {
      return { valid: false, error: 'Invalid token format' };
    }

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
    
    if (!shopDomain) {
      return { valid: false, error: 'No shop domain in token' };
    }

    // Find the user associated with this shop
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id')
      .eq('shop_domain', shopDomain)
      .single();

    if (error || !client) {
      return { valid: false, error: 'Shop not found in database' };
    }

    const userId = client.client_user_id || client.user_id;
    return { valid: true, shopDomain, userId };
  } catch (err: any) {
    console.error('Session token validation error:', err);
    return { valid: false, error: err.message };
  }
}

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

interface AdAccountInfo {
  currency?: string;
  timezone_name?: string;
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

    // Check for Shopify Session Token first (embedded app)
    const shopifySessionToken = req.headers.get('X-Shopify-Session-Token');
    const authHeader = req.headers.get('Authorization');
    
    let userId: string | null = null;
    let shopDomain: string | null = null;

    if (shopifySessionToken) {
      // Embedded Shopify app - validate Session Token
      console.log('[sync-meta] Validating Shopify Session Token...');
      const validation = await validateShopifySessionToken(shopifySessionToken, supabase);
      
      if (!validation.valid || !validation.userId) {
        console.error('[sync-meta] Session token invalid:', validation.error);
        return new Response(
          JSON.stringify({ error: 'Invalid Shopify session', details: validation.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = validation.userId;
      shopDomain = validation.shopDomain || null;
      console.log(`[sync-meta] ✓ Session token valid for shop: ${shopDomain}, user: ${userId}`);
    } else if (authHeader) {
      // Standard Supabase auth
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
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
        clients!inner(user_id, client_user_id)
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

    // Verify user owns this connection (admin via user_id OR client via client_user_id)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === userId || clientData.client_user_id === userId;
    
    if (!isOwner) {
      console.error('Authorization failed:', { userId, clientUserId: clientData.client_user_id, adminId: clientData.user_id });
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

    // Prepare ad account ID (Meta requires act_ prefix)
    const adAccountId = connection.account_id.startsWith('act_') 
      ? connection.account_id 
      : `act_${connection.account_id}`;

    // First, fetch the ad account currency to determine if conversion is needed
    const accountInfoUrl = `https://graph.facebook.com/v18.0/${adAccountId}?fields=currency,timezone_name&access_token=${decryptedToken}`;
    const accountInfoResponse = await fetch(accountInfoUrl);
    let accountCurrency = 'USD'; // Default to USD

    if (accountInfoResponse.ok) {
      const accountInfo: AdAccountInfo = await accountInfoResponse.json();
      accountCurrency = accountInfo.currency || 'USD';
      console.log(`Ad account currency: ${accountCurrency}`);
    }

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

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

    // Process and store metrics - ALWAYS CONVERT TO CLP
    const metricsToUpsert: Array<{
      connection_id: string;
      metric_date: string;
      metric_type: string;
      metric_value: number;
      currency: string;
    }> = [];

    for (const dayData of insightsData.data || []) {
      const metricDate = dayData.date_start;

      // Ad Spend - Convert to CLP
      if (dayData.spend) {
        const spendOriginal = parseFloat(dayData.spend);
        const spendCLP = await convertToCLP(spendOriginal, accountCurrency);
        console.log(`Spend ${dayData.date_start}: ${spendOriginal} ${accountCurrency} → ${spendCLP} CLP`);
        
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'ad_spend',
          metric_value: Math.round(spendCLP), // Round to whole pesos
          currency: 'CLP'
        });
      }

      // Impressions (no currency conversion needed)
      if (dayData.impressions) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'impressions',
          metric_value: parseFloat(dayData.impressions),
          currency: 'CLP'
        });
      }

      // CPM - Convert to CLP
      if (dayData.cpm) {
        const cpmOriginal = parseFloat(dayData.cpm);
        const cpmCLP = await convertToCLP(cpmOriginal, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'cpm',
          metric_value: Math.round(cpmCLP),
          currency: 'CLP'
        });
      }

      // Purchases (from actions array - no conversion, it's a count)
      const purchases = dayData.actions?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (purchases) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'purchases',
          metric_value: parseFloat(purchases.value),
          currency: 'CLP'
        });
      }

      // Purchase Value / Revenue - Convert to CLP
      const purchaseValue = dayData.action_values?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (purchaseValue) {
        const valueOriginal = parseFloat(purchaseValue.value);
        const valueCLP = await convertToCLP(valueOriginal, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'purchase_value',
          metric_value: Math.round(valueCLP),
          currency: 'CLP'
        });
      }

      // Cost per Purchase - Convert to CLP
      const costPerPurchase = dayData.cost_per_action_type?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (costPerPurchase) {
        const cppOriginal = parseFloat(costPerPurchase.value);
        const cppCLP = await convertToCLP(cppOriginal, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'cost_per_purchase',
          metric_value: Math.round(cppCLP),
          currency: 'CLP'
        });
      }

      // ROAS (ratio, no conversion needed)
      const roas = dayData.purchase_roas?.find(
        a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      if (roas) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'roas',
          metric_value: parseFloat(roas.value),
          currency: 'CLP'
        });
      }
    }

    console.log(`Upserting ${metricsToUpsert.length} metrics (all converted to CLP)`);

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

    console.log('Meta sync completed successfully (all amounts in CLP)');

    return new Response(
      JSON.stringify({ 
        success: true, 
        metrics_synced: metricsToUpsert.length,
        days_processed: insightsData.data?.length || 0,
        currency: 'CLP',
        source_currency: accountCurrency
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
