import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Steve Mail AI — Generate email content using Claude.
 * Works directly with client_id (no Klaviyo dependency).
 * POST /api/generate-steve-mail-content
 */
export async function generateSteveMailContent(c: Context) {
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
}

interface BrandContext {
  briefSection: string;
  brandName: string;
  brandTone: string;
  products: any[];
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
      .select('title, product_type, image_url, price')
      .eq('client_id', clientId)
      .limit(20),
    supabase
      .from('clients')
      .select('name, company, shop_domain')
      .eq('id', clientId)
      .single(),
  ]);

  let briefSection = 'Brief no completado.';
  let brandName = client?.name || client?.company || 'la marca';
  let brandTone = '';

  if (persona?.is_complete && persona?.persona_data) {
    briefSection = JSON.stringify(persona.persona_data, null, 2);
    const pd = persona.persona_data as any;
    brandTone = pd.tono_marca || pd.tone || pd.brand_tone || '';
    brandName = pd.nombre_marca || pd.brand_name || pd.nombre_negocio || brandName;
  }

  return {
    briefSection,
    brandName,
    brandTone,
    products: products || [],
  };
}

function buildSystemPrompt(ctx: BrandContext): string {
  return `Eres Steve, experto en email marketing. Generas emails HTML profesionales, persuasivos y optimizados para conversion. Mobile-first, subjects < 50 chars, preview text < 90 chars, 1 CTA principal.

BRIEF DE MARCA:
${ctx.briefSection}

NOMBRE DE MARCA: ${ctx.brandName}
${ctx.brandTone ? `TONO: ${ctx.brandTone}` : ''}
${ctx.products.length > 0 ? `PRODUCTOS: ${ctx.products.slice(0, 10).map((p: any) => p.title).join(', ')}` : ''}

REGLAS:
- Siempre en espanol
- USA merge tags: {{ first_name }}, {{ email }}, {{ cart_url }}, {{ cart_total }}
- HTML debe tener inline styles, ser responsive
- Colores neutros profesionales (se puede customizar despues en el editor)
- Incluye siempre un CTA claro con boton HTML`;
}

async function handleGenerateCampaignHtml(body: any, ctx: BrandContext) {
  const { campaign_type, subject, instructions, products } = body;

  const selectedProducts = products || ctx.products.slice(0, 5);

  const prompt = `Genera un email HTML completo para una campana de tipo "${campaign_type || 'promotional'}" de "${ctx.brandName}".
${subject ? `Subject: "${subject}"` : 'Genera tambien un subject line.'}
${instructions ? `Instrucciones: ${instructions}` : ''}
${selectedProducts.length > 0 ? `Productos a destacar: ${JSON.stringify(selectedProducts)}` : ''}

Genera HTML completo (DOCTYPE, head con media queries, body con tabla responsive).
El HTML debe:
- Ser 600px max width centrado
- Tener header con logo placeholder
- Saludo personalizado con {{ first_name }}
- Contenido persuasivo (5-6 parrafos minimo)
- Boton CTA con estilo inline
- Footer con texto legal placeholder
- Media queries para mobile

Responde SOLO con JSON (sin markdown, sin backticks):
{
  "subject": "...",
  "preview_text": "...",
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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText.substring(0, 500));
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data: any = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error('JSON parse error. Raw:', clean.substring(0, 500));
    throw new Error('Failed to parse AI response');
  }
}
