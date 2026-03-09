import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v18.0';

type Action = 'list' | 'create' | 'update' | 'delete' | 'toggle' | 'execute';

interface RequestBody {
  action: Action;
  client_id: string;
  connection_id: string;
  rule_id?: string;
  data?: Record<string, any>;
}

// Helper: make a Meta Graph API request (same as manage-meta-campaign)
async function metaApiRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (method === 'GET') {
    url.searchParams.set('access_token', accessToken);
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
  } else {
    fetchOptions.body = JSON.stringify({ ...body, access_token: accessToken });
  }

  const response = await fetch(url.toString(), fetchOptions);
  const responseData: any = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || 'Unknown Meta API error';
    console.error(`Meta API error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }
  return { ok: true, data: responseData };
}

// --- Time window helpers ---

function getDateRangeForWindow(timeWindow: string): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().split('T')[0];
  let daysBack = 7;
  switch (timeWindow) {
    case 'LAST_3_DAYS': daysBack = 3; break;
    case 'LAST_7_DAYS': daysBack = 7; break;
    case 'LAST_14_DAYS': daysBack = 14; break;
    case 'LAST_30_DAYS': daysBack = 30; break;
  }
  const sinceDate = new Date(now.getTime() - daysBack * 86400000);
  return { since: sinceDate.toISOString().split('T')[0], until };
}

// --- Condition evaluator ---

function evaluateCondition(
  metricValue: number,
  operator: string,
  threshold: number,
  thresholdTo?: number
): boolean {
  switch (operator) {
    case 'GREATER_THAN': return metricValue > threshold;
    case 'LESS_THAN': return metricValue < threshold;
    case 'EQUALS': return Math.abs(metricValue - threshold) < 0.01;
    case 'BETWEEN': return metricValue >= threshold && metricValue <= (thresholdTo ?? threshold);
    default: return false;
  }
}

// --- Metric aggregator ---

function aggregateMetric(
  rows: any[],
  metric: string
): number {
  if (rows.length === 0) return 0;
  switch (metric) {
    case 'SPEND':
      return rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
    case 'IMPRESSIONS':
      return rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
    case 'CLICKS':
      return rows.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
    case 'CONVERSIONS':
      return rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0);
    case 'CPA': {
      const spend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const conv = rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0);
      return conv > 0 ? spend / conv : 0;
    }
    case 'ROAS': {
      const sp = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const rev = rows.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0);
      return sp > 0 ? rev / sp : 0;
    }
    case 'CTR': {
      const imp = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
      const clk = rows.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
      return imp > 0 ? (clk / imp) * 100 : 0;
    }
    case 'CPM': {
      const sp2 = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const imp2 = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
      return imp2 > 0 ? (sp2 / imp2) * 1000 : 0;
    }
    case 'FREQUENCY': {
      const imp3 = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
      // Frequency = impressions / reach, but we don't have reach. Use impressions/clicks as proxy.
      const clk3 = rows.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
      return clk3 > 0 ? imp3 / clk3 : 0;
    }
    default: return 0;
  }
}

// --- Execute a single rule action ---

async function executeRuleAction(
  rule: any,
  campaignId: string,
  campaignName: string,
  metricValue: number,
  accessToken: string,
  accountId: string,
  supabase: any
): Promise<{ executed: boolean; details: string }> {
  const action = rule.action;
  const actionType = action.type || action.actionType;

  switch (actionType) {
    case 'PAUSE_CAMPAIGN': {
      const result = await metaApiRequest(campaignId, accessToken, 'POST', { status: 'PAUSED' });
      if (result.ok) {
        return { executed: true, details: `Campaña "${campaignName}" pausada. Métrica: ${metricValue.toFixed(2)}` };
      }
      return { executed: false, details: `Error pausando campaña: ${result.error}` };
    }

    case 'INCREASE_BUDGET':
    case 'DECREASE_BUDGET': {
      const pct = action.percentage || 20;
      const multiplier = actionType === 'INCREASE_BUDGET' ? 1 + pct / 100 : 1 - pct / 100;
      // Fetch ad sets for this campaign
      const adsetsResult = await metaApiRequest(`${campaignId}/adsets`, accessToken, 'GET', {
        fields: 'id,daily_budget',
        limit: '50',
      });
      if (!adsetsResult.ok) {
        return { executed: false, details: `Error obteniendo ad sets: ${adsetsResult.error}` };
      }
      let updated = 0;
      for (const adset of adsetsResult.data?.data || []) {
        if (adset.daily_budget) {
          const newBudget = Math.round(Number(adset.daily_budget) * multiplier);
          const updateResult = await metaApiRequest(adset.id, accessToken, 'POST', {
            daily_budget: String(newBudget),
          });
          if (updateResult.ok) updated++;
        }
      }
      const direction = actionType === 'INCREASE_BUDGET' ? 'aumentado' : 'reducido';
      return { executed: true, details: `Presupuesto ${direction} ${pct}% en ${updated} ad sets de "${campaignName}"` };
    }

    case 'SCALE_BUDGET': {
      const targetAmount = action.amount || 0;
      const adsetsResult2 = await metaApiRequest(`${campaignId}/adsets`, accessToken, 'GET', {
        fields: 'id,daily_budget',
        limit: '50',
      });
      if (!adsetsResult2.ok) {
        return { executed: false, details: `Error obteniendo ad sets: ${adsetsResult2.error}` };
      }
      let updated2 = 0;
      for (const adset of adsetsResult2.data?.data || []) {
        const updateResult = await metaApiRequest(adset.id, accessToken, 'POST', {
          daily_budget: String(Math.round(targetAmount * 100)), // cents
        });
        if (updateResult.ok) updated2++;
      }
      return { executed: true, details: `Presupuesto escalado a $${targetAmount.toLocaleString()} en ${updated2} ad sets de "${campaignName}"` };
    }

    case 'SEND_NOTIFICATION': {
      // For now just log it — no email/push infra
      return { executed: true, details: `Notificación: "${campaignName}" - métrica ${metricValue.toFixed(2)}` };
    }

    default:
      return { executed: false, details: `Acción desconocida: ${actionType}` };
  }
}

// --- Main handler ---

export async function manageMetaRules(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Verify JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const body: RequestBody = await c.req.json();
    const { action, client_id, connection_id, rule_id, data } = body;

    if (!action) return c.json({ error: 'Missing action' }, 400);
    if (!client_id) return c.json({ error: 'Missing client_id' }, 400);
    if (!connection_id) return c.json({ error: 'Missing connection_id' }, 400);

    const validActions: Action[] = ['list', 'create', 'update', 'delete', 'toggle', 'execute'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}` }, 400);
    }

    console.log(`[manage-meta-rules] Action: ${action}, Client: ${client_id}, Connection: ${connection_id}`);

    // --- LIST ---
    if (action === 'list') {
      const { data: rules, error: rulesError } = await supabase
        .from('meta_automated_rules')
        .select('*')
        .eq('client_id', client_id)
        .eq('connection_id', connection_id)
        .order('created_at', { ascending: false });

      if (rulesError) {
        console.error('[manage-meta-rules] List error:', rulesError);
        return c.json({ error: 'Failed to fetch rules' }, 500);
      }

      const { data: logs, error: logsError } = await supabase
        .from('meta_rule_execution_log')
        .select('*')
        .eq('client_id', client_id)
        .order('executed_at', { ascending: false })
        .limit(50);

      return c.json({ rules: rules || [], logs: logs || [] });
    }

    // --- CREATE ---
    if (action === 'create') {
      if (!data) return c.json({ error: 'Missing data' }, 400);

      const { data: newRule, error: createError } = await supabase
        .from('meta_automated_rules')
        .insert({
          client_id,
          connection_id,
          name: data.name,
          condition: data.condition,
          action: data.action,
          apply_to: data.apply_to || 'ACTIVE_ONLY',
          specific_campaign_ids: data.specific_campaign_ids || [],
          check_frequency: data.check_frequency || 'EVERY_1_HOUR',
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        console.error('[manage-meta-rules] Create error:', createError);
        return c.json({ error: 'Failed to create rule' }, 500);
      }
      return c.json({ success: true, rule: newRule });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);
      if (!data) return c.json({ error: 'Missing data' }, 400);

      const updateFields: Record<string, any> = {};
      if (data.name !== undefined) updateFields.name = data.name;
      if (data.condition !== undefined) updateFields.condition = data.condition;
      if (data.action !== undefined) updateFields.action = data.action;
      if (data.apply_to !== undefined) updateFields.apply_to = data.apply_to;
      if (data.specific_campaign_ids !== undefined) updateFields.specific_campaign_ids = data.specific_campaign_ids;
      if (data.check_frequency !== undefined) updateFields.check_frequency = data.check_frequency;

      const { error: updateError } = await supabase
        .from('meta_automated_rules')
        .update(updateFields)
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (updateError) {
        console.error('[manage-meta-rules] Update error:', updateError);
        return c.json({ error: 'Failed to update rule' }, 500);
      }
      return c.json({ success: true });
    }

    // --- DELETE ---
    if (action === 'delete') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);

      const { error: deleteError } = await supabase
        .from('meta_automated_rules')
        .delete()
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (deleteError) {
        console.error('[manage-meta-rules] Delete error:', deleteError);
        return c.json({ error: 'Failed to delete rule' }, 500);
      }
      return c.json({ success: true });
    }

    // --- TOGGLE ---
    if (action === 'toggle') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);

      // Fetch current state
      const { data: currentRule } = await supabase
        .from('meta_automated_rules')
        .select('is_active')
        .eq('id', rule_id)
        .eq('client_id', client_id)
        .single();

      if (!currentRule) return c.json({ error: 'Rule not found' }, 404);

      const { error: toggleError } = await supabase
        .from('meta_automated_rules')
        .update({ is_active: !currentRule.is_active })
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (toggleError) {
        console.error('[manage-meta-rules] Toggle error:', toggleError);
        return c.json({ error: 'Failed to toggle rule' }, 500);
      }
      return c.json({ success: true, is_active: !currentRule.is_active });
    }

    // --- EXECUTE ---
    if (action === 'execute') {
      // Fetch active rules
      const { data: activeRules, error: rulesError } = await supabase
        .from('meta_automated_rules')
        .select('*')
        .eq('client_id', client_id)
        .eq('connection_id', connection_id)
        .eq('is_active', true);

      if (rulesError || !activeRules?.length) {
        return c.json({ success: true, executed: 0, message: 'No hay reglas activas' });
      }

      // Get connection for Meta API access
      const { data: connection, error: connError } = await supabase
        .from('platform_connections')
        .select('id, account_id, access_token_encrypted')
        .eq('id', connection_id)
        .eq('platform', 'meta')
        .single();

      if (connError || !connection) {
        return c.json({ error: 'Connection not found' }, 404);
      }

      const { data: decryptedToken, error: decryptError } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

      if (decryptError || !decryptedToken) {
        return c.json({ error: 'Failed to decrypt token' }, 500);
      }

      const accountId = connection.account_id!.replace(/^act_/, '');
      let totalExecuted = 0;
      const results: any[] = [];

      for (const rule of activeRules) {
        const condition = rule.condition as any;
        const { since, until } = getDateRangeForWindow(condition.timeWindow);

        // Fetch campaign metrics for the time window
        const { data: metrics, error: metricsError } = await supabase
          .from('campaign_metrics')
          .select('*')
          .eq('connection_id', connection_id)
          .gte('metric_date', since)
          .lte('metric_date', until);

        if (metricsError || !metrics?.length) continue;

        // Group metrics by campaign
        const campaignGroups = new Map<string, { name: string; rows: any[] }>();
        for (const row of metrics) {
          const existing = campaignGroups.get(row.campaign_id);
          if (existing) {
            existing.rows.push(row);
          } else {
            campaignGroups.set(row.campaign_id, { name: row.campaign_name, rows: [row] });
          }
        }

        // Filter campaigns based on apply_to
        let campaignIds = Array.from(campaignGroups.keys());
        if (rule.apply_to === 'SPECIFIC_CAMPAIGNS' && rule.specific_campaign_ids?.length) {
          campaignIds = campaignIds.filter(id => rule.specific_campaign_ids.includes(id));
        }

        // Evaluate and execute for each campaign
        for (const campaignId of campaignIds) {
          const group = campaignGroups.get(campaignId)!;
          const metricValue = aggregateMetric(group.rows, condition.metric);

          if (evaluateCondition(metricValue, condition.operator, condition.value, condition.valueTo)) {
            const execResult = await executeRuleAction(
              rule, campaignId, group.name, metricValue,
              decryptedToken, accountId, supabase
            );

            // Log execution
            await supabase.from('meta_rule_execution_log').insert({
              rule_id: rule.id,
              client_id,
              campaign_id: campaignId,
              campaign_name: group.name,
              action_type: (rule.action as any).type || (rule.action as any).actionType,
              details: execResult.details,
              metrics_snapshot: { metric: condition.metric, value: metricValue, threshold: condition.value },
              executed_at: new Date().toISOString(),
            });

            if (execResult.executed) totalExecuted++;
            results.push({ rule: rule.name, campaign: group.name, ...execResult });
          }
        }

        // Update rule metadata
        await supabase
          .from('meta_automated_rules')
          .update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: (rule.trigger_count || 0) + 1,
          })
          .eq('id', rule.id);
      }

      return c.json({ success: true, executed: totalExecuted, results });
    }

    return c.json({ error: 'Unhandled action' }, 400);

  } catch (error: any) {
    console.error('[manage-meta-rules] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
