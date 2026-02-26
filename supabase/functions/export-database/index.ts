import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-export-key',
}

const EXPORT_KEY = 'steve-export-2026'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const exportKey = req.headers.get('x-export-key')
    if (exportKey !== EXPORT_KEY) {
      return new Response(JSON.stringify({ error: 'Forbidden: invalid export key' }), { status: 403, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const tables = [
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
    ]

    const dump: Record<string, unknown[]> = {}

    for (const table of tables) {
      let allRows: unknown[] = []
      let offset = 0
      const pageSize = 1000

      while (true) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .range(offset, offset + pageSize - 1)

        if (error) {
          console.error(`Error fetching ${table}:`, error.message)
          dump[table] = { error: error.message } as any
          break
        }

        if (!data || data.length === 0) break
        allRows = allRows.concat(data)
        if (data.length < pageSize) break
        offset += pageSize
      }

      if (!dump[table] || !('error' in (dump[table] as any))) {
        dump[table] = allRows
      }
    }

    const meta = {
      exported_at: new Date().toISOString(),
      tables_count: tables.length,
      row_counts: Object.fromEntries(
        Object.entries(dump).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'error'])
      ),
    }

    const result = { meta, data: dump }

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="steve-ads-full-export.json"',
      },
    })
  } catch (err) {
    console.error('Export error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
