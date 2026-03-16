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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Obtener clientes activos con Shopify conectado
    const { data: connections, error: connError } = await supabase
      .from('platform_connections')
      .select('id, client_id, shop_domain, access_token, platform_type')
      .eq('platform_type', 'shopify')
      .eq('active', true)

    if (connError) throw connError
    if (!connections?.length) {
      return new Response(JSON.stringify({ message: 'No active Shopify connections', diffs: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const report: any[] = []

    for (const conn of connections) {
      // Desencriptar token via RPC si existe, sino usar access_token directo
      let shopifyToken = conn.access_token
      try {
        const { data: decrypted } = await supabase.rpc('decrypt_platform_token', {
          encrypted_token: conn.access_token,
        })
        if (decrypted) shopifyToken = decrypted
      } catch {
        // Si no existe la función RPC, usar token directo
      }

      // Obtener métricas de Steve (últimos 7 días)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      const { data: steveMetrics } = await supabase
        .from('platform_metrics')
        .select('metric_date, metric_type, metric_value')
        .eq('connection_id', conn.id)
        .gte('metric_date', sevenDaysAgo)
        .lte('metric_date', today)
        .in('metric_type', ['revenue', 'orders'])

      if (!steveMetrics?.length) continue

      // Obtener datos directos de Shopify API
      const shopifyHeaders = { 'X-Shopify-Access-Token': shopifyToken }
      const shopifyBase = `https://${conn.shop_domain}/admin/api/2024-10`

      // Órdenes de los últimos 7 días desde Shopify
      let shopifyOrders: any[] = []
      try {
        const ordersRes = await fetch(
          `${shopifyBase}/orders.json?created_at_min=${sevenDaysAgo}T00:00:00Z&status=any&limit=250`,
          { headers: shopifyHeaders, signal: AbortSignal.timeout(10000) }
        )
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json()
          shopifyOrders = ordersData.orders || []
        }
      } catch (e: any) {
        // Si Shopify no responde, registrar como fallo
        await supabase.from('qa_log').insert({
          check_type: 'shopify_api_unreachable',
          status: 'fail',
          details: { shop_domain: conn.shop_domain, error: e.message },
        })
        report.push({ shop_domain: conn.shop_domain, error: 'Shopify API unreachable' })
        continue
      }

      // Calcular totales de Shopify por día
      const shopifyByDay: Record<string, { revenue: number; orders: number }> = {}
      for (const order of shopifyOrders) {
        const day = order.created_at.split('T')[0]
        if (!shopifyByDay[day]) shopifyByDay[day] = { revenue: 0, orders: 0 }
        shopifyByDay[day].revenue += parseFloat(order.total_price || '0')
        shopifyByDay[day].orders += 1
      }

      // Comparar Steve vs Shopify por día
      const diffs: any[] = []

      // Agrupar métricas de Steve por día y tipo
      const steveByDay: Record<string, Record<string, number>> = {}
      for (const m of steveMetrics) {
        const day = m.metric_date
        if (!steveByDay[day]) steveByDay[day] = {}
        steveByDay[day][m.metric_type] = Number(m.metric_value)
      }

      for (const [day, steveData] of Object.entries(steveByDay)) {
        const shopifyData = shopifyByDay[day]
        if (!shopifyData) continue

        // Comparar revenue
        if (steveData.revenue !== undefined) {
          const steveRev = steveData.revenue
          const shopifyRev = shopifyData.revenue
          const pctDiff = shopifyRev > 0 ? Math.abs(steveRev - shopifyRev) / shopifyRev * 100 : (steveRev > 0 ? 100 : 0)

          if (pctDiff > 10) {
            diffs.push({
              day,
              metric: 'revenue',
              steve_value: steveRev,
              shopify_value: shopifyRev,
              pct_diff: Math.round(pctDiff * 10) / 10,
            })
          }
        }

        // Comparar orders count
        if (steveData.orders !== undefined) {
          const steveOrd = steveData.orders
          const shopifyOrd = shopifyData.orders
          const pctDiff = shopifyOrd > 0 ? Math.abs(steveOrd - shopifyOrd) / shopifyOrd * 100 : (steveOrd > 0 ? 100 : 0)

          if (pctDiff > 10) {
            diffs.push({
              day,
              metric: 'orders',
              steve_value: steveOrd,
              shopify_value: shopifyOrd,
              pct_diff: Math.round(pctDiff * 10) / 10,
            })
          }
        }
      }

      // Registrar en criterio_results
      for (const diff of diffs) {
        await supabase.from('criterio_results').insert({
          rule_id: `SYNC-SHOPIFY-${diff.metric.toUpperCase()}`,
          shop_id: conn.client_id,
          entity_type: 'shopify_data_sync',
          entity_id: `${conn.shop_domain}:${diff.day}:${diff.metric}`,
          passed: false,
          actual_value: String(diff.shopify_value),
          expected_value: String(diff.steve_value),
          details: `${diff.metric} diff ${diff.pct_diff}% on ${diff.day} — Steve: ${diff.steve_value}, Shopify: ${diff.shopify_value}`,
          evaluated_by: 'ojos',
        })
      }

      // Registrar en qa_log si hay diferencias
      if (diffs.length > 0) {
        await supabase.from('qa_log').insert({
          check_type: 'shopify_data_mismatch',
          status: 'fail',
          details: {
            shop_domain: conn.shop_domain,
            client_id: conn.client_id,
            diffs_count: diffs.length,
            diffs,
          },
        })

        // Intentar alerta WhatsApp
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `OJOS SHOPIFY: ${diffs.length} diferencias >10% en ${conn.shop_domain}:\n` +
                diffs.slice(0, 5).map(d => `- ${d.day} ${d.metric}: Steve=${d.steve_value} vs Shopify=${d.shopify_value} (${d.pct_diff}%)`).join('\n'),
            }),
            signal: AbortSignal.timeout(5000),
          })
        } catch {
          console.log('send-whatsapp not available, alert saved to qa_log only')
        }
      }

      report.push({
        shop_domain: conn.shop_domain,
        days_compared: Object.keys(steveByDay).length,
        diffs_found: diffs.length,
        diffs: diffs.length > 0 ? diffs : undefined,
      })
    }

    return new Response(JSON.stringify({
      checked_at: new Date().toISOString(),
      connections_checked: connections.length,
      report,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('shopify-data-verify error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
