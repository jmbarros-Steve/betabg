import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function learnFromSource(c: Context) {
  try {
  const supabase = getSupabaseAdmin();

  // Admin role check
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('is_super_admin, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!userRole?.is_super_admin && userRole?.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { sourceType, content, title, queueId } = await c.req.json();

  if (!sourceType || !content?.trim()) {
    return c.json({ error: 'sourceType and content are required' }, 400);
  }

  // Duplicate check (includes already completed items)
  if (!queueId) {
    const { data: existing } = await supabase
      .from('learning_queue')
      .select('id, status')
      .eq('source_content', content.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      if (existing[0].status === 'completed' || existing[0].status === 'done') {
        return c.json({ status: 'already_processed', queueId: existing[0].id, message: 'Ya fue procesado anteriormente' });
      }
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

    if (updateErr) {
      console.error('[learn-from-source] Failed to update queue item:', updateErr.message);
      return c.json({ error: 'Error interno del servidor' }, 500);
    }
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
      console.error('[learn-from-source] Failed to create queue item:', insertErr?.message || 'unknown error');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    resolvedQueueId = queueRow.id;

    const { error: statusErr } = await supabase
      .from('learning_queue')
      .update({ status: 'processing' })
      .eq('id', resolvedQueueId);

    if (statusErr) {
      console.error('[learn-from-source] Failed to set queue item processing:', statusErr.message);
      return c.json({ error: 'Error interno del servidor' }, 500);
    }
  }

  return c.json({ status: 'processing', queueId: resolvedQueueId });
  } catch (err: any) {
    console.error('[learn-from-source]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
