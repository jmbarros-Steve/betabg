import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

// One-time setup function: creates criterio_rules and criterio_results tables
// Call once with ?secret=setup_criterio_2026

serve(async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('secret') !== 'setup_criterio_2026') {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: string[] = []

  // Use raw SQL via postgres
  const { error: e1 } = await supabase.rpc('exec_ddl', {
    sql: `
      CREATE TABLE IF NOT EXISTS criterio_rules (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        check_rule TEXT NOT NULL,
        pass_example TEXT,
        fail_example TEXT,
        on_fail TEXT NOT NULL,
        severity TEXT NOT NULL,
        weight INTEGER DEFAULT 1,
        auto BOOLEAN DEFAULT true,
        organ TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_criterio_organ ON criterio_rules(organ) WHERE active = true;
      CREATE INDEX IF NOT EXISTS idx_criterio_category ON criterio_rules(category) WHERE active = true;
      ALTER TABLE criterio_rules ENABLE ROW LEVEL SECURITY;
      
      CREATE TABLE IF NOT EXISTS criterio_results (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        rule_id TEXT,
        shop_id UUID,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        passed BOOLEAN NOT NULL,
        actual_value TEXT,
        expected_value TEXT,
        details TEXT,
        evaluated_at TIMESTAMPTZ DEFAULT now(),
        evaluated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_results_shop ON criterio_results(shop_id, evaluated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_results_failed ON criterio_results(passed) WHERE passed = false;
      ALTER TABLE criterio_results ENABLE ROW LEVEL SECURITY;
    `
  })

  if (e1) results.push(`DDL error: ${e1.message}`)
  else results.push('Tables created ✅')

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
