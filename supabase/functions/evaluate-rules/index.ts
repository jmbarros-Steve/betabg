import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      organ,
      shop_id,
      entity_type,
      entity_id,
      results: rawResults,
      get_rules,    // Si true, solo retorna las reglas sin guardar resultados
      category,     // Filtro opcional de categoría
    } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Modo: traer reglas para que el caller las evalúe
    if (get_rules) {
      let query = supabase
        .from('criterio_rules')
        .select('*')
        .eq('active', true)

      if (organ) query = query.eq('organ', organ)
      if (category) query = query.ilike('category', `%${category}%`)

      const { data: rules, error } = await query.order('weight', { ascending: false })
      if (error) throw error

      return new Response(JSON.stringify({ rules, total: rules?.length ?? 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Modo: registrar resultados de evaluación
    if (!rawResults?.length) {
      return new Response(JSON.stringify({ error: 'No results provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Enriquecer resultados con severidad de la regla
    const ruleIds = rawResults.map((r: any) => r.rule_id)
    const { data: rulesData } = await supabase
      .from('criterio_rules')
      .select('id, severity, weight')
      .in('id', ruleIds)

    const rulesMap = Object.fromEntries((rulesData ?? []).map((r: any) => [r.id, r]))

    const inserts = rawResults.map((r: any) => ({
      rule_id: r.rule_id,
      shop_id: shop_id ?? null,
      entity_type,
      entity_id: entity_id ?? null,
      passed: r.passed,
      actual_value: r.actual_value ?? null,
      expected_value: r.expected_value ?? null,
      details: r.details ?? null,
      evaluated_by: organ?.toLowerCase() ?? 'unknown',
    }))

    const { error: insertError } = await supabase
      .from('criterio_results')
      .insert(inserts)

    if (insertError) throw insertError

    // Calcular score ponderado
    let totalWeight = 0
    let passedWeight = 0
    let blockers = 0
    const failedRules: any[] = []

    for (const r of rawResults) {
      const rule = rulesMap[r.rule_id]
      const w = rule?.weight ?? 1
      totalWeight += w
      if (r.passed) {
        passedWeight += w
      } else {
        failedRules.push({
          rule_id: r.rule_id,
          severity: rule?.severity ?? 'Advertencia',
          details: r.details,
          actual_value: r.actual_value,
        })
        if (rule?.severity === 'BLOQUEAR') blockers++
      }
    }

    const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100
    const can_publish = blockers === 0 && score >= 60

    return new Response(JSON.stringify({
      score,
      total: rawResults.length,
      passed: rawResults.filter((r: any) => r.passed).length,
      failed: failedRules.length,
      blockers,
      can_publish,
      failed_rules: failedRules,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('evaluate-rules error:', err)
    // Fail-safe: si la función falla, NO publicar
    return new Response(JSON.stringify({
      error: err.message,
      can_publish: false,
      score: 0,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
