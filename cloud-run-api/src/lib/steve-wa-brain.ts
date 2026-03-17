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
