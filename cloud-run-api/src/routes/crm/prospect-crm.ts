import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { sendMetaCAPIEvent } from '../../lib/meta-capi.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds, verifyProspectOwnership } from '../../lib/user-scoping.js';

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
    if (expected_close_date && isNaN(new Date(expected_close_date).getTime())) return c.json({ error: 'Invalid expected_close_date' }, 400);
    if (expected_close_date !== undefined) update.expected_close_date = expected_close_date || null;

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
    return c.json({ error: error.message || 'Internal server error' }, 500);
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

    // Fix #81: append to existing admin_notes instead of overwriting
    const { data: current } = await supabase
      .from('wa_prospects')
      .select('admin_notes')
      .eq('id', prospect_id)
      .single();
    const existingNotes = current?.admin_notes || '';
    const updatedNotes = existingNotes
      ? `${existingNotes}\n\n---\n[${new Date().toISOString()}]\n${note}`
      : note;

    const { error } = await supabase
      .from('wa_prospects')
      .update({ admin_notes: updatedNotes, updated_at: new Date().toISOString() })
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
    const oldStage = prospect?.stage || 'unknown';

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
    if (!prospect_id || !Array.isArray(tags)) return c.json({ error: 'prospect_id and tags[] required' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    const { error } = await supabase
      .from('wa_prospects')
      .update({ tags, updated_at: new Date().toISOString() })
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

    // Delete related records first (events, tasks, proposals)
    await Promise.all([
      supabase.from('wa_prospect_events').delete().eq('prospect_id', prospect_id),
      supabase.from('sales_tasks').delete().eq('prospect_id', prospect_id),
      supabase.from('proposals').delete().eq('prospect_id', prospect_id),
    ]);

    const { error } = await supabase
      .from('wa_prospects')
      .delete()
      .eq('id', prospect_id);

    if (error) return c.json({ error: error.message }, 500);

    logProspectEvent(prospect_id, 'deleted', {}, `admin:${user?.id || 'unknown'}`);

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
    const oldStage = prospect?.stage || 'unknown';

    if (oldStage === new_stage) return c.json({ success: true, moved: false });

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
