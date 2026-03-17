import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Squad assignment por endpoint ──
function getSquadForEndpoint(name: string): string {
  if (name.match(/meta|campaign|audience|pixel|social-inbox|competitor/)) return 'marketing';
  if (name.match(/klaviyo|email|flow/)) return 'marketing';
  if (name.match(/steve-chat|steve-strategy|generate-copy|analyze-brand/)) return 'producto';
  if (name.match(/cloud-run|shopify-session|oauth/)) return 'infra';
  if (name.match(/shopify|google/)) return 'marketing';
  return 'producto';
}

// ── Task creation with deduplication (mirrors src/lib/task-creator.ts) ──
async function createHealthTask(
  supabase: any,
  endpoint: string,
  isSlow: boolean,
  details: { status: number; time_ms: number; error: string | null }
) {
  const title = isSlow
    ? `Endpoint lento: ${endpoint} (${details.time_ms}ms)`
    : `Endpoint caído: ${endpoint}`;

  // Dedup: don't create if pending/in_progress task with same title exists
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('title', title)
    .in('status', ['pending', 'in_progress'])
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[health-check] Task already exists for "${title}", skipping`);
    return { created: false, reason: 'duplicate' };
  }

  const squad = getSquadForEndpoint(endpoint);
  const description = isSlow
    ? `OJOS detectó que el endpoint "${endpoint}" respondió en ${details.time_ms}ms (límite: 3000ms). HTTP ${details.status}.`
    : `OJOS detectó que el endpoint "${endpoint}" está caído. HTTP ${details.status}. Error: ${details.error || 'N/A'}.`;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      priority: isSlow ? 'high' : 'critical',
      type: 'fix',
      source: 'ojos',
      assigned_squad: squad,
      status: 'pending',
      attempts: 0,
      spec: {
        endpoint,
        http_status: details.status,
        time_ms: details.time_ms,
        error: details.error,
        detected_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) {
    console.error(`[health-check] Failed to create task for ${endpoint}:`, error.message);
    return { created: false, reason: error.message };
  }

  console.log(`[health-check] Task created: ${title} → squad=${squad}`);
  return { created: true, task_id: data.id };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const CLOUD_RUN_URL = Deno.env.get('CLOUD_RUN_URL') || 'https://steve-api-ixfpqrtuiq-uc.a.run.app'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Endpoints críticos: Supabase Edge Functions + Cloud Run API
    const endpoints = [
      { name: 'steve-chat', url: `${SUPABASE_URL}/functions/v1/steve-chat`, method: 'POST', body: { message: 'ping', shop_id: 'health-check' } },
      { name: 'fetch-shopify-products', url: `${SUPABASE_URL}/functions/v1/fetch-shopify-products`, method: 'POST', body: { shop_id: 'health-check' } },
      { name: 'fetch-shopify-analytics', url: `${SUPABASE_URL}/functions/v1/fetch-shopify-analytics`, method: 'POST', body: { shop_id: 'health-check' } },
      { name: 'sync-shopify-metrics', url: `${SUPABASE_URL}/functions/v1/sync-shopify-metrics`, method: 'POST', body: {} },
      { name: 'generate-mass-campaigns', url: `${SUPABASE_URL}/functions/v1/generate-mass-campaigns`, method: 'POST', body: {} },
      { name: 'klaviyo-push-emails', url: `${SUPABASE_URL}/functions/v1/klaviyo-push-emails`, method: 'POST', body: {} },
      { name: 'meta-oauth-callback', url: `${SUPABASE_URL}/functions/v1/meta-oauth-callback`, method: 'GET' },
      { name: 'evaluate-rules', url: `${SUPABASE_URL}/functions/v1/evaluate-rules`, method: 'POST', body: { get_rules: true, organ: 'OJOS' } },
      { name: 'cloud-run-api', url: `${CLOUD_RUN_URL}/api/steve-chat`, method: 'POST', body: { message: 'ping', shop_id: 'health-check' } },
    ]

    const results = []

    for (const ep of endpoints) {
      const start = Date.now()
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: ep.method === 'POST' ? JSON.stringify(ep.body) : undefined,
          signal: AbortSignal.timeout(5000),
        })

        const time = Date.now() - start
        const ok = res.status < 500 // 4xx puede ser esperado (auth), 5xx es error real

        results.push({
          name: ep.name,
          status: res.status,
          time_ms: time,
          ok,
          error: ok ? null : `HTTP ${res.status}`,
        })
      } catch (e: any) {
        results.push({
          name: ep.name,
          status: 0,
          time_ms: Date.now() - start,
          ok: false,
          error: e.message,
        })
      }
    }

    const failed = results.filter(r => !r.ok)
    const slow = results.filter(r => r.ok && r.time_ms > 3000)

    // Registrar cada resultado en criterio_results
    for (const r of results) {
      await supabase.from('criterio_results').insert({
        rule_id: `HEALTH-${r.name.toUpperCase()}`,
        entity_type: 'endpoint_health',
        entity_id: r.name,
        passed: r.ok && r.time_ms <= 3000,
        actual_value: r.ok ? `${r.status} (${r.time_ms}ms)` : r.error,
        expected_value: 'status < 500, time < 3000ms',
        details: r.ok ? (r.time_ms > 3000 ? `Slow: ${r.time_ms}ms` : null) : r.error,
        evaluated_by: 'ojos',
      })
    }

    // Si hay fallos o endpoints lentos → guardar en qa_log + crear tasks
    if (failed.length > 0 || slow.length > 0) {
      for (const f of [...failed, ...slow]) {
        await supabase.from('qa_log').insert({
          check_type: f.ok ? 'slow_endpoint' : 'endpoint_down',
          status: f.ok ? 'warn' : 'fail',
          details: {
            endpoint: f.name,
            http_status: f.status,
            time_ms: f.time_ms,
            error: f.error,
          },
        })

        // Crear task en tabla tasks para que CEREBRO lo asigne
        await createHealthTask(supabase, f.name, f.ok, {
          status: f.status,
          time_ms: f.time_ms,
          error: f.error,
        })
      }

      // Intentar enviar alerta via send-whatsapp si existe
      if (failed.length > 0) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `OJOS HEALTH: ${failed.length} endpoints caidos:\n` +
                failed.map(f => `- ${f.name}: ${f.error}`).join('\n'),
            }),
            signal: AbortSignal.timeout(5000),
          })
        } catch {
          // send-whatsapp no existe aun, alerta queda solo en qa_log
          console.log('send-whatsapp not available, alert saved to qa_log only')
        }
      }
    }

    const summary = {
      checked_at: new Date().toISOString(),
      total: results.length,
      ok: results.length - failed.length,
      failed: failed.length,
      slow: slow.length,
      endpoints: results,
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('health-check error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
