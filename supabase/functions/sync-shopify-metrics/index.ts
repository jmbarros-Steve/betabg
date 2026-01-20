import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the connection ID from request
    const { connectionId } = await req.json();

    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: 'Connection ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching connection:', connectionId);

    // Get the connection details
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      console.error('Connection not found:', connError);
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (connection.platform !== 'shopify') {
      return new Response(
        JSON.stringify({ error: 'This endpoint only supports Shopify connections' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { store_url, access_token } = connection;

    if (!store_url || !access_token) {
      return new Response(
        JSON.stringify({ error: 'Store URL and Access Token are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching orders from Shopify:', store_url);

    // Fetch orders from Shopify (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const shopifyUrl = `https://${store_url}/admin/api/2024-01/orders.json?status=any&created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;
    
    const shopifyResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': access_token,
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

    // Calculate daily metrics
    const dailyMetrics: Record<string, { revenue: number; orders: number; currency: string }> = {};

    for (const order of orders || []) {
      const date = order.created_at.split('T')[0];
      if (!dailyMetrics[date]) {
        dailyMetrics[date] = { revenue: 0, orders: 0, currency: order.currency };
      }
      dailyMetrics[date].revenue += parseFloat(order.total_price);
      dailyMetrics[date].orders += 1;
    }

    // Upsert metrics to database
    const metricsToInsert: any[] = [];
    
    for (const [date, metrics] of Object.entries(dailyMetrics)) {
      metricsToInsert.push({
        connection_id: connectionId,
        metric_date: date,
        metric_type: 'revenue',
        metric_value: metrics.revenue,
        currency: metrics.currency,
      });
      metricsToInsert.push({
        connection_id: connectionId,
        metric_date: date,
        metric_type: 'orders',
        metric_value: metrics.orders,
        currency: metrics.currency,
      });
    }

    if (metricsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('platform_metrics')
        .upsert(metricsToInsert, {
          onConflict: 'connection_id,metric_date,metric_type',
        });

      if (insertError) {
        console.error('Error inserting metrics:', insertError);
      }
    }

    // Update last sync time
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId);

    console.log('Sync completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        ordersCount: orders?.length || 0,
        daysProcessed: Object.keys(dailyMetrics).length,
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
