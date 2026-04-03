import { getSupabaseAdmin } from './supabase.js';

/**
 * Takes a snapshot of a knowledge rule before modifying it.
 * Inserts current state into steve_knowledge_versions and increments version_number.
 */
export async function snapshotBeforeUpdate(
  knowledgeId: string,
  changedBy: string,
  reason: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Read current state
  const { data: current, error: readErr } = await supabase
    .from('steve_knowledge')
    .select('titulo, contenido, categoria, orden, version_number')
    .eq('id', knowledgeId)
    .maybeSingle();

  if (readErr || !current) {
    console.error(`[knowledge-versioner] Failed to read rule ${knowledgeId}:`, readErr?.message);
    return;
  }

  const versionNumber = current.version_number ?? 1;

  // Insert snapshot
  const { error: insertErr } = await supabase
    .from('steve_knowledge_versions')
    .insert({
      knowledge_id: knowledgeId,
      titulo: current.titulo,
      contenido: current.contenido,
      categoria: current.categoria,
      orden: current.orden,
      version_number: versionNumber,
      changed_by: changedBy,
      change_reason: reason,
    });

  if (insertErr) {
    console.error(`[knowledge-versioner] Failed to insert version for ${knowledgeId}:`, insertErr.message);
    return;
  }

  // Increment version_number on the main record
  await supabase
    .from('steve_knowledge')
    .update({ version_number: versionNumber + 1 })
    .eq('id', knowledgeId);
}
