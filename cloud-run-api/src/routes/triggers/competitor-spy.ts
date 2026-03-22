import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Competitor Spy — Fase 5 A.5
 * Scrapes Facebook Ads Library via Apify (apify~facebook-ads-scraper) for Chilean ecommerce ads.
 * Filters long-running ads (>14 days), analyzes patterns with Claude Haiku,
 * and saves insights to steve_knowledge.
 *
 * Cron: 0 6 * * 1 (Mondays 6am Chile / 10am UTC)
 * Auth: X-Cron-Secret header
 */

interface ApifyAd {
  ad_archive_id?: string;
  adArchiveID?: string;
  pageId?: string;
  page_id?: string;
  pageName?: string;
  page_name?: string;
  adText?: string;
  ad_text?: string;
  adTitle?: string;
  adImages?: string[];
  impressionsWithIndex?: { impressions_lower_bound?: number; impressions_upper_bound?: number };
  impressions?: { lower_bound?: number; upper_bound?: number };
  spend?: { lower_bound?: number; upper_bound?: number };
  reachEstimate?: { lower_bound?: number; upper_bound?: number };
  platforms?: string[];
  publisher_platforms?: string[];
  startDate?: string;
  endDate?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  isActive?: boolean;
  ctaText?: string;
  snapshot?: {
    page_name?: string;
    page_id?: string;
    body?: { markup?: { __html: string } };
    cta_text?: string;
    caption?: string;
    link_url?: string;
    cards?: Array<{
      body?: string;
      title?: string;
      link_url?: string;
      cta_text?: string;
    }>;
  };
}

interface AdInsight {
  pageName: string;
  daysActive: number;
  adText: string;
  linkUrl: string | null;
  impressions?: string;
  spend?: string;
}

async function runApifyActor(token: string): Promise<ApifyAd[]> {
  // Use apify~facebook-ads-scraper — official actor with rich metrics
  const queries = [
    'tienda online chile',
    'ofertas ropa chile',
    'ecommerce envio gratis',
  ];
  const urls = queries.map(q =>
    `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&q=${encodeURIComponent(q)}`
  );

  const resp = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        maxAds: 50,
        countryCode: 'CL',
      }),
      signal: AbortSignal.timeout(180_000), // 3 min timeout for cron
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apify returned ${resp.status}: ${text.substring(0, 300)}`);
  }

  const items = (await resp.json()) as any[];
  // Filter valid items — support both old and new field names
  return (items || []).filter(
    (item: any) => (item.ad_archive_id || item.adArchiveID) && (item.snapshot || item.adText || item.ad_text),
  ) as ApifyAd[];
}

function extractAdText(ad: ApifyAd): string {
  // Try direct fields first (new actor format)
  if (ad.adText) return ad.adText;
  if (ad.ad_text) return ad.ad_text;
  // Try body markup (old actor format)
  const bodyHtml = ad.snapshot?.body?.markup?.__html;
  if (bodyHtml) {
    return bodyHtml.replace(/<[^>]*>/g, '').trim();
  }
  // Try first card body
  const firstCard = ad.snapshot?.cards?.[0];
  if (firstCard?.body) return firstCard.body;
  return '';
}

function extractLinkUrl(ad: ApifyAd): string | null {
  const firstCard = ad.snapshot?.cards?.[0];
  return firstCard?.link_url || ad.snapshot?.caption || null;
}

function getStartMs(ad: ApifyAd): number {
  // New format: ISO string
  if (ad.startDate) return new Date(ad.startDate).getTime();
  if (ad.ad_delivery_start_time) return new Date(ad.ad_delivery_start_time).getTime();
  // Old format: unix timestamp (seconds) — check if it looks like seconds vs ms
  return 0;
}

function getEndMs(ad: ApifyAd): number {
  if (ad.endDate) return new Date(ad.endDate).getTime();
  if (ad.ad_delivery_stop_time) return new Date(ad.ad_delivery_stop_time).getTime();
  return 0;
}

function filterLongRunningAds(ads: ApifyAd[], minDays: number): AdInsight[] {
  const now = Date.now();
  const results: AdInsight[] = [];
  const seen = new Set<string>();

  for (const ad of ads) {
    const archiveId = ad.ad_archive_id || ad.adArchiveID || '';
    if (!archiveId || seen.has(archiveId)) continue;
    seen.add(archiveId);

    const adText = extractAdText(ad);
    if (!adText) continue;

    const startMs = getStartMs(ad);
    if (!startMs || isNaN(startMs)) continue;

    // If ad has end date and it's in the past, skip
    const endMs = getEndMs(ad);
    if (endMs > 0 && endMs < now) continue;
    // Also skip if explicitly marked inactive
    if (ad.isActive === false) continue;

    const daysActive = Math.floor((now - startMs) / (1000 * 60 * 60 * 24));
    if (daysActive < minDays) continue;

    // Format metrics for analysis
    const impData = ad.impressionsWithIndex || ad.impressions;
    const impLower = (impData as any)?.impressions_lower_bound ?? (impData as any)?.lower_bound;
    const impUpper = (impData as any)?.impressions_upper_bound ?? (impData as any)?.upper_bound;
    const impressions = impLower && impUpper ? `${impLower.toLocaleString()}-${impUpper.toLocaleString()}` : undefined;

    const spendLower = ad.spend?.lower_bound;
    const spendUpper = ad.spend?.upper_bound;
    const spend = spendLower && spendUpper ? `$${spendLower}-$${spendUpper}` : undefined;

    results.push({
      pageName: ad.pageName || ad.page_name || ad.snapshot?.page_name || 'Unknown',
      daysActive,
      adText: adText.substring(0, 500),
      linkUrl: extractLinkUrl(ad),
      impressions,
      spend,
    });
  }

  return results.sort((a, b) => b.daysActive - a.daysActive);
}

async function analyzeWithHaiku(ads: AdInsight[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const adSummary = ads
    .slice(0, 20)
    .map(
      (a, i) =>
        `${i + 1}. "${a.pageName}" — ${a.daysActive} días activo${a.impressions ? ` | Impresiones: ${a.impressions}` : ''}${a.spend ? ` | Gasto: ${a.spend}` : ''}\nTexto: ${a.adText}\nURL: ${a.linkUrl || 'N/A'}`,
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

  // Check if already ran this week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
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
    console.log('[competitor-spy] Running Apify facebook-ads-scraper actor...');
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
