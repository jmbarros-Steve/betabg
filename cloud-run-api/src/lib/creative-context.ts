import { getSupabaseAdmin } from './supabase.js';
import { safeQueryOrDefault } from './safe-supabase.js';

interface CreativeRow {
  angle: string | null;
  content_summary: string | null;
  cqs_score: number;
  channel: string;
}

interface AngleRow {
  angle: string | null;
  cqs_score: number;
}

interface ProductCreativeRow {
  angle: string | null;
  cqs_score: number;
  content_summary: string | null;
}

/**
 * D.3/D.4: Fetch creative performance history for a merchant.
 * Returns a text block to inject into AI prompts so Steve knows
 * which angles/copies worked and which to avoid.
 */
export async function getCreativeContext(
  client_id: string,
  channel: string,
  product_name?: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  // 1. Best creatives for this merchant
  const best = await safeQueryOrDefault<CreativeRow>(
    supabase
      .from('creative_history')
      .select('angle, content_summary, cqs_score, channel')
      .eq('client_id', client_id)
      .eq('channel', channel)
      .not('cqs_score', 'is', null)
      .gte('cqs_score', 65)
      .order('cqs_score', { ascending: false })
      .limit(5),
    [],
    'creativeContext.bestCreatives',
  );

  // 2. Worst creatives (to avoid)
  const worst = await safeQueryOrDefault<CreativeRow>(
    supabase
      .from('creative_history')
      .select('angle, content_summary, cqs_score, channel')
      .eq('client_id', client_id)
      .eq('channel', channel)
      .not('cqs_score', 'is', null)
      .lt('cqs_score', 40)
      .order('cqs_score', { ascending: true })
      .limit(5),
    [],
    'creativeContext.worstCreatives',
  );

  // 3. Product-specific history
  let productBest: ProductCreativeRow[] | null = null;
  if (product_name) {
    const pb = await safeQueryOrDefault<ProductCreativeRow>(
      supabase
        .from('creative_history')
        .select('angle, cqs_score, content_summary')
        .eq('client_id', client_id)
        .ilike('content_summary', `%${product_name}%`)
        .not('cqs_score', 'is', null)
        .order('cqs_score', { ascending: false })
        .limit(3),
      [],
      'creativeContext.productBest',
    );
    productBest = pb;
  }

  // 4. Angle ranking — query ALL scored creatives for this client+channel
  //    to get accurate counts for [VALIDADO]/[DESCARTADO] markers
  const allAngleData = await safeQueryOrDefault<AngleRow>(
    supabase
      .from('creative_history')
      .select('angle, cqs_score')
      .eq('client_id', client_id)
      .eq('channel', channel)
      .not('cqs_score', 'is', null)
      .not('angle', 'is', null),
    [],
    'creativeContext.allAngleData',
  );

  const angles: Record<string, { scores: number[]; count: number }> = {};
  for (const c of allAngleData || []) {
    if (!c.angle) continue;
    if (!angles[c.angle]) angles[c.angle] = { scores: [], count: 0 };
    angles[c.angle].scores.push(c.cqs_score);
    angles[c.angle].count++;
  }

  const angleRanking = Object.entries(angles)
    .map(([angle, data]) => {
      const avg_score = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
      // With 10+ measurements, mark as validated or discarded
      let status = '';
      if (data.count >= 10) {
        status = avg_score >= 60 ? ' [VALIDADO]' : avg_score < 40 ? ' [DESCARTADO]' : '';
      }
      return { angle, avg_score, count: data.count, status };
    })
    .sort((a, b) => b.avg_score - a.avg_score);

  // 5. Build context text
  let context = '';

  // Only build if there's actual data
  const allCreatives = [...(best || []), ...(worst || [])];
  if (allCreatives.length === 0 && !productBest?.length) {
    return ''; // No history yet — don't pollute the prompt
  }

  context += `\n## HISTORIAL CREATIVO DE ESTE MERCHANT (${channel})\n\n`;

  if (angleRanking.length > 0) {
    const good = angleRanking.filter(a => a.avg_score >= 60);
    const bad = angleRanking.filter(a => a.avg_score < 40);

    if (good.length > 0) {
      context += `### ÁNGULOS QUE FUNCIONAN:\n`;
      good.forEach(a => {
        context += `✅ ${a.angle}${a.status}: score promedio ${a.avg_score}/100 (${a.count} mediciones)\n`;
      });
    }
    if (bad.length > 0) {
      context += `\n### ÁNGULOS QUE NO FUNCIONAN:\n`;
      bad.forEach(a => {
        context += `❌ ${a.angle}${a.status}: score promedio ${a.avg_score}/100 (${a.count} mediciones) — NO usar\n`;
      });
    }
  }

  if (best && best.length > 0) {
    context += `\n### TOP MEJORES CREATIVES:\n`;
    best.slice(0, 3).forEach((b, i) => {
      context += `${i + 1}. [${b.cqs_score}/100] Ángulo: ${b.angle || 'N/A'}. ${b.content_summary || ''}\n`;
    });
  }

  if (worst && worst.length > 0) {
    context += `\n### TOP PEORES (EVITAR):\n`;
    worst.slice(0, 3).forEach((w, i) => {
      context += `${i + 1}. [${w.cqs_score}/100] Ángulo: ${w.angle || 'N/A'}. ${w.content_summary || ''}\n`;
    });
  }

  if (productBest && productBest.length > 0) {
    context += `\n### HISTORIAL DE "${product_name}":\n`;
    productBest.forEach(p => {
      context += `• Ángulo: ${p.angle || 'N/A'} → Score: ${p.cqs_score}/100. ${p.content_summary || ''}\n`;
    });
  }

  context += `\nIMPORTANTE: Usa este historial para tomar decisiones. Si un ángulo tiene score <40, NO lo sugieras. Prioriza ángulos con score >60. Ángulos marcados [VALIDADO] (10+ mediciones, score >60) son los más confiables. Ángulos marcados [DESCARTADO] (10+ mediciones, score <40) están estadísticamente probados como malos — evítalos siempre. Si no hay historial, experimenta con ángulos variados.\n`;

  return context;
}
