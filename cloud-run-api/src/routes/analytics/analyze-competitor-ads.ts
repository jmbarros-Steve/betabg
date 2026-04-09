import { Context } from 'hono';

interface AdInput {
  ad_text: string | null;
  ad_headline: string | null;
  ad_type: string | null;
  cta_type: string | null;
  days_running: number | null;
  is_active: boolean;
  impressions_lower: number | null;
  impressions_upper: number | null;
  spend_lower: number | null;
  spend_upper: number | null;
  reach_lower: number | null;
  reach_upper: number | null;
  platforms: string[] | null;
  landing_url: string | null;
}

export async function analyzeCompetitorAds(c: Context) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const user = c.get('user');
  if (!user) return c.json({ error: 'Missing authorization' }, 401);

  const { ads, competitor_count } = await c.req.json();
  if (!ads || !Array.isArray(ads) || ads.length === 0) {
    return c.json({ error: 'ads[] required' }, 400);
  }

  // Build a concise summary of ads for Claude
  const adSummaries = (ads as AdInput[]).slice(0, 30).map((ad, i) => {
    const parts = [`Ad ${i + 1}:`];
    if (ad.ad_type) parts.push(`Tipo: ${ad.ad_type}`);
    if (ad.days_running != null) parts.push(`Días activo: ${ad.days_running}`);
    if (ad.is_active) parts.push('ACTIVO');
    if (ad.cta_type) parts.push(`CTA: ${ad.cta_type}`);
    if (ad.impressions_lower && ad.impressions_upper) parts.push(`Impresiones: ${ad.impressions_lower}-${ad.impressions_upper}`);
    if (ad.spend_lower && ad.spend_upper) parts.push(`Gasto: $${ad.spend_lower}-$${ad.spend_upper}`);
    if (ad.reach_lower && ad.reach_upper) parts.push(`Alcance: ${ad.reach_lower}-${ad.reach_upper}`);
    if (ad.platforms?.length) parts.push(`Plataformas: ${ad.platforms.join(', ')}`);
    if (ad.ad_headline) parts.push(`Headline: "${ad.ad_headline}"`);
    if (ad.ad_text) parts.push(`Copy: "${ad.ad_text.slice(0, 200)}"`);
    if (ad.landing_url) parts.push(`Landing: ${ad.landing_url}`);
    return parts.join(' | ');
  }).join('\n');

  const systemPrompt = `Eres Steve, un analista experto de marketing digital y publicidad en Meta Ads.
Analiza los anuncios de competidores que te proporcionan y genera inteligencia competitiva accionable.

REGLAS:
- Responde SIEMPRE en español
- Sé directo y accionable, no genérico
- Basa tus análisis en los DATOS reales (días activo, gasto, impresiones)
- Los ads con 30+ días activos son "ganadores" — están escalando porque funcionan
- NO inventes datos que no tienes
- Responde en JSON válido`;

  const userPrompt = `Analiza estos ${ads.length} anuncios de ${competitor_count || 'varios'} competidores:

${adSummaries}

Responde con este JSON exacto:
{
  "patrones": ["patrón 1 detectado", "patrón 2", ...],
  "angulos_frecuentes": ["ángulo 1", "ángulo 2", ...],
  "formatos_usados": ["formato (cantidad)", ...],
  "ctas_populares": ["CTA (cantidad ads)", ...],
  "estimacion_gasto": "Resumen del gasto total basado en datos reales",
  "recomendaciones": ["recomendación accionable 1", "recomendación 2", ...],
  "ganadores_insight": ["insight sobre ad ganador 1", "insight 2", ...]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[analyze-competitor-ads] Anthropic error:', response.status, errText.slice(0, 200));
      return c.json({ error: `ai_error: ${response.status}` }, 500);
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response (Claude might wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return c.json({ error: 'ai_parse_error', raw: text.slice(0, 500) }, 500);
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return c.json({ success: true, analysis });
  } catch (err: any) {
    console.error('[analyze-competitor-ads] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}
