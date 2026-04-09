import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { checkRateLimit } from '../../lib/rate-limiter.js';
import { metaApiFetch, metaApiJson } from '../../lib/meta-fetch.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { convertToCLP } from '../../lib/currency.js';

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

    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    );
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

export async function syncMetaMetrics(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Check for Shopify Session Token first (embedded app)
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    const authHeader = c.req.header('Authorization');

    let userId: string | null = null;
    let shopDomain: string | null = null;

    // Allow internal/cron calls (authMiddleware already validated via service role key)
    const isInternal = c.get('isInternal');
    if (isInternal) {
      console.log('[sync-meta] Internal/cron call — skipping user auth');
    } else if (shopifySessionToken) {
      // Embedded Shopify app - validate Session Token
      console.log('[sync-meta] Validating Shopify Session Token...');
      const validation = await validateShopifySessionToken(shopifySessionToken, supabase);

      if (!validation.valid || !validation.userId) {
        console.error('[sync-meta] Session token invalid:', validation.error);
        return c.json(
          { error: 'Invalid Shopify session', details: validation.error },
          401
        );
      }

      userId = validation.userId;
      shopDomain = validation.shopDomain || null;
      console.log(`[sync-meta] Session token valid for shop: ${shopDomain}, user: ${userId}`);
    } else if (authHeader) {
      // Standard Supabase auth
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return c.json({ error: 'Invalid token' }, 401);
      }
      userId = user.id;
    } else {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    // Get connection_id from request
    const { connection_id, purge_stale } = await c.req.json();

    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    // Validate connection_id format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(connection_id)) {
      return c.json({ error: 'Invalid connection_id format' }, 400);
    }

    // Rate limit: 10 requests/minute per connection
    const rl = checkRateLimit(connection_id, 'sync-meta-metrics');
    if (!rl.allowed) {
      return c.json({ error: `Rate limited. Retry in ${rl.retryAfter} seconds.` }, 429);
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
        connection_type,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connError || !connection) {
      console.error('Connection fetch error:', connError);
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify user owns this connection OR is admin (skip for internal/cron calls)
    if (!isInternal) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const isOwner = clientData.user_id === userId || clientData.client_user_id === userId;

      if (!isOwner) {
        const adminRole = await safeQuerySingleOrDefault<any>(
          supabase
            .from('user_roles').select('role').eq('user_id', userId)
            .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
          null,
          'syncMetaMetrics.getAdminRole',
        );
        if (!adminRole) {
          console.error('Authorization failed:', { userId, clientUserId: clientData.client_user_id, adminId: clientData.user_id });
          return c.json({ error: 'Unauthorized' }, 403);
        }
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account_id' }, 400);
    }

    // Resolve token (SUAT for bm_partner, decrypt for oauth)
    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      console.error('Token resolution failed for connection', connection.id);
      return c.json({ error: 'Failed to resolve token' }, 500);
    }

    // Prepare ad account ID (Meta requires act_ prefix)
    const adAccountId = connection.account_id.startsWith('act_')
      ? connection.account_id
      : `act_${connection.account_id}`;

    // First, fetch the ad account currency to determine if conversion is needed
    let accountCurrency = 'CLP'; // Default to CLP (no conversion) to avoid 950x error
    const accountInfoResult = await metaApiJson<AdAccountInfo>(
      `/${adAccountId}`,
      decryptedToken,
      { params: { fields: 'currency,timezone_name' } }
    );

    if (accountInfoResult.ok) {
      accountCurrency = accountInfoResult.data.currency || 'CLP';
      console.log(`Ad account currency: ${accountCurrency}`);
    } else {
      console.warn('Could not fetch account currency — defaulting to CLP (no conversion)');
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

    const insightsUrl = new URL(`https://graph.facebook.com/v21.0/${adAccountId}/insights`);
    insightsUrl.searchParams.set('fields', fields);
    insightsUrl.searchParams.set('time_range', JSON.stringify({
      since: formatDate(startDate),
      until: formatDate(endDate)
    }));
    insightsUrl.searchParams.set('time_increment', '1'); // Daily breakdown
    insightsUrl.searchParams.set('level', 'account');

    console.log(`Fetching Meta insights for account ${adAccountId}`);

    // Fetch all pages of insights (Meta paginates daily breakdown)
    // Uses metaApiFetch which includes inter-request delay + retry + circuit breaker
    let allInsights: MetaInsightsResponse['data'] = [];
    let nextUrl: string | null = insightsUrl.toString();

    while (nextUrl) {
      const metaResponse = await metaApiFetch(nextUrl, decryptedToken);

      if (!metaResponse.ok) {
        const errorData: any = await metaResponse.json();
        console.error('Meta API error:', errorData);
        return c.json({
          error: 'Meta API error',
          details: errorData.error?.message || 'Unknown error'
        }, 502);
      }

      const pageData: MetaInsightsResponse = await metaResponse.json() as any;
      if (pageData.data) {
        allInsights = allInsights.concat(pageData.data);
      }
      nextUrl = pageData.paging?.next || null;
      if (nextUrl) {
        // Remove access_token from cursor URL (we use Authorization header)
        const cursorUrl = new URL(nextUrl);
        cursorUrl.searchParams.delete('access_token');
        nextUrl = cursorUrl.toString();
        console.log(`Fetching next page of insights (${allInsights.length} days so far)...`);
      }
    }

    console.log(`Received ${allInsights.length} days of insights (all pages)`);

    // Process and store metrics - ALWAYS CONVERT TO CLP
    const metricsToUpsert: Array<{
      connection_id: string;
      metric_date: string;
      metric_type: string;
      metric_value: number;
      currency: string;
    }> = [];

    for (const dayData of allInsights) {
      const metricDate = dayData.date_start;

      // Ad Spend - Convert to CLP
      if (dayData.spend) {
        const spendOriginal = parseFloat(dayData.spend);
        const spendCLP = await convertToCLP(spendOriginal, accountCurrency);
        console.log(`Spend ${dayData.date_start}: ${spendOriginal} ${accountCurrency} -> ${spendCLP} CLP`);

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

    // Upsert metrics (no pre-delete — avoids dashboard showing /bin/bash during sync)
    if (metricsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('platform_metrics')
        .upsert(metricsToUpsert, {
          onConflict: 'connection_id,metric_date,metric_type',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return c.json(
          { error: 'Failed to store metrics', details: upsertError.message },
          500
        );
      }
    }

    // Clean up stale metrics from the sync window only (last 90 days).
    // Without a date range guard this would delete ALL historical metrics
    // outside the current 30-day sync window, wiping months of data.
    const syncedDates = [...new Set(metricsToUpsert.map(m => m.metric_date))];
    if (syncedDates.length > 0) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cleanupSince = formatDate(ninetyDaysAgo);

      const { error: cleanupError } = await supabase
        .from('platform_metrics')
        .delete()
        .eq('connection_id', connection_id)
        .gte('metric_date', cleanupSince)
        .not('metric_date', 'in', `(${syncedDates.join(',')})`);
      if (cleanupError) console.error('Stale metric cleanup error:', cleanupError);
    }

    // Update last_sync_at
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection_id);

    console.log('Meta sync completed successfully (all amounts in CLP)');

    return c.json({
      success: true,
      metrics_synced: metricsToUpsert.length,
      days_processed: allInsights.length,
      currency: 'CLP',
      source_currency: accountCurrency
    }, 200);

  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
