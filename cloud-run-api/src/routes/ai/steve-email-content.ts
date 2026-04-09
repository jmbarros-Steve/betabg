import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

// ═══════════════════════════════════════════════════════════════
// Klaviyo Context Types & Loader
// ═══════════════════════════════════════════════════════════════

function truncateContext(text: string, max = 4000): string {
  if (!text || text.length <= max) return text;
  return text.substring(0, max) + '\n[Contexto truncado]';
}

// Truncate system prompt to avoid Anthropic context overflow / 502s.
// Preserves both the beginning and the end of the prompt.
function truncateSystemPrompt(text: string, maxSystemLen = 12000): string {
  if (!text || text.length <= maxSystemLen) return text;

  const marker = '\n\n[...contexto truncado por límite de tamaño]\n\n';
  const markerLen = marker.length;
  const available = maxSystemLen - markerLen;

  // Fallback safety: if maxSystemLen is too small, return a hard slice.
  if (available <= 0) return text.slice(0, maxSystemLen);

  const startLen = Math.floor(available / 2);
  const endLen = available - startLen;

  return text.slice(0, startLen) + marker + text.slice(text.length - endLen);
}

interface KlaviyoContext {
  briefSection: string;
  bugSection: string;
  knowledgeSection: string;
  criterioSection: string;
  learningContext: string;
  brandTone: string;
  brandName: string;
}

async function loadKlaviyoContext(supabase: any, clientId: string): Promise<KlaviyoContext> {
  const [
    { data: personaData },
    { data: knowledgeData },
    { data: bugsData },
    { data: globalFeedback },
    { data: clientFeedback },
    { data: criterioRules },
  ] = await Promise.all([
    supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle(),
    supabase
      .from('steve_knowledge')
      .select('titulo, contenido')
      .in('categoria', ['klaviyo', 'email'])
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .is('purged_at', null)
      .order('orden', { ascending: false })
      .limit(20),
    supabase
      .from('steve_bugs')
      .select('descripcion, ejemplo_malo, ejemplo_bueno')
      .eq('categoria', 'klaviyo')
      .eq('activo', true),
    supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type')
      .eq('content_type', 'klaviyo_email')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type, improvement_notes')
      .eq('client_id', clientId)
      .eq('content_type', 'klaviyo_email')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('criterio_rules')
      .select('name, check_rule, category')
      .eq('active', true)
      .or('category.ilike.%email%,category.ilike.%klaviyo%')
      .limit(20),
  ]);

  // Brief section
  let briefSection = 'Brief no completado. Genera contenido generico profesional.';
  let brandTone = '';
  let brandName = '';
  if (personaData?.is_complete && personaData?.persona_data) {
    briefSection = truncateContext(JSON.stringify(personaData.persona_data, null, 2), 4000);
    const pd = personaData.persona_data as any;
    brandTone = pd.tono_marca || pd.tone || pd.brand_tone || '';
    brandName = pd.nombre_marca || pd.brand_name || pd.nombre_negocio || '';
  }

  // Bugs section
  const bugSection = bugsData && bugsData.length > 0
    ? truncateContext(`\nERRORES CRITICOS QUE DEBES EVITAR EN KLAVIYO:\n${bugsData.map((b: any) => `\u274C ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n`, 2000)
    : '';

  // Knowledge section
  const knowledgeSection = knowledgeData && knowledgeData.length > 0
    ? truncateContext(`\nCONOCIMIENTO BASE KLAVIYO:\n${knowledgeData.map((k: any) => `## ${k.titulo}\n${k.contenido}`).join('\n\n')}\n`, 3000)
    : '';

  // Learning context (dual-layer: global + client)
  let learningContext = '';

  if (globalFeedback && globalFeedback.length > 0) {
    const globalAvg = globalFeedback.reduce((s: number, f: any) => s + (f.rating || 0), 0) / globalFeedback.length;
    const globalPositive = globalFeedback.filter((f: any) => (f.rating || 0) >= 4 && f.feedback_text);
    const globalNegative = globalFeedback.filter((f: any) => (f.rating || 0) <= 2 && f.feedback_text);

    learningContext += `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
STEVE'S GLOBAL LEARNING - Klaviyo (${globalFeedback.length} generaciones)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Rating promedio global: ${globalAvg.toFixed(1)}/5
${globalPositive.length > 0 ? `\n\u2705 PATRONES EXITOSOS EN KLAVIYO:\n${globalPositive.slice(0, 5).map((f: any) => `- "${f.feedback_text}"`).join('\n')}` : ''}
${globalNegative.length > 0 ? `\n\u26A0\uFE0F ERRORES COMUNES A EVITAR:\n${globalNegative.slice(0, 5).map((f: any) => `- "${f.feedback_text}"`).join('\n')}` : ''}
`;
  }

  if (clientFeedback && clientFeedback.length > 0) {
    const clientAvg = clientFeedback.reduce((s: number, f: any) => s + (f.rating || 0), 0) / clientFeedback.length;
    const clientPositive = clientFeedback.filter((f: any) => (f.rating || 0) >= 4 && f.feedback_text);
    const clientNegative = clientFeedback.filter((f: any) => (f.rating || 0) <= 2 && f.feedback_text);

    learningContext += `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
PREFERENCIAS DE ESTE CLIENTE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
Rating del cliente: ${clientAvg.toFixed(1)}/5
${clientPositive.length > 0 ? `\n\u2705 LO QUE PREFIERE (PRIORIDAD):\n${clientPositive.map((f: any) => `- "${f.feedback_text}"`).join('\n')}` : ''}
${clientNegative.length > 0 ? `\n\u26D4 LO QUE RECHAZA:\n${clientNegative.map((f: any) => `- "${f.feedback_text}"`).join('\n')}` : ''}
`;
  }

  // CRITERIO quality rules section
  const criterioSection = criterioRules && criterioRules.length > 0
    ? `\nREGLAS DE CALIDAD (tu contenido DEBE cumplir estas reglas):\n${criterioRules.map((r: { name: string; check_rule: string }) => `- ${r.name}: ${r.check_rule}`).join('\n')}\n`
    : '';

  return { briefSection, bugSection, knowledgeSection, criterioSection, learningContext: truncateContext(learningContext, 2000), brandTone, brandName };
}

// ═══════════════════════════════════════════════════════════════
// Dynamic System Prompt Builder
// ═══════════════════════════════════════════════════════════════

function buildEmailSystemPrompt(ctx: KlaviyoContext): string {
  return `${ctx.bugSection}${ctx.knowledgeSection}${ctx.criterioSection}Eres Steve, un experto en email marketing y Klaviyo. Generas contenido de email profesional, persuasivo y optimizado para conversion. Sigues las mejores practicas: subjects < 50 chars, preview text < 90 chars, 1 CTA principal, urgency real, mobile-first. Siempre respondes en espanol. Tu tono es profesional pero cercano.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
BRIEF DE MARCA DEL CLIENTE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${ctx.briefSection}

${ctx.learningContext}

REGLAS ADICIONALES:
- USA el vocabulario y tono del buyer persona del brief
- Personaliza el contenido al dolor y transformacion del cliente
- Aplica las preferencias aprendidas del feedback`;
}

// ═══════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════

export async function steveEmailContent(c: Context) {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const serviceClient = getSupabaseAdmin();

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

    // Load full Klaviyo context (brief, knowledge, bugs, feedback)
    const clientId = connection.client_id;
    const klaviyoContext = await loadKlaviyoContext(serviceClient, clientId);

    // Route to action handler
    switch (action) {
      case 'generate_subject':
        return c.json(await handleGenerateSubject(body, klaviyoContext));
      case 'generate_copy':
        return c.json(await handleGenerateCopy(body, klaviyoContext));
      case 'analyze_content':
        return c.json(await handleAnalyzeContent(body, klaviyoContext));
      case 'generate_ab_variants':
        return c.json(await handleGenerateABVariants(body, klaviyoContext));
      case 'generate_flow_emails':
        return c.json(await handleGenerateFlowEmails(body, klaviyoContext));
      case 'chat':
        return c.json(await handleChat(body, klaviyoContext));
      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error('Error in steve-email-content:', error);
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

// ═══════════════════════════════════════════════════════════════
// Action: generate_subject
// ═══════════════════════════════════════════════════════════════
async function handleGenerateSubject(body: any, ctx: KlaviyoContext): Promise<any> {
  const { campaignType, brandName, productNames, tone, industry } = body;

  const effectiveBrand = brandName || ctx.brandName || 'la marca';
  const effectiveTone = tone || ctx.brandTone || '';

  const userMessage = `Genera 5 variantes de subject line y 5 preview texts para un email de tipo "${campaignType}" de la marca "${effectiveBrand}".
${productNames ? `Productos: ${Array.isArray(productNames) ? productNames.join(', ') : productNames}` : ''}
${effectiveTone ? `Tono: ${effectiveTone}` : ''}
${industry ? `Industria: ${industry}` : ''}

REGLAS:
- Cada subject line debe tener MENOS de 50 caracteres
- Usa emojis con moderacion (maximo 1 por subject)
- Cada preview text debe tener MENOS de 90 caracteres
- Variedad: urgencia, curiosidad, beneficio, social proof, exclusividad
- USA las palabras y expresiones del buyer persona del brief

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "subjects": ["subject1", "subject2", "subject3", "subject4", "subject5"],
  "previewTexts": ["preview1", "preview2", "preview3", "preview4", "preview5"]
}`;

  return await callClaude(userMessage, buildEmailSystemPrompt(ctx));
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_copy
// ═══════════════════════════════════════════════════════════════
async function handleGenerateCopy(body: any, ctx: KlaviyoContext): Promise<any> {
  const { campaignType, subject, brandName, products, tone, instructions } = body;

  const effectiveBrand = brandName || ctx.brandName || 'la marca';
  const effectiveTone = tone || ctx.brandTone || '';

  const userMessage = `Genera el contenido completo de un email de tipo "${campaignType}" para la marca "${effectiveBrand}".
Subject line: "${subject}"
${products ? `Productos: ${truncateContext(JSON.stringify(products), 1500)}` : ''}
${effectiveTone ? `Tono: ${effectiveTone}` : ''}
${instructions ? `Instrucciones adicionales: ${instructions}` : ''}

Genera:
- title: Titulo principal del email (atractivo, directo)
- introText: Texto introductorio (2-3 oraciones persuasivas)
- ctaText: Texto del boton CTA principal
- sections: Array de secciones adicionales con heading y body

IMPORTANTE: Usa el lenguaje, dolor y transformacion del buyer persona. El email debe sentirse personalizado al negocio del cliente.

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "title": "...",
  "introText": "...",
  "ctaText": "...",
  "sections": [
    { "heading": "...", "body": "..." }
  ]
}`;

  return await callClaude(userMessage, buildEmailSystemPrompt(ctx));
}

// ═══════════════════════════════════════════════════════════════
// Action: analyze_content
// ═══════════════════════════════════════════════════════════════
async function handleAnalyzeContent(body: any, ctx: KlaviyoContext): Promise<any> {
  const { subject, previewText, bodyHtml } = body;

  const userMessage = `Analiza este contenido de email marketing y da feedback detallado:

Subject: "${subject}"
Preview text: "${previewText || '(sin preview text)'}"
${bodyHtml ? `Body HTML: ${bodyHtml.substring(0, 3000)}` : '(sin body)'}

Evalua estos criterios:
1. Longitud del subject (ideal < 50 chars)
2. Longitud del preview text (ideal < 90 chars)
3. Claridad del CTA
4. Nivel de urgencia (real, no falsa)
5. Palabras spam (GRATIS, $$$, URGENTE, etc.)
6. Ratio texto/imagen si hay HTML
7. Mobile-friendliness
8. Personalizacion
9. Coherencia subject + preview + body
10. Alineacion con el brief de marca y buyer persona del cliente

Da un score de 0 a 100 y feedback especifico.

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "score": 85,
  "feedback": [
    { "type": "success", "message": "..." },
    { "type": "warning", "message": "..." },
    { "type": "error", "message": "..." }
  ]
}`;

  return await callClaude(userMessage, buildEmailSystemPrompt(ctx));
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_ab_variants
// ═══════════════════════════════════════════════════════════════
async function handleGenerateABVariants(body: any, ctx: KlaviyoContext): Promise<any> {
  const { subject, count = 3 } = body;

  const userMessage = `Genera ${count} variantes A/B del siguiente subject line para testing:

Subject original: "${subject}"

Para cada variante, usa una estrategia diferente:
- Urgencia
- Curiosidad
- Beneficio directo
- Social proof
- Personalizacion
- Pregunta
- Numero/dato especifico

Cada variante debe tener MENOS de 50 caracteres.
Usa el tono y vocabulario del buyer persona del brief.
Aplica los patrones exitosos del feedback de aprendizaje.

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "variants": [
    { "subject": "...", "strategy": "nombre de la estrategia usada" }
  ]
}`;

  return await callClaude(userMessage, buildEmailSystemPrompt(ctx));
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_flow_emails
// ═══════════════════════════════════════════════════════════════
async function handleGenerateFlowEmails(body: any, ctx: KlaviyoContext): Promise<any> {
  const { flowType, brandName, tone, products, discount, productStrategy, discountEmailIndex, emails: templateEmails } = body;

  const effectiveBrand = brandName || ctx.brandName || 'la marca';
  const effectiveTone = tone || ctx.brandTone || '';

  const flowConfigs: Record<string, { description: string; emailCount: number; delays: string[] }> = {
    welcome_series: {
      description: 'Serie de bienvenida para nuevos suscriptores',
      emailCount: templateEmails?.length || 3,
      delays: ['Inmediato', '1 dia despues', '3 dias despues'],
    },
    abandoned_cart: {
      description: 'Recuperacion de carritos abandonados',
      emailCount: templateEmails?.length || 3,
      delays: ['1 hora despues', '24 horas despues', '72 horas despues'],
    },
    post_purchase: {
      description: 'Seguimiento post-compra y fidelizacion',
      emailCount: templateEmails?.length || 3,
      delays: ['Inmediato (confirmacion)', '3 dias despues', '7 dias despues'],
    },
    customer_winback: {
      description: 'Recuperacion de clientes inactivos',
      emailCount: templateEmails?.length || 3,
      delays: ['30 dias sin compra', '45 dias sin compra', '60 dias sin compra'],
    },
    browse_abandonment: {
      description: 'Seguimiento de navegacion sin compra',
      emailCount: templateEmails?.length || 2,
      delays: ['2 horas despues', '24 horas despues'],
    },
  };

  const config = flowConfigs[flowType] || {
    description: `Flow tipo "${flowType}"`,
    emailCount: templateEmails?.length || 3,
    delays: ['Inmediato', '2 dias despues', '5 dias despues'],
  };

  // Build email context from template
  const emailContext = templateEmails ? templateEmails.map((e: any, i: number) => {
    const parts = [`Email ${i + 1}: "${e.subject}" — ${e.description || ''}. Objetivo: ${e.purpose || 'engagement'}.`];
    if (productStrategy === 'cart_items' && i === 0) parts.push('INCLUYE productos del carrito abandonado.');
    if (productStrategy && productStrategy !== 'none' && productStrategy !== 'cart_items' && i === 0) parts.push(`INCLUYE productos ${productStrategy === 'most_viewed' ? 'mas vistos' : 'mas vendidos'}.`);
    if (discountEmailIndex === i && discount) parts.push(`INCLUYE cupon de descuento: codigo "${discount.code}", ${discount.type === 'percentage' ? `${discount.value}%` : discount.type === 'free_shipping' ? 'envio gratis' : `$${discount.value}`}.`);
    return parts.join(' ');
  }).join('\n') : '';

  const pStyle = 'style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;"';

  const userMessage = `Genera ${config.emailCount} emails RICOS para un flow "${flowType}" (${config.description}) de la marca "${effectiveBrand}".
${effectiveTone ? `Tono de marca: ${effectiveTone}` : ''}
${products && products.length > 0 ? `Productos del cliente: ${JSON.stringify(products)}` : ''}
${discount ? `Cupon configurado: codigo "${discount.code}", tipo "${discount.type}", valor ${discount.value}` : ''}
${productStrategy ? `Estrategia de productos: ${productStrategy}` : ''}

CONTEXTO POR EMAIL:
${emailContext || config.delays.map((d: string, i: number) => `Email ${i + 1}: ${d}`).join('\n')}

INSTRUCCIONES CRITICAS PARA bodyHtml:
- Genera bodyHtml como HTML RICO con multiples parrafos <p ${pStyle}>
- Cada <p> debe tener ${pStyle}
- MINIMO 5-6 parrafos por email. NO 2-3 oraciones genericas.
- Usa <b> para negritas en palabras clave y frases importantes
- Usa emojis donde sea natural (maximo 3-4 por email)
- Primer parrafo: saludo con merge tag: <p ${pStyle}>Hola <b>{{ first_name|default:"" }}</b> [emoji]</p>
- Parrafos intermedios: conecta con el dolor y transformacion del buyer persona, describe beneficios, crea urgencia cuando aplique
- Si el email tiene cupon: incluye un parrafo mencionando el codigo y beneficio
- Si el email tiene productos: menciona las categorias/tipos de productos naturalmente
- Ultimo parrafo antes de la firma: call to action suave
- Firma: <p ${pStyle}>Un abrazo,<br><b>El equipo de ${effectiveBrand}</b></p>
- USA el vocabulario exacto del buyer persona del brief
- NO uses frases genericas como "productos increibles" — se ESPECIFICO al negocio

Para CADA email responde con:
- subject: Subject line creativo (< 50 chars, con emoji)
- previewText: Preview text persuasivo (< 90 chars)
- bodyHtml: HTML RICO con 5-6+ parrafos <p> con inline styles
- ctaText: Texto del boton CTA (3-5 palabras)

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "emails": [
    {
      "subject": "...",
      "previewText": "...",
      "bodyHtml": "<p ${pStyle}>...</p><p ${pStyle}>...</p>...",
      "ctaText": "..."
    }
  ]
}`;

  return await callClaude(userMessage, buildEmailSystemPrompt(ctx));
}

// ═══════════════════════════════════════════════════════════════
// Action: chat
// ═══════════════════════════════════════════════════════════════
async function handleChat(body: any, ctx: KlaviyoContext): Promise<any> {
  const { message, history } = body;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = `${ctx.bugSection}${ctx.knowledgeSection}${ctx.criterioSection}Eres Steve, un experto senior en email marketing, Klaviyo y estrategia de ecommerce. Respondes en espanol de forma clara, practica y accionable. Tienes 10+ anos de experiencia.

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
BRIEF DE MARCA DEL CLIENTE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${ctx.briefSection}

${ctx.learningContext}

REGLAS:
- Responde de forma concisa pero completa
- Da consejos especificos y accionables, no genericos
- Cuando te pregunten sobre frecuencia, segmentacion, o mejores practicas, da numeros concretos
- Usa markdown para formatear (listas, negritas, encabezados)
- Si no sabes algo, dilo honestamente
- Siempre relaciona tus consejos con metricas y resultados medibles
- PERSONALIZA tus respuestas al negocio del cliente usando el brief

MEJORES PRACTICAS QUE SIEMPRE RECOMIENDAS:
- Segmentacion por engagement: activos 30/60/90 dias
- A/B testing en subject lines para campanas grandes
- Preview text optimizado (nunca vacio)
- Frecuencia: 2-3 emails/semana para engaged, 1 para tibios
- Mobile-first (60%+ abre en movil)
- Subject < 50 chars, preview text < 90 chars
- 1 CTA principal por email
- Ratio texto/imagen 60/40
- Enviar martes-jueves 10am-2pm hora local
- Limpieza de lista cada 90 dias con sunset flow
- Welcome series es el flow mas importante (5-10% de revenue)
- Abandoned cart con urgency progresiva (1hr, 24hr, 72hr)`;

  const messages: { role: string; content: string }[] = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Chat API error:', response.status, errText.substring(0, 300));
    throw new Error(`Chat API error: ${response.status}`);
  }

  const data: any = await response.json();
  const text = data.content?.[0]?.text || 'Lo siento, no pude generar una respuesta.';

  return { response: text };
}

// ═══════════════════════════════════════════════════════════════
// Claude API helper (now accepts dynamic system prompt)
// ═══════════════════════════════════════════════════════════════
async function callClaude(userMessage: string, systemPrompt: string): Promise<any> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Prevent very large briefs/system prompts from causing Anthropic failures.
  const truncatedSystemPrompt = truncateSystemPrompt(systemPrompt, 12000);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: truncatedSystemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  console.log('Anthropic response status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText.substring(0, 500));
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data: any = await response.json();
  const text = data.content?.[0]?.text || '{}';
  console.log('Claude response length:', text.length);

  // Parse JSON cleaning possible markdown
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (parseErr: any) {
    console.error('JSON parse error:', parseErr.message, 'Raw:', clean.substring(0, 300));
    throw new Error('Failed to parse AI response as JSON');
  }
}
