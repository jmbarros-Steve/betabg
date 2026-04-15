import { getSupabaseAdmin } from './supabase.js';
import { safeQueryOrDefault } from './safe-supabase.js';

interface KnowledgeResult {
  knowledgeBlock: string;
  bugsBlock: string;
  rules: Array<{ id: string; titulo: string; contenido: string; categoria: string }>;
  ruleIds: string[];
}

const EMPTY_RESULT: KnowledgeResult = { knowledgeBlock: '', bugsBlock: '', rules: [], ruleIds: [] };

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
  // Guard: empty categories would cause PostgREST 400 on .in()
  if (!categories || categories.length === 0) {
    console.warn('[knowledge-loader] Called with empty categories, returning empty result');
    return EMPTY_RESULT;
  }

  try {
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

    // Client rules query (parallel with global if clientId provided)
    const clientQuery = clientId
      ? supabase
          .from('steve_knowledge')
          .select('id, titulo, contenido, categoria')
          .eq('client_id', clientId)
          .in('categoria', categories)
          .eq('activo', true)
          .eq('approval_status', 'approved')
          .order('orden', { ascending: false })
          .limit(10)
      : null;

    // Run ALL queries in parallel
    const [knowledgeRes, bugsRes, clientRes] = await Promise.all([
      knowledgeQuery.then(r => r),
      bugsQuery.then(r => r),
      clientQuery ? clientQuery.then(r => r) : Promise.resolve({ data: null, error: null }),
    ]);

    // Log errors from main queries (but don't crash)
    if (knowledgeRes.error) {
      console.error('[knowledge-loader] steve_knowledge query failed:', knowledgeRes.error.message);
    }
    if (bugsRes.error) {
      console.error('[knowledge-loader] steve_bugs query failed:', bugsRes.error.message);
    }
    if (clientRes.error) {
      console.error('[knowledge-loader] client rules query failed:', clientRes.error.message);
    }

    const globalRules = knowledgeRes.data || [];
    const bugs = bugsRes.data || [];
    const clientRules = clientRes.data || [];

    // Merge: client rules first, then global (deduplicate by titulo+categoria)
    const seenKeys = new Set<string>();
    const allRules: Array<{ id: string; titulo: string; contenido: string; categoria: string }> = [];
    for (const r of [...clientRules, ...globalRules]) {
      const key = `${r.categoria}::${r.titulo}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
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

    // Fire-and-forget: increment usage counters
    if (ruleIds.length > 0) {
      supabase.rpc('increment_knowledge_usage', { rule_ids: ruleIds })
        .then(({ error }) => { if (error) console.error('[knowledge-loader] usage increment failed:', error.message); });
    }

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
  } catch (err) {
    console.error('[knowledge-loader] Unexpected error, returning empty result:', err);
    return EMPTY_RESULT;
  }
}
