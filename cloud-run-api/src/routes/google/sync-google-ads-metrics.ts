import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';

interface GoogleAdsRow {
  metrics: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    conversionsValue?: number;
    averageCpc?: string;
    ctr?: number;
    costPerConversion?: number;
  };
  segments: {
    date: string;
  };
}

export async function syncGoogleAdsMetrics(c: Context) {
  try {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

    const supabase = getSupabaseAdmin();

    if (!developerToken || !googleClientId || !googleClientSecret) {
      console.error('Missing Google Ads credentials');
      return c.json({ error: 'Google Ads configuration missing' }, 500);
    }

    // Get user from auth middleware
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Get connection_id from request
    const { connection_id } = await c.req.json();

    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    console.log(`Syncing Google Ads metrics for connection: ${connection_id}`);

    // Fetch connection details and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'google')
      .single();

    if (connError || !connection) {
      console.error('Connection fetch error:', connError);
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify user owns this connection (either as admin owner or as client user)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return c.json({ error: 'Missing Google Ads credentials' }, 400);
    }

    // Decrypt access token
    const { data: decryptedAccessToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedAccessToken) {
      console.error('Token decryption error:', decryptError);
      return c.json({ error: 'Failed to decrypt token' }, 500);
    }

    let accessToken = decryptedAccessToken;

    // Try to refresh the token if we have a refresh token
    if (connection.refresh_token_encrypted) {
      const { data: decryptedRefreshToken } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: connection.refresh_token_encrypted });

      if (decryptedRefreshToken) {
        console.log('Attempting to refresh access token...');
        try {
          const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: decryptedRefreshToken,
              grant_type: 'refresh_token',
            }),
          });

          const refreshData: any = await refreshResponse.json();

          if (refreshData.access_token) {
            accessToken = refreshData.access_token;
            console.log('Access token refreshed successfully');

            // Update encrypted token in database
            const { data: newEncryptedToken } = await supabase
              .rpc('encrypt_platform_token', { raw_token: accessToken });

            if (newEncryptedToken) {
              await supabase
                .from('platform_connections')
                .update({ access_token_encrypted: newEncryptedToken })
                .eq('id', connection_id);
            }
          }
        } catch (refreshErr) {
          console.log('Token refresh failed, using existing token:', refreshErr);
        }
      }
    }

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const customerId = connection.account_id;

    // Detect account currency for proper CLP conversion
    const accountCurrency = await fetchGoogleAccountCurrency(customerId, accessToken, developerToken);
    console.log(`Google Ads account currency: ${accountCurrency}`);

    // Build GAQL query for account-level metrics
    const query = `
      SELECT
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.average_cpc,
        metrics.ctr,
        metrics.cost_per_conversion
      FROM customer
      WHERE segments.date BETWEEN '${startDate.toISOString().split('T')[0]}' AND '${endDate.toISOString().split('T')[0]}'
      ORDER BY segments.date DESC
    `;

    console.log(`Fetching Google Ads insights for customer ${customerId}`);

    const googleAdsResponse = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': customerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!googleAdsResponse.ok) {
      const errorText = await googleAdsResponse.text();
      console.error('Google Ads API error:', errorText);

      // Check if it's an auth error
      if (googleAdsResponse.status === 401) {
        return c.json({ error: 'Token expired. Please reconnect your Google Ads account.' }, 401);
      }

      return c.json({ error: 'Google Ads API error', details: errorText }, 502);
    }

    // Parse streaming response (NDJSON format)
    const responseText = await googleAdsResponse.text();
    let allResults: GoogleAdsRow[] = [];

    try {
      // Parse the JSON array response
      const jsonResponse = JSON.parse(responseText);

      // Handle array of result batches from searchStream
      if (Array.isArray(jsonResponse)) {
        for (const batch of jsonResponse) {
          if (batch.results) {
            allResults = allResults.concat(batch.results);
          }
        }
      } else if (jsonResponse.results) {
        allResults = jsonResponse.results;
      }
    } catch (parseErr) {
      console.error('Error parsing Google Ads response:', parseErr);
      console.log('Raw response:', responseText.substring(0, 500));
    }

    console.log(`Received ${allResults.length} days of insights`);

    // Process and store metrics
    const metricsToUpsert: Array<{
      connection_id: string;
      metric_date: string;
      metric_type: string;
      metric_value: number;
      currency: string;
    }> = [];

    for (const row of allResults) {
      const metricDate = row.segments?.date;
      if (!metricDate) continue;

      const metrics = row.metrics || {};

      // Impressions (no currency conversion needed)
      if (metrics.impressions) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'impressions',
          metric_value: parseInt(metrics.impressions, 10),
          currency: 'CLP'
        });
      }

      // Clicks (no currency conversion needed)
      if (metrics.clicks) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'clicks',
          metric_value: parseInt(metrics.clicks, 10),
          currency: 'CLP'
        });
      }

      // Ad Spend (costMicros is in millionths of account currency) → convert to CLP
      if (metrics.costMicros) {
        const spendRaw = parseInt(metrics.costMicros, 10) / 1000000;
        const spendCLP = await convertToCLP(spendRaw, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'ad_spend',
          metric_value: Math.round(spendCLP),
          currency: 'CLP'
        });
      }

      // Conversions (count — no conversion needed)
      if (metrics.conversions !== undefined) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'conversions',
          metric_value: metrics.conversions,
          currency: 'CLP'
        });
      }

      // Conversion Value → convert to CLP
      if (metrics.conversionsValue !== undefined) {
        const valueCLP = await convertToCLP(metrics.conversionsValue, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'conversion_value',
          metric_value: Math.round(valueCLP),
          currency: 'CLP'
        });
      }

      // Average CPC → convert to CLP
      if (metrics.averageCpc) {
        const cpcRaw = parseInt(metrics.averageCpc, 10) / 1000000;
        const cpcCLP = await convertToCLP(cpcRaw, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'average_cpc',
          metric_value: Math.round(cpcCLP),
          currency: 'CLP'
        });
      }

      // CTR (ratio — no conversion needed)
      if (metrics.ctr !== undefined) {
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'ctr',
          metric_value: metrics.ctr,
          currency: 'CLP'
        });
      }

      // Cost per Conversion → convert to CLP
      if (metrics.costPerConversion !== undefined) {
        const cpcRaw = metrics.costPerConversion / 1000000;
        const cpcCLP = await convertToCLP(cpcRaw, accountCurrency);
        metricsToUpsert.push({
          connection_id,
          metric_date: metricDate,
          metric_type: 'cost_per_conversion',
          metric_value: Math.round(cpcCLP),
          currency: 'CLP'
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
        return c.json({ error: 'Failed to store metrics', details: upsertError.message }, 500);
      }
    }

    // Update last_sync_at
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection_id);

    console.log('Google Ads sync completed successfully');

    return c.json({
      success: true,
      metrics_synced: metricsToUpsert.length,
      days_processed: allResults.length
    });

  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
