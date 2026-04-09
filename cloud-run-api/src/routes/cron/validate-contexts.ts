import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * Validate Context Files — checks that agent context files match reality
 * Runs every 12 hours: 0 6,18 * * *
 * Auth: X-Cron-Secret header
 *
 * Checks:
 * 1. Tables in Supabase not assigned to any agent → flags in _unassigned task
 * 2. Cron jobs in Cloud Scheduler not mentioned in context files
 * 3. Creates a task if discrepancies are found
 *
 * Known agent table assignments (source of truth: agents/contexts/*.md)
 */

// Tables assigned to agents — extracted from context files
const ASSIGNED_TABLES: Record<string, string[]> = {
  'diego-w8': ['clients', 'user_roles', 'platform_connections', 'tasks', 'agent_sessions', 'backlog', 'steve_sources', 'swarm_sources'],
  'felipe-w2': ['meta_campaigns', 'campaign_metrics', 'adset_metrics', 'ad_creatives', 'ad_assets', 'ad_references', 'meta_automated_rules', 'meta_rule_execution_log'],
  'rodrigo-w0': ['email_campaigns', 'email_send_queue', 'email_events', 'email_templates', 'klaviyo_email_plans'],
  'valentina-w1': ['email_subscribers', 'email_lists', 'email_list_members', 'email_flows', 'email_flow_enrollments', 'email_ab_tests', 'email_domains', 'email_forms', 'email_send_settings', 'email_universal_blocks', 'saved_meta_copies', 'saved_google_copies'],
  'andres-w3': ['platform_metrics'],
  'camila-w4': ['merchant_onboarding'],
  'sebastian-w5': ['slo_config', 'oauth_states', 'onboarding_jobs', 'instagram_scheduled_posts', 'juez_golden_questions', 'seller_calendars'],
  'isidora-w6': ['criterio_rules', 'criterio_results'],
  'tomas-w7': ['steve_knowledge', 'steve_knowledge_versions', 'steve_conversations', 'steve_messages', 'steve_episodic_memory', 'steve_working_memory', 'steve_feedback', 'steve_training_examples', 'steve_training_feedback', 'steve_ab_tests', 'steve_bugs', 'steve_commitments', 'steve_fix_queue', 'learning_queue', 'swarm_runs', 'auto_learning_digests', 'study_resources'],
  'javiera-w12': ['qa_log', 'chino_reports', 'reconciliation_results'],
  'matias-w13': ['shopify_products', 'shopify_abandoned_checkouts'],
  'ignacio-w17': ['brand_research', 'competitor_ads', 'competitor_tracking', 'campaign_recommendations'],
  'valentin-w18': ['creative_history', 'creative_assets', 'creative_analyses', 'detective_log', 'detective_runs'],
  'paula-w19': ['wa_conversations', 'wa_messages', 'wa_campaigns', 'wa_prospects', 'wa_pending_actions', 'wa_automations', 'wa_credits', 'wa_credit_transactions', 'wa_twilio_accounts', 'wa_case_studies', 'sales_tasks', 'proposals', 'web_forms', 'web_form_submissions'],
};

// Tables known to exist but shared/unowned (no single agent)
const SHARED_TABLES = [
  'client_assets', 'client_credits', 'client_financial_config', 'credit_transactions',
  'merchant_upsell_opportunities', 'subscription_plans', 'user_subscriptions',
  'invoices', 'time_entries', 'buyer_personas', 'campaign_month_plans',
  'blog_posts', 'support_tickets', 'chino_routine',
];

export async function validateContexts(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results: { check: string; status: string; details: string }[] = [];

  // ── 1. Get all public tables from Supabase ──
  const { data: tablesRaw, error: tablesErr } = await supabase
    .rpc('get_public_tables')
    .select('*');

  let realTables: string[] = [];

  if (tablesErr || !tablesRaw) {
    // Fallback: query information_schema
    const fallback = await safeQueryOrDefault<{ table_name: string }>(
      supabase
        .from('information_schema.tables' as any)
        .select('table_name')
        .eq('table_schema', 'public') as any,
      [],
      'validateContexts.fetchInformationSchemaTables',
    );

    if (fallback.length > 0) {
      realTables = fallback.map((r: any) => r.table_name);
    } else {
      results.push({
        check: 'fetch_tables',
        status: 'error',
        details: 'Could not query Supabase tables. RPC get_public_tables not available.',
      });
    }
  } else {
    realTables = Array.isArray(tablesRaw)
      ? tablesRaw.map((r: any) => typeof r === 'string' ? r : r.table_name || r.tablename || '')
      : [];
  }

  // ── 2. Build set of all assigned tables ──
  const allAssigned = new Set<string>();
  for (const tables of Object.values(ASSIGNED_TABLES)) {
    tables.forEach(t => allAssigned.add(t));
  }
  SHARED_TABLES.forEach(t => allAssigned.add(t));

  // ── 3. Find unassigned tables ──
  const unassigned: string[] = [];
  for (const table of realTables) {
    if (!table) continue;
    // Skip system tables
    if (table.startsWith('_') || table.startsWith('pg_') || table === 'schema_migrations') continue;
    if (!allAssigned.has(table)) {
      unassigned.push(table);
    }
  }

  if (unassigned.length > 0) {
    results.push({
      check: 'unassigned_tables',
      status: 'warn',
      details: `${unassigned.length} tables without agent owner: ${unassigned.join(', ')}`,
    });
  } else {
    results.push({
      check: 'unassigned_tables',
      status: 'pass',
      details: `All ${realTables.length} tables have an assigned agent`,
    });
  }

  // ── 4. Find tables in context but not in Supabase ──
  if (realTables.length > 0) {
    const realSet = new Set(realTables);
    const ghost: string[] = [];
    for (const [agent, tables] of Object.entries(ASSIGNED_TABLES)) {
      for (const t of tables) {
        if (!realSet.has(t)) {
          ghost.push(`${t} (${agent})`);
        }
      }
    }

    if (ghost.length > 0) {
      results.push({
        check: 'ghost_tables',
        status: 'warn',
        details: `${ghost.length} tables in context files but NOT in Supabase: ${ghost.join(', ')}`,
      });
    } else {
      results.push({
        check: 'ghost_tables',
        status: 'pass',
        details: 'All context file tables exist in Supabase',
      });
    }
  }

  // ── 5. Create task if there are issues ──
  const hasIssues = results.some(r => r.status === 'warn' || r.status === 'error');

  if (hasIssues && unassigned.length > 0) {
    const { error: taskErr } = await supabase.from('tasks').insert({
      title: `Context files desactualizados — ${unassigned.length} tablas sin asignar`,
      description: `validate-contexts encontró tablas sin dueño: ${unassigned.join(', ')}. Revisar agents/state/_unassigned.md`,
      severity: 'medium',
      status: 'pending',
      agent_code: 'system',
    });

    if (taskErr) {
      results.push({
        check: 'create_task',
        status: 'error',
        details: `Failed to create task: ${taskErr.message}`,
      });
    }
  }

  // ── 6. Log to qa_log ──
  await supabase.from('qa_log').insert({
    check_type: 'context_validation',
    status: hasIssues ? 'fail' : 'pass',
    message: JSON.stringify(results),
  });

  return c.json({
    ok: !hasIssues,
    tables_in_supabase: realTables.length,
    tables_assigned: allAssigned.size,
    unassigned_tables: unassigned,
    results,
  });
}
