import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const TABLES = [
  "clients", "user_roles", "buyer_personas", "platform_connections",
  "client_credits", "client_financial_config", "brand_research",
  "ad_creatives", "ad_assets", "ad_references", "saved_meta_copies",
  "saved_google_copies", "email_templates", "email_campaigns",
  "klaviyo_email_plans", "campaign_metrics", "campaign_recommendations",
  "competitor_tracking", "competitor_ads", "client_assets",
  "steve_conversations", "steve_messages", "steve_feedback",
  "steve_knowledge", "steve_bugs", "steve_training_examples",
  "steve_training_feedback", "credit_transactions", "platform_metrics",
  "time_entries", "invoices", "blog_posts", "study_resources",
  "subscription_plans", "user_subscriptions", "learning_queue", "oauth_states",
];

export async function exportAllData(c: Context) {
  const supabase = getSupabaseAdmin();

  // Admin check: require super_admin role
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('is_super_admin')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!userRole?.is_super_admin) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const dump: Record<string, any> = {
    exported_at: new Date().toISOString(),
    project_ref: process.env.SUPABASE_URL,
    tables: {},
  };

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        dump.tables[table] = { error: error.message, count: 0 };
      } else {
        dump.tables[table] = { data, count: data?.length || 0 };
      }
    } catch (e) {
      dump.tables[table] = { error: String(e), count: 0 };
    }
  }

  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      dump.tables["auth_users"] = { error: error.message, count: 0 };
    } else {
      dump.tables["auth_users"] = {
        data: users.map((u) => ({
          id: u.id, email: u.email, raw_user_meta_data: u.user_metadata,
          created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        })),
        count: users.length,
      };
    }
  } catch (e) {
    dump.tables["auth_users"] = { error: String(e), count: 0 };
  }

  dump.summary = {};
  for (const [table, info] of Object.entries(dump.tables)) {
    dump.summary[table] = (info as any).count;
  }

  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename=supabase-dump.json',
    },
  });
}
