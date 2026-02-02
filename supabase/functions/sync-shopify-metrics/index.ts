import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token',
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

interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate the JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error('Invalid JWT:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('Authenticated user:', userId);

    // Get the connection ID from request
    const { connectionId } = await req.json();

    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: 'Connection ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching connection:', connectionId);

    // Use service role to access tokens (they should not be exposed to RLS queries)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns this connection via client ownership
    const { data: connection, error: connError } = await supabaseService
      .from('platform_connections')
      .select('*, clients!inner(user_id)')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      console.error('Connection not found:', connError);
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check: verify user owns the client that owns this connection
    if (connection.clients.user_id !== userId) {
      console.error('User does not own this connection');
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (connection.platform !== 'shopify') {
      return new Response(
        JSON.stringify({ error: 'This endpoint only supports Shopify connections' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: check last sync time (minimum 5 minutes between syncs)
    if (connection.last_sync_at) {
      const lastSync = new Date(connection.last_sync_at);
      const minInterval = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - lastSync.getTime() < minInterval) {
        const waitSeconds = Math.ceil((minInterval - (Date.now() - lastSync.getTime())) / 1000);
        return new Response(
          JSON.stringify({ error: `Rate limit: espera ${waitSeconds} segundos antes de sincronizar de nuevo` }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { store_url, access_token_encrypted } = connection;

    if (!store_url || !access_token_encrypted) {
      return new Response(
        JSON.stringify({ error: 'Store URL and Access Token are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the access token using database function
    const { data: decryptedToken, error: decryptError } = await supabaseService
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('Error decrypting token:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Error al desencriptar el token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching orders from Shopify:', store_url);

    // Fetch orders from Shopify (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const shopifyUrl = `https://${store_url}/admin/api/2024-01/orders.json?status=any&created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;
    
    const shopifyResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      },
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error:', shopifyResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Shopify API error: ${shopifyResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orders } = await shopifyResponse.json() as { orders: ShopifyOrder[] };
    console.log('Fetched orders:', orders?.length || 0);

    // Calculate daily metrics - ALL CONVERTED TO CLP
    const dailyMetrics: Record<string, { revenue: number; orders: number; originalCurrency: string }> = {};

    for (const order of orders || []) {
      const date = order.created_at.split('T')[0];
      const orderCurrency = order.currency || 'CLP';
      
      if (!dailyMetrics[date]) {
        dailyMetrics[date] = { revenue: 0, orders: 0, originalCurrency: orderCurrency };
      }
      
      const originalAmount = parseFloat(order.total_price);
      const amountCLP = await convertToCLP(originalAmount, orderCurrency);
      
      dailyMetrics[date].revenue += amountCLP;
      dailyMetrics[date].orders += 1;
    }

    // Log conversion info
    const sampleOrder = orders?.[0];
    if (sampleOrder) {
      console.log(`Converting from ${sampleOrder.currency} to CLP`);
    }

    // Upsert metrics to database using service role - ALL IN CLP
    const metricsToInsert: any[] = [];
    
    for (const [date, metrics] of Object.entries(dailyMetrics)) {
      metricsToInsert.push({
        connection_id: connectionId,
        metric_date: date,
        metric_type: 'revenue',
        metric_value: Math.round(metrics.revenue), // Round to whole pesos
        currency: 'CLP',
      });
      metricsToInsert.push({
        connection_id: connectionId,
        metric_date: date,
        metric_type: 'orders',
        metric_value: metrics.orders,
        currency: 'CLP',
      });
    }

    if (metricsToInsert.length > 0) {
      const { error: insertError } = await supabaseService
        .from('platform_metrics')
        .upsert(metricsToInsert, {
          onConflict: 'connection_id,metric_date,metric_type',
        });

      if (insertError) {
        console.error('Error inserting metrics:', insertError);
      }
    }

    // Update last sync time
    await supabaseService
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId);

    console.log('Sync completed successfully (all amounts in CLP)');

    return new Response(
      JSON.stringify({
        success: true,
        ordersCount: orders?.length || 0,
        daysProcessed: Object.keys(dailyMetrics).length,
        currency: 'CLP',
        source_currency: sampleOrder?.currency || 'CLP',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
