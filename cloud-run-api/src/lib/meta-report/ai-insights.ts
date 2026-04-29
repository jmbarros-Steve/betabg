/**
 * AI insights via Anthropic Claude.
 * Genera 5-8 recomendaciones accionables a partir de los KPIs agregados,
 * BCG quadrants, fatiga, funnel layers y conversion funnel.
 *
 * Usa fetch directo a la API de Anthropic (mismo patrón que strategy-report.ts).
 * Modelo: claude-sonnet-4-5 (balance speed/calidad). Si falla, devuelve [].
 */

import type { MetaReportData, AIRecommendation } from './data.js';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_TIMEOUT_MS = 60_000;
const ANTHROPIC_MAX_TOKENS = 2000;

const SYSTEM_PROMPT = `Eres Felipe, Performance Manager senior de Meta Ads en Steve Ads. Tu trabajo es analizar las métricas del período de un cliente y devolver 5 a 8 recomendaciones accionables, priorizadas por impacto en plata.

Reglas estrictas:
- Tono directo, cercano (vos/tú según la región LATAM), sin jerga corporativa.
- NUNCA digas "evaluar", "considerar", "sería bueno". Decí qué hacer y qué se espera ganar.
- Cada recomendación tiene: priority ('alta'|'media'|'baja'), action (1-2 frases imperativas), why (1 frase con número del período), expected_impact (1 frase con número estimado o rango).
- Las recomendaciones de prioridad alta SIEMPRE responden a un riesgo o oportunidad cuantificada en la data (fatiga >3, ROAS <1, drop-off de carrito >70%, etc).
- Devolvé SOLO un JSON válido con la forma { "recommendations": [{"priority": "alta", "action": "...", "why": "...", "expected_impact": "..."}, ...] }. NADA más, sin markdown, sin texto antes o después.
- Máximo 8 recomendaciones. Mínimo 5. Si la data es muy pobre (sin spend, sin campañas) devolvé 5 con foco en activación.`;

function buildUserPrompt(data: MetaReportData): string {
  const c = data.current;
  const p = data.previous;
  const period = `${data.period.start} a ${data.period.end} (${data.period.daysInPeriod} días)`;

  const campaignsByQuadrant = {
    star: data.campaigns.filter((x) => x.bcgQuadrant === 'star').length,
    question: data.campaigns.filter((x) => x.bcgQuadrant === 'question').length,
    cow: data.campaigns.filter((x) => x.bcgQuadrant === 'cow').length,
    dog: data.campaigns.filter((x) => x.bcgQuadrant === 'dog').length,
  };

  const fatigueCampaigns = data.campaigns.filter((x) => x.frequency >= 3).length;
  const borderlineFatigue = data.campaigns.filter((x) => x.frequency >= 2 && x.frequency < 3).length;

  const top3 = data.campaigns.slice(0, 3).map((x) => ({
    name: x.campaignName.slice(0, 40),
    spend: Math.round(x.spend),
    roas: x.roas.toFixed(2),
    freq: x.frequency.toFixed(1),
  }));

  const bottom3 = [...data.campaigns]
    .filter((x) => x.spend > 0)
    .sort((a, b) => a.roas - b.roas)
    .slice(0, 3)
    .map((x) => ({
      name: x.campaignName.slice(0, 40),
      spend: Math.round(x.spend),
      roas: x.roas.toFixed(2),
    }));

  const funnelSummary = data.funnelLayers.map((l) => ({
    stage: l.stage,
    spend: Math.round(l.spend),
    revenue: Math.round(l.revenue),
    roas: l.roas.toFixed(2),
    campaigns: l.campaignCount,
  }));

  const cf = data.conversionFunnel;

  const payload = {
    cliente: data.client.name,
    periodo: period,
    metricas_actuales: {
      spend_clp: Math.round(c.spend),
      revenue_clp: Math.round(c.revenue),
      roas: c.roas.toFixed(2),
      conversions: Math.round(c.conversions),
      impressions: c.impressions,
      reach: c.reach,
      clicks: c.clicks,
      ctr_pct: c.ctr.toFixed(2),
      cpm_clp: Math.round(c.cpm),
      cpc_clp: Math.round(c.cpc),
      frequency: c.frequency.toFixed(2),
      campaign_count: c.campaignCount,
    },
    metricas_periodo_anterior: {
      spend_clp: Math.round(p.spend),
      revenue_clp: Math.round(p.revenue),
      roas: p.roas.toFixed(2),
      conversions: Math.round(p.conversions),
    },
    eerr: {
      cogs_clp: Math.round(data.profitLoss.costOfGoods),
      cogs_method: data.profitLoss.cogsMethod,
      gross_profit_clp: Math.round(data.profitLoss.grossProfit),
      margin_pct: data.profitLoss.marginPct.toFixed(1),
      revenue_per_1000_clp: Math.round(data.profitLoss.revenuePerThousand),
    },
    bcg_quadrants: campaignsByQuadrant,
    fatiga: {
      campañas_alta_fatiga_freq_3plus: fatigueCampaigns,
      campañas_borderline_freq_2_3: borderlineFatigue,
    },
    top3_por_spend: top3,
    bottom3_por_roas: bottom3,
    funnel_distribution: funnelSummary,
    conversion_funnel: {
      impressions: cf.impressions,
      clicks: cf.clicks,
      add_to_cart: cf.addToCart,
      checkout: cf.initiatedCheckout,
      purchase: cf.purchase,
      ctr_pct: cf.ctr.toFixed(2),
      checkout_to_purchase_pct: cf.checkoutToPurchase.toFixed(1),
    },
    breakdowns_disponibles: {
      age_gender: data.breakdowns.ageGender.length,
      country: data.breakdowns.country.length,
      placement: data.breakdowns.placement.length,
    },
  };

  return `Acá está el dashboard del período. Generá 5-8 recomendaciones accionables priorizadas por impacto:\n\n${JSON.stringify(payload, null, 2)}`;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message: string };
}

export async function generateAIRecommendations(data: MetaReportData): Promise<AIRecommendation[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[meta-report:ai-insights] ANTHROPIC_API_KEY missing, skipping AI recommendations');
    return buildFallbackRecommendations(data);
  }

  const userPrompt = buildUserPrompt(data);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as AnthropicResponse;
      console.error('[meta-report:ai-insights] Anthropic API error:', res.status, errBody?.error?.message);
      return buildFallbackRecommendations(data);
    }

    const json = (await res.json()) as AnthropicResponse;
    const text = json.content?.[0]?.text || '';

    // Extraer JSON tolerante a wrappers (```json ... ``` o texto antes)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[meta-report:ai-insights] No JSON found in Claude response');
      return buildFallbackRecommendations(data);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const recs = parsed.recommendations;
    if (!Array.isArray(recs) || recs.length === 0) {
      return buildFallbackRecommendations(data);
    }

    return recs
      .filter((r: any) =>
        r && typeof r.action === 'string' && typeof r.why === 'string' && typeof r.expected_impact === 'string',
      )
      .map((r: any) => ({
        priority: ['alta', 'media', 'baja'].includes(r.priority) ? r.priority : 'media',
        action: String(r.action).slice(0, 280),
        why: String(r.why).slice(0, 280),
        expected_impact: String(r.expected_impact).slice(0, 280),
      }))
      .slice(0, 8);
  } catch (err) {
    clearTimeout(timer);
    console.warn('[meta-report:ai-insights] generation failed:', (err as Error).message);
    return buildFallbackRecommendations(data);
  }
}

/**
 * Fallback heurístico cuando Claude no responde / no hay API key.
 * 5 recomendaciones genéricas pero útiles, derivadas de la data.
 */
function buildFallbackRecommendations(data: MetaReportData): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const c = data.current;

  if (c.frequency >= 3) {
    const fatigueCount = data.campaigns.filter((x) => x.frequency >= 3).length;
    recs.push({
      priority: 'alta',
      action: 'Refrescá creativos en las campañas con frecuencia mayor a 3.',
      why: `Detectamos ${fatigueCount} campañas en fatiga (freq promedio ${c.frequency.toFixed(1)}). El público ya las vio demasiado.`,
      expected_impact: 'Bajar frecuencia 30-40% sube CTR un 15-25% y reduce CPM en una semana.',
    });
  }

  if (c.roas > 0 && c.roas < 1.5) {
    recs.push({
      priority: 'alta',
      action: 'Pausá ya las campañas con ROAS menor a 1 y redistribuí presupuesto a las top 3.',
      why: `Tu ROAS global de ${c.roas.toFixed(2)}x está bajo break-even — la pauta está perdiendo plata.`,
      expected_impact: 'Cortar el peor 30% del spend mejora ROAS global un 25-40% sin tocar revenue.',
    });
  }

  const stars = data.campaigns.filter((x) => x.bcgQuadrant === 'star');
  if (stars.length > 0) {
    recs.push({
      priority: 'alta',
      action: `Subí 20-30% el presupuesto de tus ${stars.length} campañas estrella esta semana.`,
      why: `Esas campañas ya están performando con ROAS promedio ${(stars.reduce((s, x) => s + x.roas, 0) / stars.length).toFixed(2)}x.`,
      expected_impact: 'Escalado gradual mantiene el ROAS y agrega 15-25% más de revenue en 14 días.',
    });
  }

  if (c.ctr > 0 && c.ctr < 1) {
    recs.push({
      priority: 'media',
      action: 'Testeá 2 ángulos creativos nuevos en TOFU con copy más fuerte de hook.',
      why: `CTR promedio de ${c.ctr.toFixed(2)}% está debajo del benchmark de 1% — el creativo no está agarrando.`,
      expected_impact: 'Mejor hook puede subir CTR a 1.2-1.5% y bajar CPM 20%.',
    });
  }

  if (data.conversionFunnel.checkoutToPurchase > 0 && data.conversionFunnel.checkoutToPurchase < 60) {
    recs.push({
      priority: 'media',
      action: 'Revisá el checkout: costos de envío, métodos de pago, formularios largos.',
      why: `Solo ${data.conversionFunnel.checkoutToPurchase.toFixed(0)}% de quienes inician checkout terminan comprando.`,
      expected_impact: 'Subir esa tasa a 70% recupera ~30% del revenue abandonado.',
    });
  }

  if (recs.length < 5) {
    recs.push({
      priority: 'media',
      action: 'Activá campaña de retargeting con audiencia de visitantes de 7 días.',
      why: 'El retargeting tiene ROAS 2-3x más alto que adquisición — y casi no tenés campañas BOFU.',
      expected_impact: 'Una campaña de retargeting agrega 10-15% de revenue sobre el spend total.',
    });
  }

  if (recs.length < 5) {
    recs.push({
      priority: 'baja',
      action: 'Configurá el Pixel correctamente y subí audiencias de Klaviyo a Meta.',
      why: 'Sin tracking limpio, Meta optimiza a ciegas. Las custom audiences mejoran señal.',
      expected_impact: 'Mejor matching sube ROAS 10-20% en campañas de adquisición tras 2 semanas de aprendizaje.',
    });
  }

  return recs.slice(0, 8);
}
