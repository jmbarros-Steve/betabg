/**
 * D.3/D.4: Fetch creative performance history for a merchant.
 * Deno Edge Function version — receives supabase client as param.
 * Returns a text block to inject into AI prompts so Steve knows
 * which angles/copies worked and which to avoid.
 */
export async function getCreativeContext(
  supabase: any,
  client_id: string,
  channel: string,
  product_name?: string
): Promise<string> {
  // 1. Best creatives for this merchant
  const { data: best } = await supabase
    .from('creative_history')
    .select('angle, content_summary, cqs_score, channel')
    .eq('client_id', client_id)
    .eq('channel', channel)
    .not('cqs_score', 'is', null)
    .gte('cqs_score', 65)
    .order('cqs_score', { ascending: false })
    .limit(5);

  // 2. Worst creatives (to avoid)
  const { data: worst } = await supabase
    .from('creative_history')
    .select('angle, content_summary, cqs_score, channel')
    .eq('client_id', client_id)
    .eq('channel', channel)
    .not('cqs_score', 'is', null)
    .lt('cqs_score', 40)
    .order('cqs_score', { ascending: true })
    .limit(5);

  // 3. Product-specific history
  let productBest: any[] | null = null;
  if (product_name) {
    const { data: pb } = await supabase
      .from('creative_history')
      .select('angle, cqs_score, content_summary')
      .eq('client_id', client_id)
      .ilike('content_summary', `%${product_name}%`)
      .not('cqs_score', 'is', null)
      .order('cqs_score', { ascending: false })
      .limit(3);
    productBest = pb;
  }

  // 4. Angle ranking
  const angles: Record<string, { scores: number[]; count: number }> = {};
  const allCreatives = [...(best || []), ...(worst || [])];
  for (const c of allCreatives) {
    if (!c.angle) continue;
    if (!angles[c.angle]) angles[c.angle] = { scores: [], count: 0 };
    angles[c.angle].scores.push(c.cqs_score);
    angles[c.angle].count++;
  }

  const angleRanking = Object.entries(angles)
    .map(([angle, data]) => ({
      angle,
      avg_score: Math.round(data.scores.reduce((a: number, b: number) => a + b, 0) / data.scores.length),
      count: data.count,
    }))
    .sort((a, b) => b.avg_score - a.avg_score);

  // 5. Build context text
  if (allCreatives.length === 0 && !productBest?.length) {
    return ''; // No history yet
  }

  let context = `\n## HISTORIAL CREATIVO DE ESTE MERCHANT (${channel})\n\n`;

  if (angleRanking.length > 0) {
    const good = angleRanking.filter(a => a.avg_score >= 60);
    const bad = angleRanking.filter(a => a.avg_score < 40);

    if (good.length > 0) {
      context += `### ÁNGULOS QUE FUNCIONAN:\n`;
      good.forEach(a => {
        context += `✅ ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces)\n`;
      });
    }
    if (bad.length > 0) {
      context += `\n### ÁNGULOS QUE NO FUNCIONAN:\n`;
      bad.forEach(a => {
        context += `❌ ${a.angle}: score promedio ${a.avg_score}/100 (${a.count} veces) — NO usar\n`;
      });
    }
  }

  if (best && best.length > 0) {
    context += `\n### TOP MEJORES CREATIVES:\n`;
    best.slice(0, 3).forEach((b: any, i: number) => {
      context += `${i + 1}. [${b.cqs_score}/100] Ángulo: ${b.angle || 'N/A'}. ${b.content_summary || ''}\n`;
    });
  }

  if (worst && worst.length > 0) {
    context += `\n### TOP PEORES (EVITAR):\n`;
    worst.slice(0, 3).forEach((w: any, i: number) => {
      context += `${i + 1}. [${w.cqs_score}/100] Ángulo: ${w.angle || 'N/A'}. ${w.content_summary || ''}\n`;
    });
  }

  if (productBest && productBest.length > 0) {
    context += `\n### HISTORIAL DE "${product_name}":\n`;
    productBest.forEach((p: any) => {
      context += `• Ángulo: ${p.angle || 'N/A'} → Score: ${p.cqs_score}/100. ${p.content_summary || ''}\n`;
    });
  }

  context += `\nIMPORTANTE: Usa este historial para tomar decisiones. Si un ángulo tiene score <40, NO lo sugieras. Prioriza ángulos con score >60. Si no hay historial, experimenta con ángulos variados.\n`;

  return context;
}
