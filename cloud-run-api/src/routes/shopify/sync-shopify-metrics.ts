import { Context } from 'hono';
import { getSupabaseAdmin, getSupabaseWithUserToken } from '../../lib/supabase.js';

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
    const data: any = await response.json();
    console.log(`Exchange rates fetched: 1 USD = ${data.rates?.CLP} CLP`);
    return data.rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
    return FALLBACK_RATES;
  }
}

// Cache exchange rates per request to avoid repeated API calls
let cachedRates: Record<string, number> | null = null;

async function convertToCLP(amount: number, fromCurrency: string): Promise<number> {
  const currency = fromCurrency.toUpperCase();
  if (currency === 'CLP') return amount;

  if (!cachedRates) {
    cachedRates = await getExchangeRates();
  }
  const rates = cachedRates;

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

interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
}

export async function syncShopifyMetrics(c: Context) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    // Use service role for all DB operations
    const supabaseService = getSupabaseAdmin();

    // Check for Shopify Session Token first (embedded app)
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    const authHeader = c.req.header('Authorization');

    let userId: string | null = null;
    let shopDomain: string | null = null;

    if (shopifySessionToken) {
      // Embedded Shopify app - validate Session Token
      console.log('[sync-shopify] Validating Shopify Session Token...');
      const validation = await validateShopifySessionToken(shopifySessionToken, supabaseService);

      if (!validation.valid || !validation.userId) {
        console.error('[sync-shopify] Session token invalid:', validation.error);
        return c.json({ error: 'Invalid Shopify session', details: validation.error }, 401);
      }

      userId = validation.userId;
      shopDomain = validation.shopDomain || null;
      console.log(`[sync-shopify] Session token valid for shop: ${shopDomain}, user: ${userId}`);
    } else if (authHeader?.startsWith('Bearer ')) {
      // Standard Supabase auth
      const supabaseAuth = getSupabaseWithUserToken(authHeader.replace('Bearer ', ''));

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

      if (authError || !user) {
        console.error('Invalid JWT:', authError);
        return c.json({ error: 'Unauthorized' }, 401);
      }
      userId = user.id;
    } else {
      console.error('Missing authorization');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('Authenticated user:', userId);

    // Get the connection ID from request
    const { connectionId } = await c.req.json();

    if (!connectionId) {
      return c.json({ error: 'Connection ID is required' }, 400);
    }

    console.log('Fetching connection:', connectionId);

    // Verify user owns this connection via client ownership
    const { data: connection, error: connError } = await supabaseService
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      console.error('Connection not found:', connError);
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Authorization check: verify user owns the client that owns this connection
    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === userId || clientData.client_user_id === userId;

    if (!isOwner) {
      console.error('User does not own this connection');
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (connection.platform !== 'shopify') {
      return c.json({ error: 'This endpoint only supports Shopify connections' }, 400);
    }

    // Rate limiting: check last sync time (minimum 5 minutes between syncs)
    if (connection.last_sync_at) {
      const lastSync = new Date(connection.last_sync_at);
      const minInterval = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - lastSync.getTime() < minInterval) {
        const waitSeconds = Math.ceil((minInterval - (Date.now() - lastSync.getTime())) / 1000);
        return c.json({ error: `Rate limit: espera ${waitSeconds} segundos antes de sincronizar de nuevo` }, 429);
      }
    }

    const { store_url, access_token_encrypted } = connection;

    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Store URL and Access Token are required' }, 400);
    }

    // Decrypt the access token using database function
    const { data: decryptedToken, error: decryptError } = await supabaseService
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('Error decrypting token:', decryptError);
      return c.json({ error: 'Error al desencriptar el token' }, 500);
    }

    // Strip protocol if present to avoid double https://
    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    console.log('Fetching orders from Shopify:', cleanStoreUrl);

    const SHOPIFY_API_VERSION = '2025-01';
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    // Paginated fetch — follows Shopify's Link header pagination
    async function fetchAllOrders(initialUrl: string): Promise<ShopifyOrder[]> {
      const results: ShopifyOrder[] = [];
      let url: string | null = initialUrl;
      while (url) {
        const res = await fetch(url, { headers: shopifyHeaders });
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Shopify API error:', res.status, errorText);
          throw new Error(`Shopify API error: ${res.status}`);
        }
        const json: any = await res.json();
        results.push(...(json.orders || []));
        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
      }
      return results;
    }

    // Fetch orders from Shopify (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const shopifyUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;

    // Reset cached rates for this request
    cachedRates = null;

    const orders = await fetchAllOrders(shopifyUrl);
    console.log('Fetched orders (paginated):', orders.length);

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

    return c.json({
      success: true,
      ordersCount: orders?.length || 0,
      daysProcessed: Object.keys(dailyMetrics).length,
      currency: 'CLP',
      source_currency: sampleOrder?.currency || 'CLP',
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return c.json({ error: error.message }, 500);
  }
}
