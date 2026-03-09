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
// Helper: Fetch client brand data for email templates
// ===============================================================
interface BrandData {
  name: string;
  logoUrl: string;
  storeUrl: string;
}

async function fetchClientBrand(serviceClient: any, clientId: string, storeName?: string): Promise<BrandData> {
  const { data: client } = await serviceClient
    .from('clients')
    .select('name, logo_url, website_url')
    .eq('id', clientId)
    .single();

  const storeUrl = client?.website_url || '';
  // Prefer store_name from platform connection (e.g. "A Rueda") over client.name (e.g. "jmbarros")
  const brandName = storeName || client?.name || 'Tu Tienda';
  // Skip logo_url if it's a Supabase storage URL (won't render in external email clients)
  const logoUrl = (client?.logo_url && !client.logo_url.includes('supabase.co/storage')) ? client.logo_url : '';
  return {
    name: brandName,
    logoUrl,
    storeUrl: storeUrl.startsWith('http') ? storeUrl : storeUrl ? `https://${storeUrl}` : '#',
  };
}

// ===============================================================
// Helper: Get contextual email content per flow type and step
// ===============================================================
function getFlowEmailContent(
  flowType: string,
  stepIndex: number,
  brandName: string,
): { heading: string; body: string; ctaText: string } {
  const name = '{{ first_name|default:"" }}';

  if (flowType === 'customer_winback') {
    const steps = [
      {
        heading: `${name} ¡Te echamos de menos!`,
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Hace tiempo que no nos visitas y queríamos saber cómo estás.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">En <strong>${brandName}</strong> hemos estado trabajando en traer las mejores novedades para tu próximo desafío deportivo. Nuevas marcas, nuevos productos y la misma pasión de siempre.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;font-weight:600;">¿Listo para volver a la ruta?</p>`,
        ctaText: 'Ver novedades',
      },
      {
        heading: 'Novedades que no te puedes perder',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Sabemos que un deportista siempre busca mejorar su equipo. Por eso seleccionamos lo mejor para ti:</p>
<ul style="margin:0 0 20px;padding-left:20px;color:#333;font-size:16px;line-height:2;">
  <li>Nuevos relojes GPS de <strong>COROS, Lhotse y Garmin</strong></li>
  <li>Equipamiento de ciclismo de última generación</li>
  <li>Nutrición deportiva para máximo rendimiento</li>
  <li>Envío gratis en compras sobre $100.000</li>
</ul>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu próximo PR te está esperando.</p>`,
        ctaText: 'Explorar productos',
      },
      {
        heading: '¡Último sprint! Un regalo para ti',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Porque valoramos a nuestra comunidad deportiva, tenemos algo especial solo para ti:</p>
<div style="background:#f8f6f0;border-left:4px solid #C8A84E;padding:20px 24px;margin:0 0 20px;border-radius:0 8px 8px 0;">
  <p style="margin:0 0 4px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;">Código exclusivo</p>
  <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1a1a1a;">VUELVE10</p>
  <p style="margin:0;font-size:14px;color:#555;">10% de descuento en toda la tienda · Válido por 7 días</p>
</div>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">No dejes pasar esta oportunidad. Tu equipo ideal te está esperando.</p>`,
        ctaText: 'Usar mi descuento',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  if (flowType === 'abandoned_cart') {
    const steps = [
      {
        heading: '¿Sigues dándole vueltas?',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Vimos que dejaste algo en tu carrito. No te preocupes, lo guardamos para ti.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Los productos que elegiste son de <strong>alto rendimiento</strong> y están volando. Recupéralos antes que alguien más rápido se los lleve.</p>`,
        ctaText: 'Volver a mi carrito',
      },
      {
        heading: '¿Tenías dudas? Acá estamos',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Entendemos que a veces hay que pensarlo. Si tienes alguna pregunta sobre los productos en tu carrito, nuestro equipo está listo para ayudarte.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Recuerda: <strong>envío gratis sobre $100.000</strong> a todo Chile y retiro disponible en Vitacura.</p>`,
        ctaText: 'Completar mi compra',
      },
      {
        heading: 'Última oportunidad para tu equipo',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu carrito sigue esperándote, pero no podemos garantizar stock por mucho más tiempo.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;font-weight:600;">Este es tu último recordatorio. ¡No te quedes sin lo que necesitas para tu próximo entrenamiento!</p>`,
        ctaText: 'Finalizar compra ahora',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  if (flowType === 'welcome_series') {
    const steps = [
      {
        heading: `¡Bienvenido a la comunidad ${brandName}!`,
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Nos alegra mucho que te unas a nuestra rueda. Somos una comunidad de deportistas apasionados por el ciclismo, running, natación y triatlón.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">En <strong>${brandName}</strong> encontrarás las mejores marcas como Garmin, COROS y Lhotse, con asesoría especializada y envío gratis sobre $100.000.</p>`,
        ctaText: 'Explorar la tienda',
      },
      {
        heading: 'Encuentra tu equipo perfecto',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Cada deporte tiene sus herramientas. Acá te dejamos nuestras categorías más populares para que empieces con todo:</p>
<ul style="margin:0 0 20px;padding-left:20px;color:#333;font-size:16px;line-height:2;">
  <li><strong>Ciclismo:</strong> Bicicletas, componentes y accesorios</li>
  <li><strong>Running & Trail:</strong> Zapatillas, textil y GPS</li>
  <li><strong>Natación:</strong> Trajes, goggles y accesorios</li>
  <li><strong>Nutrición:</strong> Geles, hidratación y suplementos</li>
</ul>`,
        ctaText: 'Ver categorías',
      },
      {
        heading: '¡Un regalo de bienvenida!',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Por ser parte de nuestra comunidad, te regalamos un descuento especial en tu primera compra:</p>
<div style="background:#f8f6f0;border-left:4px solid #C8A84E;padding:20px 24px;margin:0 0 20px;border-radius:0 8px 8px 0;">
  <p style="margin:0 0 4px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;">Tu código de bienvenida</p>
  <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1a1a1a;">BIENVENIDO10</p>
  <p style="margin:0;font-size:14px;color:#555;">10% de descuento · Primera compra · Válido 30 días</p>
</div>`,
        ctaText: 'Comprar con descuento',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  // Default/campaign
  return {
    heading: `${name} ${brandName} tiene algo para ti`,
    body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Descubre lo último que tenemos para tu entrenamiento y estilo de vida deportivo.</p>`,
    ctaText: 'Ver más',
  };
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
  const { name, flowName, triggerType, emails } = body;
  const flowDisplayName = name || flowName;

  if (!flowDisplayName || !emails || !Array.isArray(emails) || emails.length === 0) {
    return c.json({ error: 'name and emails array required' }, 400);
  }

  // Map triggerType to valid flow_type for DB check constraint
  const FLOW_TYPE_MAP: Record<string, string> = {
    abandoned_cart: 'abandoned_cart',
    welcome_series: 'welcome_series',
    customer_winback: 'customer_winback',
    campaign: 'campaign',
  };
  const dbFlowType = FLOW_TYPE_MAP[triggerType] || 'campaign';

  // Fetch brand data for professional templates (prefer store_name from Klaviyo connection)
  const brand = await fetchClientBrand(serviceClient, connection.client_id, connection.store_name);
  console.log(`[create_flow] Brand: ${brand.name}, Store: ${brand.storeUrl}`);

  const templateIds: string[] = [];
  const emailSteps: any[] = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const templateName = `${flowDisplayName} - Step ${i + 1}: ${email.subject}`;

    console.log(`[${i + 1}/${emails.length}] Creating template: ${templateName}`);

    // Use provided HTML or generate branded template
    const htmlContent = email.htmlContent || generateBrandedEmailHtml(brand, {
      subject: email.subject,
      previewText: email.previewText || '',
      flowType: triggerType || 'campaign',
      stepIndex: i,
      totalSteps: emails.length,
    });

    // Create template in Klaviyo
    const templateData: any = await klaviyoPost(`${KLAVIYO_BASE}/templates/`, apiKey, {
      data: {
        type: 'template',
        attributes: {
          name: templateName,
          editor_type: 'CODE',
          html: htmlContent,
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
      delayDays: Math.floor((email.delaySeconds || (email.delayHours || 0) * 3600) / 86400),
      delayHours: Math.floor(((email.delaySeconds || (email.delayHours || 0) * 3600) % 86400) / 3600),
      templateId,
    });
  }

  // Store flow plan in klaviyo_email_plans
  const { data: plan, error: planError } = await serviceClient
    .from('klaviyo_email_plans')
    .insert({
      client_id: connection.client_id,
      name: flowDisplayName,
      flow_type: dbFlowType,
      emails: emailSteps,
      status: 'draft',
      admin_notes: `Flow plan created on ${new Date().toISOString()}. ${templateIds.length} templates created. Template IDs: ${templateIds.join(', ')}. Trigger type: ${triggerType || 'manual'}. Connection: ${connection.id}. Flow must be finalized in Klaviyo dashboard.`,
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
// Helper: Generate professional branded HTML email template
// ===============================================================
function generateBrandedEmailHtml(
  brand: BrandData,
  config: { subject: string; previewText: string; flowType: string; stepIndex: number; totalSteps: number },
): string {
  const { heading, body, ctaText } = getFlowEmailContent(
    config.flowType,
    config.stepIndex,
    brand.name,
  );

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.name}" width="160" style="display:block;margin:0 auto;">`
    : `<div style="text-align:center;">
        <div style="font-size:32px;color:#C8A84E;margin-bottom:4px;">&#9673;&#9673;&#9673;&#9673;</div>
        <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:3px;font-family:Georgia,serif;">${brand.name.toUpperCase()}</div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${config.subject}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important;}</style><![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .email-container { width:100% !important; }
      .fluid { width:100% !important; max-width:100% !important; height:auto !important; }
      .stack-column { display:block !important; width:100% !important; }
      .mobile-padding { padding-left:20px !important; padding-right:20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${config.previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f4f4f4;line-height:1px;">${config.previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 10px;">

      <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- HEADER: Logo on dark background -->
        <tr>
          <td style="background-color:#1a1a1a;padding:32px 30px 16px;text-align:center;">
            ${logoBlock}
          </td>
        </tr>

        <!-- NAV BAR -->
        <tr>
          <td style="background-color:#1a1a1a;padding:0 30px 24px;text-align:center;">
            <a href="${brand.storeUrl}" style="color:#C8A84E;text-decoration:none;font-size:11px;letter-spacing:2px;padding:0 12px;font-family:Arial,sans-serif;">VER TIENDA</a>
            <span style="color:#444;font-size:11px;">&#8226;</span>
            <a href="${brand.storeUrl}/pages/contacto" style="color:#C8A84E;text-decoration:none;font-size:11px;letter-spacing:2px;padding:0 12px;font-family:Arial,sans-serif;">CONTACTO</a>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td class="mobile-padding" style="padding:40px 40px 12px;">
            <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3;font-family:Georgia,'Times New Roman',serif;">${heading}</h1>
            ${body}
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td align="center" style="padding:16px 40px 44px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#1a1a1a;border-radius:30px;">
                  <a href="${brand.storeUrl}" style="display:inline-block;padding:15px 40px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;font-family:Arial,sans-serif;">${ctaText}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- GOLDEN DIVIDER -->
        <tr>
          <td align="center" style="padding:0 40px;">
            <div style="width:60px;height:2px;background-color:#C8A84E;margin:0 auto;"></div>
          </td>
        </tr>

        <!-- SIGN-OFF -->
        <tr>
          <td style="padding:28px 40px 12px;text-align:center;">
            <p style="margin:0 0 6px;font-size:15px;color:#333;line-height:1.5;">¡Te esperamos con la mejor calidad y buena onda de siempre!</p>
            <p style="margin:0 0 4px;font-size:15px;color:#333;">Un abrazo,</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;">El equipo de ${brand.name}</p>
          </td>
        </tr>

        <!-- SOCIAL ICONS -->
        <tr>
          <td align="center" style="padding:20px 40px 8px;">
            <a href="#" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#1a1a1a;color:#fff;border-radius:50%;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px;">IG</a>
            <a href="#" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#1a1a1a;color:#fff;border-radius:50%;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px;">FB</a>
            <a href="#" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#1a1a1a;color:#fff;border-radius:50%;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px;">YT</a>
          </td>
        </tr>

        <!-- UNSUBSCRIBE -->
        <tr>
          <td style="padding:16px 40px 28px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">
              <a href="{%unsubscribe%}" style="color:#999;text-decoration:underline;">Cancelar suscripción</a>
              &nbsp;·&nbsp;
              <a href="{%manage_preferences 'Manage Preferences'%}" style="color:#999;text-decoration:underline;">Preferencias</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
