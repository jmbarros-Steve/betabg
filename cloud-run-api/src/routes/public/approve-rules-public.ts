import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { propagateKnowledge } from '../../lib/knowledge-propagator.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * GET/POST /api/approve-rules-public
 * Token-based public API (no JWT) for approving/rejecting pending swarm insights.
 *
 * GET  ?token=XXX          → list pending rules
 * POST {token, action, ids} → approve/reject rules
 */
export async function approveRulesPublic(c: Context) {
  const supabase = getSupabaseAdmin();

  if (c.req.method === 'GET') {
    return handleGet(c, supabase);
  }
  return handlePost(c, supabase);
}

// ─────────────────────────────────────────────────────────────
// GET — list pending insights for a given token
// ─────────────────────────────────────────────────────────────
async function handleGet(c: Context, supabase: any) {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Missing token parameter' }, 400);
  }

  // Validate token
  const tokenError = await validateToken(supabase, token);
  if (tokenError) {
    return c.json({ error: tokenError }, 403);
  }

  // Fetch pending insights
  const { data: pending, error: queryErr } = await supabase
    .from('steve_knowledge')
    .select('id, titulo, contenido, categoria, source_explanation, confidence, sources_urls, created_at')
    .eq('approval_status', 'pending')
    .eq('activo', true)
    .order('confidence', { ascending: false });

  if (queryErr) {
    return c.json({ error: 'Failed to query pending insights', details: queryErr.message }, 500);
  }

  return c.json({ pending: pending || [] });
}

// ─────────────────────────────────────────────────────────────
// POST — approve or reject rules
// ─────────────────────────────────────────────────────────────
async function handlePost(c: Context, supabase: any) {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { token, action, ids } = body;

  if (!token) {
    return c.json({ error: 'Missing token' }, 400);
  }
  if (!action) {
    return c.json({ error: 'Missing action (approve, reject, approve_all, reject_all)' }, 400);
  }

  // Validate token
  const tokenError = await validateToken(supabase, token);
  if (tokenError) {
    return c.json({ error: tokenError }, 403);
  }

  const validActions = ['approve', 'reject', 'approve_all', 'reject_all'];
  if (!validActions.includes(action)) {
    return c.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, 400);
  }

  // For individual actions, ids are required
  if ((action === 'approve' || action === 'reject') && (!Array.isArray(ids) || ids.length === 0)) {
    return c.json({ error: 'ids[] required for approve/reject actions' }, 400);
  }

  let updated = 0;

  if (action === 'approve') {
    const { count, error } = await supabase
      .from('steve_knowledge')
      .update({ approval_status: 'approved', orden: 90 })
      .in('id', ids)
      .eq('approval_status', 'pending');
    if (error) return c.json({ error: 'Update failed', details: error.message }, 500);
    updated = count || ids.length;

    // Also approve siblings sharing the same insight_group_id
    const rows = await safeQueryOrDefault<any>(
      supabase.from('steve_knowledge').select('insight_group_id').in('id', ids),
      [],
      'approveRulesPublic.getGroupIds',
    );
    const groupIds = (rows || []).map((r: any) => r.insight_group_id).filter(Boolean);
    if (groupIds.length > 0) {
      const { count: sibCount } = await supabase.from('steve_knowledge')
        .update({ approval_status: 'approved', orden: 90 })
        .in('insight_group_id', groupIds)
        .eq('approval_status', 'pending');
      updated += sibCount || 0;
    }

    const allIds = [...ids];
    if (groupIds.length > 0) {
      const siblingRows = await safeQueryOrDefault<any>(
        supabase.from('steve_knowledge').select('id').in('insight_group_id', groupIds),
        [],
        'approveRulesPublic.getSiblingRows',
      );
      if (siblingRows) allIds.push(...siblingRows.map((r: any) => r.id));
    }
    propagateKnowledge([...new Set(allIds)]).catch(err => console.error('[approve-public] Propagation error:', err));

  } else if (action === 'reject') {
    const { count, error } = await supabase
      .from('steve_knowledge')
      .update({ approval_status: 'rejected', activo: false })
      .in('id', ids)
      .eq('approval_status', 'pending');
    if (error) return c.json({ error: 'Update failed', details: error.message }, 500);
    updated = count || ids.length;

    // Also reject siblings sharing the same insight_group_id
    const rejRows = await safeQueryOrDefault<any>(
      supabase.from('steve_knowledge').select('insight_group_id').in('id', ids),
      [],
      'approveRulesPublic.getRejectGroupIds',
    );
    const rejGroupIds = (rejRows || []).map((r: any) => r.insight_group_id).filter(Boolean);
    if (rejGroupIds.length > 0) {
      const { count: sibCount } = await supabase.from('steve_knowledge')
        .update({ approval_status: 'rejected', activo: false })
        .in('insight_group_id', rejGroupIds)
        .eq('approval_status', 'pending');
      updated += sibCount || 0;
    }

  } else if (action === 'approve_all') {
    // Fetch IDs before updating so we can propagate them
    const pendingRows = await safeQueryOrDefault<any>(
      supabase
        .from('steve_knowledge')
        .select('id')
        .eq('approval_status', 'pending')
        .eq('activo', true),
      [],
      'approveRulesPublic.getPendingRows',
    );

    const { count, error } = await supabase
      .from('steve_knowledge')
      .update({ approval_status: 'approved', orden: 90 })
      .eq('approval_status', 'pending')
      .eq('activo', true);
    if (error) return c.json({ error: 'Update failed', details: error.message }, 500);
    updated = count || 0;

    if (pendingRows && pendingRows.length > 0) {
      const pendingIds = pendingRows.map((r: any) => r.id);
      propagateKnowledge(pendingIds).catch(err => console.error('[approve-public] Propagation error:', err));
    }

  } else if (action === 'reject_all') {
    const { count, error } = await supabase
      .from('steve_knowledge')
      .update({ approval_status: 'rejected', activo: false })
      .eq('approval_status', 'pending')
      .eq('activo', true);
    if (error) return c.json({ error: 'Update failed', details: error.message }, 500);
    updated = count || 0;
  }

  // Log the action
  await supabase.from('qa_log').insert({
    check_type: 'approve_rules_action',
    status: 'pass',
    details: { action, ids: ids || 'all', updated },
  });

  return c.json({ success: true, action, updated });
}

// ─────────────────────────────────────────────────────────────
// Token validation
// ─────────────────────────────────────────────────────────────
async function validateToken(supabase: any, token: string): Promise<string | null> {
  const { data: digest, error } = await supabase
    .from('auto_learning_digests')
    .select('id, expires_at')
    .eq('token', token)
    .single();

  if (error || !digest) {
    return 'Invalid or expired token';
  }

  if (new Date(digest.expires_at) < new Date()) {
    return 'Token expired';
  }

  return null;
}
