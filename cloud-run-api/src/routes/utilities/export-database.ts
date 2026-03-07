import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const EXPORT_KEY = process.env.EXPORT_SECRET_KEY || '';

const TABLES = [
  'clients', 'user_roles', 'buyer_personas', 'platform_connections',
  'client_credits', 'client_financial_config', 'brand_research',
  'ad_creatives', 'ad_assets', 'ad_references', 'saved_meta_copies',
  'saved_google_copies', 'email_templates', 'email_campaigns',
  'klaviyo_email_plans', 'campaign_metrics', 'platform_metrics',
  'competitor_tracking', 'competitor_ads', 'steve_conversations',
  'steve_messages', 'steve_feedback', 'steve_training_examples',
  'steve_training_feedback', 'steve_knowledge', 'steve_bugs',
  'learning_queue', 'client_assets', 'credit_transactions',
  'time_entries', 'invoices', 'blog_posts', 'study_resources',
  'subscription_plans', 'user_subscriptions', 'oauth_states',
  'campaign_recommendations',
];

export async function exportDatabase(c: Context) {
  const exportKey = c.req.header('x-export-key');
  if (!EXPORT_KEY || exportKey !== EXPORT_KEY) {
    return c.json({ error: 'Forbidden: invalid export key' }, 403);
  }

  const supabase = getSupabaseAdmin();
  const dump: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    let allRows: unknown[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error(`Error fetching ${table}:`, error.message);
        dump[table] = { error: error.message } as any;
        break;
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    if (!dump[table] || !('error' in (dump[table] as any))) {
      dump[table] = allRows;
    }
  }

  const meta = {
    exported_at: new Date().toISOString(),
    tables_count: TABLES.length,
    row_counts: Object.fromEntries(
      Object.entries(dump).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'error'])
    ),
  };

  return new Response(JSON.stringify({ meta, data: dump }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="steve-ads-full-export.json"',
    },
  });
}
