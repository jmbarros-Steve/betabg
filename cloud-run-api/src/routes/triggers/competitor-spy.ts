import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Competitor Spy — Fase 5 A.5
 * Scrapes Facebook Ads Library via Apify for Chilean ecommerce ads.
 * Filters long-running ads (>14 days), analyzes patterns with Claude Haiku,
 * and saves insights to steve_knowledge.
 *
 * Cron: 0 6 * * 1 (Mondays 6am Chile / 10am UTC)
 * Auth: X-Cron-Secret header
 */

interface ApifyAd {
  id: string;
  pageId: string;
  pageName: string;
  adCreationTime?: string;
  adDeliveryStartTime?: string;
  adDeliveryStopTime?: string;
  adText?: string;
  linkUrl?: string;
  mediaType?: string;
  impressionsLowerBound?: number;
  impressionsUpperBound?: number;
  spendLowerBound?: number;
  spendUpperBound?: number;
}

interface AdInsight {
  pageName: string;
  daysActive: number;
  adText: string;
  linkUrl: string | null;
}

async function runApifyActor(token: string): Promise<ApifyAd[]> {
  const resp = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-ads-library/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode: 'CL',
        searchQuery: 'ecommerce marketing chile',
        maxItems: 50,
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apify returned ${resp.status}: ${text.substring(0, 300)}`);
  }

  return resp.json() as Promise<ApifyAd[]>;
}

function filterLongRunningAds(ads: ApifyAd[], minDays: number): AdInsight[] {
  const now = Date.now();
  const results: AdInsight[] = [];

  for (const ad of ads) {
    const startDate = ad.adDeliveryStartTime || ad.adCreationTime;
    if (!startDate || !ad.adText) continue;

    const start = new Date(startDate).getTime();
    if (isNaN(start)) continue;

    // If ad has a stop time and it's in the past, skip (no longer running)
    if (ad.adDeliveryStopTime) {
      const stop = new Date(ad.adDeliveryStopTime).getTime();
      if (!isNaN(stop) && stop < now) continue;
    }

    const daysActive = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    if (daysActive < minDays) continue;

    results.push({
      pageName: ad.pageName || 'Unknown',
      daysActive,
      adText: ad.adText.substring(0, 500),
      linkUrl: ad.linkUrl || null,
    });
  }

  // Sort by days active descending (most proven first)
  return results.sort((a, b) => b.daysActive - a.daysActive);
}

async function analyzeWithHaiku(ads: AdInsight[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const adSummary = ads
    .slice(0, 20)
    .map(
      (a, i) =>
        `${i + 1}. "${a.pageName}" — ${a.daysActive} días activo\nTexto: ${a.adText}\nURL: ${a.linkUrl || 'N/A'}`,
    )
    .join('\n\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Eres un analista de publicidad digital especializado en ecommerce chileno.

Analiza estos ${ads.length} anuncios de Facebook que llevan >14 días activos en Chile (señal de que funcionan bien y son rentables):

${adSummary}

Genera un reporte estructurado con:
1. **Patrones de copy ganador**: ¿Qué estructuras, hooks, y CTAs se repiten en los ads exitosos?
2. **Ángulos creativos dominantes**: ¿Qué emociones/triggers usan? (urgencia, FOMO, social proof, dolor, aspiración)
3. **Tendencias de la industria**: ¿Qué productos/servicios están publicitando más agresivamente?
4. **Oportunidades para Steve**: ¿Qué ángulos podemos replicar o mejorar para los clientes de Steve?
5. **Top 3 ads más interesantes**: Explica por qué funcionan y qué podemos aprender.

Sé específico y accionable. El reporte es para media buyers profesionales.`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic returned ${resp.status}: ${text.substring(0, 300)}`);
  }

  const data: any = await resp.json();
  return data?.content?.[0]?.text || '';
}

export async function competitorSpy(c: Context) {
  // Auth: cron secret
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (cronSecret && providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return c.json({ error: 'APIFY_TOKEN not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();

  // Check if already ran this week (avoid duplicate runs)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);

  const { data: lastRun } = await supabase
    .from('qa_log')
    .select('checked_at')
    .eq('check_type', 'competitor_spy')
    .gte('checked_at', weekStart.toISOString())
    .limit(1)
    .maybeSingle();

  if (lastRun) {
    console.log('[competitor-spy] Already ran this week, skipping.');
    return c.json({ status: 'skipped', reason: 'already_ran_this_week' });
  }

  console.log('[competitor-spy] Starting weekly competitor ad scan...');

  try {
    // Step 1: Fetch ads from Apify
    console.log('[competitor-spy] Running Apify facebook-ads-library actor...');
    const rawAds = await runApifyActor(apifyToken);
    console.log(`[competitor-spy] Got ${rawAds.length} raw ads`);

    // Step 2: Filter to long-running ads (>14 days = proven winners)
    const longRunning = filterLongRunningAds(rawAds, 14);
    console.log(`[competitor-spy] ${longRunning.length} ads with >14 days active`);

    if (longRunning.length === 0) {
      await supabase.from('qa_log').insert({
        check_type: 'competitor_spy',
        status: 'warn',
        details: { raw_ads: rawAds.length, filtered: 0, reason: 'no_long_running_ads' },
      });
      return c.json({ status: 'ok', raw_ads: rawAds.length, long_running: 0, insight: 'none' });
    }

    // Step 3: Analyze with Claude Haiku
    console.log('[competitor-spy] Analyzing patterns with Claude Haiku...');
    const analysis = await analyzeWithHaiku(longRunning);

    // Step 4: Save to steve_knowledge
    const titulo = `Espía de competencia — Semana del ${weekStart.toISOString().split('T')[0]}`;

    const { error: insertError } = await supabase.from('steve_knowledge').insert({
      categoria: 'competencia',
      titulo,
      contenido: `${longRunning.length} ads activos >14 días en Chile (de ${rawAds.length} escaneados).\n\n${analysis}`,
      activo: true,
      orden: 0,
    });

    if (insertError) {
      console.error('[competitor-spy] Failed to save insight:', insertError.message);
    }

    // Step 5: Log this run
    await supabase.from('qa_log').insert({
      check_type: 'competitor_spy',
      status: 'pass',
      details: {
        raw_ads: rawAds.length,
        long_running: longRunning.length,
        top_advertisers: [...new Set(longRunning.slice(0, 10).map(a => a.pageName))],
        avg_days_active: Math.round(longRunning.reduce((s, a) => s + a.daysActive, 0) / longRunning.length),
        insight_saved: !insertError,
      },
    });

    console.log(`[competitor-spy] Done. ${longRunning.length} proven ads analyzed, insight saved.`);

    return c.json({
      status: 'ok',
      raw_ads: rawAds.length,
      long_running: longRunning.length,
      top_advertisers: [...new Set(longRunning.slice(0, 5).map(a => a.pageName))],
      insight_saved: !insertError,
    });
  } catch (err: any) {
    console.error('[competitor-spy] Error:', err.message);

    await supabase.from('qa_log').insert({
      check_type: 'competitor_spy',
      status: 'fail',
      details: { error: err.message },
    });

    return c.json({ error: err.message }, 500);
  }
}
