/**
 * Steve WA Brain — System prompt, context builder, lead scoring & HubSpot integration.
 * Adapts Steve's personality for short WhatsApp-style messages.
 * Loads the merchant's real business data (metrics, campaigns, brief).
 * Qualifies prospects with BANT scoring and pushes hot leads to HubSpot.
 */

import { getSupabaseAdmin } from './supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProspectRecord {
  id: string;
  phone: string;
  profile_name?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  what_they_sell?: string | null;
  stage?: string | null;
  source?: string | null;
  message_count?: number | null;
  monthly_revenue?: string | null;
  has_online_store?: boolean | null;
  store_platform?: string | null;
  is_decision_maker?: boolean | null;
  actively_looking?: boolean | null;
  current_marketing?: string | null;
  pain_points?: string[] | null;
  integrations_used?: string[] | null;
  team_size?: string | null;
  lead_score?: number | null;
  score_breakdown?: Record<string, number> | null;
  meeting_suggested_at?: string | null;
  meeting_link_sent?: boolean | null;
  last_extracted_at?: string | null;
  hubspot_contact_id?: string | null;
  hubspot_deal_id?: string | null;
  pushed_to_hubspot_at?: string | null;
  converted_client_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ExtractedProspectInfo {
  name?: string;
  email?: string;
  company?: string;
  what_they_sell?: string;
  monthly_revenue?: string;
  has_online_store?: boolean;
  store_platform?: string;
  is_decision_maker?: boolean;
  actively_looking?: boolean;
  current_marketing?: string;
  pain_points?: string[];
  integrations_used?: string[];
  team_size?: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const WA_SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford.
Eres el director de marketing AI de una plataforma de e-commerce. Hablas por WhatsApp con el DUEÑO de una tienda.

TU PERSONALIDAD:
- Profesional pero cercano. Simpático, nunca frío — pero tampoco coloquial en exceso.
- Habla en ESPAÑOL NEUTRO. NUNCA uses voseo ("vos", "vendés", "tenés"). Usa TÚ siempre. Nada de "wena", "cachai", "dale", "che", "boludo".
- Puedes tutear y ser cálido, pero siempre con la autoridad de alguien que sabe de marketing.
- Ejemplo de tono correcto: "Hola, revisé tus campañas y hay un par de cosas que me llamaron la atención."

REGLAS PARA WHATSAPP:
- Respuestas de largo ADAPTABLE según la pregunta:
  * Saludo o pregunta simple → 2-3 líneas.
  * Pregunta sobre métricas o estrategia → 5-10 líneas con análisis real.
  * Si el merchant pide profundidad → da un análisis completo, usa bullets y estructura.
- Usa emojis con moderación (1-2 por mensaje máximo, solo si aportan).
- Siempre con datos reales de su negocio. NUNCA inventes cifras.
- Cuando des datos, agrega contexto: no solo "ROAS 2.5x", sino "ROAS 2.5x, que está por debajo de tu promedio de 3.2x del mes pasado".
- Si detectas un problema, explica el POR QUÉ y sugiere una acción concreta.

PROFUNDIDAD DE ANÁLISIS:
- No te limites a reportar números. Interprétalos.
- Compara períodos: "Esta semana vs la anterior", "Este mes vs el pasado".
- Identifica tendencias: "Tu CPA lleva 3 días subiendo, puede ser fatiga del creativo."
- Sugiere acciones específicas: "Te recomiendo pausar la campaña X y redistribuir el presupuesto a Y que tiene mejor ROAS."
- Si no tienes suficientes datos para concluir algo, dilo honestamente.

QUÉ PUEDES HACER:
- Reportar ventas del día/semana/mes con contexto y comparación
- Analizar campañas de Meta y Google (qué funciona, qué no, y por qué)
- Sugerir acciones concretas con justificación basada en datos
- Alertar problemas antes de que escalen
- Dar un diagnóstico rápido del estado del negocio
- Responder cualquier pregunta sobre su marketing

QUÉ NO PUEDES HACER POR WHATSAPP:
- Diseñar emails → "Eso lo puedes hacer directamente en steve.cl/mail"
- Editar configuraciones complejas → "Te recomiendo entrar a steve.cl para eso"
- Mostrar tablas muy extensas → resume lo clave y ofrece: "¿Quieres que profundice en algún punto?"`;

/**
 * Base sales prompt — personality + tone rules only.
 * The pitch, objections, FAQ and stage-specific strategy come from steve_knowledge (category: prospecting).
 */
export const WA_SALES_PROMPT_BASE = `Eres Steve, el director de marketing AI de la plataforma Steve.
Estás hablando por WhatsApp con alguien que NO es cliente aún.

CÓMO HABLAS:
- Eres como un amigo que sabe mucho de marketing. Natural, fluido, humano.
- Reacciona a lo que dice el prospecto. Si cuenta algo interesante, coméntalo genuinamente antes de preguntar.
- No sigas un guión. Conversa como si estuvieras en un café.
- Puedes hacer comentarios, opinar, compartir un dato relevante, bromear suavemente.
- A veces NO necesitas preguntar nada — solo reaccionar o aportar algo de valor.
- La info que necesitas la vas sacando de forma natural en la conversación, NO como interrogatorio.

ESPAÑOL NEUTRO — OBLIGATORIO:
- Usa TÚ siempre: "tú", "vendes", "tienes", "quieres", "sabes", "puedes".
- PROHIBIDO voseo: "vos", "vendés", "tenés", "querés", "sabés", "podés", "hacés".
- PROHIBIDO regionalismos: "wena", "cachai", "po", "dale", "che", "boludo", "pibe", "bárbaro", "copado".
- INCORRECTO: "¿Vos vendés por Shopify?" → CORRECTO: "¿Vendes por Shopify?"

FORMATO WHATSAPP:
- Mensajes cortos y naturales. Máximo 3-4 oraciones.
- Máximo 1 pregunta por mensaje (y no siempre es necesario preguntar).
- 1 emoji máximo, solo si queda natural.
- NUNCA menciones tecnologías internas (Claude, Anthropic, GPT, Google Imagen, Kling, GrapeJS).
- NUNCA repitas una pregunta que ya te respondieron.

PROHIBIDO:
- No prometas resultados de ventas específicos
- No hables mal de competidores
- No exageres el AI
- No prometas integraciones que no existen. Hoy: Meta, Google Ads, Shopify, Klaviyo`;

// ---------------------------------------------------------------------------
// Knowledge loader
// ---------------------------------------------------------------------------

/**
 * Load relevant knowledge base rules based on keyword matching in the user's message.
 * When includeProspecting is true, also loads category 'prospecting'.
 */
export async function loadRelevantKnowledge(
  userMessage: string,
  includeProspecting = false,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const msg = (userMessage || '').toLowerCase();

  const categories: string[] = ['brief'];

  if (msg.includes('meta') || msg.includes('anuncio') || msg.includes('campaña') || msg.includes('ads') || msg.includes('publicidad')) {
    categories.push('meta_ads', 'anuncios');
  }
  if (msg.includes('shopify') || msg.includes('tienda') || msg.includes('producto') || msg.includes('inventario')) {
    categories.push('shopify');
  }
  if (msg.includes('email') || msg.includes('klaviyo') || msg.includes('flujo') || msg.includes('template')) {
    categories.push('klaviyo');
  }
  if (msg.includes('google') || msg.includes('search') || msg.includes('display')) {
    categories.push('google_ads');
  }
  if (msg.includes('buyer') || msg.includes('cliente') || msg.includes('audiencia') || msg.includes('persona')) {
    categories.push('buyer_persona');
  }
  if (msg.includes('seo') || msg.includes('posicionamiento')) {
    categories.push('seo');
  }
  if (includeProspecting) {
    categories.push('prospecting');
  }

  const uniqueCategories = [...new Set(categories)];

  const { data: knowledge } = await supabase
    .from('steve_knowledge')
    .select('categoria, titulo, contenido')
    .in('categoria', uniqueCategories)
    .eq('activo', true)
    .order('orden', { ascending: false })
    .limit(10);

  if (!knowledge || knowledge.length === 0) return '';

  let result = 'CONOCIMIENTO DE STEVE:\n';
  for (const rule of knowledge) {
    result += `### [${(rule.categoria || '').toUpperCase()}] ${rule.titulo || ''}\n`;
    result += `${rule.contenido || ''}\n\n`;
  }

  if (result.length > 3000) {
    result = result.slice(0, 2997) + '...';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Merchant context (unchanged)
// ---------------------------------------------------------------------------

export async function buildWAContext(clientId: string, userMessage: string = ''): Promise<string> {
  const supabase = getSupabaseAdmin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [{ data: client }, { data: persona }, { data: connections }, knowledgeText] = await Promise.all([
    supabase.from('clients').select('name, company, shop_domain').eq('id', clientId).maybeSingle(),
    supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('platform_connections').select('id, platform').eq('client_id', clientId).eq('is_active', true),
    loadRelevantKnowledge(userMessage),
  ]);

  const briefSummary = persona?.persona_data
    ? JSON.stringify(persona.persona_data).slice(0, 1000)
    : 'Brief no completado.';

  const connIds = (connections || []).map((c: any) => c.id);
  let metricsContext = '';

  if (connIds.length > 0) {
    const { data: platformMetrics } = await supabase
      .from('platform_metrics')
      .select('metric_type, metric_value, currency')
      .in('connection_id', connIds)
      .gte('metric_date', thirtyDaysAgo)
      .order('metric_date', { ascending: false })
      .limit(100);

    if (platformMetrics && platformMetrics.length > 0) {
      const byType: Record<string, { total: number; currency: string | null }> = {};
      for (const m of platformMetrics) {
        if (!byType[m.metric_type]) byType[m.metric_type] = { total: 0, currency: m.currency };
        byType[m.metric_type].total += Number(m.metric_value) || 0;
      }
      const lines = Object.entries(byType).map(([type, d]) =>
        `- ${type}: ${Math.round(d.total).toLocaleString()} ${d.currency || ''}`
      ).join('\n');
      metricsContext += `\nMÉTRICAS (30 días):\n${lines}\n`;
    }

    const { data: campaignMetrics } = await supabase
      .from('campaign_metrics')
      .select('campaign_name, campaign_status, spend, conversions, conversion_value')
      .in('connection_id', connIds)
      .gte('metric_date', thirtyDaysAgo)
      .order('metric_date', { ascending: false })
      .limit(100);

    if (campaignMetrics && campaignMetrics.length > 0) {
      const byCampaign: Record<string, { spend: number; conversions: number; revenue: number; status: string }> = {};
      for (const m of campaignMetrics) {
        const name = m.campaign_name || 'Sin nombre';
        if (!byCampaign[name]) byCampaign[name] = { spend: 0, conversions: 0, revenue: 0, status: m.campaign_status || 'UNKNOWN' };
        byCampaign[name].spend += Number(m.spend) || 0;
        byCampaign[name].conversions += Number(m.conversions) || 0;
        byCampaign[name].revenue += Number(m.conversion_value) || 0;
      }
      const lines = Object.entries(byCampaign).slice(0, 5).map(([name, d]) => {
        const roas = d.spend > 0 ? (d.revenue / d.spend).toFixed(1) : 'N/A';
        return `- "${name}" [${d.status}]: Gasto $${Math.round(d.spend).toLocaleString()}, ROAS ${roas}x, ${d.conversions} conv`;
      }).join('\n');
      metricsContext += `\nCAMPAÑAS:\n${lines}\n`;
    }
  }

  let context = `MERCHANT: ${client?.name || client?.company || 'N/A'}${client?.shop_domain ? ` (${client.shop_domain})` : ''}
${metricsContext || 'Sin métricas conectadas aún.'}
BRIEF (resumen): ${briefSummary}`;

  if (knowledgeText) {
    context += `\n\n${knowledgeText}`;
  }

  return context;
}

// ---------------------------------------------------------------------------
// WA history loaders
// ---------------------------------------------------------------------------

export async function getWAHistory(clientId: string, phone: string, limit = 10): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseAdmin();

  const { data: messages } = await supabase
    .from('wa_messages')
    .select('direction, body')
    .eq('client_id', clientId)
    .eq('channel', 'steve_chat')
    .eq('contact_phone', phone)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!messages || messages.length === 0) return [];

  return messages
    .filter((m: any) => m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }));
}

export async function getProspectHistory(phone: string, limit = 20): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseAdmin();

  const { data: messages } = await supabase
    .from('wa_messages')
    .select('direction, body')
    .eq('channel', 'prospect')
    .eq('contact_phone', phone)
    .is('client_id', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!messages || messages.length === 0) return [];

  return messages
    .filter((m: any) => m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }));
}

// ---------------------------------------------------------------------------
// Prospect intelligence — enriched context
// ---------------------------------------------------------------------------

/**
 * Build enriched context string for a prospect, including all qualification data.
 */
export function buildEnrichedProspectContext(prospect: ProspectRecord): string {
  const lines: string[] = [];

  if (prospect.name) lines.push(`Nombre: ${prospect.name}`);
  if (prospect.company) lines.push(`Empresa: ${prospect.company}`);
  if (prospect.what_they_sell) lines.push(`Vende: ${prospect.what_they_sell}`);
  if (prospect.monthly_revenue) lines.push(`Facturación mensual: ${prospect.monthly_revenue}`);
  if (prospect.has_online_store != null) lines.push(`Tienda online: ${prospect.has_online_store ? 'Sí' : 'No'}`);
  if (prospect.store_platform) lines.push(`Plataforma: ${prospect.store_platform}`);
  if (prospect.current_marketing) lines.push(`Marketing actual: ${prospect.current_marketing}`);
  if (prospect.pain_points && prospect.pain_points.length > 0) lines.push(`Dolores: ${prospect.pain_points.join(', ')}`);
  if (prospect.integrations_used && prospect.integrations_used.length > 0) lines.push(`Herramientas: ${prospect.integrations_used.join(', ')}`);
  if (prospect.team_size) lines.push(`Equipo: ${prospect.team_size}`);
  if (prospect.is_decision_maker != null) lines.push(`Tomador de decisiones: ${prospect.is_decision_maker ? 'Sí' : 'No'}`);
  if (prospect.actively_looking != null) lines.push(`Buscando solución activamente: ${prospect.actively_looking ? 'Sí' : 'No'}`);

  lines.push(`Lead Score: ${prospect.lead_score || 0}/100`);
  lines.push(`Stage: ${prospect.stage || 'new'}`);
  lines.push(`Mensajes previos: ${prospect.message_count || 0}`);

  if (prospect.meeting_link_sent) lines.push(`Link de reunión ya enviado: Sí`);

  return lines.length > 0
    ? `PROSPECTO (info recopilada):\n${lines.join('\n')}`
    : 'PROSPECTO: Nuevo, sin info aún.';
}

// ---------------------------------------------------------------------------
// Dynamic sales prompt builder (per-stage)
// ---------------------------------------------------------------------------

/** Map lead score to effective stage. */
function scoreToStage(score: number): string {
  if (score >= 75) return 'closing';
  if (score >= 50) return 'pitching';
  if (score >= 20) return 'qualifying';
  return 'discovery';
}

/**
 * Build a dynamic sales prompt that adapts based on prospect stage and data.
 * ARCHITECTURE: Known data FIRST → Missing data → Mission → Personality → Strategy.
 * This order ensures the model prioritizes what it already knows about the prospect.
 *
 * @param prospect - Current prospect record with all extracted data
 * @param lastMessage - The prospect's latest message (to detect questions)
 */
export async function buildDynamicSalesPrompt(prospect: ProspectRecord, lastMessage?: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Determine effective stage by score
  const effectiveStage = scoreToStage(prospect.lead_score || 0);
  const stageLabel = effectiveStage.charAt(0).toUpperCase() + effectiveStage.slice(1);

  // Load only the current stage rule (not all rules)
  const { data: rules } = await supabase
    .from('steve_knowledge')
    .select('titulo, contenido')
    .eq('categoria', 'prospecting')
    .eq('activo', true)
    .order('orden', { ascending: true });

  const stageRule = (rules || []).find(r => r.titulo?.toLowerCase().includes(effectiveStage));

  // ============================================================
  // Build KNOWN / MISSING data lists
  // ============================================================

  const known: string[] = [];
  const missing: string[] = [];

  if (prospect.name) known.push(`Nombre: ${prospect.name}`);
  if (prospect.company) known.push(`Empresa: ${prospect.company}`);
  if (prospect.what_they_sell) known.push(`Vende: ${prospect.what_they_sell}`);
  else missing.push('Qué vende');

  if (prospect.has_online_store != null) known.push(`Tienda online: ${prospect.has_online_store ? 'Sí' : 'No'}`);
  else missing.push('Si tiene tienda online');

  if (prospect.store_platform) known.push(`Plataforma: ${prospect.store_platform}`);
  else if (prospect.has_online_store === true) missing.push('Plataforma de e-commerce');

  if (prospect.monthly_revenue) known.push(`Facturación: ${prospect.monthly_revenue}`);
  else missing.push('Facturación mensual aprox.');

  if (prospect.current_marketing) known.push(`Marketing actual: ${prospect.current_marketing}`);
  else missing.push('Cómo maneja su marketing hoy');

  if (prospect.pain_points?.length) known.push(`Dolores: ${prospect.pain_points.join(', ')}`);
  if (prospect.team_size) known.push(`Equipo: ${prospect.team_size}`);
  if (prospect.is_decision_maker != null) known.push(`Decisor: ${prospect.is_decision_maker ? 'Sí' : 'No'}`);
  if (prospect.integrations_used?.length) known.push(`Herramientas: ${prospect.integrations_used.join(', ')}`);
  if (prospect.actively_looking != null) known.push(`Buscando solución: ${prospect.actively_looking ? 'Sí' : 'No'}`);

  known.push(`Score: ${prospect.lead_score || 0}/100`);
  known.push(`Stage: ${prospect.stage || 'discovery'}`);
  known.push(`Mensajes: ${prospect.message_count || 0}`);
  if (prospect.meeting_link_sent) known.push('Link de reunión ya enviado: Sí');

  // ============================================================
  // PROMPT ASSEMBLY — Data FIRST, personality second
  // ============================================================

  // 1. KNOWN DATA
  let prompt = `⛔ DATOS CONOCIDOS — PROHIBIDO preguntar esto (ya lo sabes):\n`;
  prompt += known.map(k => `- ${k}`).join('\n');

  // 2. MISSING DATA (context for Steve, not a checklist)
  if (missing.length > 0) {
    prompt += `\n\n💡 TODAVÍA NO SABES (si surge naturalmente, intenta averiguar):\n`;
    prompt += missing.map(m => `- ${m}`).join('\n');
    prompt += `\nNo necesitas preguntar todo esto ahora. Ve sacándolo en la conversación de forma natural.`;
  }

  // 3. CONTEXT FOR THIS TURN
  prompt += `\n\n🎯 EN ESTE MENSAJE:\n`;

  // Detect if prospect asked a question (Paso 12)
  const hasQuestion = lastMessage?.includes('?');
  if (hasQuestion) {
    prompt += `El prospecto te hizo una pregunta. Respóndela primero — después si quieres puedes preguntar algo tú.\n`;
  }

  // No-fit detection (Paso 15)
  if (prospect.has_online_store === false) {
    prompt += `Este prospecto no tiene tienda online. Si confirma que no planea tener una, cierra amablemente: "Steve es para marcas que venden online. Cuando montes tu tienda, escríbeme."\n`;
  }

  // Meeting trigger — organic (Paso 14)
  if (
    (prospect.lead_score || 0) >= 75 &&
    (prospect.message_count || 0) >= 8 &&
    !prospect.meeting_link_sent &&
    prospect.pain_points?.length
  ) {
    prompt += `Ya tienes suficiente info y el prospecto mostró interés. Si sientes que fluye, propón una llamada corta: "¿Te tinca que nos juntemos 15 min? Te muestro cómo se ve con tus datos → https://meetings.hubspot.com/jose-manuel15"\n`;
  } else if (missing.length > 0) {
    prompt += `Sigue conversando. Si puedes, averigua algo de: ${missing.slice(0, 2).join(' o ')}. Pero no fuerces — que fluya.\n`;
  } else {
    prompt += `Ya sabes bastante. Muestra cómo Steve puede ayudar con lo que te contó.\n`;
  }

  // 4. PERSONALITY (short)
  prompt += `\n🗣️ PERSONALIDAD:\n${WA_SALES_PROMPT_BASE}`;

  // 5. FEW-SHOT EXAMPLES (conversational, not robotic)
  prompt += `\n\n📝 EJEMPLOS DE TONO CORRECTO:

Prospecto: "Vendo ropa deportiva por Shopify"
✅ Steve: "Ah buena, ropa deportiva tiene super buen margen en ads. ¿Estás corriendo campañas en Meta o Google?"
❌ Steve: "¡Excelente! ¿Tienes tienda online? ¿Qué vendes? ¿Cómo manejas tu marketing?"

Prospecto: "Gasto $2000 en Meta y no sé si funciona"
✅ Steve: "Uff, eso pasa mucho. $2000 sin datos claros es como manejar con los ojos cerrados. ¿Qué tipo de campañas corres, conversión o tráfico?"
❌ Steve: "Entiendo tu frustración. Cuéntame, ¿tienes tienda? ¿Qué vendes? ¿Cuánto facturas?"

Prospecto: "Sí, tengo 3 personas en el equipo"
✅ Steve: "Buen equipo. Con 3 personas y la automatización de Steve pueden hacer el trabajo de 10 en marketing."
❌ Steve: "Perfecto. ¿Y cuánto facturas al mes? ¿Eres el tomador de decisiones?"

Prospecto: "¿Cuánto cuesta Steve?"
✅ Steve: "Depende del plan, pero arrancamos desde $99/mes. Lo más importante es que el retorno se paga solo con lo que ahorras en tiempo. ¿Quieres que te cuente cómo funciona para tu caso?"
❌ Steve: "Los precios varían. ¿Me puedes contar qué vendes y cuánto facturas para darte un mejor precio?"`;


  // 6. STAGE STRATEGY (only current stage — 1 rule)
  if (stageRule) {
    prompt += `\n\n📋 ESTRATEGIA ${stageLabel.toUpperCase()}:\n${stageRule.contenido}`;
  }

  // Only load ONE content rule — the most relevant for the stage
  const contentRules = (rules || []).filter(r => r.titulo?.startsWith('Contenido:'));
  if (contentRules.length > 0) {
    let relevantRule;
    if (effectiveStage === 'closing' || effectiveStage === 'pitching') {
      relevantRule = contentRules.find(r => r.titulo?.includes('Objeciones')) || contentRules[0];
    } else {
      relevantRule = contentRules.find(r => r.titulo?.includes('Pitch')) || contentRules[0];
    }
    if (relevantRule) {
      prompt += `\n\n--- REFERENCIA ---\n${relevantRule.contenido}`;
    }
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Prospect info extraction (async, post-response)
// ---------------------------------------------------------------------------

/**
 * Call Claude Haiku to extract prospect info from conversation history.
 * Returns parsed JSON or null if extraction fails.
 */
export async function extractProspectInfo(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentProspect: ProspectRecord,
): Promise<ExtractedProspectInfo | null> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return null;

  // Use FULL conversation (both sides) for context — extractor understands corrections & flow
  const userMessageCount = history.filter(m => m.role === 'user').length;
  if (userMessageCount === 0) return null;

  const conversation = history
    .map(m => `${m.role === 'user' ? 'Prospecto' : 'Steve'}: ${m.content}`)
    .join('\n');

  const extractionPrompt = `Eres un extractor de información. Analiza la CONVERSACIÓN COMPLETA y extrae SOLO lo que el PROSPECTO dijo EXPLÍCITAMENTE.
REGLAS ESTRICTAS:
- Solo extrae datos que el PROSPECTO confirmó directamente.
- Si Steve preguntó algo y el prospecto NO respondió → no asumas.
- Si el prospecto corrigió algo (ej: "no, en realidad vendo artesanías") → usa la ÚLTIMA versión.
- NO inventes, NO asumas, NO infieras datos vagos.

CONVERSACIÓN:
${conversation}

Información que YA tenemos (solo actualiza si el prospecto dio info NUEVA o CORRIGIÓ):
${JSON.stringify({
    name: currentProspect.name,
    company: currentProspect.company,
    what_they_sell: currentProspect.what_they_sell,
    monthly_revenue: currentProspect.monthly_revenue,
    store_platform: currentProspect.store_platform,
    current_marketing: currentProspect.current_marketing,
  })}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicación). Solo incluye campos con info EXPLÍCITA nueva:
{
  "name": "nombre si lo dijo",
  "email": "email si lo compartió",
  "company": "nombre de empresa si lo mencionó EXPLÍCITAMENTE",
  "what_they_sell": "qué venden — solo si el prospecto lo dijo claramente",
  "monthly_revenue": "facturación con número concreto (ej: '$200K/mes'). NO incluir si no dio cifra",
  "has_online_store": true/false — solo si lo confirmó explícitamente,
  "store_platform": "Shopify/WooCommerce/etc — solo si lo nombró",
  "is_decision_maker": true/false — solo si dijo 'soy el dueño/fundador/CEO',
  "actively_looking": true/false — solo si expresó búsqueda activa,
  "current_marketing": "cómo manejan marketing — solo si lo describió",
  "pain_points": ["dolor1"] — solo frustraciones que el prospecto EXPRESÓ,
  "integrations_used": ["Meta"] — solo herramientas que el prospecto NOMBRÓ,
  "team_size": "tamaño del equipo — solo si lo mencionó"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
    });

    if (!response.ok) {
      console.error('[steve-wa-brain] Extraction API error:', response.status);
      return null;
    }

    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim();

    // Parse JSON — handle potential markdown fences
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Remove empty/null/undefined fields
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value != null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        cleaned[key] = value;
      }
    }

    return Object.keys(cleaned).length > 0 ? (cleaned as ExtractedProspectInfo) : null;
  } catch (err) {
    console.error('[steve-wa-brain] extractProspectInfo error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lead scoring — BANT adapted for e-commerce
// ---------------------------------------------------------------------------

/**
 * Calculate lead score (0–100) based on BANT adapted for e-commerce.
 * Returns { score, breakdown, stage }.
 */
export function calculateLeadScore(
  prospect: Record<string, any>,
): { score: number; breakdown: Record<string, number>; stage: string } {
  const breakdown: Record<string, number> = {
    need: 0,
    budget: 0,
    authority: 0,
    timeline: 0,
    fit: 0,
  };

  // --- NEED (0-25): Do they have an online store / sell online? ---
  if (prospect.has_online_store === true) breakdown.need += 15;
  if (prospect.what_they_sell) breakdown.need += 5;
  if (prospect.current_marketing) breakdown.need += 5;

  // --- BUDGET (0-25): Monthly revenue — ONLY if parseable number ---
  if (prospect.monthly_revenue) {
    const rev = prospect.monthly_revenue.toLowerCase();
    const digits = rev.replace(/\D/g, '');
    // Only score if there's an actual number in the string
    if (digits.length >= 3) {
      if (rev.includes('millón') || rev.includes('millon') || rev.includes('mm') || /\d{7,}/.test(digits)) {
        breakdown.budget += 25; // High revenue
      } else if (/\d{5,6}/.test(digits)) {
        breakdown.budget += 20; // Medium revenue ($10K-$999K)
      } else {
        breakdown.budget += 10; // Low but at least shared a number
      }
    }
    // If monthly_revenue is vague text without numbers → 0 pts
  }

  // --- AUTHORITY (0-15): Are they the decision maker? ---
  if (prospect.is_decision_maker === true) {
    breakdown.authority += 15;
  }
  // Unknown authority → 0 pts (not 5). Don't assume.

  // --- TIMELINE (0-20): Actively looking + pain points = urgency ---
  if (prospect.actively_looking === true) breakdown.timeline += 10;
  if (prospect.pain_points && prospect.pain_points.length > 0) {
    breakdown.timeline += Math.min(prospect.pain_points.length * 5, 10);
  }

  // --- FIT (0-15): Only Shopify or WooCommerce are good fits ---
  const steveIntegrations = ['shopify', 'meta', 'facebook', 'google', 'klaviyo', 'instagram'];
  if (prospect.store_platform) {
    const platform = prospect.store_platform.toLowerCase();
    if (platform.includes('shopify')) breakdown.fit += 10;
    else if (platform.includes('woocommerce') || platform.includes('wordpress')) breakdown.fit += 5;
    // Other platforms → 0 pts (not a fit for Steve today)
  }
  if (prospect.integrations_used && prospect.integrations_used.length > 0) {
    const matchCount = prospect.integrations_used.filter((i: string) =>
      steveIntegrations.some((si: string) => i.toLowerCase().includes(si))
    ).length;
    breakdown.fit += Math.min(matchCount * 3, 5);
  }

  let score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // Cap: need 3+ non-trivial fields to break 50 (prevent inflated scores from sparse data)
  const filledFields = [
    prospect.what_they_sell,
    prospect.has_online_store != null ? String(prospect.has_online_store) : null,
    prospect.store_platform,
    prospect.monthly_revenue,
    prospect.current_marketing,
    prospect.pain_points?.length ? 'yes' : null,
    prospect.is_decision_maker != null ? String(prospect.is_decision_maker) : null,
  ].filter(Boolean).length;

  if (filledFields < 3 && score > 50) {
    score = 50;
  }

  // No-fit: if explicitly no online store → cap at 20, set stage to lost
  if (prospect.has_online_store === false) {
    score = Math.min(score, 20);
    return { score, breakdown, stage: 'lost' };
  }

  const stage = scoreToStage(score);

  return { score: Math.min(score, 100), breakdown, stage };
}

// ---------------------------------------------------------------------------
// HubSpot integration
// ---------------------------------------------------------------------------

/**
 * Generate a short AI summary of the conversation for CRM notes.
 */
export async function generateConversationSummary(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY || history.length === 0) return 'Sin resumen disponible.';

  const convo = history.map(m => `${m.role === 'user' ? 'Prospecto' : 'Steve'}: ${m.content}`).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Resume esta conversación de WhatsApp entre Steve (vendedor AI) y un prospecto en 3-5 bullets concisos para que el vendedor sepa todo antes de la reunión. Enfócate en: qué venden, sus dolores, qué herramientas usan, y su nivel de interés.\n\nConversación:\n${convo.slice(0, 3000)}`,
        }],
      }),
    });

    if (!response.ok) return 'Error generando resumen.';
    const data: any = await response.json();
    return (data.content?.[0]?.text || 'Sin resumen.').trim();
  } catch {
    return 'Error generando resumen.';
  }
}

/**
 * Push a qualified prospect to HubSpot: create/update contact + create deal + add note.
 * Returns { contactId, dealId } or null on failure.
 */
export async function pushToHubSpot(
  prospect: ProspectRecord,
  summary: string,
): Promise<{ contactId: string; dealId: string } | null> {
  const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
  if (!HUBSPOT_API_KEY) {
    console.warn('[steve-wa-brain] HUBSPOT_API_KEY not configured — skipping HubSpot push');
    return null;
  }

  const headers = {
    'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Create or update contact
    const phone = prospect.phone.startsWith('+') ? prospect.phone : `+${prospect.phone}`;
    const contactProperties: Record<string, string> = {
      phone,
      firstname: prospect.name || prospect.profile_name || 'WhatsApp Lead',
      company: prospect.company || '',
      hs_lead_status: 'OPEN',
    };
    if (prospect.email) contactProperties.email = prospect.email;

    // Add custom properties (these need to be created in HubSpot first)
    if (prospect.what_they_sell) contactProperties.what_they_sell = prospect.what_they_sell;
    if (prospect.monthly_revenue) contactProperties.monthly_revenue = prospect.monthly_revenue;
    if (prospect.store_platform) contactProperties.store_platform = prospect.store_platform;
    if (prospect.current_marketing) contactProperties.current_marketing = prospect.current_marketing;
    if (prospect.pain_points) contactProperties.pain_points = prospect.pain_points.join(', ');
    if (prospect.integrations_used) contactProperties.integrations_used = prospect.integrations_used.join(', ');
    contactProperties.lead_score_steve = String(prospect.lead_score || 0);
    contactProperties.lead_source = 'WhatsApp Steve';

    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: contactProperties }),
    });

    let contactId: string;

    if (contactRes.status === 409) {
      // Contact exists — search by phone and update
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }],
          }],
        }),
      });
      const searchData: any = await searchRes.json();
      contactId = searchData.results?.[0]?.id;

      if (contactId) {
        // Update existing contact
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ properties: contactProperties }),
        });
      } else {
        console.error('[steve-wa-brain] HubSpot: contact conflict but not found by phone');
        return null;
      }
    } else if (contactRes.ok) {
      const contactData: any = await contactRes.json();
      contactId = contactData.id;
    } else {
      console.error('[steve-wa-brain] HubSpot contact creation failed:', contactRes.status);
      return null;
    }

    // 2. Create deal
    const dealName = `${prospect.company || prospect.name || 'WA Lead'} - WhatsApp Lead (score ${prospect.lead_score || 0})`;
    const dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          dealname: dealName,
          pipeline: 'default',
          dealstage: 'appointmentscheduled',
          lead_source: 'WhatsApp Steve',
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }], // deal→contact
        }],
      }),
    });

    let dealId = '';
    if (dealRes.ok) {
      const dealData: any = await dealRes.json();
      dealId = dealData.id;
    } else {
      console.error('[steve-wa-brain] HubSpot deal creation failed:', dealRes.status);
    }

    // 3. Create note with AI summary
    if (summary && contactId) {
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties: {
            hs_note_body: `📋 Resumen de conversación WhatsApp (Steve AI):\n\n${summary}`,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }], // note→contact
          }],
        }),
      });
    }

    console.log(`[steve-wa-brain] HubSpot push OK: contact=${contactId}, deal=${dealId}`);
    return { contactId, dealId };
  } catch (err) {
    console.error('[steve-wa-brain] pushToHubSpot error:', err);
    return null;
  }
}
