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
      .select('title, product_type, image_url, price')
      .eq('client_id', clientId)
      .limit(20),
    supabase
      .from('clients')
      .select('name, company, shop_domain')
      .eq('id', clientId)
      .single(),
  ]);

  // Load knowledge rules
  const { knowledgeBlock, bugsBlock } = await loadKnowledge(
    ['email', 'klaviyo', 'anuncios'],
    { clientId, limit: 10 }
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
    products: products || [],
    knowledgeBlock,
    bugsBlock,
  };
}

function buildSystemPrompt(ctx: BrandContext): string {
  return `Eres Steve, experto en email marketing. Generas emails en formato MJML (MailJet Markup Language) profesionales, persuasivos y optimizados para conversion. Mobile-first, subjects < 50 chars, preview text < 90 chars, 1 CTA principal.

BRIEF DE MARCA:
${ctx.briefSection}

NOMBRE DE MARCA: ${ctx.brandName}
${ctx.brandTone ? `TONO: ${ctx.brandTone}` : ''}
${ctx.products.length > 0 ? `PRODUCTOS: ${truncateContext(ctx.products.slice(0, 10).map((p: any) => p.title).join(', '), 500)}` : ''}

REGLAS:
- Siempre en espanol
- USA merge tags: {{ first_name }}, {{ email }}, {{ cart_url }}, {{ cart_total }}
- Genera MJML valido (NO HTML puro) usando componentes mj-section, mj-column, mj-text, mj-image, mj-button, mj-divider
- Colores neutros profesionales (se puede customizar despues en el editor)
- Incluye siempre un CTA claro con mj-button
- El MJML se cargara en un editor visual GrapeJS donde el usuario puede editarlo
${ctx.knowledgeBlock}${ctx.bugsBlock}`;
}

async function handleGenerateCampaignHtml(body: any, ctx: BrandContext) {
  const { campaign_type, subject, instructions, products } = body;

  const selectedProducts = products || ctx.products.slice(0, 5);

  const prompt = `Genera un email MJML completo para una campana de tipo "${campaign_type || 'promotional'}" de "${ctx.brandName}".
${subject ? `Subject: "${subject}"` : 'Genera tambien un subject line.'}
${instructions ? `Instrucciones: ${instructions}` : ''}
${selectedProducts.length > 0 ? `Productos a destacar: ${truncateContext(JSON.stringify(selectedProducts), 1500)}` : ''}

Genera MJML completo con esta estructura:
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" color="#333333" />
      <mj-button background-color="#333333" color="#ffffff" border-radius="4px" font-size="16px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f4">
    <!-- Contenido aqui con mj-section, mj-column, mj-text, mj-image, mj-button, mj-divider -->
  </mj-body>
</mjml>

El email MJML debe incluir:
- Header section con nombre de marca
- Saludo personalizado con {{ first_name }}
- Contenido persuasivo (5-6 secciones minimo usando mj-section/mj-column/mj-text)
- Boton CTA con mj-button
- Dividers con mj-divider donde sea apropiado
- Footer section con texto legal placeholder
- NO uses mj-raw ni HTML puro dentro de los componentes MJML
- Cada parrafo debe ser un mj-text separado dentro de su mj-section > mj-column

Responde SOLO con JSON (sin markdown, sin backticks):
{
  "subject": "...",
  "preview_text": "...",
  "mjml": "<mjml>..."
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
      max_tokens: 8000,
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

  try {
    return JSON.parse(clean);
  } catch {
    console.error('JSON parse error. Raw:', clean.substring(0, 500));
    throw new Error('Failed to parse AI response');
  }
}
