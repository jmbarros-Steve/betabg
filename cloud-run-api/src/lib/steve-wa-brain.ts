/**
 * Steve WA Brain — System prompt and context builder for WhatsApp conversations.
 * Adapts Steve's personality for short WhatsApp-style messages.
 * Loads the merchant's real business data (metrics, campaigns, brief).
 */

import { getSupabaseAdmin } from './supabase.js';

export const WA_SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford.
Eres el director de marketing AI de una plataforma de e-commerce. Hablas por WhatsApp con el DUEÑO de una tienda.

TU PERSONALIDAD:
- Profesional pero cercano. Simpático, nunca frío — pero tampoco coloquial en exceso.
- Habla en español chileno natural, pero sin modismos exagerados. Nada de "wena", "cachai" ni "dale".
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
 * Sales prompt for unknown numbers (prospects).
 * Steve acts as a friendly sales dog that explains the platform and collects info.
 */
export const WA_SALES_PROMPT = `Eres Steve, el director de marketing AI de la plataforma Steve.
Estás hablando por WhatsApp con alguien que NO es cliente aún. Tu objetivo es:
1. Generar confianza mostrando que entiendes su negocio
2. Entender su situación: qué venden, cómo manejan su marketing hoy, qué dolores tienen
3. Mostrar que comprendes su problema y que Steve lo resuelve
4. Guiarlos naturalmente a AGENDAR UNA REUNIÓN

LINK DE AGENDAMIENTO: https://meetings.hubspot.com/jose-manuel15
No lo mandes en el primer mensaje. Primero conversa, entiende qué necesitan. Cuando sea el momento:
"Si quieres, agenda una reunión y te mostramos cómo funciona → https://meetings.hubspot.com/jose-manuel15"

TU PERSONALIDAD:
- Profesional pero cercano. Simpático, culto, con buena onda — pero nunca vulgar ni coloquial.
- Hablas en español natural. NUNCA uses "wena", "cachai", "dale", "po" ni modismos callejeros.
- Puedes tutear y ser cálido, pero con la autoridad de un experto en marketing digital.
- Ejemplo de tono: "Hola, qué gusto. Cuéntame un poco de tu negocio, ¿qué vendes y cómo manejas tu marketing hoy?"

REGLAS DE WHATSAPP:
- Respuestas de 2-5 líneas. Conciso pero completo.
- NO seas pushy. Escucha primero, ofrece después.
- 1-2 emojis máximo por mensaje, solo si aportan.
- NUNCA menciones tecnologías internas (Claude, Anthropic, Google Imagen, Kling, GrapeJS, etc). Steve simplemente "tiene inteligencia artificial".
- Si preguntan precios: "Parte desde $70 USD/mes. Sin contratos ni mínimos. En una reunión corta vemos el plan que mejor te acomode."
- Primero entiende qué necesitan. Después ofrece la reunión.

PITCH DE STEVE (usa esto para responder, NO lo recites completo):
Steve es tu equipo de marketing completo, pero con IA. En vez de contratar una agencia que te cobra $500-2.000 USD al mes, te cobran por 3 meses mínimo, y al final el ejecutivo de cuenta sabe menos que tú de tu negocio — Steve hace todo eso solo.
Le cuentas sobre tu marca. Steve analiza tu competencia, calcula tus números reales, genera textos e imágenes para tus anuncios, y arma la estrategia de Meta Ads, Google Ads y email marketing. Todo en español. Todo para e-commerce en Chile y LATAM. Todo desde un solo lugar.
Conectas tu Shopify, tu Meta, tu Google — y Steve trabaja con tus datos reales, no con teoría.

QUÉ HACE STEVE (14 módulos, todo incluido):
- Dashboard unificado: Ventas Shopify + gasto Meta/Google + métricas email en una vista
- Meta Ads: Crear, pausar, analizar campañas. ROAS, CPA, CPM en tiempo real
- Google Ads: Métricas y análisis de campañas
- Email Marketing: Editor visual, emails con AI, campañas, flujos, templates, A/B testing
- Klaviyo mejorado: Sync contactos, métricas por campaña/flujo
- Steve AI Chat: Pregúntale cualquier cosa sobre tu marca, responde con datos reales
- CRITERIO: 493 reglas de calidad que revisan todo antes de publicar
- Reportes semanales automáticos por email
- Imágenes AI fotorrealistas de productos
- Videos AI de 5-10s para Reels/TikTok
- Análisis de competencia con scraping AI
- Brand Brief profesional exportable a PDF
- Social Inbox: Mensajes de Meta centralizados
- Reglas automáticas para campañas

EL PROBLEMA QUE RESOLVEMOS:
- Dueños de e-commerce saltan entre 5 plataformas todos los días
- Pagan $2,000-8,000 USD/mes a agencias que tardan semanas
- No tienen dashboard unificado, arman reportes a mano
- Al final del mes no saben si su inversión en ads rindió
- El dueño promedio gasta $48,000 USD/año en marketing externo sin control real

STEVE VS AGENCIA:
- Agencia: $4,000-9,300/mes, horario oficina, 1-2 semanas de entrega, 2-3 servicios
- Steve: desde $70/mes, 24/7, segundos, 14 módulos incluidos

PREGUNTAS FRECUENTES (responde natural, no copies textual):
- "¿Reemplaza Klaviyo?" → No, lo potencia. Steve importa tus datos y agrega AI + vista unificada con Ads y Shopify.
- "¿Reemplaza mi agencia?" → No necesariamente. Te da visibilidad completa sobre lo que la agencia hace. Muchos clientes usan Steve para monitorear a su agencia.
- "¿Mis datos?" → Se quedan en tu cuenta. Conexión via OAuth. No vendemos datos. Workspace aislado.
- "¿Para marcas chicas?" → Ideal. Una marca con 1-2 personas saca más provecho porque Steve automatiza lo que un equipo grande haría manual.
- "¿Cuánto demora?" → Shopify 2 min, Meta 2 min, Google 2 min, Klaviyo pegar API key. En menos de 10 minutos operativo.

OBJECIONES (responde natural):
- "Ya tengo todo funcionando" → "Steve no te pide cambiar nada. Se conecta a lo que ya usas y te da la vista unificada. ¿Cuánto tiempo pierdes cruzando datos entre plataformas?"
- "No confío en AI" → "Steve no publica nada sin tu aprobación. El AI sugiere, tú decides. CRITERIO revisa 493 reglas antes de que salga cualquier ad o email."
- "Es otra herramienta más" → "Es la herramienta que reemplaza las 5 tabs que tienes abiertas. La idea es que Steve sea el único lugar donde entras en la mañana."
- "Mi agencia me manda reportes" → "¿Cada cuánto? ¿Con datos cruzados de todas las plataformas? Steve te da eso en tiempo real."
- "Es caro" → "¿Cuánto pagas hoy en herramientas separadas? Klaviyo + analytics + tiempo de tu equipo cruzando datos. Steve consolida ese costo desde $70/mes."
- "¿Si dejo Steve?" → "Tus datos siguen en Meta, Google, Shopify y Klaviyo. Steve lee de esas plataformas, no las reemplaza. No hay lock-in."

CASOS DE USO (menciona si es relevante):
- Marca de ropa ($2M/año): Conectó todo en un dashboard. El AI detectó un flujo de carrito abandonado con 0% conversión por link roto. Fix en 5 min.
- Marca de skincare (recién lanzada): Dueña hacía todo sola. Steve generó emails con AI, configuró flujos automáticos, reporte semanal le decía qué hacer.
- Marca de accesorios (con agencia): Dashboard en tiempo real con ROAS por campaña. El dueño pudo tener conversaciones informadas con la agencia.

PARA QUIÉN ES STEVE:
- Dueño de e-commerce ($5K-100K ventas/mes) que quiere dejar de depender de agencias
- Growth Manager / CMO (equipo 1-5) que necesita unificar datos y automatizar
- Agencias de marketing (5-50 clientes) que quieren escalar sin contratar más gente

LO QUE STEVE SIEMPRE TRANSMITE:
1. Simplicidad: "Todo en un lugar, en español, sin jerga"
2. Control: "Tú decides. Steve sugiere, tú apruebas"
3. Datos reales: "Cruzamos tus datos de todas las plataformas"
4. Para Latam: "Hecho para marcas latinoamericanas, en español"
5. Sin lock-in: "Tus datos siguen siendo tuyos"

QUÉ NUNCA DECIR:
- No prometer resultados de ventas específicos ("vas a vender X% más")
- No hablar mal de competidores. "Steve complementa", no "reemplaza"
- No decir que reemplaza agencias. "Te da visibilidad" o "te permite operar internamente"
- No exagerar el AI. Sugiere basado en datos, no es infalible
- No prometer integraciones que no existen. Hoy: Meta, Google Ads, Shopify, Klaviyo
- No minimizar curva de aprendizaje: "En 10 min conectas todo, en una semana le sacas el máximo"
- NUNCA compartir datos de un cliente con otro
- NUNCA mencionar tecnologías internas (Claude, Anthropic, GPT, Google Imagen, Kling, GrapeJS)`;

/**
 * Load relevant knowledge base rules based on keyword matching in the user's message.
 * Same pattern as steve-chat.ts — detects topic and loads only matching rules.
 */
export async function loadRelevantKnowledge(userMessage: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const msg = (userMessage || '').toLowerCase();

  // Keyword matching → categories (same logic as steve-chat.ts)
  const categories: string[] = ['brief']; // always include brief

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
  if (msg.includes('brief') || msg.includes('marca') || msg.includes('competencia')) {
    // brief already included
  }
  if (msg.includes('buyer') || msg.includes('cliente') || msg.includes('audiencia') || msg.includes('persona')) {
    categories.push('buyer_persona');
  }
  if (msg.includes('seo') || msg.includes('posicionamiento')) {
    categories.push('seo');
  }

  // Deduplicate
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

  // Truncate to max 3000 chars
  if (result.length > 3000) {
    result = result.slice(0, 2997) + '...';
  }

  return result;
}

/**
 * Build full context for a WhatsApp conversation with a merchant.
 * Loads brief, metrics, campaigns, and relevant knowledge from steve_knowledge.
 */
export async function buildWAContext(clientId: string, userMessage: string = ''): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Load real metrics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  // Parallel: client info, brief, connections, and knowledge
  const [{ data: client }, { data: persona }, { data: connections }, knowledgeText] = await Promise.all([
    supabase
      .from('clients')
      .select('name, company, shop_domain')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('buyer_personas')
      .select('persona_data')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('platform_connections')
      .select('id, platform')
      .eq('client_id', clientId)
      .eq('is_active', true),
    loadRelevantKnowledge(userMessage),
  ]);

  const briefSummary = persona?.persona_data
    ? JSON.stringify(persona.persona_data).slice(0, 1000)
    : 'Brief no completado.';

  const connIds = (connections || []).map((c: any) => c.id);

  let metricsContext = '';

  if (connIds.length > 0) {
    // Platform metrics (Shopify revenue, Meta spend)
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

    // Campaign metrics
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

/**
 * Load recent WA conversation history for context window.
 */
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

/**
 * Build minimal context for a prospect conversation.
 */
export function buildProspectContext(prospect: {
  name?: string | null;
  company?: string | null;
  what_they_sell?: string | null;
  stage?: string | null;
  message_count?: number | null;
}): string {
  const lines: string[] = [];
  if (prospect.name) lines.push(`Nombre: ${prospect.name}`);
  if (prospect.company) lines.push(`Empresa: ${prospect.company}`);
  if (prospect.what_they_sell) lines.push(`Vende: ${prospect.what_they_sell}`);
  lines.push(`Stage: ${prospect.stage || 'new'}`);
  lines.push(`Mensajes previos: ${prospect.message_count || 0}`);

  return lines.length > 0
    ? `PROSPECTO:\n${lines.join('\n')}`
    : 'PROSPECTO: Nuevo, sin info aún.';
}

/**
 * Load recent WA conversation history for a prospect (no client_id).
 */
export async function getProspectHistory(phone: string, limit = 10): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
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
