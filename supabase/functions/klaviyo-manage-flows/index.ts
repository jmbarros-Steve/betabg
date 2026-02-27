import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { connectionId, action } = body;

    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify connection ownership
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt API key
    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route to action handler
    switch (action) {
      case 'list_flows':
        return await handleListFlows(apiKey);
      case 'get_flow_detail':
        return await handleGetFlowDetail(apiKey, body);
      case 'create_flow':
        return await handleCreateFlow(apiKey, serviceClient, connection, body);
      case 'get_flow_metrics':
        return await handleGetFlowMetrics(apiKey, body);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Error in klaviyo-manage-flows:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Action: list_flows
// ═══════════════════════════════════════════════════════════════
async function handleListFlows(apiKey: string): Promise<Response> {
  const data = await klaviyoGet(`${KLAVIYO_BASE}/flows/`, apiKey);

  const flows = (data.data || []).map((f: any) => ({
    id: f.id,
    name: f.attributes?.name || 'Sin nombre',
    status: f.attributes?.status || 'manual',
    trigger_type: f.attributes?.trigger_type || null,
    created: f.attributes?.created,
    updated: f.attributes?.updated,
  }));

  return new Response(JSON.stringify({ flows }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// Action: get_flow_detail
// ═══════════════════════════════════════════════════════════════
async function handleGetFlowDetail(apiKey: string, body: any): Promise<Response> {
  const { flowId } = body;

  if (!flowId) {
    return new Response(JSON.stringify({ error: 'flowId required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const data = await klaviyoGet(
    `${KLAVIYO_BASE}/flows/${flowId}/?include=flow-actions,flow-messages`,
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

  return new Response(JSON.stringify({ flow, actions, messages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// Action: create_flow
// Creates templates in Klaviyo and stores a flow plan in DB
// (Klaviyo API does not support full programmatic flow creation)
// ═══════════════════════════════════════════════════════════════
async function handleCreateFlow(
  apiKey: string,
  serviceClient: any,
  connection: any,
  body: any,
): Promise<Response> {
  const { name, triggerType, emails } = body;

  if (!name || !emails || !Array.isArray(emails) || emails.length === 0) {
    return new Response(JSON.stringify({ error: 'name and emails array required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const templateIds: string[] = [];
  const emailSteps: any[] = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const templateName = `${name} - Step ${i + 1}: ${email.subject}`;

    console.log(`[${i + 1}/${emails.length}] Creating template: ${templateName}`);

    // Create template in Klaviyo
    const templateData = await klaviyoPost(`${KLAVIYO_BASE}/templates/`, apiKey, {
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
    return new Response(JSON.stringify({
      error: 'Templates created but failed to save flow plan',
      templateIds,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: `${templateIds.length} templates creados en Klaviyo. El flow debe finalizarse en el dashboard de Klaviyo.`,
    plan_id: plan.id,
    templateIds,
    note: 'Klaviyo API no permite crear flows completos programáticamente. Los templates están listos para asociar a un flow manualmente.',
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// Action: get_flow_metrics
// ═══════════════════════════════════════════════════════════════
async function handleGetFlowMetrics(apiKey: string, body: any): Promise<Response> {
  const { flowId, timeframe = 'last_90_days' } = body;

  if (!flowId) {
    return new Response(JSON.stringify({ error: 'flowId required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Find conversion metric ID
  const metricsData = await klaviyoGet(`${KLAVIYO_BASE}/metrics/`, apiKey);
  const metrics = metricsData.data || [];
  const placedOrder = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
  const conversionMetricId = placedOrder?.id || metrics.find((m: any) => {
    const name = (m.attributes?.name || '').toLowerCase();
    return name.includes('order') || name.includes('purchase');
  })?.id || null;

  if (!conversionMetricId) {
    return new Response(JSON.stringify({
      error: 'No conversion metric found (Placed Order)',
      metrics: {},
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch flow values report
  const reportData = await klaviyoPost(`${KLAVIYO_BASE}/flow-values-reports/`, apiKey, {
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

  return new Response(JSON.stringify({ flowId, timeframe, metrics: flowMetrics }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// Helper: Generate default HTML for flow email
// ═══════════════════════════════════════════════════════════════
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
