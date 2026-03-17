import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_BASE = 'https://graph.facebook.com/v21.0';

async function metaApiRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, any>
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  const fetchOptions: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };

  (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;

  if (method === 'GET') {
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
  } else {
    fetchOptions.body = JSON.stringify(body || {});
  }

  const response = await fetch(url.toString(), fetchOptions);
  const responseData = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || 'Unknown Meta API error';
    return { ok: false, error: errorMessage };
  }
  return { ok: true, data: responseData };
}

// Map time window to days for querying campaign_metrics
function timeWindowToDays(tw: string): number {
  switch (tw) {
    case 'LAST_3_DAYS': return 3;
    case 'LAST_7_DAYS': return 7;
    case 'LAST_14_DAYS': return 14;
    case 'LAST_30_DAYS': return 30;
    default: return 7;
  }
}

function evaluateCondition(
  metric: string,
  operator: string,
  value: number,
  valueTo: number | undefined,
  actual: number
): boolean {
  switch (operator) {
    case 'GREATER_THAN': return actual > value;
    case 'LESS_THAN': return actual < value;
    case 'EQUALS': return Math.abs(actual - value) < 0.01;
    case 'BETWEEN': return valueTo != null && actual >= value && actual <= valueTo;
    default: return false;
  }
}

function getMetricFromCampaign(metric: string, campaign: Record<string, any>): number {
  switch (metric) {
    case 'CPA': {
      const spend = parseFloat(campaign.spend || '0');
      const conv = parseFloat(campaign.conversions || '0');
      return conv > 0 ? spend / conv : 0;
    }
    case 'ROAS': return parseFloat(campaign.roas || '0');
    case 'CTR': return parseFloat(campaign.ctr || '0');
    case 'SPEND': return parseFloat(campaign.spend || '0');
    case 'IMPRESSIONS': return parseFloat(campaign.impressions || '0');
    case 'CLICKS': return parseFloat(campaign.clicks || '0');
    case 'CONVERSIONS': return parseFloat(campaign.conversions || '0');
    case 'FREQUENCY': return parseFloat(campaign.frequency || '0');
    default: return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { client_id, connection_id } = body;

    if (!client_id || !connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: client_id, connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const { data: client } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .maybeSingle();

    if (!client || (client.user_id !== user.id && client.client_user_id !== user.id)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active rules for this client
    const { data: rules, error: rulesErr } = await supabase
      .from('meta_automated_rules')
      .select('*')
      .eq('client_id', client_id)
      .eq('connection_id', connection_id)
      .eq('is_active', true);

    if (rulesErr || !rules?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active rules to execute', executed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[execute-meta-rules] Found ${rules.length} active rules for client ${client_id}`);

    // Fetch campaign metrics from DB (already synced)
    // Note: campaign_metrics uses connection_id, not client_id
    const { data: campaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('connection_id', connection_id)
      .eq('platform', 'meta');

    if (!campaigns?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No campaign metrics found', executed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token for Meta API actions
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('access_token_encrypted, account_id')
      .eq('id', connection_id)
      .maybeSingle();

    let accessToken: string | null = null;
    if (connection?.access_token_encrypted) {
      const { data: decrypted } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });
      accessToken = decrypted;
    }

    const executionResults: Array<{ rule_id: string; campaign_id: string; action: string; details: string }> = [];

    for (const rule of rules) {
      const condition = rule.condition as { metric: string; operator: string; value: number; valueTo?: number; timeWindow: string };
      const ruleAction = rule.action as { type: string; percentage?: number; amount?: number; notificationType?: string };

      // Filter campaigns based on apply_to
      let targetCampaigns = [...campaigns];
      if (rule.apply_to === 'ACTIVE_ONLY') {
        targetCampaigns = targetCampaigns.filter((c: any) => c.status === 'ACTIVE');
      } else if (rule.apply_to === 'SPECIFIC_CAMPAIGNS' && rule.specific_campaign_ids?.length) {
        targetCampaigns = targetCampaigns.filter((c: any) => rule.specific_campaign_ids.includes(c.campaign_id));
      }

      for (const campaign of targetCampaigns) {
        const actualValue = getMetricFromCampaign(condition.metric, campaign);
        const triggered = evaluateCondition(condition.metric, condition.operator, condition.value, condition.valueTo, actualValue);

        if (!triggered) continue;

        let details = `${condition.metric} = ${actualValue.toFixed(2)} (threshold: ${condition.operator} ${condition.value})`;
        let actionExecuted = false;

        switch (ruleAction.type) {
          case 'PAUSE_CAMPAIGN': {
            if (accessToken && campaign.campaign_id) {
              const result = await metaApiRequest(campaign.campaign_id, accessToken, 'POST', { status: 'PAUSED' });
              actionExecuted = result.ok;
              details += ` → Campaign paused`;
            }
            break;
          }
          case 'INCREASE_BUDGET':
          case 'DECREASE_BUDGET': {
            if (accessToken && campaign.campaign_id) {
              // Fetch current ad sets to update budgets
              const adsetsResult = await metaApiRequest(`${campaign.campaign_id}/adsets`, accessToken, 'GET', { fields: 'id,daily_budget', limit: '100' });
              if (adsetsResult.ok && adsetsResult.data?.data) {
                const pct = (ruleAction.percentage || 20) / 100;
                const multiplier = ruleAction.type === 'INCREASE_BUDGET' ? (1 + pct) : (1 - pct);
                for (const adset of adsetsResult.data.data) {
                  if (adset.daily_budget) {
                    const newBudget = Math.round(Number(adset.daily_budget) * multiplier);
                    await metaApiRequest(adset.id, accessToken, 'POST', { daily_budget: newBudget });
                  }
                }
                actionExecuted = true;
                details += ` → Budget ${ruleAction.type === 'INCREASE_BUDGET' ? 'increased' : 'decreased'} by ${ruleAction.percentage}%`;
              }
            }
            break;
          }
          case 'SCALE_BUDGET': {
            if (accessToken && campaign.campaign_id && ruleAction.amount) {
              const adsetsResult = await metaApiRequest(`${campaign.campaign_id}/adsets`, accessToken, 'GET', { fields: 'id', limit: '100' });
              if (adsetsResult.ok && adsetsResult.data?.data) {
                const budgetCents = Math.round(ruleAction.amount * 100);
                for (const adset of adsetsResult.data.data) {
                  await metaApiRequest(adset.id, accessToken, 'POST', { daily_budget: budgetCents });
                }
                actionExecuted = true;
                details += ` → Budget scaled to ${ruleAction.amount}`;
              }
            }
            break;
          }
          case 'SEND_NOTIFICATION': {
            // Just log the notification - actual notification sending can be added later
            actionExecuted = true;
            details += ` → Notification triggered (${ruleAction.notificationType || 'IN_APP'})`;
            break;
          }
        }

        if (actionExecuted) {
          // Log execution
          await supabase.from('meta_rule_execution_log').insert({
            rule_id: rule.id,
            client_id,
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.campaign_name || '',
            action_type: ruleAction.type,
            details,
            metrics_snapshot: {
              spend: campaign.spend,
              roas: campaign.roas,
              ctr: campaign.ctr,
              conversions: campaign.conversions,
              cpa: actualValue,
            },
          });

          // Update rule trigger stats
          await supabase
            .from('meta_automated_rules')
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (rule.trigger_count || 0) + 1,
            })
            .eq('id', rule.id);

          executionResults.push({
            rule_id: rule.id,
            campaign_id: campaign.campaign_id,
            action: ruleAction.type,
            details,
          });
        }
      }
    }

    console.log(`[execute-meta-rules] Executed ${executionResults.length} actions`);

    return new Response(
      JSON.stringify({ success: true, executed: executionResults.length, results: executionResults }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[execute-meta-rules] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
