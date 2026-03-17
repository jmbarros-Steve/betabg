import { supabase } from '@/integrations/supabase/client';

/**
 * D.3 — Creative Context
 *
 * Queries creative_history to build a text context for the AI generation
 * system with: best/worst creatives, angles that work vs don't, and
 * product-specific history. Injected into prompts before generating new copy.
 */

interface AngleStat {
  angle: string;
  avg_score: number;
  count: number;
}

export async function getCreativeContext(
  shop_id: string,
  channel: string,
  product_name?: string
): Promise<string> {
  // Use client_id or shop_id — table has both
  const shopFilter = (query: any) =>
    query.or(`client_id.eq.${shop_id},shop_id.eq.${shop_id}`);

  // 1. Best creatives for this merchant
  let bestQuery = supabase
    .from('creative_history')
    .select(
      'angle, copy_text, performance_score, performance_verdict, performance_reason, meta_roas, klaviyo_open_rate'
    )
    .eq('channel', channel)
    .eq('performance_verdict', 'bueno')
    .not('performance_score', 'is', null)
    .order('performance_score', { ascending: false })
    .limit(5);
  bestQuery = shopFilter(bestQuery);
  const { data: best } = await bestQuery;

  // 2. Worst creatives (to avoid)
  let worstQuery = supabase
    .from('creative_history')
    .select('angle, copy_text, performance_score, performance_reason')
    .eq('channel', channel)
    .eq('performance_verdict', 'malo')
    .not('performance_score', 'is', null)
    .order('performance_score', { ascending: true })
    .limit(5);
  worstQuery = shopFilter(worstQuery);
  const { data: worst } = await worstQuery;

  // 3. Product-specific history
  let productBest: any[] | null = null;
  if (product_name) {
    let pQuery = supabase
      .from('creative_history')
      .select('angle, performance_score, performance_reason')
      .eq('product_name', product_name)
      .not('performance_score', 'is', null)
      .order('performance_score', { ascending: false })
      .limit(3);
    pQuery = shopFilter(pQuery);
    const { data: pb } = await pQuery;
    productBest = pb;
  }

  // 4. Angle ranking — which angles work vs don't
  const allCreatives = [...(best || []), ...(worst || [])];
  const angleMap: Record<string, { scores: number[]; count: number }> = {};

  for (const c of allCreatives) {
    if (!c.angle) continue;
    if (!angleMap[c.angle]) angleMap[c.angle] = { scores: [], count: 0 };
    angleMap[c.angle].scores.push(c.performance_score);
    angleMap[c.angle].count++;
  }

  const angleRanking: AngleStat[] = Object.entries(angleMap)
    .map(([angle, data]) => ({
      angle,
      avg_score: Math.round(
        data.scores.reduce((a, b) => a + b, 0) / data.scores.length
      ),
      count: data.count,
    }))
    .sort((a, b) => b.avg_score - a.avg_score);

  // 5. Build text context
  let context = `## HISTORIAL DE ESTE MERCHANT (${channel})\n\n`;

  if (angleRanking.length > 0) {
    const good = angleRanking.filter((a) => a.avg_score >= 60);
    const bad = angleRanking.filter((a) => a.avg_score < 40);

    if (good.length > 0) {
      context += `### ANGULOS QUE FUNCIONAN:\n`;
      for (const a of good) {
        context += `- ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces)\n`;
      }
      context += '\n';
    }

    if (bad.length > 0) {
      context += `### ANGULOS QUE NO FUNCIONAN:\n`;
      for (const a of bad) {
        context += `- ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces) — NO usar\n`;
      }
      context += '\n';
    }
  }

  if (best && best.length > 0) {
    context += `### TOP ${Math.min(3, best.length)} MEJORES CREATIVES:\n`;
    for (let i = 0; i < Math.min(3, best.length); i++) {
      const b = best[i];
      context += `${i + 1}. [${b.performance_score}/100] Angulo: ${b.angle || 'N/A'}. ${b.performance_reason || ''}\n`;
    }
    context += '\n';
  }

  if (worst && worst.length > 0) {
    context += `### TOP ${Math.min(3, worst.length)} PEORES (EVITAR):\n`;
    for (let i = 0; i < Math.min(3, worst.length); i++) {
      const w = worst[i];
      context += `${i + 1}. [${w.performance_score}/100] Angulo: ${w.angle || 'N/A'}. ${w.performance_reason || ''}\n`;
    }
    context += '\n';
  }

  if (productBest && productBest.length > 0) {
    context += `### HISTORIAL DE "${product_name}":\n`;
    for (const p of productBest) {
      context += `- Angulo: ${p.angle || 'N/A'} -> Score: ${p.performance_score}/100. ${p.performance_reason || ''}\n`;
    }
    context += '\n';
  }

  if (context.trim() === `## HISTORIAL DE ESTE MERCHANT (${channel})`) {
    return ''; // No history yet — return empty so prompts don't include noise
  }

  return context;
}
