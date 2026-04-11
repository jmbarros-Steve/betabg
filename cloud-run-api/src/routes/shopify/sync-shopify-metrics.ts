import { Context } from 'hono';
import { getSupabaseAdmin, getSupabaseWithUserToken } from '../../lib/supabase.js';
import { convertToCLP } from '../../lib/currency.js';
import { validateShopifySessionToken } from '../../lib/shopify-session.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
}

export async function syncShopifyMetrics(c: Context) {
  try {
    // Use service role for all DB operations
    const supabaseService = getSupabaseAdmin();

    // Check for cron secret (automated sync)
    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));

    // Check for Shopify Session Token first (embedded app)
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    const authHeader = c.req.header('Authorization');

    let userId: string | null = null;
    let shopDomain: string | null = null;

    // Accept internal calls (from sync-all-metrics cron via authMiddleware)
    const isInternal = c.get('isInternal');
    if (isCron || isInternal) {
      console.log('[sync-shopify] Cron/internal-triggered sync');
    } else if (shopifySessionToken) {
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
    const isOwner = isCron || isInternal || clientData.user_id === userId || clientData.client_user_id === userId;

    if (!isOwner) {
      console.error('User does not own this connection');
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (connection.platform !== 'shopify') {
      return c.json({ error: 'This endpoint only supports Shopify connections' }, 400);
    }

    // Rate limiting: check last sync time (minimum 5 minutes between syncs, skip for cron)
    if (!isCron && !isInternal && connection.last_sync_at) {
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

    // Fetch orders from Shopify (last 90 days — enables period comparisons)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

    const shopifyUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;

    const orders = await fetchAllOrders(shopifyUrl);
    console.log('Fetched orders (paginated):', orders.length);

    // Calculate daily metrics - ALL CONVERTED TO CLP
    const dailyMetrics: Record<string, { revenue: number; orders: number; originalCurrency: string }> = {};

    const PAID_STATUSES = new Set(['paid', 'partially_paid', 'partially_refunded']);
    for (const order of orders || []) {
      // Whitelist only paid statuses — excludes pending, authorized, refunded, voided
      const fs = String(order.financial_status || '');
      if (!PAID_STATUSES.has(fs)) continue;

      const date = order.created_at.split('T')[0];
      const orderCurrency = order.currency || 'CLP';

      if (!dailyMetrics[date]) {
        dailyMetrics[date] = { revenue: 0, orders: 0, originalCurrency: orderCurrency };
      }

      const originalAmount = parseFloat(order.total_price);
      if (isNaN(originalAmount)) continue;
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
        return c.json({ error: `Failed to save metrics: ${insertError.message}` }, 500);
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
