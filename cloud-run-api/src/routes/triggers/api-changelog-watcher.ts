import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Changelog Watcher — Fase 5 A.4
 * Scrapes Meta, Klaviyo, and Shopify changelogs daily via Apify.
 * If breaking changes are detected, creates a task in the tasks table.
 *
 * Cron: 0 7 * * * (daily at 7am UTC)
 * Auth: X-Cron-Secret header
 */

const CHANGELOG_SOURCES = [
  {
    platform: 'meta',
    name: 'Meta Graph API Changelog',
    url: 'https://developers.facebook.com/docs/graph-api/changelog',
    keywords: [
      'deprecat', 'breaking', 'removed', 'sunset', 'migration required',
      'v21.0', 'v22.0', 'ads_management', 'ads_read', 'pages_read',
      'campaign', 'adset', 'creative', 'insights', 'business_management',
    ],
  },
  {
    platform: 'klaviyo',
    name: 'Klaviyo API Changelog',
    url: 'https://developers.klaviyo.com/en/docs/changelog_',
    keywords: [
      'deprecat', 'breaking', 'removed', 'sunset', 'migration',
      'campaign', 'flow', 'template', 'profile', 'metric', 'segment',
      'revision', '2024-10-15', '2025',
    ],
  },
  {
    platform: 'shopify',
    name: 'Shopify API Changelog',
    url: 'https://shopify.dev/docs/api/release-notes',
    keywords: [
      'deprecat', 'breaking', 'removed', 'sunset', 'migration',
      'admin api', 'graphql', 'rest', 'webhook', 'order', 'product',
      'fulfillment', 'discount', '2024-10', '2025',
    ],
  },
];

interface ChangelogEntry {
  platform: string;
  title: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

async function scrapeChangelog(url: string): Promise<string> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.error('[changelog-watcher] APIFY_TOKEN not configured');
    return '';
  }

  try {
    // Run website-content-crawler actor synchronously
    const resp = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxCrawlPages: 1,
          outputFormats: ['markdown'],
        }),
      }
    );

    if (!resp.ok) {
      console.error(`[changelog-watcher] Apify error for ${url}: ${resp.status}`);
      return '';
    }

    const items = (await resp.json()) as any;

    return items?.[0]?.text || items?.[0]?.markdown || '';
  } catch (e) {
    console.error(`[changelog-watcher] Scrape failed for ${url}:`, e);
    return '';
  }
}

function analyzeChangelog(
  markdown: string,
  keywords: string[],
  platform: string
): ChangelogEntry[] {
  if (!markdown) return [];

  const entries: ChangelogEntry[] = [];
  // Split by headers (## or ###)
  const sections = markdown.split(/(?=^#{2,3}\s)/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0]?.replace(/^#+\s*/, '').trim() || '';
    const body = lines.slice(1).join('\n').toLowerCase();
    const fullText = (title + ' ' + body).toLowerCase();

    const matched = keywords.filter(kw => fullText.includes(kw.toLowerCase()));
    if (matched.length === 0) continue;

    // Determine severity
    const isBreaking = matched.some(k =>
      ['breaking', 'removed', 'sunset', 'migration required'].includes(k)
    );
    const isDeprecation = matched.some(k => k.includes('deprecat'));

    let severity: ChangelogEntry['severity'] = 'low';
    if (isBreaking) severity = 'critical';
    else if (isDeprecation) severity = 'high';
    else if (matched.length >= 3) severity = 'medium';

    entries.push({
      platform,
      title: title.substring(0, 200),
      summary: body.substring(0, 500).trim(),
      severity,
      matchedKeywords: matched,
    });
  }

  return entries;
}

export async function apiChangelogWatcher(c: Context) {
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
  const allEntries: ChangelogEntry[] = [];
  const errors: string[] = [];

  console.log('[changelog-watcher] Starting daily changelog scan...');

  // Check last run to avoid duplicate alerts
  const { data: lastRun } = await supabase
    .from('qa_log')
    .select('checked_at')
    .eq('check_type', 'changelog_watcher')
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRunDate = lastRun?.checked_at
    ? new Date(lastRun.checked_at).toISOString().split('T')[0]
    : null;
  const today = new Date().toISOString().split('T')[0];

  if (lastRunDate === today) {
    console.log('[changelog-watcher] Already ran today, skipping.');
    return c.json({ status: 'skipped', reason: 'already_ran_today' });
  }

  // Scrape all changelogs
  for (const source of CHANGELOG_SOURCES) {
    console.log(`[changelog-watcher] Scraping ${source.name}...`);
    const markdown = await scrapeChangelog(source.url);

    if (!markdown) {
      errors.push(`Failed to scrape ${source.platform}`);
      continue;
    }

    const entries = analyzeChangelog(markdown, source.keywords, source.platform);
    allEntries.push(...entries);
    console.log(`[changelog-watcher] ${source.platform}: ${entries.length} relevant entries found`);
  }

  // Filter to critical/high entries that need tasks
  const actionable = allEntries.filter(e => e.severity === 'critical' || e.severity === 'high');
  let tasksCreated = 0;

  for (const entry of actionable) {
    // Check if a similar task already exists (avoid duplicates)
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('type', 'fix')
      .eq('source', 'ojos')
      .ilike('title', `%${entry.platform}%changelog%`)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    const squadMap: Record<string, string> = {
      meta: 'meta',
      klaviyo: 'email',
      shopify: 'analytics',
    };

    const { error: insertError } = await supabase.from('tasks').insert({
      title: `[${entry.platform.toUpperCase()}] Changelog: ${entry.title}`.substring(0, 200),
      description: `Cambio detectado en ${entry.platform} changelog que podría afectar a Steve.\n\nSeveridad: ${entry.severity}\nKeywords: ${entry.matchedKeywords.join(', ')}\n\nResumen:\n${entry.summary}`,
      priority: entry.severity === 'critical' ? 'critical' : 'high',
      type: 'fix',
      source: 'ojos',
      assigned_squad: squadMap[entry.platform] || 'analytics',
      status: 'pending',
      spec: {
        changelog_platform: entry.platform,
        matched_keywords: entry.matchedKeywords,
        severity: entry.severity,
        detected_at: new Date().toISOString(),
      },
    });

    if (insertError) {
      console.error('[changelog-watcher] Failed to create task:', insertError.message);
    } else {
      tasksCreated++;
    }
  }

  // Log this run
  await supabase.from('qa_log').insert({
    check_type: 'changelog_watcher',
    status: errors.length > 0 ? 'warn' : 'pass',
    details: {
      platforms_scraped: CHANGELOG_SOURCES.length - errors.length,
      total_entries: allEntries.length,
      actionable_entries: actionable.length,
      tasks_created: tasksCreated,
      errors,
      entries_by_platform: {
        meta: allEntries.filter(e => e.platform === 'meta').length,
        klaviyo: allEntries.filter(e => e.platform === 'klaviyo').length,
        shopify: allEntries.filter(e => e.platform === 'shopify').length,
      },
    },
  });

  console.log(`[changelog-watcher] Done. ${allEntries.length} entries, ${tasksCreated} tasks created.`);

  return c.json({
    status: 'ok',
    platforms_scraped: CHANGELOG_SOURCES.length - errors.length,
    total_entries: allEntries.length,
    actionable: actionable.length,
    tasks_created: tasksCreated,
    errors,
  });
}
