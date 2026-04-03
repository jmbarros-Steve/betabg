import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function creativeReviewFeed(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Admin role check (same pattern as learn-from-source.ts)
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

    const { action, ...params } = await c.req.json();

    switch (action) {
      case 'list':
        return await handleList(c, supabase, params);
      case 'submit_feedback':
        return await handleSubmitFeedback(c, supabase, params);
      case 'skip':
        return await handleSkip(c, supabase, params);
      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[creative-review-feed]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}

// ─── LIST ───────────────────────────────────────────────────────────

async function handleList(c: Context, supabase: any, params: any) {
  const { review_status, channel } = params;

  let query = supabase
    .from('creative_history')
    .select(`
      id, client_id, channel, copy_text, angle, product_name,
      performance_score, criterio_score, espejo_score, cqs_score,
      review_status, admin_feedback, feedback_rules_generated, feedback_queue_id,
      feedback_processed_at, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (review_status) {
    query = query.eq('review_status', review_status);
  }
  if (channel) {
    query = query.eq('channel', channel);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[creative-review-feed] list error:', error.message);
    return c.json({ error: error.message }, 500);
  }

  // Enrich with client names (no FK exists, so query separately)
  const clientIds = [...new Set((data || []).map((d: any) => d.client_id).filter(Boolean))];
  let clientMap: Record<string, { name: string | null; company: string | null }> = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, company')
      .in('id', clientIds);
    for (const cl of clients || []) {
      clientMap[cl.id] = { name: cl.name, company: cl.company };
    }
  }

  const enriched = (data || []).map((d: any) => ({
    ...d,
    clients: clientMap[d.client_id] || null,
  }));

  // Get stats
  const { data: statsData } = await supabase
    .from('creative_history')
    .select('review_status');

  const stats = {
    pending: 0,
    reviewed: 0,
    skipped: 0,
    rules_generated: 0,
  };

  if (statsData) {
    for (const row of statsData) {
      if (row.review_status === 'pending') stats.pending++;
      else if (row.review_status === 'reviewed') stats.reviewed++;
      else if (row.review_status === 'skipped') stats.skipped++;
    }
  }

  // Sum rules generated
  const { data: rulesData } = await supabase
    .from('creative_history')
    .select('feedback_rules_generated')
    .eq('review_status', 'reviewed')
    .not('feedback_rules_generated', 'is', null);

  if (rulesData) {
    stats.rules_generated = rulesData.reduce(
      (sum: number, r: any) => sum + (r.feedback_rules_generated || 0),
      0
    );
  }

  return c.json({ items: enriched, stats });
}

// ─── SUBMIT FEEDBACK ────────────────────────────────────────────────

async function handleSubmitFeedback(c: Context, supabase: any, params: any) {
  const { creative_id, feedback } = params;

  if (!creative_id || !feedback?.trim()) {
    return c.json({ error: 'creative_id and feedback are required' }, 400);
  }

  // 1. Fetch creative
  const { data: creative, error: fetchErr } = await supabase
    .from('creative_history')
    .select('id, copy_text, angle, channel, product_name, client_id')
    .eq('id', creative_id)
    .single();

  if (fetchErr || !creative) {
    return c.json({ error: 'Creative not found' }, 404);
  }

  // 2. Fetch client context
  const { data: client } = await supabase
    .from('clients')
    .select('name, company')
    .eq('id', creative.client_id)
    .single();

  const { data: brandRes } = await supabase
    .from('brand_research')
    .select('industry')
    .eq('client_id', creative.client_id)
    .maybeSingle();

  // 3. Build enriched text for learning pipeline
  const clientName = client?.name || client?.company || 'Cliente desconocido';
  const industry = brandRes?.industry || 'no especificada';

  const enrichedContent = [
    `FEEDBACK DE REVISIÓN CREATIVA`,
    ``,
    `Canal: ${creative.channel || 'desconocido'}`,
    `Cliente: ${clientName}`,
    `Industria: ${industry}`,
    `Producto: ${creative.product_name || 'no especificado'}`,
    `Ángulo: ${creative.angle || 'no especificado'}`,
    ``,
    `--- COPY ORIGINAL ---`,
    creative.copy_text || '(sin copy)',
    ``,
    `--- FEEDBACK DE JM ---`,
    feedback.trim(),
  ].join('\n');

  // 4. Insert into learning_queue
  const { data: queueRow, error: insertErr } = await supabase
    .from('learning_queue')
    .insert({
      source_type: 'feedback',
      source_content: enrichedContent.slice(0, 2000),
      source_title: `Feedback: ${creative.angle || creative.channel || 'creative'} — ${clientName}`,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !queueRow?.id) {
    console.error('[creative-review-feed] Failed to create queue item:', insertErr?.message);
    return c.json({ error: 'Error creando item en cola de aprendizaje' }, 500);
  }

  // 5. Set to processing
  await supabase
    .from('learning_queue')
    .update({ status: 'processing' })
    .eq('id', queueRow.id);

  // 6. Update creative_history
  const { error: updateErr } = await supabase
    .from('creative_history')
    .update({
      review_status: 'reviewed',
      admin_feedback: feedback.trim(),
      feedback_queue_id: queueRow.id,
      feedback_processed_at: new Date().toISOString(),
    })
    .eq('id', creative_id);

  if (updateErr) {
    console.error('[creative-review-feed] Failed to update creative:', updateErr.message);
    return c.json({ error: 'Error actualizando creativo' }, 500);
  }

  return c.json({
    status: 'processing',
    queueId: queueRow.id,
    message: 'Feedback enviado al pipeline de aprendizaje',
  });
}

// ─── SKIP ───────────────────────────────────────────────────────────

async function handleSkip(c: Context, supabase: any, params: any) {
  const { creative_ids } = params;

  if (!Array.isArray(creative_ids) || creative_ids.length === 0) {
    return c.json({ error: 'creative_ids array is required' }, 400);
  }

  const { error } = await supabase
    .from('creative_history')
    .update({ review_status: 'skipped' })
    .in('id', creative_ids);

  if (error) {
    console.error('[creative-review-feed] skip error:', error.message);
    return c.json({ error: error.message }, 500);
  }

  return c.json({ status: 'ok', skipped: creative_ids.length });
}
