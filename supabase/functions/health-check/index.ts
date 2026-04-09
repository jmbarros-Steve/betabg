import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Squad assignment por endpoint ──
// Reviewed-By: Isidora W6 (2026-04-07) — fix de misclasificación detectada por Javiera W12
// IMPORTANTE: producto va ANTES de marketing porque endpoints como `steve-email-content`
// contienen `email` y `generate-meta-copy` contiene `meta`. Sin esto, marketing los captura primero.
function getSquadForEndpoint(name: string): string {
  // Ventas: WhatsApp + CRM + prospección
  if (name.match(/whatsapp|wa-|twilio|crm|prospect|sales|web-form/)) return 'ventas';
  // Producto PRIMERO (anclado con ^ para precisión): Steve AI/Brain
  if (name.match(/^steve-chat|^steve-strategy|^steve-email-content|^steve-bulk-analyze|^analyze-brand|^generate-meta-copy|^generate-copy|^generate-google-copy|^generate-image|^criterio-meta|^espejo|^train-steve|^approve-knowledge|^submit-correction|^manage-sources|^creative-preview/)) return 'producto';
  // Marketing: Meta + Google + Shopify + Klaviyo + Email/Steve Mail + Instagram/Facebook
  if (name.match(/meta|campaign|audience|pixel|social-inbox|competitor|targeting/)) return 'marketing';
  if (name.match(/klaviyo|email|flow|mail-|steve-mail|manage-email|query-email|send-test|verify-domain|email-templates/)) return 'marketing';
  if (name.match(/shopify|google|instagram|facebook|publish-|discount/)) return 'marketing';
  // Infra: cloud-run root, oauth, sesiones, frontend
  if (name.match(/cloud-run|shopify-session|oauth|^frontend$/)) return 'infra';
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
    const CLOUD_RUN_URL = Deno.env.get('CLOUD_RUN_URL') || 'https://steve-api-850416724643.us-central1.run.app'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Endpoints críticos: Cloud Run API (activo) + frontend
    // NOTA: Las Edge Functions de Supabase son dead code — todo el tráfico real va por Cloud Run
    // Cobertura ampliada Javiera W12 (2026-04-07): 11 → 36 endpoints (14% → >50% de los 69 críticos)
    // Cobertura ampliada OJOS Fase 2 (2026-04-09): 36 → 60 endpoints (~25% de 235 total)
    // Reviewed-By: Isidora W6
    // Filosofía: status < 500 es OK (401 del middleware es esperado, 5xx es real)
    const endpoints = [
      // ─── Core AI / Steve ────────────────────────────────────────
      { name: 'steve-chat', url: `${CLOUD_RUN_URL}/api/steve-chat`, method: 'POST', body: { message: 'ping', client_id: 'health-check' } },
      { name: 'steve-strategy', url: `${CLOUD_RUN_URL}/api/steve-strategy`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'steve-email-content', url: `${CLOUD_RUN_URL}/api/steve-email-content`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'analyze-brand', url: `${CLOUD_RUN_URL}/api/analyze-brand`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'generate-meta-copy', url: `${CLOUD_RUN_URL}/api/generate-meta-copy`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'steve-bulk-analyze', url: `${CLOUD_RUN_URL}/api/steve-bulk-analyze`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'criterio-meta', url: `${CLOUD_RUN_URL}/api/criterio-meta`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'espejo', url: `${CLOUD_RUN_URL}/api/espejo`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'generate-image', url: `${CLOUD_RUN_URL}/api/generate-image`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'analyze-brand-research', url: `${CLOUD_RUN_URL}/api/analyze-brand-research`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'creative-preview', url: `${CLOUD_RUN_URL}/api/creative-preview`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Shopify ────────────────────────────────────────────────
      { name: 'fetch-shopify-analytics', url: `${CLOUD_RUN_URL}/api/fetch-shopify-analytics`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-shopify-products', url: `${CLOUD_RUN_URL}/api/fetch-shopify-products`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-shopify-collections', url: `${CLOUD_RUN_URL}/api/fetch-shopify-collections`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-shopify-customers', url: `${CLOUD_RUN_URL}/api/fetch-shopify-customers`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'sync-shopify-metrics', url: `${CLOUD_RUN_URL}/api/sync-shopify-metrics`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'create-shopify-discount', url: `${CLOUD_RUN_URL}/api/create-shopify-discount`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-shopify-discounts', url: `${CLOUD_RUN_URL}/api/fetch-shopify-discounts`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'update-shopify-product', url: `${CLOUD_RUN_URL}/api/update-shopify-product`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Meta Ads ───────────────────────────────────────────────
      { name: 'sync-meta-metrics', url: `${CLOUD_RUN_URL}/api/sync-meta-metrics`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'check-meta-scopes', url: `${CLOUD_RUN_URL}/api/check-meta-scopes`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-meta-ad-accounts', url: `${CLOUD_RUN_URL}/api/fetch-meta-ad-accounts`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-meta-business-hierarchy', url: `${CLOUD_RUN_URL}/api/fetch-meta-business-hierarchy`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'manage-meta-campaign', url: `${CLOUD_RUN_URL}/api/manage-meta-campaign`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },
      { name: 'meta-social-inbox', url: `${CLOUD_RUN_URL}/api/meta-social-inbox`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'manage-meta-audiences', url: `${CLOUD_RUN_URL}/api/manage-meta-audiences`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },
      { name: 'manage-meta-pixel', url: `${CLOUD_RUN_URL}/api/manage-meta-pixel`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'manage-meta-rules', url: `${CLOUD_RUN_URL}/api/manage-meta-rules`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },
      { name: 'meta-targeting-search', url: `${CLOUD_RUN_URL}/api/meta-targeting-search`, method: 'POST', body: { client_id: 'health-check', query: 'ping' } },

      // ─── Klaviyo ────────────────────────────────────────────────
      { name: 'klaviyo-push-emails', url: `${CLOUD_RUN_URL}/api/klaviyo-push-emails`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'sync-klaviyo-metrics', url: `${CLOUD_RUN_URL}/api/sync-klaviyo-metrics`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-klaviyo-top-products', url: `${CLOUD_RUN_URL}/api/fetch-klaviyo-top-products`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'import-klaviyo-templates', url: `${CLOUD_RUN_URL}/api/import-klaviyo-templates`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'klaviyo-manage-flows', url: `${CLOUD_RUN_URL}/api/klaviyo-manage-flows`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'create-klaviyo-campaign', url: `${CLOUD_RUN_URL}/api/klaviyo/create-campaign`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Google Ads ─────────────────────────────────────────────
      { name: 'sync-google-ads-metrics', url: `${CLOUD_RUN_URL}/api/sync-google-ads-metrics`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Instagram / Facebook ──────────────────────────────────
      { name: 'publish-instagram', url: `${CLOUD_RUN_URL}/api/publish-instagram`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'publish-facebook', url: `${CLOUD_RUN_URL}/api/publish-facebook`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'fetch-instagram-insights', url: `${CLOUD_RUN_URL}/api/fetch-instagram-insights`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Steve Mail ─────────────────────────────────────────────
      { name: 'manage-email-campaigns', url: `${CLOUD_RUN_URL}/api/manage-email-campaigns`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },
      { name: 'manage-email-flows', url: `${CLOUD_RUN_URL}/api/manage-email-flows`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },
      { name: 'query-email-subscribers', url: `${CLOUD_RUN_URL}/api/query-email-subscribers`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'email-campaign-analytics', url: `${CLOUD_RUN_URL}/api/email-campaign-analytics`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'send-test-email', url: `${CLOUD_RUN_URL}/api/email/send-test`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'verify-email-domain', url: `${CLOUD_RUN_URL}/api/verify-email-domain`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'email-templates', url: `${CLOUD_RUN_URL}/api/email-templates`, method: 'POST', body: { client_id: 'health-check', action: 'list' } },

      // ─── WhatsApp ───────────────────────────────────────────────
      { name: 'wa-send-message', url: `${CLOUD_RUN_URL}/api/whatsapp/send-message`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'wa-send-campaign', url: `${CLOUD_RUN_URL}/api/whatsapp/send-campaign`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── CRM ────────────────────────────────────────────────────
      { name: 'crm-prospects-kanban', url: `${CLOUD_RUN_URL}/api/crm/prospects/kanban`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'crm-proposals', url: `${CLOUD_RUN_URL}/api/crm/proposals`, method: 'POST', body: { action: 'list', client_id: 'health-check' } },
      { name: 'crm-sales-tasks', url: `${CLOUD_RUN_URL}/api/crm/tasks`, method: 'POST', body: { action: 'list', client_id: 'health-check' } },
      { name: 'crm-web-forms', url: `${CLOUD_RUN_URL}/api/crm/web-forms`, method: 'POST', body: { action: 'list', client_id: 'health-check' } },
      { name: 'crm-tasks-auto-generate', url: `${CLOUD_RUN_URL}/api/crm/tasks/auto-generate`, method: 'POST', body: { client_id: 'health-check' } },

      // ─── Utilities ──────────────────────────────────────────────
      { name: 'train-steve', url: `${CLOUD_RUN_URL}/api/train-steve`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'approve-knowledge', url: `${CLOUD_RUN_URL}/api/approve-knowledge`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'generate-copy', url: `${CLOUD_RUN_URL}/api/generate-copy`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'generate-google-copy', url: `${CLOUD_RUN_URL}/api/generate-google-copy`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'submit-correction', url: `${CLOUD_RUN_URL}/api/submit-correction`, method: 'POST', body: { client_id: 'health-check' } },
      { name: 'manage-sources', url: `${CLOUD_RUN_URL}/api/manage-sources`, method: 'POST', body: { action: 'list', client_id: 'health-check' } },

      // ─── Infra / Root ───────────────────────────────────────────
      { name: 'frontend', url: 'https://www.steve.cl', method: 'GET' },
      { name: 'cloud-run-root', url: `${CLOUD_RUN_URL}/`, method: 'GET' },
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
    // Only flag slow if response was successful (2xx/3xx) — 4xx (e.g. 401 on cold start) are not perf issues
    const slow = results.filter(r => r.ok && r.status < 400 && r.time_ms > 3000)

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

      // ── Auto-restart: check for 2+ consecutive failures per endpoint ──
      for (const f of failed) {
        try {
          // Query last 2 criterio_results for this endpoint (most recent first)
          const { data: recentChecks } = await supabase
            .from('criterio_results')
            .select('passed, created_at')
            .eq('rule_id', `HEALTH-${f.name.toUpperCase()}`)
            .eq('entity_type', 'endpoint_health')
            .order('created_at', { ascending: false })
            .limit(2)

          // If both of the last 2 checks failed → trigger restart
          const consecutiveFails = recentChecks
            && recentChecks.length >= 2
            && recentChecks.every((r: { passed: boolean }) => !r.passed)

          if (consecutiveFails) {
            console.log(`[health-check] 2+ consecutive failures for ${f.name} — triggering auto-restart`)
            try {
              await fetch(`${CLOUD_RUN_URL}/api/cron/restart-service`, {
                method: 'POST',
                headers: {
                  'X-Cron-Secret': SUPABASE_SERVICE_ROLE_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  endpoint: f.name,
                  reason: `2+ consecutive health-check failures. Last error: ${f.error}`,
                }),
                signal: AbortSignal.timeout(10000),
              })
            } catch (restartErr: any) {
              console.error(`[health-check] Auto-restart failed for ${f.name}:`, restartErr.message)
            }
          }
        } catch (checkErr: any) {
          console.error(`[health-check] Error checking consecutive failures for ${f.name}:`, checkErr.message)
        }
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
