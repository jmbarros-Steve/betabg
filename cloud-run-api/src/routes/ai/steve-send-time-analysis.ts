import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const KLAVIYO_REVISION = '2024-10-15';

function makeHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'revision': KLAVIYO_REVISION,
  };
}

function makePostHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json',
    'revision': KLAVIYO_REVISION,
  };
}

async function klaviyoGet(url: string, apiKey: string): Promise<any> {
  const res = await fetch(url, { headers: makeHeaders(apiKey) });
  if (!res.ok) return null;
  return res.json();
}

// Find "Placed Order" metric ID
async function findConversionMetricId(apiKey: string): Promise<string | null> {
  const data: any = await klaviyoGet('https://a.klaviyo.com/api/metrics/', apiKey);
  if (!data) return null;
  const metrics = data.data || [];
  const placed = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
  if (placed) return placed.id;
  const fallback = metrics.find((m: any) => {
    const name = (m.attributes?.name || '').toLowerCase();
    return name.includes('order') || name.includes('purchase');
  });
  return fallback?.id || null;
}

// Fetch ALL campaigns with full pagination
async function fetchAllCampaigns(apiKey: string): Promise<any[]> {
  const allCampaigns: any[] = [];
  let url: string | null = 'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at';

  while (url) {
    const data: any = await klaviyoGet(url, apiKey);
    if (!data) break;

    const campaigns = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.attributes?.name || 'Sin nombre',
      status: c.attributes?.status || 'draft',
      send_time: c.attributes?.send_time || null,
      created_at: c.attributes?.created_at,
      updated_at: c.attributes?.updated_at,
    }));

    allCampaigns.push(...campaigns);

    // Follow pagination
    url = data.links?.next || null;
  }

  return allCampaigns;
}

// Campaign values report
async function fetchCampaignReport(
  apiKey: string,
  conversionMetricId: string,
  timeframe: string
): Promise<Record<string, any>> {
  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers: makePostHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: [
            'opens', 'clicks', 'delivered', 'recipients',
            'open_rate', 'click_rate', 'conversion_value',
            'conversion_rate', 'conversion_uniques',
          ],
          timeframe: { key: timeframe },
          conversion_metric_id: conversionMetricId,
        },
      },
    }),
  });
  if (!res.ok) return {};
  const data: any = await res.json();
  const metrics: Record<string, any> = {};
  for (const r of (data.data?.attributes?.results || [])) {
    const campaignId = r.groupings?.campaign_id;
    if (!campaignId) continue;
    const s = r.statistics || {};
    metrics[campaignId] = {
      delivered: s.delivered || 0,
      opens: s.opens || 0,
      clicks: s.clicks || 0,
      revenue: s.conversion_value || 0,
      recipients: s.recipients || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
      conversion_rate: s.conversion_rate || 0,
      conversions: s.conversion_uniques || 0,
    };
  }
  return metrics;
}

// Day names for logging / reference
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface HeatmapCell {
  count: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgRevenue: number;
  avgConversions: number;
  score: number;
}

interface HeatmapAccumulator {
  count: number;
  totalOpenRate: number;
  totalClickRate: number;
  totalRevenue: number;
  totalConversions: number;
}

function buildHeatmap(
  campaigns: any[],
  campaignMetrics: Record<string, any>
): { heatmap: HeatmapCell[][]; totalAnalyzed: number; dateRange: { from: string; to: string } } {
  // Initialize 7x24 accumulator grid (0=Monday .. 6=Sunday, hours 0-23)
  const grid: HeatmapAccumulator[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      count: 0,
      totalOpenRate: 0,
      totalClickRate: 0,
      totalRevenue: 0,
      totalConversions: 0,
    }))
  );

  let totalAnalyzed = 0;
  let minDate = '';
  let maxDate = '';

  for (const campaign of campaigns) {
    if (!campaign.send_time) continue;
    const metrics = campaignMetrics[campaign.id];
    if (!metrics) continue;

    const sendDate = new Date(campaign.send_time);
    if (isNaN(sendDate.getTime())) continue;

    // JavaScript getDay(): 0=Sunday, 1=Monday ... 6=Saturday
    // We want 0=Monday .. 6=Sunday
    const jsDay = sendDate.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Convert: Sun(0)->6, Mon(1)->0, ..., Sat(6)->5
    const hour = sendDate.getUTCHours();

    const cell = grid[dayOfWeek][hour];
    cell.count += 1;
    cell.totalOpenRate += metrics.open_rate || 0;
    cell.totalClickRate += metrics.click_rate || 0;
    cell.totalRevenue += metrics.revenue || 0;
    cell.totalConversions += metrics.conversions || 0;

    totalAnalyzed += 1;

    // Track date range
    const dateStr = campaign.send_time.substring(0, 10);
    if (!minDate || dateStr < minDate) minDate = dateStr;
    if (!maxDate || dateStr > maxDate) maxDate = dateStr;
  }

  // Compute averages
  const averagedGrid: { day: number; hour: number; count: number; avgOpenRate: number; avgClickRate: number; avgRevenue: number; avgConversions: number }[] = [];

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = grid[d][h];
      if (cell.count > 0) {
        averagedGrid.push({
          day: d,
          hour: h,
          count: cell.count,
          avgOpenRate: cell.totalOpenRate / cell.count,
          avgClickRate: cell.totalClickRate / cell.count,
          avgRevenue: cell.totalRevenue / cell.count,
          avgConversions: cell.totalConversions / cell.count,
        });
      }
    }
  }

  // Compute composite score: weighted combination of normalized metrics
  // Normalize each metric to 0-100 across all cells that have data
  const maxOpenRate = Math.max(...averagedGrid.map(c => c.avgOpenRate), 0.001);
  const maxClickRate = Math.max(...averagedGrid.map(c => c.avgClickRate), 0.001);
  const maxRevenue = Math.max(...averagedGrid.map(c => c.avgRevenue), 0.001);
  const maxConversions = Math.max(...averagedGrid.map(c => c.avgConversions), 0.001);

  // Score = 30% open_rate + 30% click_rate + 25% revenue + 15% conversions (all normalized 0-100)
  const scoredCells: Map<string, number> = new Map();
  for (const cell of averagedGrid) {
    const normOpen = (cell.avgOpenRate / maxOpenRate) * 100;
    const normClick = (cell.avgClickRate / maxClickRate) * 100;
    const normRevenue = (cell.avgRevenue / maxRevenue) * 100;
    const normConversions = (cell.avgConversions / maxConversions) * 100;
    const score = normOpen * 0.30 + normClick * 0.30 + normRevenue * 0.25 + normConversions * 0.15;
    scoredCells.set(`${cell.day}-${cell.hour}`, Math.round(score * 100) / 100);
  }

  // Build final 7x24 heatmap
  const heatmap: HeatmapCell[][] = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      const cell = grid[d][h];
      const score = scoredCells.get(`${d}-${h}`) || 0;
      if (cell.count === 0) {
        return { count: 0, avgOpenRate: 0, avgClickRate: 0, avgRevenue: 0, avgConversions: 0, score: 0 };
      }
      return {
        count: cell.count,
        avgOpenRate: Math.round((cell.totalOpenRate / cell.count) * 10000) / 10000,
        avgClickRate: Math.round((cell.totalClickRate / cell.count) * 10000) / 10000,
        avgRevenue: Math.round((cell.totalRevenue / cell.count) * 100) / 100,
        avgConversions: Math.round((cell.totalConversions / cell.count) * 100) / 100,
        score,
      };
    })
  );

  return {
    heatmap,
    totalAnalyzed,
    dateRange: { from: minDate || 'N/A', to: maxDate || 'N/A' },
  };
}

function getTopSlots(heatmap: HeatmapCell[][], count: number, best: boolean): { day: number; hour: number; score: number }[] {
  const allCells: { day: number; hour: number; score: number }[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heatmap[d][h].count > 0) {
        allCells.push({ day: d, hour: h, score: heatmap[d][h].score });
      }
    }
  }
  allCells.sort((a, b) => best ? b.score - a.score : a.score - b.score);
  return allCells.slice(0, count);
}

async function getClaudeInsights(
  heatmap: HeatmapCell[][],
  bestSlots: { day: number; hour: number; score: number }[],
  worstSlots: { day: number; hour: number; score: number }[],
  totalAnalyzed: number,
  dateRange: { from: string; to: string },
  briefContext?: string
): Promise<{ insights: any[]; bestSlots: any[]; worstSlots: any[] } | null> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[send-time-analysis] ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Build a summary of the heatmap for Claude (only cells with data)
  const heatmapSummary: any[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = heatmap[d][h];
      if (cell.count > 0) {
        heatmapSummary.push({
          day: d,
          dayName: DAY_NAMES[d],
          hour: h,
          hourLabel: `${h.toString().padStart(2, '0')}:00`,
          count: cell.count,
          avgOpenRate: cell.avgOpenRate,
          avgClickRate: cell.avgClickRate,
          avgRevenue: cell.avgRevenue,
          avgConversions: cell.avgConversions,
          score: cell.score,
        });
      }
    }
  }

  const systemPrompt = `Eres Steve, un experto en email marketing. Analiza los datos de rendimiento de envío por hora y día de la semana y proporciona insights accionables en español.
${briefContext || ''}
IMPORTANTE:
- Los días van de 0 (Lunes) a 6 (Domingo)
- Las horas son en formato 24h (UTC)
- El score es una puntuación compuesta (0-100) basada en open_rate, click_rate, revenue y conversions
- Solo analiza las celdas que tienen datos (count > 0)
- Sé específico con días y horas
- Si tienes contexto de la industria/audiencia del cliente, personaliza las recomendaciones (ej: horarios de almuerzo para oficinistas, noches para millennials, etc.)
- Responde SOLO con JSON válido, sin markdown ni texto adicional`;

  const userMessage = `Analiza estos datos de rendimiento de envío de campañas de email:

DATOS DEL HEATMAP (solo celdas con envíos):
${JSON.stringify(heatmapSummary, null, 2)}

TOP 5 MEJORES HORARIOS:
${JSON.stringify(bestSlots.map(s => ({ ...s, dayName: DAY_NAMES[s.day], hourLabel: `${s.hour.toString().padStart(2, '0')}:00` })), null, 2)}

TOP 5 PEORES HORARIOS:
${JSON.stringify(worstSlots.map(s => ({ ...s, dayName: DAY_NAMES[s.day], hourLabel: `${s.hour.toString().padStart(2, '0')}:00` })), null, 2)}

Total de campañas analizadas: ${totalAnalyzed}
Rango de fechas: ${dateRange.from} a ${dateRange.to}

Basándote en estos datos:
1. Identifica las mejores combinaciones de día+hora para enviar
2. Identifica los peores momentos que se deben evitar
3. Nota cualquier patrón interesante (ej: mañanas vs tardes, entre semana vs fin de semana)
4. Da 4-6 recomendaciones específicas y accionables

Responde UNICAMENTE con este JSON (sin markdown, sin backticks):
{
  "insights": [
    { "type": "success|warning|info", "title": "string corto", "message": "string descriptivo" }
  ],
  "bestSlots": [
    { "day": number, "hour": number, "score": number }
  ],
  "worstSlots": [
    { "day": number, "hour": number, "score": number }
  ]
}

Reglas para insights:
- type "success" para los mejores hallazgos y recomendaciones positivas
- type "warning" para horarios a evitar o patrones negativos
- type "info" para patrones interesantes y contexto
- Genera entre 4 y 6 insights
- bestSlots y worstSlots deben tener hasta 5 elementos cada uno, ordenados por score`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[send-time-analysis] Claude API error:', response.status, text);
      return null;
    }

    const data: any = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Parse JSON from response, handling potential markdown wrapping
    let jsonText = rawText.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText);
    return {
      insights: parsed.insights || [],
      bestSlots: parsed.bestSlots || bestSlots,
      worstSlots: parsed.worstSlots || worstSlots,
    };
  } catch (error: any) {
    console.error('[send-time-analysis] Claude insights error:', error.message);
    return null;
  }
}

export async function steveSendTimeAnalysis(c: Context) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const serviceClient = getSupabaseAdmin();

  // === PARSE BODY ===
  const body = await c.req.json();
  const { connectionId, timeframe = 'last_365_days' } = body;
  if (!connectionId) {
    return c.json({ error: 'connectionId required' }, 400);
  }

  // === VERIFY CONNECTION OWNERSHIP ===
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

  // === LOAD BRIEF CONTEXT FOR PERSONALIZED INSIGHTS ===
  const clientId = connection.client_id;
  let briefContext = '';
  if (clientId) {
    const { data: personaData } = await serviceClient
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle();

    if (personaData?.is_complete && personaData?.persona_data) {
      const pd = personaData.persona_data as any;
      const industry = pd.industria || pd.industry || pd.sector || pd.rubro || '';
      const audience = pd.audiencia || pd.target_audience || pd.buyer_persona_nombre || '';
      const ageRange = pd.rango_etario || pd.age_range || '';
      const occupation = pd.ocupacion || pd.occupation || '';
      const location = pd.ubicacion || pd.location || pd.zona_horaria || '';

      if (industry || audience || ageRange || occupation || location) {
        briefContext = `\nCONTEXTO DEL NEGOCIO:`;
        if (industry) briefContext += `\n- Industria/Sector: ${industry}`;
        if (audience) briefContext += `\n- Audiencia objetivo: ${audience}`;
        if (ageRange) briefContext += `\n- Rango etario: ${ageRange}`;
        if (occupation) briefContext += `\n- Ocupacion tipica: ${occupation}`;
        if (location) briefContext += `\n- Ubicacion/Zona horaria: ${location}`;
        briefContext += `\n\nUsa este contexto para personalizar tus recomendaciones de horarios de envio.`;
      }
    }
  }

  // === DECRYPT API KEY ===
  const { data: apiKey, error: decryptError } = await serviceClient
    .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

  if (decryptError || !apiKey) {
    return c.json({ error: 'Token decryption failed' }, 500);
  }

  console.log('[send-time-analysis] Starting analysis...');
  const t0 = Date.now();

  // === STEP 1 & 3: Fetch campaigns and conversion metric in parallel ===
  const [allCampaigns, conversionMetricId] = await Promise.all([
    fetchAllCampaigns(apiKey),
    findConversionMetricId(apiKey),
  ]);

  console.log(`[send-time-analysis] Fetched ${allCampaigns.length} campaigns, conversionMetricId: ${conversionMetricId}`);

  // Filter to only campaigns with send_time
  const sentCampaigns = allCampaigns.filter(c => c.send_time);

  // Check minimum data threshold
  if (sentCampaigns.length < 5) {
    return c.json({
      error: 'not_enough_data',
      message: 'Se necesitan al menos 5 campañas enviadas para generar un análisis de horarios de envío. Actualmente hay ' + sentCampaigns.length + ' campaña(s) enviada(s).',
    });
  }

  // === STEP 2: Fetch campaign metrics report ===
  let campaignMetrics: Record<string, any> = {};
  if (conversionMetricId) {
    campaignMetrics = await fetchCampaignReport(apiKey, conversionMetricId, timeframe);
  }

  console.log(`[send-time-analysis] Got metrics for ${Object.keys(campaignMetrics).length} campaigns`);

  // === STEP 4: Build heatmap ===
  const { heatmap, totalAnalyzed, dateRange } = buildHeatmap(sentCampaigns, campaignMetrics);

  if (totalAnalyzed < 5) {
    return c.json({
      error: 'not_enough_data',
      message: 'Se necesitan al menos 5 campañas con métricas disponibles para generar el análisis. Solo se encontraron ' + totalAnalyzed + ' campaña(s) con datos de rendimiento.',
    });
  }

  // Get top/bottom slots
  const bestSlots = getTopSlots(heatmap, 5, true);
  const worstSlots = getTopSlots(heatmap, 5, false);

  console.log(`[send-time-analysis] Heatmap built. ${totalAnalyzed} campaigns analyzed. Requesting Claude insights...`);

  // === STEP 5: Get Claude insights ===
  const claudeResult = await getClaudeInsights(heatmap, bestSlots, worstSlots, totalAnalyzed, dateRange, briefContext);

  const elapsed = Date.now() - t0;
  console.log(`[send-time-analysis] DONE in ${elapsed}ms`);

  // === BUILD RESPONSE ===
  const responseData: any = {
    heatmap,
    totalCampaignsAnalyzed: totalAnalyzed,
    dateRange,
    bestSlots: claudeResult?.bestSlots || bestSlots,
    worstSlots: claudeResult?.worstSlots || worstSlots,
  };

  // Include insights if Claude succeeded, otherwise omit
  if (claudeResult?.insights && claudeResult.insights.length > 0) {
    responseData.insights = claudeResult.insights;
  } else {
    responseData.insights = [];
  }

  return c.json(responseData);
}
