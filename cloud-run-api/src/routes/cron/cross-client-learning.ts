import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function crossClientLearning(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  try {
    // Get last 30 days campaign metrics with connection details
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = await safeQuery<{
      connection_id: string;
      campaign_name: string;
      platform: string;
      spend: number | string | null;
      impressions: number | string | null;
      clicks: number | string | null;
      conversions: number | string | null;
      conversion_value: number | string | null;
    }>(
      supabase
        .from('campaign_metrics')
        .select('connection_id, campaign_name, platform, spend, impressions, clicks, conversions, conversion_value')
        .gte('metric_date', thirtyDaysAgo),
      'crossClientLearning.fetchMetrics',
    );

    if (metrics.length < 50) {
      return c.json({ success: true, message: 'Not enough data for cross-client analysis' });
    }

    // Group by connection (proxy for client)
    const byConnection: Record<string, { platform: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number; campaigns: number }> = {};

    for (const m of metrics) {
      if (!byConnection[m.connection_id]) {
        byConnection[m.connection_id] = { platform: m.platform, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, campaigns: 0 };
      }
      const b = byConnection[m.connection_id];
      b.spend += Number(m.spend) || 0;
      b.impressions += Number(m.impressions) || 0;
      b.clicks += Number(m.clicks) || 0;
      b.conversions += Number(m.conversions) || 0;
      b.revenue += Number(m.conversion_value) || 0;
      b.campaigns++;
    }

    // Build anonymized summary
    const clients = Object.values(byConnection).filter(c => c.spend > 50);
    if (clients.length < 3) {
      return c.json({ success: true, message: 'Need 3+ active clients' });
    }

    const summary = clients.map((c, i) => ({
      client: `Client_${i + 1}`,
      platform: c.platform,
      monthly_spend: c.spend.toFixed(0),
      ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0',
      conv_rate: c.clicks > 0 ? ((c.conversions / c.clicks) * 100).toFixed(2) : '0',
      roas: c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : '0',
      campaigns: c.campaigns,
    }));

    // Ask Claude to find patterns
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analiza estos datos ANÓNIMOS de ${clients.length} clientes de e-commerce y encuentra PATRONES accionables.

${JSON.stringify(summary, null, 2)}

Genera 2-3 reglas basadas en patrones reales encontrados en estos datos.
Formato JSON array:
[{"titulo": "título (max 60 chars)", "contenido": "CUANDO: [condición]. HAZ: [acción]. PORQUE: [dato del análisis]."}]

Solo incluye patrones claros respaldados por los datos. Sin markdown.`,
        }],
      }),
    });

    if (!res.ok) return c.json({ error: 'AI API error' }, 500);

    const data: any = await res.json();
    const text = data.content?.[0]?.text || '[]';
    let rules: any[];
    try {
      rules = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('[cross-client-learning] Failed to parse AI response as JSON:', text.slice(0, 200));
      return c.json({ success: false, error: 'Failed to parse AI response', clientsAnalyzed: clients.length, rulesGenerated: 0 }, 500);
    }

    let saved = 0;
    for (const rule of (Array.isArray(rules) ? rules : [])) {
      if (!rule.titulo || !rule.contenido) continue;

      const { error: upsertErr } = await supabase.from('steve_knowledge').upsert({
        categoria: 'analisis',
        titulo: `[CROSS-CLIENT] ${rule.titulo}`.slice(0, 80),
        contenido: rule.contenido.slice(0, 600),
        activo: true,
        orden: 99,
        industria: 'general',
      }, { onConflict: 'categoria,titulo' });
      if (upsertErr) {
        console.error(`[cross-client] Failed to upsert rule "${rule.titulo}":`, upsertErr);
        continue;
      }
      saved++;
    }

    await supabase.from('qa_log').insert({
      check_type: 'cross_client_learning',
      status: 'pass',
      details: JSON.stringify({ clients_analyzed: clients.length, rules_generated: saved }),
      detected_by: 'cross-client-learning',
    });

    return c.json({ success: true, clientsAnalyzed: clients.length, rulesGenerated: saved });
  } catch (err: any) {
    console.error('[cross-client-learning]', err);
    return c.json({ error: err.message }, 500);
  }
}
