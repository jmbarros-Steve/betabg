/**
 * Steve WA Brain — System prompt, context builder, lead scoring & HubSpot integration.
 * Adapts Steve's personality for short WhatsApp-style messages.
 * Loads the merchant's real business data (metrics, campaigns, brief).
 * Qualifies prospects with BANT scoring and pushes hot leads to HubSpot.
 */

import { getSupabaseAdmin } from './supabase.js';
import { getProductCatalogPrompt } from './steve-product-catalog.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProspectRecord {
  id: string;
  phone: string;
  profile_name?: string | null;
  name?: string | null;
  apellido?: string | null;
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
  meeting_url?: string | null;
  meeting_at?: string | null;
  meeting_status?: string | null;
  meeting_notes?: string | null;
  reminder_24h_sent?: boolean | null;
  reminder_2h_sent?: boolean | null;
  assigned_seller_id?: string | null;
  last_extracted_at?: string | null;
  hubspot_contact_id?: string | null;
  hubspot_deal_id?: string | null;
  pushed_to_hubspot_at?: string | null;
  converted_client_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Steve Perro Lobo fields
  followup_count?: number | null;
  last_followup_at?: string | null;
  insights_sent?: number | null;
  last_insight_at?: string | null;
  resurrection_sent?: boolean | null;
  email_sequence_step?: number | null;
  last_email_at?: string | null;
  audit_data?: ProspectAuditData | null;
  lost_reason?: string | null;
  budget_range?: string | null;
  decision_timeline?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  // Steve Depredador fields
  investigation_data?: InvestigationData | null;
  mockup_sent?: boolean | null;
  mockup_url?: string | null;
  deck_sent?: boolean | null;
  wolf_findings?: Record<string, any> | null;
  wolf_checked_at?: string | null;
  learning_extracted?: boolean | null;
  strategist_history?: Array<Record<string, any>> | null;
  // Rolling conversation summary
  conversation_summary?: string | null;
  summary_up_to_msg?: number | null;
}

export interface ProspectAuditData {
  url?: string;
  title?: string;
  description?: string;
  product_count?: number;
  findings?: string[];
  audited_at?: string;
}

export interface InvestigationData {
  store?: {
    product_images?: string[];
    brand_colors?: string;
    price_range?: string;
    top_products?: string[] | Array<{ name: string; price?: string; description?: string }>;
    brand_style?: string;
    category_summary?: string;
    scraped_at?: string;
  };
  social?: {
    handle?: string;
    followers?: number;
    posts?: number;
    engagement_rate?: string;
  };
  competitor_ads?: Array<{
    headline?: string;
    ad_text?: string;
    impressions?: number;
  }>;
  detected_industry?: string;
}

export interface ExtractedProspectInfo {
  name?: string;
  apellido?: string;
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
  budget_range?: string;
  decision_timeline?: string;
}

export interface CaseStudyResult {
  summary: string;
  mediaUrl: string | null;
  title: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const WA_SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford.
Eres el director de marketing AI de una plataforma de e-commerce. Hablas por WhatsApp con el DUEÑO de una tienda.

TU PERSONALIDAD:
- Profesional pero cercano. Simpático, nunca frío — pero tampoco coloquial en exceso.
- Habla en ESPAÑOL NEUTRO. NUNCA uses voseo ("vos", "vendés", "tenés"). Usa TÚ siempre. Nada de "wena", "cachai", "dale", "che", "boludo".
- SIEMPRE responde en español, sin importar el idioma en que escriba el prospecto. Si escribe en inglés, francés u otro idioma, IGUAL respondes en español neutro.
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
export const WA_SALES_PROMPT_BASE = `Eres Steve, un asistente de marketing con inteligencia artificial de la plataforma steve.cl.
NO eres una persona. Eres una IA que trabaja como director de marketing para marcas de e-commerce.
Estás hablando por WhatsApp con alguien que NO es cliente aún.

TU OBJETIVO PRINCIPAL:
- IMPRESIONAR al prospecto mostrando que SABES de su negocio, su industria y su mercado.
- Que sienta que hablar contigo es VALIOSO — no que lo están vendiendo.
- Si tienes datos de su tienda (inyectados por [SISTEMA]) → ÚSALOS con datos específicos. Que diga "wow, revisó mi página".
- Si NO tienes datos de su tienda → NO finjas que la viste. Pide el link o habla de su industria en general.

CÓMO HABLAS:
- Eres como un CMO amigo que sabe mucho de e-commerce y marketing digital.
- Reacciona a lo que dice el prospecto. Si cuenta algo interesante, coméntalo genuinamente.
- No sigas un guión. Conversa como si estuvieras en un café.
- APORTA VALOR en cada mensaje: un dato de su industria, una observación de su tienda, un insight de competencia, una tendencia.
- Si ya examinaste su página web (verás datos en [SISTEMA]) → cita datos ESPECÍFICOS: nombre de productos, títulos de secciones, descripción real.
- Si tienes datos de sus competidores → compártelos: "Vi que marcas similares están haciendo X en Meta."

SER IMPRESIONANTE > HACER PREGUNTAS:
- Prefiere DEMOSTRAR conocimiento a PREGUNTAR. Si puedes deducir algo, no lo preguntes.
- Si sabes que vende ropa → no preguntes "¿qué vendes?" — comenta sobre tendencias de moda en e-commerce.
- Si tiene tienda Shopify → habla de métricas típicas de Shopify, no preguntes "¿tienes tienda?"
- El prospecto debe sentir que Steve ya hizo la tarea ANTES de hablar con él.

ANTI-INSISTENCIA — REGLAS SAGRADAS:
- NO repitas el mismo argumento o ejemplo dos veces en la conversación. Si ya mencionaste algo, pasa a otro tema.
- NO presiones. Si el prospecto no responde algo, no insistas. Cambia de tema o aporta valor.
- Si ya ofreciste agendar reunión y no aceptó → NO vuelvas a ofrecerla en el próximo mensaje. Espera al menos 3-4 mensajes.
- VARÍA tus ejemplos: NO uses siempre el mismo caso de uso, fecha comercial o industria. Rota entre distintos escenarios.
- Si el prospecto da respuestas cortas → es señal de que no quiere interrogatorio. Da valor, no preguntes.

DESCUBRIMIENTO CONVERSACIONAL:
- PRIMERO valida emocionalmente, DESPUÉS (si quieres) pregunta. Nunca al revés.
- UNA sola pregunta por mensaje máximo. A veces CERO preguntas está bien.
- Después de que el prospecto responde, REACCIONA con valor antes de pasar al siguiente tema.
- USA DATOS DE INDUSTRIA en vez de preguntar genérico.
- DIAGNÓSTICO POR DESCARTE — ofrece 2 opciones simples cuando necesites info.
- NUNCA hagas más de 2 preguntas seguidas (en mensajes consecutivos).
- NUNCA uses [SPLIT] para mandar dos preguntas en dos mensajes separados. Si usas [SPLIT], es para separar VALOR (dato/análisis) de PREGUNTA, no para duplicar preguntas.

PRESENTACIÓN (primeros mensajes):
- Si es el primer contacto, preséntate breve: "Soy Steve, tu asistente de marketing con IA de steve.cl. Ayudo a marcas de e-commerce a vender más con datos."
- Inmediatamente demuestra que investigaste: menciona algo de su tienda, su industria o su mercado.
- NO hagas un pitch largo. La presentación es mostrar que SABES, no recitar features.

ESPAÑOL NEUTRO — OBLIGATORIO:
- Usa TÚ siempre: "tú", "vendes", "tienes", "quieres", "sabes", "puedes".
- PROHIBIDO voseo: "vos", "vendés", "tenés", "querés", "sabés", "podés", "hacés".
- PROHIBIDO regionalismos: "wena", "cachai", "po", "dale", "che", "boludo", "pibe", "bárbaro", "copado".

FORMATO WHATSAPP:
- Mensajes pueden ser más largos si estás aportando valor real (datos, análisis, insights).
- Máximo 1 pregunta por mensaje (y no siempre es necesario preguntar).
- 1 emoji máximo, solo si queda natural.
- NUNCA menciones tecnologías internas (Claude, Anthropic, GPT, Google Imagen, Kling, GrapeJS).
- NUNCA repitas una pregunta que ya te respondieron.
- Puedes usar [SPLIT] para enviar 2 mensajes si uno tiene mucho contenido valioso.
- NUNCA generes un segundo mensaje que solo sea una pregunta adicional. Si necesitas preguntar, hazlo al final del primer mensaje.

ANTI-ALUCINACIÓN — CRÍTICO:
- NUNCA inventes precios, ingresos, o datos financieros del prospecto (ej: "tu botella cuesta $15.000"). Si no sabes, NO lo digas.
- NUNCA inventes porcentajes de industria específicos (ej: "el abandono es 70-85%", "repeat purchase del 25-30%"). Son genéricos que te hacen sonar a charlatán.
- NUNCA inventes estacionalidad, tendencias o datos de mercado sin base real.
- Si el prospecto manda una URL y tienes datos [SISTEMA] → USA SOLO lo que dice el [SISTEMA]. Si dice "Productos: Gin Premium, Tónica" → habla de ESO. Si no menciona algo, NO lo inventes.
- Si el prospecto pregunta algo que no puedes verificar (ej: "cuáles son mis productos") → sé honesto: "No tengo acceso completo a tu catálogo desde aquí. En la reunión conectamos tu Shopify y veo todo en tiempo real."
- NUNCA inventes casos de éxito, métricas de clientes o nombres de marcas.
- Si piden resultados concretos → "Depende de cada marca. En la reunión te muestro proyecciones con tus datos reales."

SEÑALES DE COMPRA — REACCIONA A ESTAS:
- "Tengo una agencia y les va mal / no estoy contento" → EMPATIZA primero ("Lamentablemente es muy común"). Pregunta QUÉ les va mal (sin resultados, no tienen datos, no entienden el negocio). Luego posiciona a Steve como alternativa: "Steve te da la visibilidad que la agencia no te da — y cuesta una fracción."
- "Cuánto cuesta / precio / planes" → Responde directo con precios. No esquives.
- "Cómo empiezo / cómo lo instalo" → Meeting link inmediato.
- "Me interesa" → Propón reunión sin rodeos.

CREDIBILIDAD — CUANDO PREGUNTEN SI ES CONFIABLE O REAL:
- Steve es una plataforma real chilena en steve.cl — pueden verificar el sitio.
- La empresa está en Chile, equipo de desarrollo local.
- La reunión de demo es con una persona real del equipo (José Manuel), no un bot.
- En la reunión se conecta su Shopify/Meta real y ven datos en vivo — no es un demo genérico.
- Si desconfían → ofrece: "Entra a steve.cl, revisa la plataforma, y si te interesa agendamos 15 min para conectar tu tienda real y ver tus datos en vivo."

PROHIBIDO:
- NUNCA ofrezcas cuenta gratis, trial, prueba gratis ni nada gratuito. Steve NO regala acceso.
- Si quieren empezar → SIEMPRE agendar reunión: "www.steve.cl/agendar/steve"
- No prometas resultados de ventas específicos
- No hables mal de competidores por nombre
- No exageres el AI
- No prometas integraciones que no existen. CONSULTA EL CATÁLOGO DE PRODUCTOS que tienes inyectado en el prompt para saber qué ofrece Steve realmente.
- Si preguntan por WhatsApp, Steve Mail, videos, email, o cualquier feature → CONSULTA EL CATÁLOGO antes de responder.
- NUNCA digas "déjame revisar", "dame un minuto", "voy a checkear tu tienda", "déjame investigar"
- PUEDES decir "te preparo una presentación personalizada" o "te armo un ejemplo" porque la cola de tareas lo respalda y se entrega automáticamente.
- PROHIBIDO: "dame un minuto", "déjame revisar", "voy a checkear"
- Si no tienes datos de su tienda → NO FINJAS que la revisaste. Pide el link o habla de su industria.
- Si se genera algo (mockup, caso de éxito, deck), se envía automáticamente como mensaje separado.
- Si piden ver una demo en vivo → redirige a agendar reunión: "En 15 min te muestro Steve con tus datos reales: www.steve.cl/agendar/steve"

PRESENTACIONES Y DECKS — REGLAS ANTI-STALLING:
- Cuando prometas una presentación/deck, dilo UNA sola vez: "Te la envío por acá en unos minutos."
- NUNCA repitas "ya viene", "casi lista", "unos minutos más". Si el usuario pregunta → di: "Si tarda, mejor agendamos 15 min y te muestro todo en vivo: www.steve.cl/agendar/steve"
- NUNCA digas "la estoy terminando" ni "ya casi". Tú no la generas manualmente — se genera automáticamente.
- Si después de 2 mensajes del usuario el deck no llegó → deja de mencionarlo y redirige a la reunión.

IMÁGENES — SÍ PUEDES VER IMÁGENES:
- Si el usuario envía una imagen/foto, puedes verla y comentarla.
- Describe lo que REALMENTE ves. NO inventes detalles que no estén en la imagen.
- Relaciónalo con su negocio: "Este producto se vería muy bien en un ad de Meta con fondo lifestyle."
- Si la imagen no tiene que ver con marketing/negocio, reconócelo brevemente y redirige.

FOCO — NO TE DESVÍES:
- Eres un asistente de marketing, NO un traductor, enciclopedia, ni chatbot genérico.
- Si el usuario pide traducciones, trivia, chistes repetidos, o temas no relacionados: responde UNA vez brevemente y redirige al negocio.
- Si insiste con off-topic → "Jaja, para eso está Google. Volvamos a lo que importa — ¿retomamos lo de tu marca?"
- NUNCA dediques más de 1 mensaje a temas off-topic.

ERRORES Y HONESTIDAD:
- Eres una IA. Si algo no funciona o no llega, NO digas "mentí". Di: "El sistema tuvo un problema y no debí decirte que estaba listo sin confirmarlo."
- Si el usuario se enoja porque algo no llegó → valida su frustración, reconoce el error del sistema, y ofrece la alternativa real (reunión).
- NUNCA stalles. Si algo no funciona, sé directo desde el primer momento.`;

// ---------------------------------------------------------------------------
// Quick first-message intel (Cambio 1)
// ---------------------------------------------------------------------------

/**
 * For message_count <= 1, use Haiku to quickly extract intel from the first message.
 * ~1s latency. Returns a brief text to inject into the prompt so Steve doesn't sound generic.
 */
export async function quickFirstMessageIntel(
  message: string,
  profileName: string | null | undefined,
): Promise<string> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return '';

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
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Analiza este primer mensaje de un prospecto de WhatsApp y extrae lo que puedas en 2-3 líneas:
- ¿Qué vende o a qué industria pertenece?
- ¿Mencionó tienda, URL, Instagram?
- ¿Qué tono usa (formal, casual, directo)?
- Cualquier detalle útil para impresionarlo

Nombre de perfil: ${profileName || 'N/A'}
Mensaje: "${message}"

Responde en texto plano, máximo 3 líneas. Si no hay info suficiente, haz una hipótesis basada en el nombre del perfil o contexto. NUNCA digas "no hay suficiente info".`,
        }],
      }),
    });

    if (!response.ok) return '';
    const data: any = await response.json();
    return (data.content?.[0]?.text || '').trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Knowledge loader
// ---------------------------------------------------------------------------

/**
 * Load relevant knowledge base rules based on keyword matching in the user's message.
 * When includeProspecting is true, also loads category 'prospecting'.
 *
 * Now also:
 * - Filters by approval_status = 'approved' (only validated rules)
 * - Orders by quality_score desc (best rules first)
 * - Loads steve_bugs matching categories (anti-patterns to avoid)
 * - Expands category detection for sales conversations
 */
export async function loadRelevantKnowledge(
  userMessage: string,
  includeProspecting = false,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const msg = (userMessage || '').toLowerCase();

  const categories: string[] = ['brief'];

  if (msg.includes('meta') || msg.includes('anuncio') || msg.includes('campaña') || msg.includes('ads') || msg.includes('publicidad') || msg.includes('facebook') || msg.includes('instagram') || msg.includes('redes')) {
    categories.push('meta_ads', 'anuncios');
  }
  if (msg.includes('shopify') || msg.includes('tienda') || msg.includes('producto') || msg.includes('inventario') || msg.includes('ecommerce') || msg.includes('e-commerce') || msg.includes('ventas online')) {
    categories.push('shopify');
  }
  if (msg.includes('email') || msg.includes('klaviyo') || msg.includes('flujo') || msg.includes('template') || msg.includes('correo') || msg.includes('newsletter') || msg.includes('mailchimp')) {
    categories.push('klaviyo');
  }
  if (msg.includes('google') || msg.includes('search') || msg.includes('display') || msg.includes('shopping') || msg.includes('ppc')) {
    categories.push('google_ads');
  }
  if (msg.includes('buyer') || msg.includes('cliente') || msg.includes('audiencia') || msg.includes('persona') || msg.includes('segmento') || msg.includes('target')) {
    categories.push('buyer_persona');
  }
  if (msg.includes('seo') || msg.includes('posicionamiento') || msg.includes('orgánico') || msg.includes('organico')) {
    categories.push('seo');
  }
  // New: load analisis (discovered patterns) when prospect asks about results/data
  if (msg.includes('resultado') || msg.includes('funciona') || msg.includes('caso') || msg.includes('éxito') || msg.includes('exito') || msg.includes('ejemplo') || msg.includes('dato') || msg.includes('métrica') || msg.includes('metrica')) {
    categories.push('analisis');
  }
  if (includeProspecting) {
    categories.push('prospecting');
  }

  const uniqueCategories = [...new Set(categories)];

  // Load knowledge rules — filtered by approved + ordered by quality_score
  const [{ data: knowledge }, { data: bugs }] = await Promise.all([
    supabase
      .from('steve_knowledge')
      .select('id, categoria, titulo, contenido')
      .in('categoria', uniqueCategories)
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .order('quality_score', { ascending: false })
      .order('orden', { ascending: false })
      .limit(10),
    supabase
      .from('steve_bugs')
      .select('descripcion, ejemplo_malo, ejemplo_bueno')
      .in('categoria', uniqueCategories)
      .eq('activo', true)
      .limit(8),
  ]);

  let result = '';

  if (knowledge && knowledge.length > 0) {
    result += 'CONOCIMIENTO DE STEVE:\n';
    for (const rule of knowledge) {
      result += `### [${(rule.categoria || '').toUpperCase()}] ${rule.titulo || ''}\n`;
      result += `${rule.contenido || ''}\n\n`;
    }
  }

  if (bugs && bugs.length > 0) {
    result += '\nERRORES CONOCIDOS — EVITAR OBLIGATORIAMENTE:\n';
    for (const bug of bugs) {
      result += `❌ ${bug.descripcion}`;
      if (bug.ejemplo_bueno) result += ` → CORRECTO: ${bug.ejemplo_bueno}`;
      result += '\n';
    }
  }

  if (result.length > 3500) {
    result = result.slice(0, 3497) + '...';
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

  // Get the MOST RECENT messages (descending), then reverse for chronological order
  const { data: messages } = await supabase
    .from('wa_messages')
    .select('direction, body')
    .eq('client_id', clientId)
    .eq('channel', 'steve_chat')
    .eq('contact_phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!messages || messages.length === 0) return [];

  return messages
    .reverse() // Back to chronological order for Claude
    .filter((m: any) => m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }));
}

export async function getProspectHistory(phone: string, limit = 20): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseAdmin();

  // Get the MOST RECENT messages (descending), then reverse for chronological order
  const { data: messages } = await supabase
    .from('wa_messages')
    .select('direction, body')
    .eq('channel', 'prospect')
    .eq('contact_phone', phone)
    .is('client_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!messages || messages.length === 0) return [];

  const recent = messages
    .reverse()
    .filter((m: any) => m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }));

  // Inject rolling summary as first message if it exists
  const { data: prospect } = await supabase
    .from('wa_prospects')
    .select('conversation_summary')
    .eq('phone', phone)
    .maybeSingle();

  if (prospect?.conversation_summary) {
    return [
      { role: 'user' as const, content: `[RESUMEN DE CONVERSACIÓN ANTERIOR]\n${prospect.conversation_summary}` },
      { role: 'assistant' as const, content: 'Entendido, tengo el contexto de nuestra conversación anterior.' },
      ...recent,
    ];
  }

  return recent;
}

/**
 * Rolling conversation summary — compresses older messages with Haiku.
 * Called from processProspectAsync every 10 new messages.
 * Keeps conversation_summary up to date so getProspectHistory can inject it.
 *
 * Cost: ~$0.001 per summary (Haiku, ~500 input tokens + 200 output)
 * At 500 msgs: ~50 summary updates = ~$0.05 total per prospect
 */
export async function updateRollingConversationSummary(
  prospect: ProspectRecord,
  phone: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return;

  const msgCount = prospect.message_count || 0;
  const summaryUpTo = (prospect as any).summary_up_to_msg || 0;

  // Only update every 10 new messages
  if (msgCount - summaryUpTo < 10) return;

  try {
    // Get ALL messages (not just last 20) for the summary
    const { data: allMessages } = await supabase
      .from('wa_messages')
      .select('direction, body, created_at')
      .eq('channel', 'prospect')
      .eq('contact_phone', phone)
      .is('client_id', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (!allMessages || allMessages.length < 10) return;

    // Build conversation text (skip last 20 — those will be literal in prompt)
    const olderMessages = allMessages.slice(0, -20);
    if (olderMessages.length === 0) return;

    const convoText = olderMessages
      .filter((m: any) => m.body)
      .map((m: any) => `${m.direction === 'inbound' ? 'Prospecto' : 'Steve'}: ${m.body}`)
      .join('\n');

    // Include existing summary for continuity
    const existingSummary = (prospect as any).conversation_summary || '';
    const summaryContext = existingSummary
      ? `Resumen previo:\n${existingSummary}\n\nMensajes nuevos desde el último resumen:\n`
      : '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Eres un asistente que comprime conversaciones de ventas por WhatsApp. Genera un resumen conciso que capture TODO lo importante para que un vendedor pueda retomar la conversación sin perder contexto.

${summaryContext}${convoText.slice(0, 6000)}

Incluye en el resumen:
- Qué vende el prospecto y en qué plataforma
- Dolores y necesidades mencionados
- Qué le ofreció Steve y cómo reaccionó
- Objeciones planteadas
- Promesas o compromisos hechos por Steve
- Nivel de interés actual
- Cualquier dato personal relevante (nombre, empresa, etc.)

Formato: bullets concisos, máximo 10 líneas. Solo hechos, sin opiniones.`,
        }],
      }),
    });

    if (!response.ok) return;
    const data: any = await response.json();
    const summary = (data.content?.[0]?.text || '').trim();
    if (!summary) return;

    await supabase
      .from('wa_prospects')
      .update({
        conversation_summary: summary,
        summary_up_to_msg: msgCount,
        updated_at: new Date().toISOString(),
      })
      .eq('phone', phone);

    console.log(`[rolling-summary] Updated for ${phone} (msgs: ${msgCount}, summary: ${summary.length} chars)`);
  } catch (err) {
    console.error('[rolling-summary] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Industry benchmarks for "espejo" discovery technique
// ---------------------------------------------------------------------------

function getIndustryBenchmarks(industry: string): string | null {
  if (!industry) return null;

  const benchmarks: Record<string, string> = {
    moda: '- CPA promedio Meta: $2.500-$5.000 CLP\n- ROAS saludable: 3-5x\n- Tasa conversión e-commerce: 1.5-3%\n- Ticket promedio: $25.000-$60.000\n- Mejor temporada: cambios de estación, Black Friday, Navidad',
    ropa: '- CPA promedio Meta: $2.500-$5.000 CLP\n- ROAS saludable: 3-5x\n- Tasa conversión e-commerce: 1.5-3%\n- Mejor canal: Instagram/Meta con UGC y lifestyle',
    zapatos: '- CPA promedio Meta: $3.000-$6.000 CLP\n- ROAS saludable: 3-4x\n- Ticket promedio: $40.000-$80.000\n- Clave: fotos de producto en uso, reviews visuales',
    cosmetica: '- CPA promedio Meta: $2.000-$4.000 CLP\n- ROAS top marcas: 4-6x\n- Tasa conversión: 2-4% (alto vs otros rubros)\n- Mejor estrategia: antes/después, UGC, influencer micro',
    belleza: '- CPA promedio Meta: $2.000-$4.000 CLP\n- ROAS top marcas: 4-6x\n- Clave: contenido educativo + social proof\n- Email marketing: flows de recompra funcionan muy bien',
    alimentos: '- CPA promedio Meta: $1.500-$3.500 CLP\n- ROAS saludable: 3-5x\n- Desafío principal: logística y vida útil\n- Mejor estrategia: suscripción + email flows de recompra',
    comida: '- CPA promedio Meta: $1.500-$3.500 CLP\n- ROAS saludable: 3-5x\n- Clave: fotos que den hambre, delivery rápido\n- Email: flows de recompra cada 2-4 semanas',
    deportes: '- CPA promedio Meta: $3.000-$5.000 CLP\n- ROAS saludable: 3-4x\n- Ticket promedio: $30.000-$70.000\n- Mejor contenido: lifestyle, rendimiento, comunidad',
    tecnologia: '- CPA promedio Meta: $4.000-$8.000 CLP\n- ROAS saludable: 2-4x (ticket más alto)\n- Ciclo de compra más largo que moda\n- Clave: comparativas, specs, reviews técnicos',
    hogar: '- CPA promedio Meta: $3.000-$6.000 CLP\n- ROAS saludable: 3-5x\n- Mejor temporada: mudanzas, Cyber, Navidad\n- Contenido: antes/después, espacios reales, lifestyle',
    joyas: '- CPA promedio Meta: $3.000-$7.000 CLP\n- ROAS saludable: 4-8x (buen margen)\n- Ticket promedio: $30.000-$150.000\n- Clave: branding aspiracional, regalos, ocasiones especiales',
    mascotas: '- CPA promedio Meta: $1.500-$3.000 CLP\n- ROAS saludable: 3-5x\n- Tasa recompra: muy alta si hay suscripción\n- Clave: emocional, fotos de mascotas reales, UGC',
  };

  for (const [key, value] of Object.entries(benchmarks)) {
    if (industry.includes(key)) return value;
  }

  // Generic fallback for unknown industries
  return '- CPA promedio Meta (general e-commerce): $2.500-$5.000 CLP\n- ROAS saludable: 3-4x\n- Tasa conversión e-commerce promedio: 1.5-2.5%';
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
// Steve Perro Lobo — Detection & Intelligence Functions
// ---------------------------------------------------------------------------

/** Paso 2: Detect explicit disqualification (rejection, profanity). */
export function detectDisqualification(
  lastMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): { disqualified: boolean; reason?: string } {
  const msg = lastMessage.toLowerCase().trim();

  // Explicit rejection keywords
  const rejectionKeywords = [
    'no me interesa', 'no gracias', 'no quiero', 'déjame en paz',
    'dejame en paz', 'no molestes', 'no me escribas', 'para de escribir',
    'deja de escribir', 'no necesito nada', 'no estoy interesado',
  ];
  // Profanity / aggressive rejection
  const profanityKeywords = [
    'ctm', 'csm', 'mierda', 'chucha', 'puta', 'weón', 'weon',
    'ándate a la', 'andate a la', 'vete a la', 'lárgate', 'largate',
  ];

  if (rejectionKeywords.some(k => msg.includes(k))) {
    return { disqualified: true, reason: 'rejected' };
  }
  if (profanityKeywords.some(k => msg.includes(k))) {
    return { disqualified: true, reason: 'rejected' };
  }

  // Pattern: 3+ rejection-like messages in last 5 user messages
  const recentUserMsgs = history
    .filter(m => m.role === 'user')
    .slice(-5)
    .map(m => m.content.toLowerCase());

  const softRejections = ['no', 'nada', 'paso', 'no gracias', 'no me interesa'];
  const rejectionCount = recentUserMsgs.filter(m =>
    softRejections.some(r => m.trim() === r || m.includes(r))
  ).length;

  if (rejectionCount >= 3) {
    return { disqualified: true, reason: 'rejected' };
  }

  return { disqualified: false };
}

/** Paso 3: Detect buying signals in messages. */
export function detectBuyingSignals(
  lastMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  const buyingKeywords = [
    'cuánto cuesta', 'cuanto cuesta', 'precio', 'planes', 'valores', 'tarifas',
    'cómo empiezo', 'como empiezo', 'cómo parto', 'como parto',
    'si empiezo', 'cuando conecte', 'me gustaría partir', 'me gustaria partir',
    'contrato', 'cómo se paga', 'como se paga',
    'formas de pago', 'demo', 'me interesa', 'si contrato',
    'quiero probar', 'quiero empezar', 'cómo funciona el pago', 'como funciona el pago',
    // Señales de reunión explícita
    'quiero agendar', 'quiero reunión', 'quiero reunion', 'agendar reunión', 'agendar reunion',
    'cuándo podemos hablar', 'cuando podemos hablar', 'cuándo podemos', 'cuando podemos',
    'quiero hablar', 'podemos hablar', 'podemos reunirnos', 'nos reunimos',
    'lo antes posible', 'ya mismo', 'quiero solucionar', 'necesito solucionar',
    'quiero empezar ya', 'empezar ya', 'cuándo empezamos', 'cuando empezamos',
    'me interesa reunirme', 'interesa agendar', '¿cuándo?', '¿cuando?',
  ];

  const msg = lastMessage.toLowerCase();

  // 1 signal in last message → closer mode
  if (buyingKeywords.some(k => msg.includes(k))) return true;

  // 2+ signals in last 5 user messages → closer mode
  const recentUserMsgs = history
    .filter(m => m.role === 'user')
    .slice(-5)
    .map(m => m.content.toLowerCase());

  let totalSignals = 0;
  for (const userMsg of recentUserMsgs) {
    if (buyingKeywords.some(k => userMsg.includes(k))) totalSignals++;
  }

  return totalSignals >= 2;
}

/** Paso 5: Analyze prospect's writing style for chameleon mode. */
export function analyzeProspectStyle(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): { length: 'corto' | 'medio' | 'largo'; usesEmojis: boolean; formality: 'casual' | 'formal' } {
  const userMsgs = history.filter(m => m.role === 'user').slice(-3);

  if (userMsgs.length === 0) {
    return { length: 'medio', usesEmojis: false, formality: 'formal' };
  }

  const avgLen = userMsgs.reduce((a, m) => a + m.content.length, 0) / userMsgs.length;
  const length = avgLen < 30 ? 'corto' : avgLen > 100 ? 'largo' : 'medio';

  const allText = userMsgs.map(m => m.content).join(' ');
  const usesEmojis = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(allText);

  const casualWords = ['wea', 'po', 'weon', 'weón', 'jaja', 'xd', 'xD', 'nah', 'sip', 'sep', 'ya'];
  const formality = casualWords.some(w => allText.toLowerCase().includes(w)) ? 'casual' : 'formal';

  return { length, usesEmojis, formality };
}

/** Paso 4: Get Chile time-based tone instruction. */
export function getChileTimeContext(): string {
  // Chile = UTC-4 (CLT) or UTC-3 (CLST summer). Use -4 as default.
  const now = new Date();
  const chileHour = (now.getUTCHours() - 4 + 24) % 24;

  if (chileHour >= 8 && chileHour < 12) return 'Tono energético, es de mañana en Chile. Buenos días.';
  if (chileHour >= 12 && chileHour < 18) return 'Tono profesional, horario de trabajo.';
  if (chileHour >= 18 && chileHour < 22) return 'Tono relajado, es tarde/noche. No lo abrumes.';
  return 'Es muy tarde/madrugada en Chile. Sé breve y casual, no lo abrumes a esta hora.';
}

/** Paso 10: Market deadlines by month. */
export function getMarketDeadline(): string | null {
  const month = new Date().getMonth(); // 0-indexed
  // Multiple deadlines per month — pick one randomly so Steve doesn't repeat the same every time
  const deadlines: Record<number, string[]> = {
    0: ['Vuelta a clases (marzo) — marcas de moda y accesorios venden fuerte', 'Verano en LATAM — buen momento para marcas de outdoor, deporte y skincare'],
    1: ['Día de la Mujer (8 marzo) — las marcas que preparan con tiempo venden 3x más', 'Vuelta a clases terminando — buen momento para pensar en la estrategia del semestre'],
    2: ['Q2 empieza en abril — las marcas que planifican ahora arrancan con ventaja', 'CyberDay Chile se viene en mayo/junio. Las marcas top empiezan a preparar ahora'],
    3: ['CyberDay Chile está cerca — las marcas que entran preparadas venden 5x más que las improvisadas', 'Mayo es clave para e-commerce: tráfico sube, hay que estar listo'],
    4: ['CyberDay Chile es AHORA — si no estás en campaña, estás regalando ventas a la competencia', 'Segundo semestre viene con todo: Fiestas Patrias, CyberMonday, Black Friday. Hay que planificar'],
    5: ['CyberDay pasó — buen momento para analizar qué funcionó y optimizar', 'Segundo semestre arranca: Fiestas Patrias, CyberMonday y Black Friday vienen en fila'],
    6: ['CyberMonday se viene en octubre. Las marcas que empiezan a optimizar ahora llegan mejor', 'Segundo semestre es el más fuerte para e-commerce. ¿Tu estrategia está lista?'],
    7: ['Fiestas Patrias Chile (septiembre) — categorías como food, moda y outdoor explotan', 'Black Friday viene en noviembre. Las marcas top empiezan a preparar 2-3 meses antes'],
    8: ['Fiestas Patrias Chile AHORA — buen momento para empujar campañas temáticas', 'Black Friday en 2 meses. Las marcas que se preparan con datos venden más'],
    9: ['CyberMonday Chile este mes. Black Friday viene en noviembre — es la recta final', 'Último trimestre del año: CyberMonday + Black Friday + Navidad. Triple combo'],
    10: ['Black Friday y Cyber Monday — la semana más importante del año para e-commerce', 'Las campañas que mejor convierten en BF son las que usan datos previos para segmentar'],
    11: ['Navidad y Año Nuevo — última oportunidad del año para vender fuerte', 'Cierre de año: buen momento para revisar métricas y planificar Q1'],
  };
  const options = deadlines[month] || [];
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

/** Paso 12: Calculate money left on the table. */
export function calculateLostMoney(monthlyRevenue: string | null | undefined): {
  currentEstimate: number;
  optimizedEstimate: number;
  difference: number;
} | null {
  if (!monthlyRevenue) return null;

  const rev = monthlyRevenue.toLowerCase();
  const digits = rev.replace(/\D/g, '');
  if (digits.length < 3) return null;

  let amount = parseInt(digits, 10);

  // Normalize: if contains "millón" or "mm" treat as millions
  if (rev.includes('millón') || rev.includes('millon') || rev.includes('mm')) {
    if (amount < 1000) amount = amount * 1_000_000;
  }
  // If number is too small to be CLP (likely USD or thousands)
  if (amount < 10_000) return null;

  // Assume current ROAS ~2x (industry average), optimized ~4x
  const currentEstimate = amount;
  const optimizedEstimate = amount * 2; // double revenue with better ROAS
  const difference = optimizedEstimate - currentEstimate;

  return { currentEstimate, optimizedEstimate, difference };
}

/** Paso 13: Load case studies from wa_case_studies matching prospect's industry keywords. */
export async function loadIndustryCaseStudy(whatTheySell: string | null | undefined): Promise<CaseStudyResult | null> {
  if (!whatTheySell) return null;
  const supabase = getSupabaseAdmin();

  // Extract keywords from what they sell
  const keywords = whatTheySell.toLowerCase().split(/[\s,;]+/).filter(w => w.length >= 3);
  if (keywords.length === 0) return null;

  // Try overlap query with industry_keywords array
  const { data } = await supabase
    .from('wa_case_studies')
    .select('title, summary, metrics, media_url, industry_keywords')
    .eq('active', true)
    .overlaps('industry_keywords', keywords)
    .limit(1);

  if (data && data.length > 0) {
    return {
      title: data[0].title,
      summary: data[0].summary,
      mediaUrl: data[0].media_url || null,
    };
  }

  // Fallback: fuzzy match on first keyword via steve_knowledge
  const { data: fallback } = await supabase
    .from('steve_knowledge')
    .select('id, titulo, contenido')
    .eq('activo', true)
    .eq('approval_status', 'approved')
    .ilike('contenido', `%${keywords[0]}%`)
    .limit(1);

  if (fallback && fallback.length > 0) {
    return {
      title: fallback[0].titulo || 'Caso de éxito',
      summary: (fallback[0].contenido || '').slice(0, 400),
      mediaUrl: null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Creative performance insights (real social proof for sales)
// ---------------------------------------------------------------------------

/**
 * Load aggregated creative performance insights from creative_history.
 * Returns a short text block with real data Steve can cite in sales conversations.
 * Only loads data with measured performance (not pending).
 */
export async function loadCreativeInsights(): Promise<string> {
  const supabase = getSupabaseAdmin();

  try {
    // Get top-performing creatives with real metrics (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: topCreatives } = await supabase
      .from('creative_history')
      .select('channel, angle, performance_verdict, meta_roas, meta_ctr, meta_cpa, klaviyo_open_rate, klaviyo_click_rate, performance_score')
      .not('measured_at', 'is', null)
      .gte('created_at', ninetyDaysAgo)
      .order('performance_score', { ascending: false })
      .limit(30);

    if (!topCreatives || topCreatives.length < 3) return '';

    // Aggregate by channel
    const metaCreatives = topCreatives.filter(c => c.channel === 'meta' && c.meta_roas);
    const emailCreatives = topCreatives.filter(c => c.channel === 'email' && c.klaviyo_open_rate);

    const lines: string[] = [];

    if (metaCreatives.length >= 3) {
      const avgRoas = metaCreatives.reduce((s, c) => s + (Number(c.meta_roas) || 0), 0) / metaCreatives.length;
      const avgCtr = metaCreatives.reduce((s, c) => s + (Number(c.meta_ctr) || 0), 0) / metaCreatives.length;
      if (avgRoas > 0) lines.push(`Meta Ads: ROAS promedio ${avgRoas.toFixed(1)}x, CTR ${(avgCtr * 100).toFixed(1)}% (${metaCreatives.length} campañas medidas)`);

      // Top angle
      const angles = metaCreatives.filter(c => c.angle).map(c => c.angle!);
      if (angles.length > 0) {
        const angleCounts: Record<string, number> = {};
        for (const a of angles) angleCounts[a] = (angleCounts[a] || 0) + 1;
        const topAngle = Object.entries(angleCounts).sort((a, b) => b[1] - a[1])[0];
        if (topAngle) lines.push(`Ángulo más usado en Meta: "${topAngle[0]}" (${topAngle[1]} veces)`);
      }
    }

    if (emailCreatives.length >= 3) {
      const avgOpen = emailCreatives.reduce((s, c) => s + (Number(c.klaviyo_open_rate) || 0), 0) / emailCreatives.length;
      const avgClick = emailCreatives.reduce((s, c) => s + (Number(c.klaviyo_click_rate) || 0), 0) / emailCreatives.length;
      if (avgOpen > 0) lines.push(`Email: open rate ${(avgOpen * 100).toFixed(1)}%, click rate ${(avgClick * 100).toFixed(1)}% (${emailCreatives.length} campañas)`);
    }

    // Verdicts summary
    const buenos = topCreatives.filter(c => c.performance_verdict === 'bueno').length;
    const total = topCreatives.length;
    if (total > 5) lines.push(`${buenos}/${total} creativos evaluados como "buenos" en los últimos 90 días`);

    if (lines.length === 0) return '';

    return `\n📈 DATOS CREATIVOS REALES DE LA PLATAFORMA (usa como social proof — son datos REALES, no inventados):\n${lines.map(l => `- ${l}`).join('\n')}`;
  } catch (err) {
    console.error('[creative-insights] Error loading:', err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Sales learnings & investigation context loaders
// ---------------------------------------------------------------------------

/**
 * Load top sales learnings from steve_knowledge matching the prospect's industry.
 * Used to inject past wins/losses into the prompt for continuous improvement.
 */
export async function loadSalesLearnings(industry: string | null | undefined): Promise<{ text: string; ruleIds: string[] }> {
  if (!industry) return { text: '', ruleIds: [] };
  const supabase = getSupabaseAdmin();

  const keywords = industry.toLowerCase().split(/[\s,;]+/).filter(w => w.length >= 3);

  const { data: learnings } = await supabase
    .from('steve_knowledge')
    .select('id, titulo, contenido')
    .eq('categoria', 'sales_learning')
    .eq('activo', true)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!learnings?.length) return { text: '', ruleIds: [] };

  // Filter by industry relevance, fallback to generic
  const relevant = keywords.length > 0
    ? learnings.filter((l: any) =>
        keywords.some(k => (l.contenido || '').toLowerCase().includes(k) || (l.titulo || '').toLowerCase().includes(k))
      )
    : [];

  const toUse = relevant.length > 0 ? relevant.slice(0, 5) : learnings.slice(0, 3);
  if (toUse.length === 0) return { text: '', ruleIds: [] };

  const ruleIds = toUse.map((l: any) => l.id).filter(Boolean);
  const text = `\n\n📚 APRENDIZAJES DE CONVERSACIONES PASADAS:\n${toUse.map((l: any) => `- ${l.titulo}: ${(l.contenido || '').slice(0, 250)}`).join('\n')}`;
  return { text, ruleIds };
}

/**
 * Load investigation data for a prospect (pre-scraped store, social, competitor info).
 */
export async function loadInvestigationContext(prospectId: string): Promise<string> {
  if (!prospectId) return '';
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('wa_prospects')
    .select('investigation_data')
    .eq('id', prospectId)
    .maybeSingle();

  const inv = data?.investigation_data;
  if (!inv) return '';

  const sections: string[] = [];

  // Store data — formatted as CMO expert observations
  if (inv.store) {
    const storeParts: string[] = [];
    // Format top products with names and prices
    if (inv.store.top_products?.length) {
      const products = inv.store.top_products.slice(0, 5);
      const productList = products.map((p: any) => {
        if (typeof p === 'string') return p;
        return `${p.name}${p.price ? ` (${p.price})` : ''}`;
      }).join(', ');
      storeParts.push(`- Productos: ${productList}`);
    }
    if (inv.store.brand_style) {
      storeParts.push(`- Estilo: ${inv.store.brand_style}`);
    }
    if (inv.store.price_range) {
      storeParts.push(`- Rango: ${inv.store.price_range} — ${detectTicketInsight(inv.store.price_range)}`);
    }
    if (inv.store.category_summary) {
      storeParts.push(`- Tipo: ${inv.store.category_summary}`);
    }
    if (inv.store.product_images?.length) {
      storeParts.push(`- ${inv.store.product_images.length} productos publicados — ${inv.store.product_images.length < 10 ? 'catálogo en crecimiento' : 'catálogo sólido'}`);
    }

    if (storeParts.length > 0) {
      sections.push(`TIENDA DEL PROSPECTO (ya la revisaste):\n${storeParts.join('\n')}`);
      // Instruction to use specific product data
      const firstProduct = inv.store.top_products?.[0];
      const productName = typeof firstProduct === 'string' ? firstProduct : firstProduct?.name;
      if (productName) {
        sections.push(`→ MENCIONA un producto específico, ej: "Vi tu ${productName}, tiene pinta de vender bien en ads"`);
      }
    }
  }

  // Social data
  if (inv.social) {
    const socialParts: string[] = [];
    if (inv.social.followers) socialParts.push(`${inv.social.followers.toLocaleString()} followers`);
    if (inv.social.posts) socialParts.push(`${inv.social.posts} posts`);
    if (inv.social.engagement_rate) socialParts.push(`engagement: ${inv.social.engagement_rate}`);
    if (socialParts.length > 0) {
      sections.push(`IG: ${socialParts.join(', ')}`);
    }
  }

  // Competitor ads
  if (inv.competitor_ads?.length) {
    const ads = inv.competitor_ads.slice(0, 3).map((a: any) =>
      `"${(a.headline || a.ad_text || '').slice(0, 50)}"`
    ).join(', ');
    sections.push(`Ads de competencia en su rubro: ${ads}`);
  }

  return sections.length > 0 ? `\n🔍 INTEL INVESTIGADA:\n${sections.join('\n')}` : '';
}

/** Helper: detect ticket insight from price range */
function detectTicketInsight(priceRange: string): string {
  const numbers = priceRange.replace(/[$.,]/g, '').match(/\d+/g)?.map(Number) || [];
  const maxPrice = Math.max(...numbers, 0);
  if (maxPrice >= 100000) return 'ticket alto, ideal para Google Ads + Meta retargeting';
  if (maxPrice >= 40000) return 'ticket ideal para Meta Ads';
  if (maxPrice >= 15000) return 'buen ticket, funciona bien con volumen en Meta';
  return 'ticket bajo, necesita volumen alto';
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
export interface DynamicPromptResult {
  prompt: string;
  ruleIds: string[];
}

export async function buildDynamicSalesPrompt(
  prospect: ProspectRecord,
  lastMessage?: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  strategistBrief?: string,
  quickIntel?: string,
): Promise<DynamicPromptResult> {
  const supabase = getSupabaseAdmin();

  // Determine effective stage by score
  const effectiveStage = scoreToStage(prospect.lead_score || 0);
  const stageLabel = effectiveStage.charAt(0).toUpperCase() + effectiveStage.slice(1);

  // Track all rule IDs used in this prompt
  const collectedRuleIds: string[] = [];

  // Load stage rules + corrections + sales bugs in parallel
  const [{ data: rules }, { data: corrections }, { data: salesBugs }] = await Promise.all([
    supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, orden')
      .eq('categoria', 'prospecting')
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .order('orden', { ascending: true }),
    supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, orden')
      .eq('categoria', 'prospecting')
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .ilike('titulo', 'CORRECCION:%')
      .gte('orden', 90)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('steve_bugs')
      .select('descripcion, ejemplo_malo, ejemplo_bueno')
      .in('categoria', ['prospecting', 'meta_ads', 'anuncios', 'brief'])
      .eq('activo', true)
      .limit(10),
  ]);

  const stageRule = (rules || []).find(r => r.titulo?.toLowerCase().includes(effectiveStage));
  if (stageRule?.id) collectedRuleIds.push(stageRule.id);

  if (corrections?.length) {
    for (const c of corrections) {
      if (c.id) collectedRuleIds.push(c.id);
    }
  }

  // ============================================================
  // Perro Lobo: Run detections in parallel
  // ============================================================
  const historyArr = history || [];
  const disqResult = lastMessage ? detectDisqualification(lastMessage, historyArr) : { disqualified: false };
  const closerMode = lastMessage ? detectBuyingSignals(lastMessage, historyArr) : false;
  const prospectStyle = analyzeProspectStyle(historyArr);
  const chileTime = getChileTimeContext();
  const deadline = getMarketDeadline();
  const lostMoney = calculateLostMoney(prospect.monthly_revenue);
  const caseStudy = await loadIndustryCaseStudy(prospect.what_they_sell);

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
  if (prospect.budget_range) known.push(`Presupuesto: ${prospect.budget_range}`);
  if (prospect.decision_timeline) known.push(`Timeline decisión: ${prospect.decision_timeline}`);
  if (prospect.audit_data?.findings?.length) known.push(`Auditoría tienda: ${prospect.audit_data.findings.join('; ')}`);

  if (prospect.apellido) known.push(`Apellido: ${prospect.apellido}`);
  if (prospect.meeting_status && prospect.meeting_status !== 'none') known.push(`Estado reunión: ${prospect.meeting_status}`);
  if (prospect.meeting_at) known.push(`Reunión agendada: ${new Date(prospect.meeting_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`);

  known.push(`Score: ${prospect.lead_score || 0}/100`);
  known.push(`Stage: ${prospect.stage || 'discovery'}`);
  known.push(`Mensajes: ${prospect.message_count || 0}`);
  if (prospect.meeting_link_sent) known.push('Link de reunión ya enviado: Sí');

  // ============================================================
  // Load sales learnings + investigation + creative insights (parallel)
  // ============================================================
  const [salesLearningsResult, investigationText, creativeInsightsText] = await Promise.all([
    loadSalesLearnings(prospect.what_they_sell),
    loadInvestigationContext(prospect.id),
    loadCreativeInsights(),
  ]);
  const salesLearningsText = salesLearningsResult.text;
  if (salesLearningsResult.ruleIds.length > 0) {
    collectedRuleIds.push(...salesLearningsResult.ruleIds);
  }

  // ============================================================
  // PROMPT ASSEMBLY — Data FIRST, personality second
  // ============================================================

  let prompt = '';

  // 0. PRODUCT CATALOG (so Steve knows what he's selling)
  prompt += getProductCatalogPrompt() + '\n\n';

  // 0. CORRECTIONS — injected with MAXIMUM priority so Steve learns from past mistakes
  if (corrections?.length) {
    prompt += `🚨 CORRECCIONES RECIENTES (PRIORIDAD MÁXIMA — sigue estas directrices):\n`;
    for (const c of corrections) {
      prompt += `### ${c.titulo}\n${c.contenido}\n\n`;
    }
  }

  // 0.1 KNOWN BUGS — anti-patterns Steve must avoid
  if (salesBugs?.length) {
    prompt += `🚫 ERRORES CONOCIDOS — EVITAR OBLIGATORIAMENTE:\n`;
    for (const bug of salesBugs) {
      prompt += `❌ ${bug.descripcion}`;
      if (bug.ejemplo_bueno) prompt += ` → CORRECTO: ${bug.ejemplo_bueno}`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  // 0. STRATEGIST BRIEF (injected by multi-brain pipeline)
  if (strategistBrief) {
    prompt += `🧠 BRIEF DEL ESTRATEGA (SIGUE ESTA DIRECTRIZ):\n${strategistBrief}\n\n`;
  }

  // 0.25. STAGE STRATEGY — at the TOP so it's the primary directive (Cambio 4a)
  if (stageRule) {
    prompt += `📋 ESTRATEGIA ${stageLabel.toUpperCase()} (TU DIRECTRIZ PRINCIPAL):\n${stageRule.contenido}\n\n`;
  }

  // 0.5. FIRST MESSAGE INTEL (quick Haiku analysis for msg 1)
  if (quickIntel) {
    prompt += `🎯 PRIMERA IMPRESIÓN (lo que captaste del primer mensaje):\n${quickIntel}\n→ USA esta info para impresionar desde el primer mensaje. NO digas "déjame revisar" ni "dame un minuto".\n\n`;
  }

  // 1. KNOWN DATA
  prompt += `⛔ DATOS CONOCIDOS — PROHIBIDO preguntar esto (ya lo sabes):\n`;
  prompt += known.map(k => `- ${k}`).join('\n');

  // 1.5 INVESTIGATION INTEL
  if (investigationText) {
    prompt += investigationText;
    prompt += `\n⚡ IMPORTANTE: TIENES investigación del prospecto. ÚSALA en tu respuesta. Menciona algo concreto que viste de su tienda, sus productos o su competencia. Eso demuestra que hiciste la tarea y genera confianza inmediata.\n`;
  }

  // 2. MISSING DATA + ACTIVE QUALIFICATION by message count (Cambio 3)
  const msgCount = prospect.message_count || 0;
  if (missing.length > 0) {
    prompt += `\n\n💡 TODAVÍA NO SABES:\n`;
    prompt += missing.map(m => `- ${m}`).join('\n');

    // Escalated qualification directives based on conversation stage
    if (msgCount <= 2) {
      prompt += `\n\n🎯 DIRECTIVA (msgs 1-2): IMPRESIONA. Muestra expertise de su industria. Máximo 1 pregunta natural al final. Tu objetivo es que diga "wow, este tipo sabe".`;
    } else if (msgCount <= 5) {
      const topMissing = missing.slice(0, 2).join(' y ');
      prompt += `\n\n🎯 DIRECTIVA (msgs 3-5): CALIFICACIÓN ACTIVA. DEBES averiguar: ${topMissing}. Una pregunta directa pero natural por mensaje. No dejes pasar un mensaje sin intentar sacar info clave.`;
    } else if (msgCount <= 8) {
      prompt += `\n\n🎯 DIRECTIVA (msgs 6-8): PROFUNDIZACIÓN. Averigua dolores y presupuesto. Conecta cada problema con cómo Steve lo resuelve. Si ya tienes suficiente info, empieza a proponer.`;
    } else {
      prompt += `\n\n🎯 DIRECTIVA (msgs 9+): DECISIÓN. Resume lo que sabes, conecta con el valor de Steve para su caso específico. Si no has propuesto reunión, hazlo ahora.`;
    }
  } else {
    // No missing data — still give stage directive
    if (msgCount >= 9) {
      prompt += `\n\n🎯 DIRECTIVA: Ya sabes todo lo necesario. Es momento de proponer reunión si no lo has hecho.`;
    }
  }

  // 3. CONTEXT FOR THIS TURN
  prompt += `\n\n🎯 EN ESTE MENSAJE:\n`;

  // Paso 2: Disqualification override
  if (disqResult.disqualified) {
    prompt += `⚠️ El prospecto NO está interesado. Despídete con respeto y cierra la conversación: "Entendido, sin problema. Si en algún momento quieres retomar, aquí estoy. Éxito!"\n`;
    // Short-circuit — no need for other tactics
    prompt += `\n🗣️ PERSONALIDAD:\n${WA_SALES_PROMPT_BASE}`;
    return { prompt, ruleIds: collectedRuleIds };
  }

  // Paso 3: Closer mode — buying signals
  if (closerMode) {
    prompt += `🔥 SEÑAL DE COMPRA DETECTADA. Responde su duda directamente y propón agendar llamada de 15 minutos. Incluye SIEMPRE el link: www.steve.cl/agendar/steve\n`;
  }

  // Mini CRM: Meeting auto-suggestion when score is high enough
  const meetingStatus = prospect.meeting_status || 'none';
  const prospectScore = prospect.lead_score || 0;
  const prospectStage = prospect.stage || 'discovery';
  const bookingBaseUrl = process.env.BOOKING_BASE_URL || 'https://www.steve.cl/agendar';

  if (prospectScore >= 70 && meetingStatus === 'none' && (prospectStage === 'qualifying' || prospectStage === 'pitching' || prospectStage === 'closing')) {
    // Check if there's an assigned seller with booking link
    const bookingLink = prospect.assigned_seller_id
      ? `${bookingBaseUrl}/${prospect.assigned_seller_id}`
      : null;

    if (bookingLink) {
      prompt += `\n📞 INSTRUCCIÓN PRIORITARIA: Este prospecto tiene score ${prospectScore}. DEBES sugerir agendar una llamada de 15 minutos. Mándale este link de agendamiento: ${bookingLink}\nDile algo como: "¿Agendamos una llamada rápida? Elige el horario que te acomode: ${bookingLink}"\n`;
    } else {
      prompt += `\n📞 INSTRUCCIÓN PRIORITARIA: Este prospecto tiene score ${prospectScore}. DEBES sugerir agendar una llamada de 15 minutos para mostrarle Steve con sus datos reales. Propón 2-3 horarios del próximo día hábil (horario Chile) y espera confirmación.\n`;
    }
  } else if (meetingStatus === 'proposed') {
    prompt += `\n📞 Ya le propusiste reunión. Si confirma un horario, responde con entusiasmo y confirma la hora. Si propone otro horario, acepta si es razonable. Si rechaza, respétalo y sigue la conversación normalmente.\n`;
  } else if (meetingStatus === 'scheduled' || meetingStatus === 'reminded_24h' || meetingStatus === 'reminded_2h') {
    prompt += `\n📞 Ya hay reunión agendada (${prospect.meeting_at ? new Date(prospect.meeting_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'pendiente'}). NO vuelvas a proponer reunión. Si el prospecto pregunta, confirma la hora.\n`;
  }

  // Detect if prospect asked a question
  const hasQuestion = lastMessage?.includes('?');
  if (hasQuestion) {
    prompt += `El prospecto te hizo una pregunta. Respóndela primero — después si quieres puedes preguntar algo tú.\n`;
  }

  // Detect if Steve asked a question in his last message (anti-interrogation)
  const lastSteveMsg = historyArr.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  const steveAskedQuestion = lastSteveMsg.includes('?');
  if (steveAskedQuestion && !hasQuestion) {
    prompt += `⚠️ Ya hiciste una pregunta en tu mensaje anterior. En ESTE mensaje, aporta valor (dato, opinión, insight, reacción) sin hacer otra pregunta. Que no se sienta como interrogatorio.\n`;
  }

  // Paso 1: No-tienda ya NO es descalificación — ofrecer armarla
  if (prospect.has_online_store === false) {
    prompt += `No tiene tienda online. Ofrécele: "También podemos armarte una, háblalo con la consultora. Andan alrededor de 1 millón de pesos." Sigue vendiéndole Steve normalmente.\n`;
  }

  // Paso 11: Pedir URL de tienda
  if (prospect.has_online_store === true && !prospect.audit_data?.url) {
    prompt += `Tiene tienda online pero no tenemos su URL. Si surge, pídele: "¿Me pasas el link de tu tienda? Le echo un ojo rápido y te doy feedback gratis."\n`;
  }

  // Paso 19: Roast con datos de auditoría
  if (prospect.audit_data?.findings?.length) {
    prompt += `Tienes datos de su tienda: ${prospect.audit_data.findings.join('. ')}. Sé directo con el feedback constructivo. Ofrece ayuda específica.\n`;
  }

  // Paso 7: Provocador — dudas sobre agencia
  if (prospect.current_marketing?.toLowerCase().includes('agencia')) {
    prompt += `Usa agencia. Haz preguntas que expongan debilidades: "¿Te dan acceso al Business Manager? ¿Ves los números reales o solo reportes bonitos?"\n`;
  }

  // Paso 8: Quiz — exponer lagunas (discovery/qualifying)
  if (effectiveStage === 'discovery' || effectiveStage === 'qualifying') {
    prompt += `Puedes hacer quiz: "¿Sabes tu CAC? ¿Y tu LTV?" Si no sabe → "Eso Steve lo calcula automático."\n`;
  }

  // Paso 9: FOMO de cupos (pitching/closing)
  if (effectiveStage === 'pitching' || effectiveStage === 'closing') {
    prompt += `Steve trabaja máximo 3 marcas por categoría para no competir entre clientes. Puedes mencionarlo si es natural.\n`;
  }

  // Paso 10: Deadline real del mercado (solo mencionar 1 vez en toda la conversación)
  if (deadline) {
    const alreadyMentioned = historyArr.some(m => m.role === 'assistant' && (m.content.includes('CyberDay') || m.content.includes('Black Friday') || m.content.includes('Fiestas Patrias') || m.content.includes('Navidad') || m.content.includes('Día de la Madre') || m.content.includes('Día de la Mujer')));
    if (!alreadyMentioned) {
      prompt += `Contexto de mercado (menciona SOLO si es natural, NO lo repitas si ya lo dijiste): ${deadline}\n`;
    }
  }

  // Paso 12: Calculadora de plata perdida
  if (lostMoney) {
    const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
    prompt += `Con lo que factura (~${fmt(lostMoney.currentEstimate)}/mes), optimizando podría estar generando ~${fmt(lostMoney.difference)} más. Menciónalo si es natural.\n`;
  }

  // Industry benchmarks (for "espejo" technique)
  const industry = (prospect.what_they_sell || '').toLowerCase();
  const benchmarks = getIndustryBenchmarks(industry);
  if (benchmarks) {
    prompt += `📊 DATOS DE SU INDUSTRIA (úsalos como espejo para que revele info sin sentir interrogatorio):\n${benchmarks}\n`;
  }

  // Paso 13: Caso de éxito por industria
  if (caseStudy) {
    prompt += `Caso de éxito REAL de su industria: ${caseStudy.title} — ${caseStudy.summary}\n`;
    prompt += `⚠️ Este caso es REAL. NO inventes métricas adicionales, nombres de marcas ni países. Solo usa los datos que te doy aquí.\n`;
    // In pitching/closing, Steve can trigger media delivery
    if ((effectiveStage === 'pitching' || effectiveStage === 'closing') && caseStudy.mediaUrl) {
      prompt += `Si quieres enviarle el caso de éxito con imagen, incluye [SEND_CASE_STUDY] al final de tu mensaje (se enviará como mensaje separado).\n`;
    }
  }

  // Closing — siempre agendar reunión, NUNCA activar cuentas gratis
  if (closerMode || effectiveStage === 'pitching' || effectiveStage === 'closing') {
    prompt += `IMPORTANTE: Steve NO activa cuentas gratis ni trials. SIEMPRE dirige a agendar reunión: "Te muestro cómo se ve con tus datos → www.steve.cl/agendar/steve". Esa es la única forma de empezar.\n`;
  }

  // Meeting trigger — organic (lowered from 8 to 4 messages)
  if (
    (prospect.lead_score || 0) >= 75 &&
    (prospect.message_count || 0) >= 4 &&
    !prospect.meeting_link_sent &&
    prospect.pain_points?.length
  ) {
    prompt += `Ya tienes suficiente info y el prospecto mostró interés. Si sientes que fluye, propón una llamada corta: "¿Te tinca que nos juntemos 15 min? Te muestro cómo se ve con tus datos → www.steve.cl/agendar/steve"\n`;
  } else if (!closerMode && missing.length > 0) {
    prompt += `Sigue conversando. Si puedes, averigua algo de: ${missing.slice(0, 2).join(' o ')}. Pero no fuerces — que fluya.\n`;
  } else if (!closerMode) {
    prompt += `Ya sabes bastante. Muestra cómo Steve puede ayudar con lo que te contó.\n`;
  }

  // Paso 4: Tono por hora (Chile)
  prompt += `\n⏰ HORA CHILE: ${chileTime}`;

  // Paso 5: Camaleón — mirror del prospecto
  prompt += `\n🪞 ESTILO PROSPECTO: Escribe ${prospectStyle.length}, ${prospectStyle.formality}, ${prospectStyle.usesEmojis ? 'usa' : 'no usa'} emojis. Adapta tu estilo.`;

  // Paso 6: Double text instruction
  prompt += `\n\n📱 Si quieres enviar 2 mensajes separados (ej: uno con respuesta y otro con dato extra), usa [SPLIT] para dividirlos. Máximo 2 partes.`;

  // Mockup trigger (pitching/closing with product images)
  if (
    (effectiveStage === 'pitching' || effectiveStage === 'closing') &&
    (prospect as any).investigation_data?.store?.product_images?.length &&
    !(prospect as any).mockup_sent
  ) {
    prompt += `\n\n🎨 MOCKUP: Si quieres enviarle un ejemplo visual de cómo se vería un anuncio de su marca, incluye [SEND_MOCKUP] al final de tu mensaje.`;
  }

  // Sales deck trigger (pitching/closing with qualification data) — Cambio 6
  if (
    (effectiveStage === 'pitching' || effectiveStage === 'closing') &&
    prospect.what_they_sell &&
    (prospect.pain_points?.length || prospect.current_marketing) &&
    !(prospect as any).deck_sent
  ) {
    prompt += `\n\n📊 DECK: Si quieres enviarle una propuesta comercial personalizada, incluye [SEND_DECK] al final de tu mensaje. Se genera automáticamente con sus datos.`;
  }

  // Demo requests → redirect to meeting (no video demo available yet)
  prompt += `\n\n🎬 DEMO: Si el prospecto pide ver una demo, screenshot, o cómo funciona Steve → NO prometas enviar video ni screenshots. Redirige a la reunión: "En 15 min te muestro Steve con TUS datos reales conectados: www.steve.cl/agendar/steve"`;


  // Sales learnings from past conversations
  if (salesLearningsText) {
    prompt += salesLearningsText;
  }

  // Creative performance insights (real social proof)
  if (creativeInsightsText) {
    prompt += creativeInsightsText;
  }

  // 4. PERSONALITY (short)
  prompt += `\n\n🗣️ PERSONALIDAD:\n${WA_SALES_PROMPT_BASE}`;

  // 5. FEW-SHOT EXAMPLES
  prompt += `\n\n📝 EJEMPLOS — IMPRESIONAR, NO INTERROGAR:

--- DEMOSTRAR QUE INVESTIGASTE ---
Prospecto: "Hola, tengo una tienda de zapatos"
✅ Steve: "Vi tu tienda. Tienes buen producto y la foto de los botines negros está genial para ads. En zapatos el ticket promedio suele ser $40K-$80K, lo que da buen margen para Meta. ¿Estás corriendo campañas ahí?"
❌ Steve: "¡Hola! ¿Qué tipo de zapatos vendes? ¿Tienes tienda online? ¿En qué plataforma?"

--- APORTAR VALOR REAL ---
Prospecto: "Vendo ropa deportiva por Shopify"
✅ Steve: "Ropa deportiva en Shopify tiene super buen margen en ads. El CPA promedio en Meta para ese rubro anda entre $2.500-$4.000 y las marcas que mejor les va usan lookalike audiences de compradores recurrentes. ¿Estás corriendo campañas?"
❌ Steve: "¡Excelente! ¿Cuánto facturas al mes? ¿Cómo manejas tu marketing?"

--- VALIDAR EMOCIONALMENTE ---
Prospecto: "Gasto en ads pero no veo resultados"
✅ Steve: "Uff, eso es súper frustrante y pasa más de lo que crees. Generalmente el problema no es cuánto gastas sino dónde se va la plata. Las campañas de conversión vs tráfico son mundos distintos."
❌ Steve: "¿Cuánto gastas? ¿En qué plataforma? ¿Qué vendes?"

--- COMPARTIR INSIGHTS DE COMPETENCIA ---
Prospecto: "Tengo una marca de cosmética"
✅ Steve: "Cosmética tiene el mejor retorno en Meta si se hace bien — ROAS de 4-6x. Vi que marcas similares están usando mucho UGC con before/after en sus ads. ¿Tú estás corriendo campañas o todavía no?"
❌ Steve: "¡Qué bueno! ¿Tienes tienda online? ¿Cuánto facturas?"

--- SER ÚTIL SIN PREGUNTAR NADA ---
Prospecto: "Uso una agencia pero siento que no me pescan"
✅ Steve: "Eso pasa mucho. Las agencias manejan 20-30 cuentas y tu marca termina siendo un número más. Lo peor es que muchas ni te dan acceso al Business Manager, entonces dependes de sus reportes sin poder verificar nada."
❌ Steve: "¿Cuánto le pagas a la agencia? ¿Hace cuánto trabajas con ellos?"

--- NO REPETIR ARGUMENTOS ---
Si ya mencionaste una fecha comercial, NO la repitas. Si ya hablaste de CPA, habla de ROAS o conversión la próxima vez. VARÍA siempre.`;


  // 6. STAGE STRATEGY — already injected at the TOP (Cambio 4a, moved up)

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
      if (relevantRule.id) collectedRuleIds.push(relevantRule.id);
    }
  }

  // Audit trail: fire-and-forget qa_log insert (non-blocking)
  if (collectedRuleIds.length > 0) {
    supabase.from('qa_log').insert({
      check_type: 'knowledge_injection',
      status: 'info',
      details: JSON.stringify({
        source: 'wa-sales-brain',
        prospect_id: prospect.id,
        rule_count: collectedRuleIds.length,
        rule_ids: collectedRuleIds,
        stage: effectiveStage,
      }),
      detected_by: 'steve-wa-brain',
    }).then(({ error }) => {
      if (error) console.error('[steve-wa-brain] qa_log insert failed:', error.message);
    });
  }

  return { prompt, ruleIds: collectedRuleIds };
}

// ---------------------------------------------------------------------------
// Pain points consolidation (semantic dedup via Haiku)
// ---------------------------------------------------------------------------

/**
 * Consolidate pain points by removing semantic duplicates.
 * Uses Haiku to identify items that express the same frustration with different words.
 * Returns deduplicated array (max 8 items). Falls back to slice(-8) on error.
 */
export async function consolidatePainPoints(painPoints: string[]): Promise<string[]> {
  if (painPoints.length <= 8) return painPoints;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return painPoints.slice(-8);

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
          content: `Consolida estos pain points eliminando duplicados semánticos. Dos items son duplicados si expresan la MISMA frustración con distintas palabras.

Pain points actuales:
${JSON.stringify(painPoints)}

Reglas:
- Máximo 8 items únicos en el resultado
- Si dos items dicen lo mismo, quédate con la versión más específica/detallada
- Mantén el texto original (no reescribas)
- Responde SOLO con un JSON array, sin explicación

Ejemplo:
["pierde plata en ads", "está perdiendo dinero en publicidad", "no sabe medir ROI"]
→ ["está perdiendo dinero en publicidad", "no sabe medir ROI"]`,
        }],
      }),
    });

    if (!response.ok) {
      console.error('[consolidatePainPoints] API error:', response.status);
      return painPoints.slice(-8);
    }

    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 8);
    }
    return painPoints.slice(-8);
  } catch (err) {
    console.error('[consolidatePainPoints] Error:', err);
    return painPoints.slice(-8);
  }
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

  const existingPainPoints = currentProspect.pain_points || [];
  const extractionPrompt = `Eres un extractor de información. Analiza la CONVERSACIÓN COMPLETA y extrae SOLO lo que el PROSPECTO dijo EXPLÍCITAMENTE.
REGLAS ESTRICTAS:
- Solo extrae datos que el PROSPECTO confirmó directamente.
- Si Steve preguntó algo y el prospecto NO respondió → no asumas.
- Si el prospecto corrigió algo (ej: "no, en realidad vendo artesanías") → usa la ÚLTIMA versión.
- NO inventes, NO asumas, NO infieras datos vagos.

REGLA CRÍTICA SOBRE PAIN_POINTS:
Los pain_points YA REGISTRADOS son: ${JSON.stringify(existingPainPoints)}
- COMPARA cada candidato contra CADA item existente antes de incluirlo
- Si expresa la MISMA frustración con otras palabras → NO LO INCLUYAS
- Ejemplos de duplicados semánticos (NO incluir):
  * "pierde plata en ads" ≈ "está perdiendo dinero en publicidad" → MISMO DOLOR
  * "no sabe si los ads funcionan" ≈ "no puede medir resultados" → MISMO DOLOR
  * "no tiene tiempo" ≈ "le falta tiempo para marketing" → MISMO DOLOR
- Si no hay dolores genuinamente NUEVOS y DISTINTOS → devuelve pain_points como array vacío []
- MÁXIMO 3 pain_points nuevos por extracción

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
    pain_points: existingPainPoints,
  })}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicación). Solo incluye campos con info EXPLÍCITA nueva:
{
  "name": "nombre si lo dijo",
  "apellido": "apellido del prospecto (SOLO si lo dijo EXPLÍCITAMENTE, NO inferir del nombre)",
  "email": "email si lo compartió",
  "company": "nombre de empresa si lo mencionó EXPLÍCITAMENTE",
  "what_they_sell": "qué venden — solo si el prospecto lo dijo claramente",
  "monthly_revenue": "facturación con número concreto (ej: '$200K/mes'). NO incluir si no dio cifra",
  "has_online_store": true/false — solo si lo confirmó explícitamente,
  "store_platform": "Shopify/WooCommerce/etc — solo si lo nombró",
  "is_decision_maker": true/false — solo si dijo 'soy el dueño/fundador/CEO',
  "actively_looking": true/false — solo si expresó búsqueda activa,
  "current_marketing": "cómo manejan marketing — solo si lo describió",
  "pain_points": ["dolor genuinamente NUEVO"] — solo si NO está ya cubierto semánticamente en la lista existente. Si no hay nuevos → [],
  "integrations_used": ["Meta"] — solo herramientas que el prospecto NOMBRÓ,
  "team_size": "tamaño del equipo — solo si lo mencionó",
  "budget_range": "presupuesto de marketing mensual — solo si dio rango o cifra (ej: '$500K/mes', 'entre 1-2 millones')",
  "decision_timeline": "cuándo quiere empezar — solo si lo dijo (ej: 'este mes', 'después de CyberDay', 'lo antes posible')"
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
  // Paso 1 Perro Lobo: no-tienda ya no es descalificación, solo baja de 15→5
  if (prospect.has_online_store === true) breakdown.need += 15;
  else if (prospect.has_online_store === false) breakdown.need += 5; // Still has some need
  if (prospect.what_they_sell) breakdown.need += 5;
  if (prospect.current_marketing) breakdown.need += 5;

  // --- BUDGET (0-25): Monthly revenue + budget range ---
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
  // Bonus: explicit budget range shared
  if (prospect.budget_range) {
    const budgetLower = prospect.budget_range.toLowerCase();
    if (budgetLower.includes('millón') || budgetLower.includes('millon') || /\d{6,}/.test(budgetLower.replace(/\D/g, ''))) {
      breakdown.budget = Math.min(breakdown.budget + 10, 25); // High budget
    } else {
      breakdown.budget = Math.min(breakdown.budget + 5, 25);
    }
  }

  // --- AUTHORITY (0-15): Are they the decision maker? ---
  if (prospect.is_decision_maker === true) {
    breakdown.authority += 15;
  }
  // Unknown authority → 0 pts (not 5). Don't assume.

  // --- TIMELINE (0-20): Actively looking + pain points + decision_timeline = urgency ---
  if (prospect.actively_looking === true) breakdown.timeline += 10;
  if (prospect.pain_points && prospect.pain_points.length > 0) {
    breakdown.timeline += Math.min(prospect.pain_points.length * 5, 10);
  }
  // Bonus: explicit decision timeline
  if (prospect.decision_timeline) {
    const tl = prospect.decision_timeline.toLowerCase();
    if (tl.includes('ahora') || tl.includes('ya') || tl.includes('este mes') || tl.includes('lo antes posible') || tl.includes('urgente')) {
      breakdown.timeline = Math.min(breakdown.timeline + 10, 20);
    } else if (tl.includes('próximo mes') || tl.includes('proximo mes') || tl.includes('pronto')) {
      breakdown.timeline = Math.min(breakdown.timeline + 5, 20);
    }
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
  // Bonus: audit data available (we scraped their store)
  if (prospect.audit_data?.findings?.length) {
    breakdown.fit = Math.min(breakdown.fit + 5, 15);
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

  // Paso 1 Perro Lobo: no-tienda ya NO descalifica. Score normal, need baja a 5.
  // La descalificación real ahora viene de detectDisqualification() en el chat handler.

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

// ---------------------------------------------------------------------------
// Meeting confirmation detection — Mini CRM Pipeline
// ---------------------------------------------------------------------------

export interface MeetingConfirmationResult {
  confirmed: boolean;
  proposedTime?: string;
  rejected?: boolean;
}

/**
 * Use Haiku to detect if the prospect's message confirms, rejects, or proposes
 * another time for a meeting. Only called when meeting_status === 'proposed'.
 */
export async function detectMeetingConfirmation(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<MeetingConfirmationResult> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return { confirmed: false };

  // Get last few messages for context
  const recentHistory = history.slice(-6)
    .map(m => `${m.role === 'user' ? 'Prospecto' : 'Steve'}: ${m.content}`)
    .join('\n');

  const prompt = `Analiza si el prospecto confirma, rechaza, o propone otro horario para una reunión.

CONVERSACIÓN RECIENTE:
${recentHistory}

ÚLTIMO MENSAJE DEL PROSPECTO:
${message}

Responde ÚNICAMENTE con JSON válido (sin markdown):
{
  "confirmed": true/false — true si acepta un horario propuesto,
  "proposedTime": "fecha y hora que el prospecto propone o confirma (ej: 'mañana a las 10', 'el lunes a las 3pm', '2026-04-03 10:00'). null si no propone horario",
  "rejected": true/false — true si rechaza la reunión por completo (no quiere reunirse, no solo cambiar horario)
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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[steve-wa-brain] detectMeetingConfirmation API error:', response.status);
      return { confirmed: false };
    }

    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      confirmed: !!parsed.confirmed,
      proposedTime: parsed.proposedTime || undefined,
      rejected: !!parsed.rejected,
    };
  } catch (err) {
    console.error('[steve-wa-brain] detectMeetingConfirmation error:', err);
    return { confirmed: false };
  }
}

/**
 * Parse a natural language time reference into a Date.
 * Uses Haiku to interpret relative times like "mañana a las 10" or "el lunes a las 3pm".
 */
export async function parseMeetingTime(
  timeStr: string,
): Promise<Date | null> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return null;

  const now = new Date();
  const chileNow = now.toLocaleString('en-US', { timeZone: 'America/Santiago' });

  const prompt = `La fecha/hora actual en Chile es: ${chileNow}

El prospecto dijo: "${timeStr}"

Convierte eso a una fecha ISO 8601 con timezone de Chile (America/Santiago, UTC-3 o UTC-4 según horario de verano).
Si dice "mañana" → el día siguiente. Si dice "lunes" → el próximo lunes. Si no especifica AM/PM, asume horario laboral (10am-6pm).

Responde ÚNICAMENTE con la fecha en formato ISO 8601, ej: 2026-04-03T10:00:00-03:00
Si no puedes interpretar la hora, responde: null`;

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
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    if (text === 'null' || !text) return null;

    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (err) {
    console.error('[steve-wa-brain] parseMeetingTime error:', err);
    return null;
  }
}
