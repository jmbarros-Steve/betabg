import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';

export async function funnelDiagnosis(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const results: Array<{ client_id: string; diagnosis: string }> = [];

  // Get campaign metrics from last 7 days grouped by client
  const metrics = await safeQuery<{
    connection_id: string;
    campaign_name: string;
    impressions: number | string | null;
    clicks: number | string | null;
    conversions: number | string | null;
    conversion_value: number | string | null;
    spend: number | string | null;
    platform: string;
  }>(
    supabase
      .from('campaign_metrics')
      .select('connection_id, campaign_name, impressions, clicks, conversions, conversion_value, spend, platform')
      .gte('metric_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    'funnelDiagnosis.fetchCampaignMetrics',
  );

  if (metrics.length === 0) return c.json({ success: true, results: [] });

  // Get connection→client mapping
  const connectionIds = [...new Set(metrics.map(m => m.connection_id))];
  const connections = await safeQuery<{ id: string; client_id: string; clients: any }>(
    supabase
      .from('platform_connections')
      .select('id, client_id, clients!inner(name)')
      .in('id', connectionIds),
    'funnelDiagnosis.fetchConnections',
  );

  if (connections.length === 0) return c.json({ success: true, results: [] });

  const connToClient = new Map(connections.map(c => [c.id, { client_id: c.client_id, name: (c.clients as any)?.name }]));

  // Group metrics by client
  const byClient: Record<string, typeof metrics> = {};
  for (const m of metrics) {
    const client = connToClient.get(m.connection_id);
    if (!client) continue;
    if (!byClient[client.client_id]) byClient[client.client_id] = [];
    byClient[client.client_id].push(m);
  }

  for (const [clientId, clientMetrics] of Object.entries(byClient)) {
    const totals = clientMetrics.reduce((acc, m) => ({
      impressions: acc.impressions + (Number(m.impressions) || 0),
      clicks: acc.clicks + (Number(m.clicks) || 0),
      conversions: acc.conversions + (Number(m.conversions) || 0),
      revenue: acc.revenue + (Number(m.conversion_value) || 0),
      spend: acc.spend + (Number(m.spend) || 0),
    }), { impressions: 0, clicks: 0, conversions: 0, revenue: 0, spend: 0 });

    if (totals.impressions < 1000) continue;

    const ctr = (totals.clicks / totals.impressions * 100);
    const convRate = totals.clicks > 0 ? (totals.conversions / totals.clicks * 100) : 0;
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    // Determine bottleneck
    let bottleneck = '';
    let severity = 'medium';

    if (ctr < 1.0) {
      bottleneck = `CTR muy bajo (${ctr.toFixed(2)}%). El problema está en los ANUNCIOS: los creativos o el copy no generan suficiente interés. Acción: probar nuevos ángulos creativos y copies.`;
      severity = ctr < 0.5 ? 'high' : 'medium';
    } else if (convRate < 1.5) {
      bottleneck = `CTR aceptable (${ctr.toFixed(2)}%) pero conversión baja (${convRate.toFixed(2)}%). El problema está en la LANDING PAGE o el CHECKOUT: la gente hace clic pero no compra. Acción: revisar velocidad de carga, precio visible, proceso de checkout.`;
      severity = convRate < 0.5 ? 'high' : 'medium';
    } else if (roas < 1.5) {
      bottleneck = `Conversiones OK (${convRate.toFixed(2)}%) pero ROAS bajo (${roas.toFixed(2)}x). El problema es el TICKET PROMEDIO o el CPC alto. Acción: subir precios, hacer bundles, o reducir CPC con mejor segmentación.`;
      severity = roas < 1.0 ? 'high' : 'medium';
    } else {
      bottleneck = `Funnel saludable: CTR ${ctr.toFixed(2)}%, Conv ${convRate.toFixed(2)}%, ROAS ${roas.toFixed(2)}x. Oportunidad de ESCALAR.`;
      severity = 'low';
    }

    // Save diagnosis as client-specific knowledge
    const clientInfo = connToClient.get(clientMetrics[0].connection_id);
    await supabase.from('steve_knowledge').upsert({
      categoria: 'analisis',
      titulo: `Diagnóstico funnel - ${clientInfo?.name || 'Cliente'}`.slice(0, 80),
      contenido: `CUANDO: Revisas el funnel de este cliente. HAZ: ${bottleneck} PORQUE: Datos de los últimos 7 días (${totals.impressions} imp, ${totals.clicks} clicks, ${totals.conversions} conv).`,
      client_id: clientId,
      activo: true,
      orden: 95,
    }, { onConflict: 'categoria,titulo' });

    // Log to qa_log
    await supabase.from('qa_log').insert({
      check_type: 'funnel_diagnosis',
      status: severity === 'high' ? 'fail' : severity === 'medium' ? 'warn' : 'pass',
      details: JSON.stringify({ client_id: clientId, totals, ctr, convRate, roas, bottleneck }),
      detected_by: 'funnel-diagnosis',
    });

    results.push({ client_id: clientId, diagnosis: bottleneck });
  }

  return c.json({ success: true, results });
}
