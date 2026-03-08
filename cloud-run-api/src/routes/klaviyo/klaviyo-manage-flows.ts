import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_GET_REVISION = '2024-10-15';
const KLAVIYO_POST_REVISION = '2025-01-15';

function makeGetHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'revision': KLAVIYO_GET_REVISION,
  };
}

function makePostHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json',
    'revision': KLAVIYO_POST_REVISION,
  };
}

async function klaviyoGet(url: string, apiKey: string): Promise<any> {
  const res = await fetch(url, { headers: makeGetHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Klaviyo GET error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function klaviyoPost(url: string, apiKey: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: makePostHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Klaviyo POST error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function klaviyoManageFlows(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const serviceClient = getSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { connectionId, action } = body;

    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    // Verify connection ownership
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Decrypt API key
    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    // Route to action handler
    switch (action) {
      case 'list_flows':
        return await handleListFlows(c, apiKey);
      case 'get_flow_detail':
        return await handleGetFlowDetail(c, apiKey, body);
      case 'create_flow':
        return await handleCreateFlow(c, apiKey, serviceClient, connection, body);
      case 'get_flow_metrics':
        return await handleGetFlowMetrics(c, apiKey, body);
      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error('Error in klaviyo-manage-flows:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}

// ===============================================================
// Action: list_flows
// ===============================================================
async function handleListFlows(c: Context, apiKey: string) {
  const allFlows: any[] = [];
  let url: string | null = `${KLAVIYO_BASE}/flows/`;
  while (url) {
    const data: any = await klaviyoGet(url, apiKey);
    for (const f of (data.data || [])) {
      allFlows.push({
        id: f.id,
        name: f.attributes?.name || 'Sin nombre',
        status: f.attributes?.status || 'manual',
        trigger_type: f.attributes?.trigger_type || null,
        created: f.attributes?.created,
        updated: f.attributes?.updated,
      });
    }
    url = data.links?.next || null;
  }

  return c.json({ flows: allFlows });
}

// ===============================================================
// Action: get_flow_detail
// ===============================================================
async function handleGetFlowDetail(c: Context, apiKey: string, body: any) {
  const { flowId } = body;

  if (!flowId) {
    return c.json({ error: 'flowId required' }, 400);
  }

  const data: any = await klaviyoGet(
    `${KLAVIYO_BASE}/flows/${flowId}/?include=flow-actions`,
    apiKey,
  );

  const flow = {
    id: data.data?.id,
    name: data.data?.attributes?.name || 'Sin nombre',
    status: data.data?.attributes?.status || 'manual',
    trigger_type: data.data?.attributes?.trigger_type || null,
    created: data.data?.attributes?.created,
    updated: data.data?.attributes?.updated,
  };

  const actions = (data.included || [])
    .filter((item: any) => item.type === 'flow-action')
    .map((a: any) => ({
      id: a.id,
      action_type: a.attributes?.action_type || null,
      status: a.attributes?.status || null,
      settings: a.attributes?.settings || {},
      created: a.attributes?.created,
      updated: a.attributes?.updated,
    }));

  const messages = (data.included || [])
    .filter((item: any) => item.type === 'flow-message')
    .map((m: any) => ({
      id: m.id,
      name: m.attributes?.name || null,
      channel: m.attributes?.channel || 'email',
      content: m.attributes?.content || {},
      created: m.attributes?.created,
      updated: m.attributes?.updated,
    }));

  return c.json({ flow, actions, messages });
}

// ===============================================================
// Action: create_flow
// Creates templates in Klaviyo and stores a flow plan in DB
// (Klaviyo API does not support full programmatic flow creation)
// ===============================================================
async function handleCreateFlow(
  c: Context,
  apiKey: string,
  serviceClient: any,
  connection: any,
  body: any,
) {
  const { name, triggerType, emails } = body;

  if (!name || !emails || !Array.isArray(emails) || emails.length === 0) {
    return c.json({ error: 'name and emails array required' }, 400);
  }

  const templateIds: string[] = [];
  const emailSteps: any[] = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const templateName = `${name} - Step ${i + 1}: ${email.subject}`;

    console.log(`[${i + 1}/${emails.length}] Creating template: ${templateName}`);

    // Create template in Klaviyo
    const templateData: any = await klaviyoPost(`${KLAVIYO_BASE}/templates/`, apiKey, {
      data: {
        type: 'template',
        attributes: {
          name: templateName,
          editor_type: 'CODE',
          html: email.htmlContent || generateDefaultFlowHtml(email.subject, ''),
          text: email.subject,
        },
      },
    });

    const templateId = templateData.data.id;
    templateIds.push(templateId);
    console.log(`  Template created: ${templateId}`);

    emailSteps.push({
      id: `step-${i + 1}`,
      subject: email.subject,
      previewText: email.previewText || '',
      content: email.htmlContent || '',
      delayDays: Math.floor((email.delaySeconds || 0) / 86400),
      delayHours: Math.floor(((email.delaySeconds || 0) % 86400) / 3600),
      templateId,
    });
  }

  // Store flow plan in klaviyo_email_plans
  const { data: plan, error: planError } = await serviceClient
    .from('klaviyo_email_plans')
    .insert({
      client_id: connection.client_id,
      connection_id: connection.id,
      name,
      flow_type: 'flow',
      trigger_type: triggerType || null,
      emails: emailSteps,
      status: 'templates_created',
      admin_notes: `Flow plan created on ${new Date().toISOString()}. ${templateIds.length} templates created. Template IDs: ${templateIds.join(', ')}. Trigger type: ${triggerType || 'manual'}. Flow must be finalized in Klaviyo dashboard.`,
    })
    .select()
    .single();

  if (planError) {
    console.error('Error saving flow plan:', planError);
    return c.json({
      error: 'Templates created but failed to save flow plan',
      templateIds,
    }, 500);
  }

  return c.json({
    success: true,
    message: `${templateIds.length} templates creados en Klaviyo. El flow debe finalizarse en el dashboard de Klaviyo.`,
    plan_id: plan.id,
    templateIds,
    note: 'Klaviyo API no permite crear flows completos programaticamente. Los templates estan listos para asociar a un flow manualmente.',
  });
}

// ===============================================================
// Action: get_flow_metrics
// ===============================================================
async function handleGetFlowMetrics(c: Context, apiKey: string, body: any) {
  const { flowId, timeframe = 'last_90_days' } = body;

  if (!flowId) {
    return c.json({ error: 'flowId required' }, 400);
  }

  // Find conversion metric ID
  const metricsData: any = await klaviyoGet(`${KLAVIYO_BASE}/metrics/`, apiKey);
  const metrics = metricsData.data || [];
  const placedOrder = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
  const conversionMetricId = placedOrder?.id || metrics.find((m: any) => {
    const name = (m.attributes?.name || '').toLowerCase();
    return name.includes('order') || name.includes('purchase');
  })?.id || null;

  if (!conversionMetricId) {
    return c.json({
      error: 'No conversion metric found (Placed Order)',
      metrics: {},
    }, 200);
  }

  // Fetch flow values report
  const reportData: any = await klaviyoPost(`${KLAVIYO_BASE}/flow-values-reports/`, apiKey, {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: [
          'opens', 'clicks', 'delivered', 'recipients',
          'open_rate', 'click_rate', 'conversion_value',
          'unsubscribes', 'conversion_rate', 'conversion_uniques',
        ],
        timeframe: { key: timeframe },
        conversion_metric_id: conversionMetricId,
        filter: `equals(flow_id,"${flowId}")`,
      },
    },
  });

  const results = reportData?.data?.attributes?.results || [];
  const flowMetrics: Record<string, any> = {};

  for (const r of results) {
    const actionId = r.groupings?.flow_message_id || r.groupings?.flow_id || 'total';
    const s = r.statistics || {};
    flowMetrics[actionId] = {
      delivered: s.delivered || 0,
      opens: s.opens || 0,
      clicks: s.clicks || 0,
      revenue: s.conversion_value || 0,
      unsubscribes: s.unsubscribes || 0,
      recipients: s.recipients || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
      conversion_rate: s.conversion_rate || 0,
      conversions: s.conversion_uniques || 0,
    };
  }

  return c.json({ flowId, timeframe, metrics: flowMetrics });
}

// ===============================================================
// Helper: Generate default HTML for flow email
// ===============================================================
function generateDefaultFlowHtml(subject: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  ${content.replace(/\n/g, '<br>')}
</body>
</html>`.trim();
}
