import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function learnFromSource(c: Context) {
  const { sourceType, content, title, queueId } = await c.req.json();

  if (!sourceType || !content?.trim()) {
    return c.json({ error: 'sourceType and content are required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Duplicate check
  if (!queueId) {
    const { data: existing } = await supabase
      .from('learning_queue')
      .select('id, status')
      .eq('source_content', content.trim())
      .in('status', ['pending', 'processing'])
      .limit(1);

    if (existing && existing.length > 0) {
      return c.json({ status: 'duplicate', queueId: existing[0].id, message: 'Este contenido ya está en la cola' });
    }
  }

  let resolvedQueueId = queueId as string | undefined;

  if (resolvedQueueId) {
    const { error: updateErr } = await supabase
      .from('learning_queue')
      .update({
        source_type: sourceType,
        source_content: content.slice(0, 2000),
        source_title: title || null,
        status: 'processing',
        error_message: null,
        processed_at: null,
        rules_extracted: null,
      })
      .eq('id', resolvedQueueId);

    if (updateErr) throw new Error(`Failed to update queue item: ${updateErr.message}`);
  } else {
    const { data: queueRow, error: insertErr } = await supabase
      .from('learning_queue')
      .insert({
        source_type: sourceType,
        source_content: content.slice(0, 2000),
        source_title: title || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !queueRow?.id) {
      throw new Error(`Failed to create queue item: ${insertErr?.message || 'unknown error'}`);
    }

    resolvedQueueId = queueRow.id;

    const { error: statusErr } = await supabase
      .from('learning_queue')
      .update({ status: 'processing' })
      .eq('id', resolvedQueueId);

    if (statusErr) throw new Error(`Failed to set queue item processing: ${statusErr.message}`);
  }

  return c.json({ status: 'processing', queueId: resolvedQueueId });
}
