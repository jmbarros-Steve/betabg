import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CHANGELOG_SOURCES = [
  {
    platform: 'meta',
    name: 'Meta Marketing API Changelog',
    url: 'https://developers.facebook.com/docs/graph-api/changelog',
  },
  {
    platform: 'klaviyo',
    name: 'Klaviyo API Changelog',
    url: 'https://developers.klaviyo.com/en/docs/changelog_',
  },
  {
    platform: 'shopify',
    name: 'Shopify API Changelog',
    url: 'https://shopify.dev/changelog',
  },
];

async function scrapeUrl(url: string): Promise<string | null> {
  if (!FIRECRAWL_API_KEY) {
    console.error('[changelog-watcher] FIRECRAWL_API_KEY not set');
    return null;
  }

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });

    if (!res.ok) {
      console.error(`[changelog-watcher] Firecrawl error for ${url}: ${res.status}`);
      return null;
    }

    const data = await res.json() as { success?: boolean; data?: { markdown?: string } };
    return data.data?.markdown?.substring(0, 15000) || null;
  } catch (err: any) {
    console.error(`[changelog-watcher] Scrape failed for ${url}:`, err.message);
    return null;
  }
}

interface ChangeAnalysis {
  has_breaking_changes: boolean;
  changes: { title: string; impact: string; priority: string; affected_area: string }[];
}

async function analyzeChangelog(platform: string, markdown: string): Promise<ChangeAnalysis> {
  if (!ANTHROPIC_API_KEY) {
    console.error('[changelog-watcher] ANTHROPIC_API_KEY not set');
    return { has_breaking_changes: false, changes: [] };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Eres un ingeniero de software que monitorea cambios en APIs de terceros.
Analiza este changelog de ${platform} y determina si hay cambios recientes (últimos 7 días) que podrían afectar a una plataforma de marketing que usa:
- Meta Marketing API (campañas, ad sets, ads, audiences, pixel, Graph API v21.0)
- Klaviyo API (email campaigns, flows, templates, contacts, metrics)
- Shopify API (products, orders, customers, webhooks, OAuth)

Solo reporta cambios que sean RELEVANTES para estos usos. Ignora cambios cosméticos o de documentación.

Responde SOLO con JSON válido (sin markdown):
{"has_breaking_changes": true/false, "changes": [{"title": "breve descripción", "impact": "qué puede romperse o cambiar", "priority": "critical|high|medium|low", "affected_area": "área afectada en Steve"}]}

Si no hay cambios relevantes recientes, responde: {"has_breaking_changes": false, "changes": []}

Changelog:
${markdown}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[changelog-watcher] Claude API error: ${res.status}`);
    return { has_breaking_changes: false, changes: [] };
  }

  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text || '';

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim()) as ChangeAnalysis;
  } catch {
    console.error('[changelog-watcher] Failed to parse Claude response:', text.substring(0, 200));
    return { has_breaking_changes: false, changes: [] };
  }
}

/**
 * Cron endpoint: API Changelog Watcher
 * Scrapes Meta/Klaviyo/Shopify changelogs daily at 7am,
 * analyzes with Claude Haiku, creates tasks + qa_log entries for relevant changes.
 *
 * Security: validates X-Cron-Secret header.
 */
export async function apiChangelogWatcher(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results: { platform: string; status: string; changes_found: number; error?: string }[] = [];

  for (const source of CHANGELOG_SOURCES) {
    try {
      console.log(`[changelog-watcher] Scraping ${source.platform}: ${source.url}`);
      const markdown = await scrapeUrl(source.url);

      if (!markdown) {
        results.push({ platform: source.platform, status: 'scrape_failed', changes_found: 0 });
        await supabase.from('qa_log').insert({
          check_type: 'changelog-watcher',
          status: 'warn',
          details: { platform: source.platform, error: 'Scrape returned empty' },
        });
        continue;
      }

      console.log(`[changelog-watcher] Analyzing ${source.platform} (${markdown.length} chars)`);
      const analysis = await analyzeChangelog(source.platform, markdown);

      if (analysis.changes.length > 0) {
        // Create a task for each relevant change
        for (const change of analysis.changes) {
          await supabase.from('tasks').insert({
            title: `[${source.platform.toUpperCase()}] ${change.title}`,
            description: `Impact: ${change.impact}\nAffected area: ${change.affected_area}\nSource: ${source.url}`,
            source: 'changelog-watcher',
            platform: source.platform,
            priority: change.priority,
            metadata: { changelog_url: source.url, analysis: change },
          });
        }

        // Log to qa_log
        await supabase.from('qa_log').insert({
          check_type: 'changelog-watcher',
          status: analysis.has_breaking_changes ? 'fail' : 'warn',
          details: {
            platform: source.platform,
            changes_count: analysis.changes.length,
            has_breaking_changes: analysis.has_breaking_changes,
            changes: analysis.changes,
          },
        });

        console.log(`[changelog-watcher] ${source.platform}: ${analysis.changes.length} changes found (breaking: ${analysis.has_breaking_changes})`);
      } else {
        // Log clean check
        await supabase.from('qa_log').insert({
          check_type: 'changelog-watcher',
          status: 'pass',
          details: { platform: source.platform, message: 'No relevant changes' },
        });
        console.log(`[changelog-watcher] ${source.platform}: no relevant changes`);
      }

      results.push({ platform: source.platform, status: 'ok', changes_found: analysis.changes.length });
    } catch (err: any) {
      console.error(`[changelog-watcher] ${source.platform} failed:`, err.message);
      results.push({ platform: source.platform, status: 'error', changes_found: 0, error: err.message });

      await supabase.from('qa_log').insert({
        check_type: 'changelog-watcher',
        status: 'fail',
        details: { platform: source.platform, error: err.message },
      });
    }
  }

  const totalChanges = results.reduce((sum, r) => sum + r.changes_found, 0);
  console.log(`[changelog-watcher] Done: ${totalChanges} total changes across ${results.length} platforms`);

  return c.json({ total_changes: totalChanges, results });
}
