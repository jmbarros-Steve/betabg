import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiFetch } from '../../lib/meta-fetch.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuery } from '../../lib/safe-supabase.js';

/**
 * Cron: Execute all active Meta automated rules across all clients.
 * Runs every hour. Evaluates rules and takes actions on Meta API.
 * POST /api/cron/execute-meta-rules
 */
export async function executeMetaRulesCron(c: Context) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  try {
    // Fetch all active rules grouped by connection
    const { data: activeRules, error } = await supabase
      .from('meta_automated_rules')
      .select('*, platform_connections!inner(id, account_id, access_token_encrypted, client_id, connection_type)')
      .eq('is_active', true);

    if (error) {
      console.error('[execute-meta-rules] Fetch error:', error);
      return c.json({ error: error.message }, 500);
    }

    if (!activeRules?.length) {
      return c.json({ success: true, message: 'No active rules', executed: 0 });
    }

    console.log(`[execute-meta-rules] Found ${activeRules.length} active rules`);

    // Group rules by connection_id
    const byConnection = new Map<string, typeof activeRules>();
    for (const rule of activeRules) {
      const connId = rule.connection_id;
      if (!byConnection.has(connId)) byConnection.set(connId, []);
      byConnection.get(connId)!.push(rule);
    }

    let totalExecuted = 0;
    let totalEvaluated = 0;
    const errors: string[] = [];

    for (const [connectionId, rules] of byConnection) {
      const conn = (rules[0] as any).platform_connections;
      if (!conn?.access_token_encrypted || !conn?.account_id) continue;

      // Resolve token (supports both encrypted and system tokens)
      const decryptedToken = await getTokenForConnection(supabase, conn);
      if (!decryptedToken) {
        errors.push(`Connection ${connectionId}: token resolution failed`);
        continue;
      }

      const accountId = conn.account_id.replace(/^act_/, '');

      // Pre-fetch metrics for the widest time window needed
      const metrics = await safeQuery<any>(
        supabase
          .from('campaign_metrics')
          .select('*')
          .eq('connection_id', connectionId)
          .gte('metric_date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]),
        'executeMetaRules.fetchCampaignMetrics',
      );

      if (!metrics.length) continue;

      for (const rule of rules) {
        totalEvaluated++;
        const condition = rule.condition as any;

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
            return latest.campaign_status === 'ACTIVE';
          });
        } else if (rule.apply_to === 'SPECIFIC_CAMPAIGNS' && rule.specific_campaign_ids?.length) {
          campaignIds = campaignIds.filter(id => rule.specific_campaign_ids.includes(id));
        }

        let ruleTriggered = false;
        for (const campaignId of campaignIds) {
          const group = campaignGroups.get(campaignId)!;
          const metricValue = aggregateMetric(group.rows, condition.metric);

          if (evaluateCondition(metricValue, condition.operator, condition.value, condition.valueTo)) {
            ruleTriggered = true;

            // Execute the action on Meta API
            const action = rule.action as any;
            const actionType = action.type || action.actionType;
            let execDetails = '';
            let executed = false;

            try {
              if (actionType === 'PAUSE_CAMPAIGN') {
                // Uses metaApiFetch: circuit breaker + retry + inter-request delay
                const resp = await metaApiFetch(`/${campaignId}`, decryptedToken, {
                  method: 'POST',
                  body: { status: 'PAUSED' },
                });
                executed = resp.ok;
                execDetails = executed ? 'Campaign paused' : `Pause failed: ${resp.status}`;
              } else if (actionType === 'INCREASE_BUDGET' || actionType === 'DECREASE_BUDGET') {
                const pct = action.percentage || 20;
                const multiplier = actionType === 'INCREASE_BUDGET' ? (1 + pct / 100) : (1 - pct / 100);
                // Fetch ad sets for this campaign via metaApiFetch
                const adsetsResp = await metaApiFetch(`/${campaignId}/adsets`, decryptedToken, {
                  params: { fields: 'id,daily_budget', limit: '50' },
                });
                if (adsetsResp.ok) {
                  const adsetsData: any = await adsetsResp.json();
                  for (const adset of (adsetsData.data || [])) {
                    if (!adset.daily_budget) continue;
                    const newBudget = Math.round(parseFloat(adset.daily_budget) * multiplier);
                    // Each adset update goes through circuit breaker + delay
                    await metaApiFetch(`/${adset.id}`, decryptedToken, {
                      method: 'POST',
                      body: { daily_budget: newBudget },
                    });
                  }
                  executed = true;
                  execDetails = `Budget ${actionType === 'INCREASE_BUDGET' ? 'increased' : 'decreased'} by ${pct}%`;
                }
              } else {
                execDetails = `Unknown action: ${actionType}`;
              }
            } catch (execErr: any) {
              execDetails = `Execution error: ${execErr.message}`;
            }

            // Log execution
            await supabase.from('meta_rule_execution_log').insert({
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
          await supabase.from('meta_automated_rules').update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: (rule.trigger_count || 0) + 1,
          }).eq('id', rule.id);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[execute-meta-rules] Done: ${totalEvaluated} evaluated, ${totalExecuted} executed in ${duration}ms`);

    return c.json({
      success: true,
      evaluated: totalEvaluated,
      executed: totalExecuted,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[execute-meta-rules] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}

function getWindowDays(timeWindow: string): number {
  switch (timeWindow) {
    case 'LAST_24H': return 1;
    case 'LAST_3D': return 3;
    case 'LAST_7D': return 7;
    case 'LAST_14D': return 14;
    case 'LAST_30D': return 30;
    default: return 7;
  }
}

function aggregateMetric(rows: any[], metric: string): number {
  switch (metric) {
    case 'spend': return rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
    case 'impressions': return rows.reduce((s, r) => s + (parseFloat(r.impressions) || 0), 0);
    case 'clicks': return rows.reduce((s, r) => s + (parseFloat(r.clicks) || 0), 0);
    case 'conversions': return rows.reduce((s, r) => s + (parseFloat(r.conversions) || 0), 0);
    case 'revenue': return rows.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
    case 'cpa': {
      const spend = rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      const conv = rows.reduce((s, r) => s + (parseFloat(r.conversions) || 0), 0);
      return conv > 0 ? spend / conv : 0;
    }
    case 'roas': {
      const spend = rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      const rev = rows.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
      return spend > 0 ? rev / spend : 0;
    }
    case 'ctr': {
      const imps = rows.reduce((s, r) => s + (parseFloat(r.impressions) || 0), 0);
      const clicks = rows.reduce((s, r) => s + (parseFloat(r.clicks) || 0), 0);
      return imps > 0 ? (clicks / imps) * 100 : 0;
    }
    case 'cpm': {
      const spend = rows.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      const imps = rows.reduce((s, r) => s + (parseFloat(r.impressions) || 0), 0);
      return imps > 0 ? (spend / imps) * 1000 : 0;
    }
    default: return 0;
  }
}

function evaluateCondition(value: number, operator: string, threshold: number, valueTo?: number): boolean {
  switch (operator) {
    case 'GREATER_THAN': return value > threshold;
    case 'LESS_THAN': return value < threshold;
    case 'EQUAL_TO': return Math.abs(value - threshold) < 0.01;
    case 'BETWEEN': return valueTo !== undefined && value >= threshold && value <= valueTo;
    default: return false;
  }
}
