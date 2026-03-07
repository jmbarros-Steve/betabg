import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const STEVE_EMAIL_SYSTEM_PROMPT = `Eres Steve, un experto en email marketing y Klaviyo. Generas contenido de email profesional, persuasivo y optimizado para conversión. Sigues las mejores prácticas: subjects < 50 chars, preview text < 90 chars, 1 CTA principal, urgency real, mobile-first. Siempre respondes en español. Tu tono es profesional pero cercano.`;

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

    // Route to action handler
    switch (action) {
      case 'generate_subject':
        return c.json(await handleGenerateSubject(body));
      case 'generate_copy':
        return c.json(await handleGenerateCopy(body));
      case 'analyze_content':
        return c.json(await handleAnalyzeContent(body));
      case 'generate_ab_variants':
        return c.json(await handleGenerateABVariants(body));
      case 'generate_flow_emails':
        return c.json(await handleGenerateFlowEmails(body));
      case 'chat':
        return c.json(await handleChat(body));
      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    console.error('Error in steve-email-content:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_subject
// ═══════════════════════════════════════════════════════════════
async function handleGenerateSubject(body: any): Promise<any> {
  const { campaignType, brandName, productNames, tone, industry } = body;

  const userMessage = `Genera 5 variantes de subject line y 5 preview texts para un email de tipo "${campaignType}" de la marca "${brandName}".
${productNames ? `Productos: ${Array.isArray(productNames) ? productNames.join(', ') : productNames}` : ''}
${tone ? `Tono: ${tone}` : ''}
${industry ? `Industria: ${industry}` : ''}

REGLAS:
- Cada subject line debe tener MENOS de 50 caracteres
- Usa emojis con moderación (máximo 1 por subject)
- Cada preview text debe tener MENOS de 90 caracteres
- Variedad: urgencia, curiosidad, beneficio, social proof, exclusividad

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "subjects": ["subject1", "subject2", "subject3", "subject4", "subject5"],
  "previewTexts": ["preview1", "preview2", "preview3", "preview4", "preview5"]
}`;

  return await callClaude(userMessage);
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_copy
// ═══════════════════════════════════════════════════════════════
async function handleGenerateCopy(body: any): Promise<any> {
  const { campaignType, subject, brandName, products, tone, instructions } = body;

  const userMessage = `Genera el contenido completo de un email de tipo "${campaignType}" para la marca "${brandName}".
Subject line: "${subject}"
${products ? `Productos: ${JSON.stringify(products)}` : ''}
${tone ? `Tono: ${tone}` : ''}
${instructions ? `Instrucciones adicionales: ${instructions}` : ''}

Genera:
- title: Título principal del email (atractivo, directo)
- introText: Texto introductorio (2-3 oraciones persuasivas)
- ctaText: Texto del botón CTA principal
- sections: Array de secciones adicionales con heading y body

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "title": "...",
  "introText": "...",
  "ctaText": "...",
  "sections": [
    { "heading": "...", "body": "..." }
  ]
}`;

  return await callClaude(userMessage);
}

// ═══════════════════════════════════════════════════════════════
// Action: analyze_content
// ═══════════════════════════════════════════════════════════════
async function handleAnalyzeContent(body: any): Promise<any> {
  const { subject, previewText, bodyHtml } = body;

  const userMessage = `Analiza este contenido de email marketing y da feedback detallado:

Subject: "${subject}"
Preview text: "${previewText || '(sin preview text)'}"
${bodyHtml ? `Body HTML: ${bodyHtml.substring(0, 3000)}` : '(sin body)'}

Evalúa estos criterios:
1. Longitud del subject (ideal < 50 chars)
2. Longitud del preview text (ideal < 90 chars)
3. Claridad del CTA
4. Nivel de urgencia (real, no falsa)
5. Palabras spam (GRATIS, $$$, URGENTE, etc.)
6. Ratio texto/imagen si hay HTML
7. Mobile-friendliness
8. Personalización
9. Coherencia subject + preview + body

Da un score de 0 a 100 y feedback específico.

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "score": 85,
  "feedback": [
    { "type": "success", "message": "..." },
    { "type": "warning", "message": "..." },
    { "type": "error", "message": "..." }
  ]
}`;

  return await callClaude(userMessage);
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_ab_variants
// ═══════════════════════════════════════════════════════════════
async function handleGenerateABVariants(body: any): Promise<any> {
  const { subject, count = 3 } = body;

  const userMessage = `Genera ${count} variantes A/B del siguiente subject line para testing:

Subject original: "${subject}"

Para cada variante, usa una estrategia diferente:
- Urgencia
- Curiosidad
- Beneficio directo
- Social proof
- Personalización
- Pregunta
- Número/dato específico

Cada variante debe tener MENOS de 50 caracteres.

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "variants": [
    { "subject": "...", "strategy": "nombre de la estrategia usada" }
  ]
}`;

  return await callClaude(userMessage);
}

// ═══════════════════════════════════════════════════════════════
// Action: generate_flow_emails
// ═══════════════════════════════════════════════════════════════
async function handleGenerateFlowEmails(body: any): Promise<any> {
  const { flowType, brandName, tone, products } = body;

  const flowConfigs: Record<string, { description: string; emailCount: number; delays: string[] }> = {
    welcome: {
      description: 'Serie de bienvenida para nuevos suscriptores',
      emailCount: 3,
      delays: ['Inmediato', '1 día después', '3 días después'],
    },
    abandoned_cart: {
      description: 'Recuperación de carritos abandonados',
      emailCount: 3,
      delays: ['1 hora después', '24 horas después', '72 horas después'],
    },
    post_purchase: {
      description: 'Seguimiento post-compra y fidelización',
      emailCount: 3,
      delays: ['Inmediato (confirmación)', '3 días después', '7 días después'],
    },
    win_back: {
      description: 'Recuperación de clientes inactivos',
      emailCount: 3,
      delays: ['30 días sin compra', '45 días sin compra', '60 días sin compra'],
    },
    browse_abandonment: {
      description: 'Seguimiento de navegación sin compra',
      emailCount: 2,
      delays: ['2 horas después', '24 horas después'],
    },
  };

  const config = flowConfigs[flowType] || {
    description: `Flow tipo "${flowType}"`,
    emailCount: 3,
    delays: ['Inmediato', '2 días después', '5 días después'],
  };

  const userMessage = `Genera una secuencia completa de ${config.emailCount} emails para un flow de tipo "${flowType}" (${config.description}) para la marca "${brandName}".
${tone ? `Tono: ${tone}` : ''}
${products ? `Productos principales: ${JSON.stringify(products)}` : ''}

Delays sugeridos: ${config.delays.join(', ')}

Para CADA email genera:
- subject: Subject line (< 50 chars)
- previewText: Preview text (< 90 chars)
- title: Título principal del email
- introText: Texto introductorio (2-3 oraciones)
- ctaText: Texto del botón CTA
- delayDescription: Descripción del momento de envío

La secuencia debe tener progresión lógica:
- Email 1: Primer contacto / gancho principal
- Email 2: Refuerzo / urgencia / beneficio adicional
- Email 3: Último intento / oferta especial (si aplica)

Responde SOLO con JSON puro (sin markdown, sin backticks):
{
  "emails": [
    {
      "subject": "...",
      "previewText": "...",
      "title": "...",
      "introText": "...",
      "ctaText": "...",
      "delayDescription": "..."
    }
  ]
}`;

  return await callClaude(userMessage);
}

// ═══════════════════════════════════════════════════════════════
// Action: chat
// ═══════════════════════════════════════════════════════════════
async function handleChat(body: any): Promise<any> {
  const { message, history } = body;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = `Eres Steve, un experto senior en email marketing, Klaviyo y estrategia de ecommerce. Respondes en español de forma clara, practica y accionable. Tienes 10+ años de experiencia.

REGLAS:
- Responde de forma concisa pero completa
- Da consejos especificos y accionables, no genericos
- Cuando te pregunten sobre frecuencia, segmentacion, o mejores practicas, da numeros concretos
- Usa markdown para formatear (listas, negritas, encabezados)
- Si no sabes algo, dilo honestamente
- Siempre relaciona tus consejos con metricas y resultados medibles

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
// Claude API helper
// ═══════════════════════════════════════════════════════════════
async function callClaude(userMessage: string): Promise<any> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

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
      system: STEVE_EMAIL_SYSTEM_PROMPT,
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
