import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

/**
 * Cron: Execute all active Google Ads automated rules across all clients.
 * Runs every hour. Evaluates rules and takes actions on Google Ads API.
 * POST /api/cron/execute-google-rules
 */
export async function executeGoogleRulesCron(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const startTime = Date.now();
  const supabase = getSupabaseAdmin();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    return c.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not set' }, 500);
  }

  // Mutex lock
  const lockKey = 'cron_lock_execute_google_rules';
  const { data: lockRow } = await supabase
    .from('steve_knowledge')
    .select('id, contenido')
    .eq('categoria', 'system')
    .eq('titulo', lockKey)
    .maybeSingle();

  const lockNow = new Date();
  if (lockRow) {
    const lockedAt = new Date(lockRow.contenido || '');
    const lockAgeMinutes = (lockNow.getTime() - lockedAt.getTime()) / 60000;
    if (lockAgeMinutes < 10) {
      console.log(`[execute-google-rules] Already running (locked ${Math.round(lockAgeMinutes)}min ago), skipping`);
      return c.json({ skipped: true, reason: 'Another run in progress' });
    }
  }

  // Acquire lock
  await supabase.from('steve_knowledge').upsert(
    { categoria: 'system', titulo: lockKey, contenido: lockNow.toISOString(), activo: true, orden: 0 },
    { onConflict: 'categoria,titulo' },
  );

  try {
    // Fetch all active rules with connection data
    const { data: activeRules, error } = await supabase
      .from('google_automated_rules')
      .select('*, platform_connections(id, account_id, access_token_encrypted, refresh_token_encrypted, client_id, connection_type)')
      .eq('is_active', true);

    if (error) {
      console.error('[execute-google-rules] Fetch error:', error);
      return c.json({ error: error.message }, 500);
    }

    if (!activeRules?.length) {
      return c.json({ success: true, message: 'No active rules', executed: 0 });
    }

    console.log(`[execute-google-rules] Found ${activeRules.length} active rules`);

    // Group rules by connection_id
    const byConnection = new Map<string, typeof activeRules>();
    for (const rule of activeRules) {
      if (!rule.platform_connections) {
        console.warn(`[execute-google-rules] Rule ${rule.id}: connection deleted, skipping`);
        continue;
      }
      const connId = rule.connection_id;
      if (!byConnection.has(connId)) byConnection.set(connId, []);
      byConnection.get(connId)!.push(rule);
    }

    let totalExecuted = 0;
    let totalEvaluated = 0;
    const errors: string[] = [];

    for (const [connectionId, rules] of byConnection) {
      const conn = (rules[0] as any).platform_connections;
      if (!conn?.account_id) continue;

      // Resolve token
      let accessToken: string;
      let loginCustomerId: string;
      try {
        const tokenResult = await getGoogleTokenForConnection(supabase, conn);
        accessToken = tokenResult.accessToken;
        loginCustomerId = tokenResult.mccCustomerId || conn.account_id;
      } catch (tokenErr: any) {
        console.warn(`[execute-google-rules] Connection ${connectionId}: token error: ${tokenErr.message}`);
        errors.push(`Connection ${connectionId}: ${tokenErr.message}`);
        continue;
      }

      // Pre-fetch metrics for widest window (31 days)
      const metrics = await safeQuery<any>(
        supabase
          .from('campaign_metrics')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('platform', 'google')
          .gte('metric_date', new Date(Date.now() - 31 * 86400000).toISOString().split('T')[0])
          .lt('metric_date', new Date().toISOString().split('T')[0]),
        'executeGoogleRules.fetchCampaignMetrics',
      );

      if (!metrics.length) continue;

      for (const rule of rules) {
        totalEvaluated++;
        const condition = rule.condition as any;

        const conditionValue = Number(condition.value);
        if (isNaN(conditionValue)) {
          console.warn(`[execute-google-rules] Rule ${rule.id}: invalid condition.value, skipping`);
          continue;
        }
        condition.value = conditionValue;

        // Filter metrics by time window
        const windowDays = getWindowDays(condition.timeWindow);
        const sinceDate = new Date(Date.now() - windowDays * 86400000).toISOString().split('T')[0];
        const windowMetrics = metrics.filter((m: any) => m.metric_date >= sinceDate);
        if (!windowMetrics.length) continue;

        // Group by campaign
        const campaignGroups = new Map<string, { name: string; rows: any[] }>();
        for (const row of windowMetrics) {
          const existing = campaignGroups.get(row.campaign_id);
          if (existing) existing.rows.push(row);
          else campaignGroups.set(row.campaign_id, { name: row.campaign_name, rows: [row] });
        }

        // Filter campaigns by apply_to
        let campaignIds = Array.from(campaignGroups.keys());
        if (rule.apply_to === 'ACTIVE_ONLY') {
          campaignIds = campaignIds.filter(id => {
            const group = campaignGroups.get(id)!;
            const latest = group.rows.reduce((a: any, b: any) =>
              (a.metric_date > b.metric_date ? a : b), group.rows[0]);
            return latest.campaign_status === 'ACTIVE' || latest.campaign_status === 'ENABLED';
          });
        } else if (rule.apply_to === 'SPECIFIC_CAMPAIGNS' && rule.specific_campaign_ids?.length) {
          campaignIds = campaignIds.filter(id => rule.specific_campaign_ids.includes(id));
        }

        let ruleTriggered = false;
        for (const campaignId of campaignIds) {
          const group = campaignGroups.get(campaignId)!;
          const metricValue = aggregateMetric(group.rows, condition.metric);

          if (evaluateCondition(metricValue, condition.operator, condition.value)) {
            ruleTriggered = true;

            const action = rule.action as any;
            const actionType = action.type || action.actionType;
            let execDetails = '';
            let executed = false;

            try {
              const customerId = conn.account_id;

              if (actionType === 'PAUSE_CAMPAIGN') {
                const resp = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
                  campaignOperation: {
                    update: {
                      resourceName: `customers/${customerId}/campaigns/${campaignId}`,
                      status: 'PAUSED',
                    },
                    updateMask: 'status',
                  },
                }]);
                executed = resp.ok;
                execDetails = executed ? 'Campaign paused' : `Pause failed: ${resp.error}`;
              } else if (actionType === 'INCREASE_BUDGET' || actionType === 'DECREASE_BUDGET') {
                const pct = action.percentage || 20;
                const multiplier = actionType === 'INCREASE_BUDGET' ? (1 + pct / 100) : (1 - pct / 100);

                // Get budget resource
                const budgetQuery = `SELECT campaign.campaign_budget, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId}`;
                const budgetResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, budgetQuery);

                if (budgetResult.ok && budgetResult.data?.length) {
                  const budgetResourceName = budgetResult.data[0]?.campaign?.campaignBudget;
                  const currentMicros = Number(budgetResult.data[0]?.campaignBudget?.amountMicros || 0);
                  if (budgetResourceName && currentMicros > 0) {
                    const newMicros = Math.round(currentMicros * multiplier).toString();
                    const mutateResult = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
                      campaignBudgetOperation: {
                        update: { resourceName: budgetResourceName, amountMicros: newMicros },
                        updateMask: 'amount_micros',
                      },
                    }]);
                    executed = mutateResult.ok;
                    const direction = actionType === 'INCREASE_BUDGET' ? 'increased' : 'decreased';
                    execDetails = executed
                      ? `Budget ${direction} by ${pct}%`
                      : `Budget update failed: ${mutateResult.error}`;
                  }
                }
              } else if (actionType === 'SEND_NOTIFICATION') {
                executed = true;
                execDetails = `Notification: "${group.name}" - metric ${metricValue.toFixed(2)}`;
              } else {
                execDetails = `Unknown action: ${actionType}`;
              }
            } catch (execErr: any) {
              console.error(`[execute-google-rules] Action error for campaign ${campaignId}:`, execErr.message);
              execDetails = `Execution error: ${execErr.message}`;
            }

            // Log execution
            await supabase.from('google_rule_execution_log').insert({
              rule_id: rule.id,
              client_id: rule.client_id,
              campaign_id: campaignId,
              campaign_name: group.name,
              action_type: actionType,
              details: execDetails,
              metrics_snapshot: { metric: condition.metric, value: metricValue, threshold: condition.value },
              executed_at: new Date().toISOString(),
            });

            if (executed) totalExecuted++;
          }
        }

        if (ruleTriggered) {
          const currentCount = (rule.trigger_count as number) || 0;
          await supabase.from('google_automated_rules').update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: currentCount + 1,
          }).eq('id', rule.id).eq('trigger_count', currentCount);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[execute-google-rules] Done: ${totalEvaluated} evaluated, ${totalExecuted} executed in ${duration}ms`);

    return c.json({
      success: true,
      evaluated: totalEvaluated,
      executed: totalExecuted,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[execute-google-rules] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  } finally {
    await supabase
      .from('steve_knowledge')
      .delete()
      .eq('categoria', 'system')
      .eq('titulo', lockKey);
  }
}

// --- Google Ads API helpers (duplicated to avoid coupling) ---

async function googleAdsQuery(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  query: string
): Promise<{ ok: boolean; data?: any[]; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(loginCustomerId);
  if (response.status === 403 && loginCustomerId !== customerId) {
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `Google Ads API error (${response.status})` };
  }

  const responseText = await response.text();
  let results: any[] = [];
  try {
    const json = JSON.parse(responseText);
    if (Array.isArray(json)) {
      for (const batch of json) {
        if (batch.results) results = results.concat(batch.results);
      }
    } else if (json.results) {
      results = json.results;
    }
  } catch {
    return { ok: false, error: 'Failed to parse response' };
  }

  return { ok: true, data: results };
}

async function googleAdsMutate(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  mutateOperations: any[]
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:mutate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutateOperations }),
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(loginCustomerId);
  if (response.status === 403 && loginCustomerId !== customerId) {
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google Ads API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      const detail = errJson?.error?.message || errJson?.[0]?.error?.message;
      if (detail) errorMessage = detail;
    } catch {}
    return { ok: false, error: errorMessage };
  }

  const data = await response.json();
  return { ok: true, data };
}

// --- Helpers ---

function getWindowDays(timeWindow: string): number {
  switch (timeWindow) {
    case 'LAST_3_DAYS': return 3;
    case 'LAST_7_DAYS': return 7;
    case 'LAST_14_DAYS': return 14;
    case 'LAST_30_DAYS': return 30;
    default: return 7;
  }
}

function aggregateMetric(rows: any[], metric: string): number {
  const m = (metric || '').toLowerCase();
  switch (m) {
    case 'spend':
      return rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
    case 'impressions':
      return rows.reduce((s, r) => s + (parseFloat(r.impressions) || 0), 0);
    case 'clicks':
      return rows.reduce((s, r) => s + (parseFloat(r.clicks) || 0), 0);
    case 'conversions':
      return rows.reduce((s, r) => s + (parseFloat(r.conversions) || 0), 0);
    case 'cpa': {
      const spend = rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      const conv = rows.reduce((s, r) => s + (parseFloat(r.conversions) || 0), 0);
      return conv > 0 ? spend / conv : 0;
    }
    case 'roas': {
      const spend = rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      const rev = rows.reduce((s, r) => s + (parseFloat(r.conversion_value) || 0), 0);
      return spend > 0 ? rev / spend : 0;
    }
    case 'ctr': {
      const imps = rows.reduce((s, r) => s + (parseFloat(r.impressions) || 0), 0);
      const clicks = rows.reduce((s, r) => s + (parseFloat(r.clicks) || 0), 0);
      return imps > 0 ? (clicks / imps) * 100 : 0;
    }
    default: return 0;
  }
}

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'GREATER_THAN': return value > threshold;
    case 'LESS_THAN': return value < threshold;
    case 'EQUALS': return Math.abs(value - threshold) < 0.01;
    default: return false;
  }
}
