import { getSupabaseAdmin } from './supabase.js';

interface KnowledgeResult {
  knowledgeBlock: string;
  bugsBlock: string;
  rules: Array<{ id: string; titulo: string; contenido: string; categoria: string }>;
  ruleIds: string[];
}

/**
 * Carga reglas de steve_knowledge + steve_bugs para inyectar en cualquier prompt.
 *
 * @param categories - Categorías relevantes (ej: ['meta_ads', 'anuncios'])
 * @param options.clientId - Opcional: cargar reglas específicas del cliente
 * @param options.limit - Máximo de reglas (default 15)
 * @param options.label - Label para el bloque (default "REGLAS APRENDIDAS")
 */
export async function loadKnowledge(
  categories: string[],
  options: { clientId?: string; limit?: number; label?: string; audit?: { source: string } } = {}
): Promise<KnowledgeResult> {
  const { clientId, limit = 15, label = 'REGLAS APRENDIDAS' } = options;
  const supabase = getSupabaseAdmin();

  const knowledgeQuery = supabase
    .from('steve_knowledge')
    .select('id, titulo, contenido, categoria')
    .in('categoria', categories)
    .eq('activo', true)
    .eq('approval_status', 'approved')
    .order('orden', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const bugsQuery = supabase
    .from('steve_bugs')
    .select('descripcion, ejemplo_bueno')
    .in('categoria', categories)
    .eq('activo', true);

  const [knowledgeRes, bugsRes] = await Promise.all([
    knowledgeQuery.then(r => r),
    bugsQuery.then(r => r),
  ]);

  let clientRulesData: any[] = [];
  if (clientId) {
    const { data } = await supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, categoria')
      .eq('client_id', clientId)
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .order('orden', { ascending: false })
      .limit(10);
    clientRulesData = data || [];
  }
  const globalRules = knowledgeRes.data || [];
  const bugs = bugsRes.data || [];
  const clientRules = clientRulesData;

  // Merge: client rules first, then global (deduplicate by titulo)
  const seenTitles = new Set<string>();
  const allRules: Array<{ id: string; titulo: string; contenido: string; categoria: string }> = [];
  for (const r of [...clientRules, ...globalRules]) {
    if (!seenTitles.has(r.titulo)) {
      seenTitles.add(r.titulo);
      allRules.push(r);
    }
  }

  const knowledgeBlock = allRules.length > 0
    ? `\n${label} (seguir obligatoriamente):\n${allRules.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n`
    : '';

  const bugsBlock = bugs.length > 0
    ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${bugs.map((b: any) => `❌ ${b.descripcion}${b.ejemplo_bueno ? `\nBIEN: ${b.ejemplo_bueno}` : ''}`).join('\n\n')}\n`
    : '';

  const ruleIds = allRules.map(r => r.id).filter(Boolean);

  // Audit trail: fire-and-forget insert to qa_log
  if (options.audit && ruleIds.length > 0) {
    supabase.from('qa_log').insert({
      check_type: 'knowledge_injection',
      status: 'info',
      details: JSON.stringify({
        source: options.audit.source,
        rule_count: ruleIds.length,
        rule_ids: ruleIds,
        categories,
      }),
      detected_by: 'knowledge-loader',
    }).then(({ error }) => {
      if (error) console.error('[knowledge-loader] qa_log insert failed:', error.message);
    });
  }

  return { knowledgeBlock, bugsBlock, rules: allRules, ruleIds };
}
