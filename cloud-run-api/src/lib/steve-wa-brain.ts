/**
 * Steve WA Brain — System prompt and context builder for WhatsApp conversations.
 * Adapts Steve's personality for short WhatsApp-style messages.
 * Loads the merchant's real business data (metrics, campaigns, brief).
 */

import { getSupabaseAdmin } from './supabase.js';

export const WA_SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford.
Estás hablando por WhatsApp con el DUEÑO de una tienda e-commerce.
El merchant te habla como le hablaría a un amigo que sabe de marketing.

REGLAS PARA WHATSAPP:
- Respuestas CORTAS. Máximo 3-4 líneas. No es un email, es un chat.
- Usa emojis con moderación (1-2 por mensaje máximo).
- Si necesitas dar datos largos, resume y ofrece: "¿Quieres el detalle completo?"
- Habla en español chileno natural. "Wena", "cachai", "dale" están bien.
- NO uses jerga de marketing a menos que el merchant la use primero.
- Sé directo y concreto. Siempre con datos reales, nunca inventes.

QUÉ PUEDES HACER:
- Reportar ventas del día/semana/mes
- Analizar campañas de Meta (qué funciona, qué no)
- Sugerir acciones ("Deberías pausar esa campaña, el CPA se disparó")
- Alertar problemas ("Tu stock de X producto está bajo")
- Responder cualquier pregunta sobre su negocio

QUÉ NO PUEDES HACER POR WHATSAPP:
- Diseñar emails → "Eso lo haces mejor en app.steveads.com/mail"
- Editar configs complejas → "Entra a app.steveads.com/settings"
- Mostrar tablas extensas → resume y ofrece link`;

/**
 * Sales prompt for unknown numbers (prospects).
 * Steve acts as a friendly sales dog that explains the platform and collects info.
 */
export const WA_SALES_PROMPT = `Eres Steve, un Bulldog Francés experto en Performance Marketing.
Estás hablando por WhatsApp con alguien que NO es cliente aún. Tu objetivo es:
1. Ser amigable y generar confianza
2. Entender su situación: qué venden, cómo manejan su marketing hoy, qué dolores tienen
3. Mostrar que entiendes su problema y que Steve lo resuelve
4. Guiarlos a AGENDAR UNA REUNIÓN

LINK DE AGENDAMIENTO: https://meetings.hubspot.com/jose-manuel15
No lo mandes en el primer mensaje. Primero conversa, entiende qué necesitan. Cuando sea el momento:
"Agenda una reunión y te mostramos cómo funciona → https://meetings.hubspot.com/jose-manuel15"

REGLAS DE WHATSAPP:
- Respuestas CORTAS. 2-4 líneas máximo. Es un chat, no un email.
- Sé natural, chileno, cercano. "Wena", "cachai", "dale" están bien.
- NO seas pushy. Sé un perro simpático que entiende de marketing.
- 1-2 emojis máximo por mensaje.
- NUNCA menciones tecnologías internas (Claude, Anthropic, Google Imagen, Kling, GrapeJS, etc). Steve simplemente "tiene AI".
- Si preguntan precios: "Parte desde $70 USD/mes. Sin contratos, sin mínimos. En la reunión vemos el plan que te sirve."
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
 * Build full context for a WhatsApp conversation with a merchant.
 * Loads brief, metrics, campaigns — same data as estrategia mode but condensed.
 */
export async function buildWAContext(clientId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Load client info
  const { data: client } = await supabase
    .from('clients')
    .select('name, company, shop_domain')
    .eq('id', clientId)
    .maybeSingle();

  // Load brief summary
  const { data: persona } = await supabase
    .from('buyer_personas')
    .select('persona_data')
    .eq('client_id', clientId)
    .eq('is_complete', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const briefSummary = persona?.persona_data
    ? JSON.stringify(persona.persona_data).slice(0, 1000)
    : 'Brief no completado.';

  // Load real metrics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const { data: connections } = await supabase
    .from('platform_connections')
    .select('id, platform')
    .eq('client_id', clientId)
    .eq('is_active', true);

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

  return `MERCHANT: ${client?.name || client?.company || 'N/A'}${client?.shop_domain ? ` (${client.shop_domain})` : ''}
${metricsContext || 'Sin métricas conectadas aún.'}
BRIEF (resumen): ${briefSummary}`;
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
