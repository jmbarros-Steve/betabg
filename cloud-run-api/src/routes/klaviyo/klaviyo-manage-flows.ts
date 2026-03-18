import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_GET_REVISION = '2024-10-15';
const KLAVIYO_POST_REVISION = '2025-01-15';
const KLAVIYO_FLOW_REVISION = '2024-10-15.pre'; // Beta revision for flow creation

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

function makeFlowHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json',
    'revision': KLAVIYO_FLOW_REVISION,
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

async function klaviyoFlowPost(url: string, apiKey: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: makeFlowHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Klaviyo FLOW POST error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo Flow API error ${res.status}: ${text}`);
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
      console.error('[klaviyo-manage-flows] decrypt_platform_token failed:', decryptError?.message, decryptError?.code);
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
// Brand & Logo helpers
// ===============================================================
interface BrandData {
  name: string;
  logoUrl: string;
  storeUrl: string;
}

async function fetchLogoFromKlaviyo(apiKey: string): Promise<string> {
  try {
    const data = await klaviyoGet(`${KLAVIYO_BASE}/templates/`, apiKey);
    for (const t of (data.data || [])) {
      // Template listing may not include HTML — fetch individual template
      try {
        const detail = await klaviyoGet(`${KLAVIYO_BASE}/templates/${t.id}/`, apiKey);
        const html = detail.data?.attributes?.html || '';
        const logoMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]*(?:cloudfront|klaviyo)[^"]*\.(?:png|jpg|jpeg|gif|svg))"[^>]*>/i);
        if (logoMatch) {
          console.log(`[fetchLogoFromKlaviyo] Found logo in template ${t.id}: ${logoMatch[1].substring(0, 80)}...`);
          return logoMatch[1];
        }
      } catch { /* skip */ }
    }
  } catch (e: any) {
    console.log('[fetchLogoFromKlaviyo] Could not fetch logo:', e.message);
  }
  return '';
}

async function fetchClientBrand(serviceClient: any, clientId: string, apiKey: string, storeName?: string): Promise<BrandData> {
  const { data: client } = await serviceClient
    .from('clients')
    .select('name, logo_url, website_url')
    .eq('id', clientId)
    .single();

  const storeUrl = client?.website_url || '';
  const brandName = storeName || client?.name || 'Tu Tienda';

  // Try logo sources in priority order
  let logoUrl = '';
  if (client?.logo_url && !client.logo_url.includes('supabase.co/storage')) {
    logoUrl = client.logo_url;
  }
  if (!logoUrl) {
    logoUrl = await fetchLogoFromKlaviyo(apiKey);
  }

  return {
    name: brandName,
    logoUrl,
    storeUrl: storeUrl.startsWith('http') ? storeUrl : storeUrl ? `https://${storeUrl}` : '#',
  };
}

// ===============================================================
// Shopify product blocks via Klaviyo catalog lookup tags
// ===============================================================
function getShopifyProductBlock(flowType: string, brandName: string): string {
  if (flowType === 'abandoned_cart') {
    // Show actual cart items from Shopify event data
    return `
        <!-- PRODUCTOS DEL CARRITO (dinámico desde Shopify) -->
        <tr>
          <td class="mobile-padding" style="padding:8px 40px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="background:#fafafa;padding:12px 16px;border-bottom:1px solid #e8e8e8;">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">Tu carrito en ${brandName}</p>
                </td>
              </tr>
              {% for item in event.Items %}
              {% catalog item.SKU %}
              <tr>
                <td style="padding:16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="90" valign="top" style="padding-right:16px;">
                        <img src="{{ catalog_item.featured_image.thumbnail.src }}" alt="{{ catalog_item.title }}" width="80" style="display:block;border-radius:6px;border:1px solid #eee;">
                      </td>
                      <td valign="top">
                        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a;">{{ catalog_item.title }}</p>
                        <p style="margin:0 0 8px;font-size:14px;color:#666;">{{ catalog_item.description|truncatewords:15 }}</p>
                        <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;">{% currency_format catalog_item.metadata|lookup:"price" %}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              {% if not forloop.last %}<tr><td style="padding:0 16px;"><div style="height:1px;background:#eee;"></div></td></tr>{% endif %}
              {% endcatalog %}
              {% endfor %}
            </table>
          </td>
        </tr>`;
  }

  // Welcome series & winback: show personalized product recommendations
  return `
        <!-- PRODUCTOS RECOMENDADOS (dinámico desde Shopify) -->
        <tr>
          <td class="mobile-padding" style="padding:8px 40px 24px;">
            <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">Seleccionados para ti</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
              {% for item in person|lookup:'Recommended Products'|slice:":3" %}
              {% catalog item %}
                <td width="33%" valign="top" style="padding:0 6px;text-align:center;">
                  <a href="{{ catalog_item.url }}" style="text-decoration:none;color:#1a1a1a;">
                    <img src="{{ catalog_item.featured_image.full.src }}" alt="{{ catalog_item.title }}" width="160" style="display:block;margin:0 auto 8px;border-radius:6px;border:1px solid #eee;max-width:100%;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1a1a1a;line-height:1.3;">{{ catalog_item.title|truncatewords:8 }}</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:#C8A84E;">{% currency_format catalog_item.metadata|lookup:"price" %}</p>
                  </a>
                </td>
              {% endcatalog %}
              {% endfor %}
              </tr>
            </table>
          </td>
        </tr>`;
}

// ===============================================================
// Email content per flow type — long, detailed, with storytelling
// ===============================================================
function getFlowEmailContent(
  flowType: string,
  stepIndex: number,
  brandName: string,
): { heading: string; body: string; ctaText: string } {
  const name = '{{ first_name|default:"" }}';

  // ----- CUSTOMER WINBACK -----
  if (flowType === 'customer_winback') {
    const steps = [
      {
        heading: `${name} ¡Te echamos de menos!`,
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Hace tiempo que no nos visitas y queríamos saber cómo estás. En <strong>${brandName}</strong> creemos que el deporte es mejor cuando lo vivimos en comunidad, y nos damos cuenta cuando un miembro de nuestra familia deportiva se aleja.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Desde tu última visita, hemos renovado completamente nuestro catálogo. Nuevas marcas, nuevas tecnologías y las mismas ganas de acompañarte en cada kilómetro, cada pedalada y cada brazada.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">Lo que te has perdido</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Llegaron los nuevos <strong>relojes GPS COROS PACE 3 Sport</strong> y los <strong>Garmin Forerunner 265</strong>, perfectos para trackear tu entrenamiento con precisión profesional. Si eres ciclista, tenemos nueva equipación <strong>Lhotse</strong> con tecnología de compresión que marca la diferencia en rutas largas.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">También ampliamos nuestra línea de nutrición deportiva — geles de asimilación rápida, barras energéticas, sales de hidratación y suplementos de recuperación para que tu cuerpo rinda al máximo en cada sesión.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Por qué volver?</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Porque en <strong>${brandName}</strong> no solo vendemos productos — te asesoramos. Cada recomendación está pensada para tu nivel, tu deporte y tus objetivos. Nuestro equipo practica lo que vende, y eso se nota.</p>

<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#555;">📦 Envío gratis en compras sobre $100.000 a todo Chile<br>🏪 Retiro en tienda disponible en Vitacura</p>`,
        ctaText: 'Ver novedades',
      },
      {
        heading: 'Novedades que no te puedes perder',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Sabemos que un deportista siempre está buscando esa ventaja que marca la diferencia. En <strong>${brandName}</strong> hemos seleccionado lo mejor de cada categoría para que encuentres exactamente lo que necesitas.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🏃‍♂️ Running &amp; Trail</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Zapatillas de trail diseñadas para terrenos técnicos con grip superior y amortiguación que protege tus articulaciones en descensos largos. Complementa con textil térmico para esas salidas temprano cuando el frío aprieta. Nuevos modelos con drop bajo para una pisada más natural.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🚴 Ciclismo</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Desde componentes para tu bicicleta hasta indumentaria técnica con tratamiento UV y secado rápido. Los nuevos cascos con sistema MIPS te mantienen seguro, y las luces LED de alta potencia son esenciales para rutas en baja visibilidad. También llegaron nuevos ciclocomputadores GPS con mapas de Chile.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">⌚ Relojes GPS</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;"><strong>COROS, Garmin y Lhotse</strong> — tres marcas en las que confían los atletas profesionales. Monitoreo de frecuencia cardíaca en muñeca, mapas topográficos offline, modo multi-deporte y baterías que duran semanas. Porque los datos importan cuando quieres superar tu marca.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🥤 Nutrición Deportiva</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Geles de asimilación rápida para competencia, sales de hidratación con el balance perfecto de electrolitos, barras proteicas para recuperación post-entreno. Todo lo que tu cuerpo necesita antes, durante y después del esfuerzo.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Cada producto en nuestra tienda fue seleccionado por deportistas para deportistas. No vendemos lo que no usaríamos nosotros mismos.</p>

<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#555;">📦 Envío gratis sobre $100.000 a todo Chile · 🏪 Retiro en Vitacura</p>`,
        ctaText: 'Explorar productos',
      },
      {
        heading: '¡Último sprint! Un regalo para ti',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Porque valoramos a cada miembro de nuestra comunidad deportiva, y porque sabemos que a veces la vida nos aleja de lo que nos apasiona, queremos darte un empujón extra para que vuelvas a la acción.</p>

<div style="background:#f8f6f0;border-left:4px solid #C8A84E;padding:24px 28px;margin:0 0 24px;border-radius:0 8px 8px 0;">
  <p style="margin:0 0 4px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Código exclusivo</p>
  <p style="margin:0 0 8px;font-size:32px;font-weight:700;color:#1a1a1a;letter-spacing:2px;">VUELVE10</p>
  <p style="margin:0;font-size:15px;color:#555;">10% de descuento en toda la tienda · Válido por 7 días</p>
</div>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">Ideas para aprovechar tu descuento</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">¿Llevas tiempo queriendo renovar tu reloj GPS? Con <strong>VUELVE10</strong> puedes ahorrar miles en los COROS PACE 3 o Garmin Forerunner. ¿Necesitas zapatillas nuevas para la temporada? Es el momento perfecto para dar ese paso.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Este código es exclusivo para ti y solo está activo por los próximos 7 días. Es nuestra forma de decirte que te extrañamos de verdad.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">No queremos perder a un deportista como tú. Tu próximo desafío te espera, y nosotros queremos estar ahí contigo. <strong>¿Nos dejas acompañarte?</strong></p>`,
        ctaText: 'Usar mi descuento',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  // ----- ABANDONED CART -----
  if (flowType === 'abandoned_cart') {
    const steps = [
      {
        heading: '¿Sigues dándole vueltas?',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Vimos que dejaste algo increíble en tu carrito y queríamos asegurarnos de que no se te escape. A veces la vida interrumpe, y está bien — tu selección te espera exactamente como la dejaste.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Los productos que elegiste son de <strong>alto rendimiento</strong> y están entre los más populares de nuestra tienda. Fueron seleccionados por deportistas como tú que buscan calidad sin compromisos.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Por qué estos productos?</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">En <strong>${brandName}</strong> trabajamos directo con marcas como COROS, Garmin y Lhotse para traerte lo mejor al mejor precio en Chile. Cada producto cuenta con garantía oficial y soporte técnico de nuestro equipo de especialistas deportivos.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">✅ Envío gratis en compras sobre $100.000</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">✅ Retiro en tienda Vitacura (mismo día)</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">✅ Garantía oficial de marca</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">✅ Asesoría deportiva personalizada</td>
  </tr>
</table>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">¿Tienes alguna duda sobre los productos? Escríbenos directo por WhatsApp o responde este correo — te ayudamos a elegir lo perfecto para tu entrenamiento.</p>`,
        ctaText: 'Volver a mi carrito',
      },
      {
        heading: '¿Tenías dudas? Estamos acá para ayudarte',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Entendemos que a veces hay que pensarlo. Elegir el equipo deportivo correcto es importante — es una inversión en tu rendimiento, comodidad y seguridad. Queremos que tomes la mejor decisión.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu carrito sigue guardado con los productos que seleccionaste. Solo falta un click para que sean tuyos.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">Lo que otros deportistas dicen</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Miles de atletas en Chile confían en <strong>${brandName}</strong> para su equipamiento. Desde ciclistas de ruta hasta triatlonistas, nuestra comunidad crece porque entregamos calidad y servicio real. No somos un marketplace genérico — cada producto fue probado y aprobado por nuestro equipo.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Si tienes preguntas sobre <strong>tallas, compatibilidad, o cuál modelo es mejor para tu nivel</strong> — responde este correo y nuestro equipo te orienta sin compromiso. Estamos para ayudarte a encontrar exactamente lo que necesitas.</p>

<div style="background:#f8f8f8;border-radius:8px;padding:20px 24px;margin:0 0 20px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">Beneficios de comprar en ${brandName}</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">📦 Envío gratis sobre $100.000 a todo Chile</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">🏪 Retiro disponible en Vitacura</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">💳 Hasta 6 cuotas sin interés</p>
  <p style="margin:0;font-size:15px;color:#333;">🔄 Cambios y devoluciones fáciles</p>
</div>`,
        ctaText: 'Completar mi compra',
      },
      {
        heading: 'Última oportunidad para tu equipo',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu carrito sigue esperándote, pero no podemos garantizar stock ni precios por mucho más tiempo. Los productos deportivos de alta gama se agotan rápido — especialmente los más buscados de marcas como COROS, Garmin y Lhotse.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;"><strong>Este es tu último recordatorio.</strong> Después de hoy, no podremos asegurar que estos productos sigan disponibles al mismo precio.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Por qué no dejarlo para después?</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu próximo entrenamiento merece el mejor equipo. Cada día que pasa sin el equipamiento correcto es rendimiento que se pierde. Ya diste el primer paso al elegir estos productos — solo falta cruzar la meta.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Si el precio es lo que te frena, escríbenos. Tenemos opciones de pago en cuotas sin interés y queremos ayudarte a encontrar la solución perfecta. En <strong>${brandName}</strong> no dejamos a ningún deportista sin su equipo.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;font-weight:600;font-style:italic;">No dejes que la indecisión gane esta carrera. ¡Tú puedes más!</p>`,
        ctaText: 'Finalizar compra ahora',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  // ----- WELCOME SERIES -----
  if (flowType === 'welcome_series') {
    const steps = [
      {
        heading: `¡Bienvenido/a a la comunidad ${brandName}!`,
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">¡Nos alegra mucho que te unas a nuestra rueda! Somos mucho más que una tienda deportiva — somos una comunidad de atletas apasionados por el ciclismo, running, natación y triatlón.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Quiénes somos?</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">En <strong>${brandName}</strong> seleccionamos las mejores marcas del mundo deportivo — <strong>Garmin, COROS, Lhotse</strong> y muchas más — para traerte productos de alto rendimiento con asesoría real. No somos un marketplace genérico: cada producto en nuestra tienda fue probado y aprobado por deportistas profesionales.</p>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Qué vas a encontrar?</h2>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="padding:10px 0;font-size:15px;color:#333;">🚴 <strong>Ciclismo:</strong> Bicicletas, componentes, indumentaria, cascos, luces</td>
  </tr>
  <tr>
    <td style="padding:10px 0;font-size:15px;color:#333;">🏃 <strong>Running &amp; Trail:</strong> Zapatillas, textil técnico, hidratación, GPS</td>
  </tr>
  <tr>
    <td style="padding:10px 0;font-size:15px;color:#333;">🏊 <strong>Natación:</strong> Trajes, goggles, accesorios de piscina y aguas abiertas</td>
  </tr>
  <tr>
    <td style="padding:10px 0;font-size:15px;color:#333;">⌚ <strong>Tecnología:</strong> Relojes GPS, sensores, ciclocomputadores</td>
  </tr>
  <tr>
    <td style="padding:10px 0;font-size:15px;color:#333;">🥤 <strong>Nutrición:</strong> Geles, barras, hidratación, suplementos de recuperación</td>
  </tr>
</table>

<div style="background:#f8f8f8;border-radius:8px;padding:20px 24px;margin:0 0 20px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">Nuestros beneficios</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">✅ Envío gratis en compras sobre $100.000 a todo Chile</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">✅ Retiro en tienda disponible en Vitacura</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">✅ Garantía oficial de todas las marcas</p>
  <p style="margin:0 0 6px;font-size:15px;color:#333;">✅ Asesoría deportiva personalizada por WhatsApp</p>
  <p style="margin:0;font-size:15px;color:#333;">✅ Programa de fidelidad con descuentos exclusivos</p>
</div>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Síguenos en <strong>Instagram (@arueda.cl)</strong> para tips de entrenamiento, lanzamientos de productos y ofertas exclusivas para nuestra comunidad.</p>`,
        ctaText: 'Explorar la tienda',
      },
      {
        heading: 'Encuentra tu equipo perfecto',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Cada deporte tiene sus herramientas, y elegir bien marca la diferencia entre un buen entrenamiento y uno extraordinario. En <strong>${brandName}</strong> queremos ayudarte a encontrar exactamente lo que necesitas.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">⌚ Relojes GPS: Tu entrenador personal en la muñeca</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Un buen reloj GPS es la inversión más importante que puede hacer un deportista. Te permite medir ritmo, distancia, frecuencia cardíaca y recuperación. Los <strong>COROS PACE 3</strong> ofrecen batería de hasta 38 horas en modo GPS, mientras que los <strong>Garmin Forerunner 265</strong> traen pantalla AMOLED y métricas de entrenamiento avanzadas. ¿No sabes cuál elegir? Escríbenos y te asesoramos.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🚴 Ciclismo: Cada componente cuenta</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Desde cascos con sistema MIPS hasta indumentaria con tratamiento UV y chamois de alta densidad para rutas largas. También ciclocomputadores con navegación GPS y sensores de potencia para los más exigentes. Tu bicicleta merece los mejores accesorios.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🏃 Running: Kilómetro a kilómetro</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Zapatillas con drop bajo para una pisada natural, textil transpirable con costuras planas que eliminan roces, y accesorios de hidratación para tus salidas largas. Ya sea que corras en asfalto o en montaña, tenemos lo que necesitas para llegar más lejos.</p>

<h2 style="margin:28px 0 12px;font-size:17px;font-weight:700;color:#1a1a1a;">🥤 Nutrición: El combustible del rendimiento</h2>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Geles con cafeína para competencia, isotónicos con el balance ideal de sodio y potasio, y proteína de recuperación para después del esfuerzo. La nutrición deportiva correcta puede mejorar tu rendimiento hasta un 15%. No la subestimes.</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;"><strong>¿No sabes por dónde empezar?</strong> Responde este correo con tu deporte y nivel, y te armamos una recomendación personalizada. Gratis, sin compromiso.</p>`,
        ctaText: 'Ver categorías',
      },
      {
        heading: '¡Un regalo de bienvenida!',
        body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Por ser parte de nuestra comunidad deportiva, queremos regalarte algo especial para tu primera compra. Es nuestra forma de decirte: bienvenido/a, estás en el lugar correcto.</p>

<div style="background:#f8f6f0;border-left:4px solid #C8A84E;padding:24px 28px;margin:0 0 24px;border-radius:0 8px 8px 0;">
  <p style="margin:0 0 4px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Tu código de bienvenida</p>
  <p style="margin:0 0 8px;font-size:32px;font-weight:700;color:#1a1a1a;letter-spacing:2px;">BIENVENIDO10</p>
  <p style="margin:0;font-size:15px;color:#555;">10% de descuento · Primera compra · Válido 30 días</p>
</div>

<h2 style="margin:28px 0 16px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;">¿Qué puedes comprar con tu descuento?</h2>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu código <strong>BIENVENIDO10</strong> aplica en toda la tienda, sin mínimo de compra. Algunas ideas:</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">🎯 Un reloj <strong>COROS PACE 3</strong> para empezar a medir tu progreso</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">🎯 Zapatillas de trail para tus primeras aventuras en montaña</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">🎯 Un kit de nutrición deportiva para optimizar tu rendimiento</td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:15px;color:#333;">🎯 Indumentaria técnica para entrenar con comodidad todo el año</td>
  </tr>
</table>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Tu código vence en 30 días, así que tómate tu tiempo para explorar — pero no tanto que se te pase. 😊</p>

<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">¿Necesitas ayuda eligiendo? Escríbenos por WhatsApp o responde este correo. Nuestro equipo de deportistas expertos está listo para asesorarte.</p>`,
        ctaText: 'Comprar con descuento',
      },
    ];
    return steps[stepIndex] || steps[0];
  }

  // ----- DEFAULT / CAMPAIGN -----
  return {
    heading: `${name} ${brandName} tiene algo para ti`,
    body: `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Descubre lo último que tenemos para tu entrenamiento y estilo de vida deportivo. En <strong>${brandName}</strong> trabajamos para traerte las mejores marcas y productos del mercado, con asesoría real de deportistas para deportistas.</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#333;">Visita nuestra tienda y encuentra exactamente lo que necesitas para tu próximo desafío. Recuerda: envío gratis en compras sobre $100.000 a todo Chile.</p>`,
    ctaText: 'Ver más',
  };
}

// ===============================================================
// Fetch sender info from existing flow messages
// ===============================================================
interface SenderInfo {
  from_email: string;
  from_label: string;
  reply_to_email: string;
}

async function fetchSenderInfo(apiKey: string): Promise<SenderInfo> {
  const defaults: SenderInfo = { from_email: '', from_label: '', reply_to_email: '' };
  try {
    // Approach 1: Get sender from flow messages (direct fetch)
    const flowsData = await klaviyoGet(`${KLAVIYO_BASE}/flows/?page[size]=3`, apiKey);
    for (const flow of (flowsData.data || [])) {
      const detailData = await klaviyoGet(
        `${KLAVIYO_BASE}/flows/${flow.id}/?include=flow-actions`,
        apiKey,
      );
      const actions = (detailData.included || []).filter((i: any) => i.type === 'flow-action');
      for (const action of actions) {
        // Get the flow message for this action
        try {
          const msgData = await klaviyoGet(
            `${KLAVIYO_BASE}/flow-actions/${action.id}/flow-message/`,
            apiKey,
          );
          const content = msgData.data?.attributes?.content || {};
          if (content.from_email) {
            console.log(`[fetchSenderInfo] Found sender: ${content.from_email} from action ${action.id}`);
            return {
              from_email: content.from_email,
              from_label: content.from_label || content.from_email,
              reply_to_email: content.reply_to_email || content.from_email,
            };
          }
        } catch { /* skip this action */ }
      }
    }

    // Approach 2: Get sender from Klaviyo account
    const accountData = await klaviyoGet(`${KLAVIYO_BASE}/accounts/`, apiKey);
    const account = accountData.data?.[0]?.attributes || {};
    const contactInfo = account.contact_information || {};
    if (contactInfo.default_sender_email) {
      console.log(`[fetchSenderInfo] Using account default: ${contactInfo.default_sender_email}`);
      return {
        from_email: contactInfo.default_sender_email,
        from_label: contactInfo.default_sender_name || contactInfo.organization_name || '',
        reply_to_email: contactInfo.default_sender_email,
      };
    }
  } catch (e: any) {
    console.log('[fetchSenderInfo] Error:', e.message);
  }
  return defaults;
}

// ===============================================================
// Find trigger metric ID for flow creation
// ===============================================================
async function findMetricByName(apiKey: string, metricName: string): Promise<string | null> {
  try {
    const data: any = await klaviyoGet(`${KLAVIYO_BASE}/metrics/`, apiKey);
    const metrics = data.data || [];
    const found = metrics.find((m: any) =>
      (m.attributes?.name || '').toLowerCase() === metricName.toLowerCase()
    );
    return found?.id || null;
  } catch {
    return null;
  }
}

// ===============================================================
// Build flow definition for Klaviyo beta API
// ===============================================================
function buildFlowDefinition(
  triggerType: string,
  templateIds: string[],
  emails: any[],
  triggerMetricId: string | null,
  listId: string | null,
  sender: SenderInfo,
): any {
  const actions: any[] = [];
  let actionCounter = 1000;

  // Build action chain: email → delay → email → delay → email
  for (let i = 0; i < templateIds.length; i++) {
    const emailActionId = String(actionCounter++);
    const delayActionId = String(actionCounter++);
    const nextEmailActionId = i < templateIds.length - 1 ? String(actionCounter) : null;

    actions.push({
      temporary_id: emailActionId,
      type: 'send-email',
      links: {
        next: i < templateIds.length - 1 ? delayActionId : null,
      },
      data: {
        message: {
          template_id: templateIds[i],
          subject_line: emails[i].subject || `Email ${i + 1}`,
          preview_text: emails[i].previewText || '',
          from_email: sender.from_email,
          from_label: sender.from_label,
          reply_to_email: null,
          cc_email: null,
          bcc_email: null,
          smart_sending_enabled: true,
          transactional: false,
          add_tracking_params: false,
          custom_tracking_params: null,
          additional_filters: null,
          name: `Email ${i + 1}`,
        },
        status: 'draft',
      },
    });

    // Time delay action (between emails, not after the last one)
    if (i < templateIds.length - 1) {
      const delayHours = emails[i + 1]?.delayHours || Math.floor((emails[i + 1]?.delaySeconds || 0) / 3600) || 24;
      actions.push({
        temporary_id: delayActionId,
        type: 'time-delay',
        links: {
          next: nextEmailActionId,
        },
        data: {
          unit: delayHours >= 24 ? 'days' : 'hours',
          value: delayHours >= 24 ? Math.round(delayHours / 24) : delayHours,
          secondary_value: 0,
          timezone: 'profile',
          delay_until_time: null,
          delay_until_weekdays: null,
        },
      });
    }
  }

  // Build trigger based on type
  const triggers: any[] = [];
  if (triggerType === 'welcome_series' && listId) {
    triggers.push({ type: 'list', id: listId, trigger_filter: null });
  } else if (triggerMetricId) {
    triggers.push({ type: 'metric', id: triggerMetricId, trigger_filter: null });
  }

  return {
    triggers,
    profile_filter: null,
    actions,
    entry_action_id: actions[0]?.temporary_id || '1000',
  };
}

// ===============================================================
// Action: create_flow
// Creates templates + actual flow (via beta API) in Klaviyo
// ===============================================================
async function handleCreateFlow(
  c: Context,
  apiKey: string,
  serviceClient: any,
  connection: any,
  body: any,
) {
  const { name, flowName, triggerType, emails, discount, productStrategy, discountEmailIndex } = body;
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

  // Fetch brand data (including logo from existing Klaviyo templates)
  const brand = await fetchClientBrand(serviceClient, connection.client_id, apiKey, connection.store_name);
  console.log(`[create_flow] Brand: ${brand.name}, Logo: ${brand.logoUrl ? 'found' : 'none'}, Store: ${brand.storeUrl}`);

  // === STEP 1: Create templates in Klaviyo ===
  const templateIds: string[] = [];
  const emailSteps: any[] = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const templateName = `${flowDisplayName} - Step ${i + 1}: ${email.subject}`;

    console.log(`[${i + 1}/${emails.length}] Creating template: ${templateName}`);

    const htmlContent = email.htmlContent || generateBrandedEmailHtml(brand, {
      subject: email.subject,
      previewText: email.previewText || '',
      flowType: triggerType || 'campaign',
      stepIndex: i,
      totalSteps: emails.length,
    });

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

  // === STEP 2: Try to create actual flow via beta API ===
  let flowId: string | null = null;
  let flowCreated = false;

  try {
    // Find trigger metric based on flow type
    // Get sender info from existing flows
    const sender = await fetchSenderInfo(apiKey);
    if (!sender.from_email) {
      console.log('[create_flow] No sender info found in existing flows, skipping flow creation');
      throw new Error('No sender info found');
    }
    console.log(`[create_flow] Sender: ${sender.from_email} (${sender.from_label})`);

    let triggerMetricId: string | null = null;
    let listId: string | null = null;

    if (triggerType === 'abandoned_cart') {
      triggerMetricId = await findMetricByName(apiKey, 'Checkout Started');
      if (!triggerMetricId) triggerMetricId = await findMetricByName(apiKey, 'Added to Cart');
    } else if (triggerType === 'customer_winback') {
      triggerMetricId = await findMetricByName(apiKey, 'Placed Order');
    } else if (triggerType === 'welcome_series') {
      const listsData = await klaviyoGet(`${KLAVIYO_BASE}/lists/?page[size]=5`, apiKey);
      const lists = listsData.data || [];
      const newsletterList = lists.find((l: any) =>
        (l.attributes?.name || '').toLowerCase().includes('newsletter') ||
        (l.attributes?.name || '').toLowerCase().includes('suscri')
      );
      listId = newsletterList?.id || lists[0]?.id || null;
    }

    const definition = buildFlowDefinition(triggerType, templateIds, emails, triggerMetricId, listId, sender);

    console.log(`[create_flow] Attempting beta flow creation with ${definition.actions.length} actions...`);

    const flowData = await klaviyoFlowPost(`${KLAVIYO_BASE}/flows/`, apiKey, {
      data: {
        type: 'flow',
        attributes: {
          name: flowDisplayName,
          definition,
        },
      },
    });

    flowId = flowData?.data?.id || null;
    if (flowId) {
      flowCreated = true;
      console.log(`[create_flow] Flow created in Klaviyo: ${flowId} (draft status)`);
    }
  } catch (e: any) {
    console.log(`[create_flow] Beta flow API failed (templates still created): ${e.message}`);
  }

  // === STEP 3: Store flow plan in DB ===
  const { data: plan, error: planError } = await serviceClient
    .from('klaviyo_email_plans')
    .insert({
      client_id: connection.client_id,
      name: flowDisplayName,
      flow_type: dbFlowType,
      emails: emailSteps,
      status: 'draft',
      admin_notes: `${flowCreated ? 'FLOW CREATED' : 'TEMPLATES ONLY'} on ${new Date().toISOString()}. ${templateIds.length} templates. Template IDs: ${templateIds.join(', ')}. ${flowId ? `Klaviyo Flow ID: ${flowId}.` : ''} Trigger type: ${triggerType || 'manual'}. Connection: ${connection.id}.`,
    })
    .select()
    .single();

  if (planError) {
    console.error('Error saving flow plan:', planError);
  }

  return c.json({
    success: true,
    flowCreated,
    flowId,
    message: flowCreated
      ? `Flujo "${flowDisplayName}" creado como borrador en Klaviyo con ${templateIds.length} emails.`
      : `${templateIds.length} templates creados en Klaviyo. El flow debe finalizarse en el dashboard.`,
    plan_id: plan?.id || null,
    templateIds,
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
// Generate professional branded HTML email template
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

  const productBlock = getShopifyProductBlock(config.flowType, brand.name);

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.name}" width="150" style="display:block;margin:0 auto;">`
    : `<div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:3px;font-family:Georgia,serif;text-align:center;">${brand.name.toUpperCase()}</div>`;

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
      .mobile-padding { padding-left:16px !important; padding-right:16px !important; }
      .mobile-hide { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${config.previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f4f4f4;line-height:1px;">${config.previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 10px;">

      <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- HEADER: Logo + Nav on dark background -->
        <tr>
          <td style="background-color:#000000;padding:28px 30px 12px;text-align:center;">
            ${logoBlock}
          </td>
        </tr>
        <tr>
          <td style="background-color:#000000;padding:0 30px 20px;text-align:center;">
            <a href="${brand.storeUrl}" style="color:#C8A84E;text-decoration:none;font-size:11px;letter-spacing:2px;padding:0 10px;font-family:Arial,sans-serif;font-weight:600;">COMUNIDAD</a>
            <span style="color:#444;font-size:11px;">&#8226;</span>
            <a href="${brand.storeUrl}/pages/contacto" style="color:#C8A84E;text-decoration:none;font-size:11px;letter-spacing:2px;padding:0 10px;font-family:Arial,sans-serif;font-weight:600;">CONTÁCTANOS</a>
            <span style="color:#444;font-size:11px;">&#8226;</span>
            <a href="${brand.storeUrl}/account" style="color:#C8A84E;text-decoration:none;font-size:11px;letter-spacing:2px;padding:0 10px;font-family:Arial,sans-serif;font-weight:600;">MI CUENTA</a>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td class="mobile-padding" style="padding:40px 40px 12px;">
            <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3;font-family:Georgia,'Times New Roman',serif;">${heading}</h1>
            ${body}
          </td>
        </tr>

        <!-- SHOPIFY PRODUCT BLOCK -->
        ${productBlock}

        <!-- CTA BUTTON -->
        <tr>
          <td align="center" style="padding:20px 40px 44px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:#1a1a1a;border-radius:30px;">
                  <a href="${brand.storeUrl}" style="display:inline-block;padding:16px 44px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.5px;font-family:Arial,sans-serif;">${ctaText}</a>
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
