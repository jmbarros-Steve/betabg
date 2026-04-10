import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { sendMetaCAPIEvent } from '../../lib/meta-capi.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds, verifyProspectOwnership } from '../../lib/user-scoping.js';

// Bug #129 fix: valid stage transitions map — prevents arbitrary stage jumps
// Each stage maps to the set of stages it can transition TO.
// 'lost' can be reached from any active stage. 'converted' only from 'closing'.
const VALID_STAGE_TRANSITIONS: Record<string, string[]> = {
  new:        ['discovery', 'lost'],
  discovery:  ['qualifying', 'new', 'lost'],
  qualifying: ['pitching', 'discovery', 'lost'],
  pitching:   ['closing', 'qualifying', 'lost'],
  closing:    ['converted', 'pitching', 'lost'],
  converted:  [],  // terminal state — no transitions out
  lost:       ['new'],  // can reopen to 'new' only
};

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true; // no-op is always valid
  const allowed = VALID_STAGE_TRANSITIONS[from];
  if (!allowed) return false; // unknown source stage
  return allowed.includes(to);
}

/** Update deal value, win probability, expected close date */
export async function prospectUpdateDeal(c: Context) {
  try {
    const { prospect_id, deal_value, win_probability, expected_close_date } = await c.req.json();
    if (!prospect_id) return c.json({ error: 'prospect_id required' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const update: Record<string, any> = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
    if (deal_value != null) {
      const dv = Number(deal_value);
      if (isNaN(dv) || dv < 0) return c.json({ error: 'deal_value must be a non-negative number' }, 400);
      update.deal_value = dv;
    }
    if (win_probability != null) {
      // Bug #54 fix: Number("alta") = NaN passes < 0 and > 100 checks (both false)
      const wp = Number(win_probability);
      if (isNaN(wp) || wp < 0 || wp > 100) return c.json({ error: 'win_probability must be a number 0-100' }, 400);
      update.win_probability = wp;
    }
    if (expected_close_date !== undefined && expected_close_date !== null && expected_close_date !== '') {
      // Bug #174 fix: Validate date format, reject past dates, and cap at +2 years
      const parsedDate = new Date(expected_close_date);
      if (isNaN(parsedDate.getTime())) return c.json({ error: 'Invalid expected_close_date' }, 400);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDate < today) return c.json({ error: 'expected_close_date must be in the future' }, 400);
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 2);
      if (parsedDate > maxDate) return c.json({ error: 'expected_close_date too far in future (max 2 years)' }, 400);
      update.expected_close_date = parsedDate.toISOString();
    } else if (expected_close_date === null || expected_close_date === '') {
      update.expected_close_date = null;
    }

    const { error } = await supabase
      .from('wa_prospects')
      .update(update)
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    logProspectEvent(prospect_id, 'deal_updated', {
      deal_value: update.deal_value,
      win_probability: update.win_probability,
      expected_close_date: update.expected_close_date,
    }, `admin:${user?.id || 'unknown'}`);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** GET full prospect detail: profile + events + tasks + proposals + recent messages */
export async function prospectDetail(c: Context) {
  try {
    const { prospect_id } = await c.req.json();
    if (!prospect_id) return c.json({ error: 'prospect_id required' }, 400);

    // Bug #123 fix: Validate prospect_id is a valid UUID before passing to .eq()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof prospect_id !== 'string' || !uuidRegex.test(prospect_id)) {
      return c.json({ error: 'Invalid prospect_id format' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const [prospectRes, eventsRes, tasksRes, proposalsRes] = await Promise.all([
      supabase.from('wa_prospects').select('*').eq('id', prospect_id).single(),
      supabase.from('wa_prospect_events').select('*').eq('prospect_id', prospect_id).order('created_at', { ascending: false }).limit(100),
      supabase.from('sales_tasks').select('*').eq('prospect_id', prospect_id).order('created_at', { ascending: false }),
      supabase.from('proposals').select('*').eq('prospect_id', prospect_id).order('created_at', { ascending: false }),
    ]);

    if (prospectRes.error || !prospectRes.data) {
      return c.json({ error: 'Prospect not found' }, 404);
    }

    // Bug #52 fix: scope messages to prospect channel to prevent cross-merchant leak
    const messages = await safeQueryOrDefault<any>(
      supabase
        .from('wa_messages')
        .select('id, direction, body, created_at, contact_name, metadata')
        .eq('contact_phone', prospectRes.data.phone)
        .eq('channel', 'prospect')
        .is('client_id', null)
        .order('created_at', { ascending: false })
        .limit(50),
      [],
      'prospectCrm.getMessages',
    );

    return c.json({
      prospect: prospectRes.data,
      events: eventsRes.data || [],
      tasks: tasksRes.data || [],
      proposals: proposalsRes.data || [],
      messages: messages || [],
    });
  } catch (error: any) {
    // Bug #123 fix: sanitize error to avoid exposing internal details
    console.error('[prospectDetail] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/** Add admin note to prospect */
export async function prospectAddNote(c: Context) {
  try {
    const { prospect_id, note } = await c.req.json();
    if (!prospect_id || !note) return c.json({ error: 'prospect_id and note required' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    // Bug #211 fix: frontend sends full textarea content, so REPLACE instead of APPEND
    // to prevent exponential duplication on each save
    const { error } = await supabase
      .from('wa_prospects')
      .update({ admin_notes: note, updated_at: new Date().toISOString() })
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    logProspectEvent(prospect_id, 'note_added', { note: note.substring(0, 200) }, `admin:${user?.id || 'unknown'}`);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Change prospect stage manually */
export async function prospectChangeStage(c: Context) {
  try {
    const { prospect_id, stage } = await c.req.json();
    if (!prospect_id || !stage) return c.json({ error: 'prospect_id and stage required' }, 400);

    const validStages = ['new', 'discovery', 'qualifying', 'pitching', 'closing', 'converted', 'lost'];
    if (!validStages.includes(stage)) return c.json({ error: 'Invalid stage' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    // Get current stage for event log
    const prospect = await safeQuerySingleOrDefault<any>(
      supabase.from('wa_prospects').select('stage').eq('id', prospect_id).single(),
      null,
      'prospectCrm.getCurrentStage',
    );
    const oldStage = prospect?.stage || 'new';

    // Bug #129 fix: validate stage transition
    if (!isValidTransition(oldStage, stage)) {
      return c.json({ error: `Transición inválida: no se puede pasar de '${oldStage}' a '${stage}'` }, 400);
    }

    const { error } = await supabase
      .from('wa_prospects')
      .update({ stage, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), is_rotting: false })
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    logProspectEvent(prospect_id, 'stage_change', { from: oldStage, to: stage }, `admin:${user?.id || 'unknown'}`);

    return c.json({ success: true, from: oldStage, to: stage });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Change prospect priority */
export async function prospectChangePriority(c: Context) {
  try {
    const { prospect_id, priority } = await c.req.json();
    if (!prospect_id || !priority) return c.json({ error: 'prospect_id and priority required' }, 400);

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) return c.json({ error: 'Invalid priority' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const { error } = await supabase
      .from('wa_prospects')
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Update prospect tags */
export async function prospectUpdateTags(c: Context) {
  try {
    const { prospect_id, tags } = await c.req.json();
    if (!prospect_id) return c.json({ error: 'prospect_id required' }, 400);

    // Bug #173 fix: Validate and sanitize tags — prevent XSS and tag stuffing
    if (!Array.isArray(tags)) return c.json({ error: 'tags must be array' }, 400);
    const safeTags = tags
      .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      .map((t: string) => t.trim().slice(0, 50).replace(/[<>]/g, ''))
      .slice(0, 20);
    // Bug #212 fix: allow empty array to clear all tags (don't reject safeTags.length === 0)

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const { error } = await supabase
      .from('wa_prospects')
      .update({ tags: safeTags, updated_at: new Date().toISOString() })
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Get all prospects grouped by stage (for Kanban view) */
export async function prospectsKanban(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant scoping
    const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);

    let query = supabase
      .from('wa_prospects')
      .select('id, phone, profile_name, name, company, what_they_sell, stage, lead_score, message_count, updated_at, priority, tags, meeting_status, meeting_at, apellido, deal_value, win_probability, is_rotting')
      .order('updated_at', { ascending: false });

    if (!isSuperAdmin) {
      // Non-admin users see prospects linked to their clients OR unassigned (active pipeline)
      if (clientIds.length === 0) {
        return c.json({ kanban: {}, total: 0, stageTotals: {}, pipelineTotal: 0, pipelineWeighted: 0 });
      }
      // Fix Bug#4: converted_client_id is NULL for active pipeline prospects
      // Use OR to include both converted prospects AND unassigned active ones
      const clientList = clientIds.map((id: string) => `converted_client_id.eq.${id}`).join(',');
      query = query.or(`${clientList},converted_client_id.is.null`);
    }

    const { data, error } = await query;

    if (error) return c.json({ error: error.message }, 500);

    // Group by stage
    const stages = ['new', 'discovery', 'qualifying', 'pitching', 'closing', 'converted', 'lost'];
    const kanban: Record<string, any[]> = {};
    const stageTotals: Record<string, { total: number; weighted: number; count: number }> = {};

    for (const s of stages) {
      const stageProspects = (data || []).filter((p: any) => (p.stage || 'new') === s);
      kanban[s] = stageProspects;

      let total = 0;
      let weighted = 0;
      for (const p of stageProspects) {
        const dv = Number(p.deal_value) || 0;
        total += dv;
        weighted += dv * ((p.win_probability ?? 50) / 100);
      }
      stageTotals[s] = { total, weighted, count: stageProspects.length };
    }

    // Bug #53 fix: Pipeline totals should exclude converted and lost stages
    const activePipelineStages = ['new', 'discovery', 'qualifying', 'pitching', 'closing'];
    const pipelineTotal = activePipelineStages.reduce((s, stage) => s + (stageTotals[stage]?.total || 0), 0);
    const pipelineWeighted = activePipelineStages.reduce((s, stage) => s + (stageTotals[stage]?.weighted || 0), 0);

    return c.json({ kanban, total: (data || []).length, stageTotals, pipelineTotal, pipelineWeighted });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Delete a prospect (Bug #80 fix: server-side ownership check) */
export async function prospectDelete(c: Context) {
  try {
    const { prospect_id } = await c.req.json();
    if (!prospect_id) return c.json({ error: 'prospect_id required' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership before deleting
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    // Bug #118 fix: Get the prospect's phone BEFORE deleting so we can clean up wa_messages
    const prospect = await safeQuerySingleOrDefault<any>(
      supabase.from('wa_prospects').select('phone, name, profile_name').eq('id', prospect_id).single(),
      null,
      'prospectCrm.getProspectForDelete',
    );
    const prospectPhone = prospect?.phone || null;

    // Bug #118 fix: Log the delete event BEFORE actually deleting the prospect
    // (after delete, the prospect_id FK may cause issues in some setups)
    logProspectEvent(prospect_id, 'deleted', {
      phone: prospectPhone,
      name: prospect?.name || prospect?.profile_name || null,
    }, `admin:${user?.id || 'unknown'}`);

    // Delete related records first (events, tasks, proposals, wa_messages)
    try {
      await Promise.all([
        supabase.from('wa_prospect_events').delete().eq('prospect_id', prospect_id),
        supabase.from('sales_tasks').delete().eq('prospect_id', prospect_id),
        supabase.from('proposals').delete().eq('prospect_id', prospect_id),
      ]);
    } catch (cascadeErr: any) {
      console.error('[prospectDelete] Cascade delete failed:', cascadeErr);
      return c.json({ error: 'Failed to delete related records' }, 500);
    }

    // Bug #118 fix: Also delete orphaned wa_messages by contact_phone
    if (prospectPhone) {
      await supabase.from('wa_messages').delete()
        .eq('contact_phone', prospectPhone)
        .eq('channel', 'prospect')
        .is('client_id', null);
    }

    const { error } = await supabase
      .from('wa_prospects')
      .delete()
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Move prospect stage via drag & drop */
export async function prospectMoveStage(c: Context) {
  try {
    const { prospect_id, new_stage } = await c.req.json();
    if (!prospect_id || !new_stage) return c.json({ error: 'prospect_id and new_stage required' }, 400);

    const validStages = ['new', 'discovery', 'qualifying', 'pitching', 'closing', 'converted', 'lost'];
    if (!validStages.includes(new_stage)) return c.json({ error: 'Invalid stage' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const prospect = await safeQuerySingleOrDefault<any>(
      supabase.from('wa_prospects').select('stage, phone, name, profile_name, deal_value').eq('id', prospect_id).single(),
      null,
      'prospectCrm.getProspectForMove',
    );
    const oldStage = prospect?.stage || 'new';

    if (oldStage === new_stage) return c.json({ success: true, moved: false });

    // Bug #129 fix: validate stage transition for drag & drop
    if (!isValidTransition(oldStage, new_stage)) {
      return c.json({ error: `Transición inválida: no se puede pasar de '${oldStage}' a '${new_stage}'` }, 400);
    }

    const { error } = await supabase
      .from('wa_prospects')
      .update({ stage: new_stage, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), is_rotting: false })
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    logProspectEvent(prospect_id, 'stage_change', { from: oldStage, to: new_stage, method: 'drag_drop' }, `admin:${user?.id || 'unknown'}`);

    // Fire Meta CAPI Purchase event when prospect is converted (fire & forget)
    if (new_stage === 'converted' && prospect?.phone) {
      sendMetaCAPIEvent({
        eventName: 'Purchase',
        eventId: `purchase-${prospect_id}`,
        userData: {
          phone: prospect.phone,
          name: prospect.name || prospect.profile_name || undefined,
          country: 'cl',
        },
        customData: {
          value: prospect.deal_value || 0,
          currency: 'CLP',
          content_name: 'Cliente Steve Ads',
          status: 'converted',
        },
      }).catch(() => {});
    }

    return c.json({ success: true, moved: true, from: oldStage, to: new_stage });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
