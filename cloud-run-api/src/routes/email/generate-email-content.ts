import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

function truncateContext(text: string, max = 4000): string {
  if (!text || text.length <= max) return text;
  return text.substring(0, max) + '\n[Contexto truncado]';
}

/**
 * Steve Mail AI — Generate email content using Claude.
 * Works directly with client_id (no Klaviyo dependency).
 * POST /api/generate-steve-mail-content
 * Auth: protected by authMiddleware at the router level (routes/index.ts).
 */
export async function generateSteveMailContent(c: Context) {
  try {
    const body = await c.req.json();
    const { action, client_id } = body;

    if (!client_id) return c.json({ error: 'client_id is required' }, 400);

    const supabase = getSupabaseAdmin();

    // Load brand context
    const ctx = await loadBrandContext(supabase, client_id);

    switch (action) {
      case 'generate_campaign_html':
        return c.json(await handleGenerateCampaignHtml(body, ctx));
      case 'generate_flow_emails':
        return c.json(await handleGenerateFlowEmails(body, ctx));
      case 'generate_subjects':
        return c.json(await handleGenerateSubjects(body, ctx));
      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error('Error in generate-steve-mail-content:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'ANTHROPIC_API_KEY not configured') {
      return c.json({ error: 'AI service not configured. Contact support.' }, 503);
    }
    if (message === 'INSTRUCTIONS_REQUIRED') {
      return c.json({ error: 'Cuéntale a Steve sobre tu campaña (mínimo 30 caracteres) para que pueda generar el email.' }, 400);
    }
    if (message === 'AI_RESPONSE_TRUNCATED') {
      return c.json({ error: 'El email salió muy largo y no se pudo terminar de generar. Intenta con instrucciones más concretas.' }, 502);
    }
    if (message.includes('Rate limit')) {
      return c.json({ error: 'AI service busy. Try again in a moment.' }, 429);
    }
    if (message.includes('Failed to parse AI response')) {
      return c.json({ error: 'AI generated an invalid response. Try again.' }, 502);
    }
    return c.json({ error: message }, 500);
  }
}

interface BrandContext {
  briefSection: string;
  brandName: string;
  brandTone: string;
  brandColor: string;
  brandSecondaryColor: string;
  brandFont: string;
  logoUrl: string;
  products: any[];
  knowledgeBlock: string;
  bugsBlock: string;
}

async function loadBrandContext(supabase: any, clientId: string): Promise<BrandContext> {
  const [
    { data: persona },
    { data: products },
    { data: client },
  ] = await Promise.all([
    supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle(),
    supabase
      .from('shopify_products')
      .select('title, product_type, image_url, price_min, price_max, description')
      .eq('client_id', clientId)
      .limit(20),
    supabase
      .from('clients')
      .select('name, company, shop_domain, brand_color, brand_secondary_color, brand_font, logo_url')
      .eq('id', clientId)
      .single(),
  ]);

  // Load knowledge rules
  const { knowledgeBlock, bugsBlock } = await loadKnowledge(
    ['email', 'klaviyo', 'anuncios'],
    { clientId, limit: 10, audit: { source: 'generate-email-content' } }
  );

  let briefSection = 'Brief no completado.';
  let brandName = client?.name || client?.company || 'la marca';
  let brandTone = '';

  if (persona?.is_complete && persona?.persona_data) {
    briefSection = truncateContext(JSON.stringify(persona.persona_data, null, 2), 4000);
    const pd = persona.persona_data as any;
    brandTone = pd.tono_marca || pd.tone || pd.brand_tone || '';
    brandName = pd.nombre_marca || pd.brand_name || pd.nombre_negocio || brandName;
  }

  return {
    briefSection,
    brandName,
    brandTone,
    brandColor: client?.brand_color || '#18181b',
    brandSecondaryColor: client?.brand_secondary_color || '#6366f1',
    brandFont: client?.brand_font || 'Inter',
    logoUrl: client?.logo_url || '',
    products: products || [],
    knowledgeBlock,
    bugsBlock,
  };
}

function buildSystemPrompt(ctx: BrandContext): string {
  return `Eres Steve, experto en email marketing. Generas emails en HTML email-compatible (responsive, table-based, inline CSS). Mobile-first, subjects < 50 chars, preview text < 90 chars, 1 CTA principal.

BRIEF DE MARCA:
${ctx.briefSection}

IDENTIDAD VISUAL DE LA MARCA (USA SIEMPRE ESTOS VALORES):
- Nombre: ${ctx.brandName}
- Color primario: ${ctx.brandColor}
- Color secundario: ${ctx.brandSecondaryColor}
- Tipografía: ${ctx.brandFont}
${ctx.logoUrl ? `- Logo URL: ${ctx.logoUrl}` : ''}
${ctx.brandTone ? `- Tono de voz: ${ctx.brandTone}` : ''}

${ctx.products.length > 0
  ? `PRODUCTOS REALES DISPONIBLES (USA ESTOS, NO INVENTES):\n${ctx.products.slice(0, 10).map((p: any) =>
      `- ${p.title} | precio: ${p.price_min || '—'} | imagen: ${p.image_url || '(sin imagen)'}`
    ).join('\n')}`
  : 'NO HAY PRODUCTOS DISPONIBLES — NO INVENTES NOMBRES NI PRECIOS DE PRODUCTOS. Genera un email sin sección de productos (puede ser newsletter, anuncio, bienvenida, etc).'}

REGLAS:
- Siempre en español neutro LATAM
- USA merge tags: {{ first_name }}, {{ email }}, {{ cart_url }}, {{ cart_total }}
- HTML email-compatible: <!DOCTYPE html>, <html>, <head> con <meta viewport> y <style>, <body> con <table role="presentation" cellpadding="0" cellspacing="0" border="0">
- Layout 600px max-width centrado
- font-family: '${ctx.brandFont}', Arial, sans-serif (en TODO el email)
- Colores: usa ${ctx.brandColor} para CTA y headings, ${ctx.brandSecondaryColor} como acento. Fondos neutros (#ffffff, #f4f4f4)
- Incluye siempre 1 CTA principal con botón <a> estilizado
- ${ctx.logoUrl ? `Header con logo: <img src="${ctx.logoUrl}" alt="${ctx.brandName}" style="max-height:60px">` : 'Header con texto del nombre de marca destacado'}
- Inline CSS para todo lo crítico (Gmail/Outlook strippean <style>); usar <style> solo para @media queries responsive
- Footer con texto legal placeholder + unsubscribe placeholder {{unsubscribe_url}}
${ctx.knowledgeBlock}${ctx.bugsBlock}`;
}

async function handleGenerateCampaignHtml(body: any, ctx: BrandContext) {
  const { campaign_type, subject, instructions, products } = body;

  // Instrucciones son obligatorias — sin contexto no podemos generar nombre,
  // asunto ni MJML coherentes. Mínimo 30 chars para evitar prompts vacíos.
  if (!instructions || typeof instructions !== 'string' || instructions.trim().length < 30) {
    throw new Error('INSTRUCTIONS_REQUIRED');
  }

  const selectedProducts = products || ctx.products.slice(0, 5);

  const prompt = `Genera un email HTML completo para una campaña de tipo "${campaign_type || 'promotional'}" de "${ctx.brandName}".

CONTEXTO DE LA CAMPAÑA (lo que el usuario te dijo):
${instructions}

${subject ? `Subject sugerido: "${subject}". Puedes mejorarlo si tienes mejor idea.` : ''}
${selectedProducts.length > 0
  ? `Productos a destacar (USA ESTOS, no inventes):\n${selectedProducts.slice(0, 5).map((p: any) =>
      `- ${p.title} (precio: ${p.price_min || p.price || '—'}, imagen: ${p.image_url || 'sin imagen'})`
    ).join('\n')}`
  : 'NO HAY PRODUCTOS — el email no debe incluir bloques de productos. Hazlo enfocado en mensaje, marca o CTA general.'}

Genera HTML email-compatible con esta estructura:
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>...</title>
  <style>
    /* Solo @media queries responsive aquí. Resto del CSS va inline. */
    @media only screen and (max-width: 600px) {
      .stack-mobile { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family:'${ctx.brandFont}', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
          <!-- Header con logo o nombre de marca -->
          <!-- Hero: titular grande -->
          <!-- Saludo personalizado con {{ first_name }} -->
          <!-- 3-5 secciones de contenido persuasivo -->
          <!-- CTA principal estilizado con color ${ctx.brandColor} -->
          <!-- ${selectedProducts.length > 0 ? 'Sección de productos con imagen, título y precio reales' : '(sin productos)'} -->
          <!-- Footer con texto legal + unsubscribe -->
        </table>
      </td>
    </tr>
  </table>
</body>
</html>

El email debe incluir:
- Header con ${ctx.logoUrl ? `logo (${ctx.logoUrl})` : `nombre de marca "${ctx.brandName}" destacado`}
- Saludo personalizado con {{ first_name }}
- 3-5 secciones de contenido persuasivo
- 1 botón CTA principal con background-color:${ctx.brandColor} y color:#ffffff (no usar otro color para el CTA)
- ${selectedProducts.length > 0 ? 'Sección con productos REALES (imagen + título + precio + link)' : 'NO incluir sección de productos'}
- Dividers <hr style="border:none;border-top:1px solid #e0e0e0;"> donde corresponda
- Footer con texto legal placeholder + link a {{unsubscribe_url}}
- TODO el CSS crítico (colores, fonts, padding, márgenes) debe ser INLINE (Gmail strippea <style>)
- font-family de cada texto debe ser '${ctx.brandFont}', Arial, sans-serif

Responde SOLO con JSON (sin markdown, sin backticks):
{
  "name": "Nombre interno de la campaña (max 60 chars, descriptivo, ej: 'Black Friday 2026 - 30% OFF')",
  "subject": "Asunto del email (max 50 chars)",
  "preview_text": "Preview text (max 90 chars)",
  "html": "<!DOCTYPE html>..."
}`;

  return await callClaude(prompt, buildSystemPrompt(ctx));
}

async function handleGenerateFlowEmails(body: any, ctx: BrandContext) {
  const { flow_type, email_count } = body;

  const flowConfigs: Record<string, { desc: string; count: number; delays: number[] }> = {
    abandoned_cart: {
      desc: 'Carrito abandonado',
      count: email_count || 3,
      delays: [3600, 86400, 259200],
    },
    welcome: {
      desc: 'Bienvenida a nuevos suscriptores',
      count: email_count || 3,
      delays: [0, 172800, 604800],
    },
    post_purchase: {
      desc: 'Post-compra',
      count: email_count || 2,
      delays: [86400, 604800],
    },
    winback: {
      desc: 'Recuperar clientes inactivos',
      count: email_count || 3,
      delays: [0, 604800, 1209600],
    },
  };

  const config = flowConfigs[flow_type] || flowConfigs.abandoned_cart;

  const prompt = `Genera ${config.count} emails HTML completos para un flow de "${config.desc}" de "${ctx.brandName}".
${ctx.products.length > 0 ? `Productos: ${ctx.products.slice(0, 5).map((p: any) => p.title).join(', ')}` : ''}

Para carrito abandonado: Email 1 = recordatorio suave, Email 2 = urgencia, Email 3 = descuento/ultima oportunidad.
Para bienvenida: Email 1 = bienvenida + historia de marca, Email 2 = mejores productos, Email 3 = incentivo primera compra.
Para post-compra: Email 1 = gracias + tips uso, Email 2 = pedir resena + productos complementarios.
Para winback: Email 1 = te extrañamos, Email 2 = novedades, Email 3 = descuento especial.

Cada email debe ser HTML completo (DOCTYPE, inline styles, responsive 600px, boton CTA).
Usa merge tags: {{ first_name }}, {{ cart_url }}, {{ cart_total }}.

Responde SOLO con JSON (sin markdown, sin backticks):
{
  "emails": [
    {
      "subject": "...",
      "preview_text": "...",
      "html_content": "<!DOCTYPE html>...",
      "delay_seconds": ${config.delays[0] || 0}
    }
  ]
}`;

  return await callClaude(prompt, buildSystemPrompt(ctx));
}

async function handleGenerateSubjects(body: any, ctx: BrandContext) {
  const { campaign_type, count } = body;

  const prompt = `Genera ${count || 5} variantes de subject line y preview text para un email de tipo "${campaign_type || 'promotional'}" de "${ctx.brandName}".

Reglas: subjects < 50 chars, preview texts < 90 chars, variedad de estrategias (urgencia, curiosidad, beneficio, social proof).

Responde SOLO con JSON:
{
  "subjects": [{"subject": "...", "preview_text": "...", "strategy": "..."}]
}`;

  return await callClaude(prompt, buildSystemPrompt(ctx));
}

async function callClaude(userMessage: string, systemPrompt: string): Promise<any> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  if (systemPrompt.length > 12000) systemPrompt = systemPrompt.substring(0, 12000);
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 240_000); // 4 min timeout
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  clearTimeout(fetchTimeout);

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText.substring(0, 500));
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data: any = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Si Claude truncó por límite de tokens, el JSON queda incompleto.
  // Tiramos error específico para que el handler le dé mensaje útil al usuario.
  if (data.stop_reason === 'max_tokens') {
    console.error('AI response truncated by max_tokens. Length:', clean.length);
    throw new Error('AI_RESPONSE_TRUNCATED');
  }

  try {
    return JSON.parse(clean);
  } catch {
    console.error('JSON parse error. Raw:', clean.substring(0, 500));
    throw new Error('Failed to parse AI response');
  }
}
