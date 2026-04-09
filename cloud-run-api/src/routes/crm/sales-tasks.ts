import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds, verifyProspectOwnership } from '../../lib/user-scoping.js';

/** CRUD for sales tasks: list, create, update, complete */
export async function salesTasksCrud(c: Context) {
  try {
    const body = await c.req.json();
    const { action } = body;
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant scoping
    const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);

    switch (action) {
      case 'list': {
        const { prospect_id, status, assigned_to } = body;

        // If filtering by prospect, verify ownership
        if (prospect_id && !isSuperAdmin) {
          const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
          if (!allowed) return c.json({ error: 'Forbidden' }, 403);
        }

        let query = supabase.from('sales_tasks').select('*, wa_prospects(id, phone, name, profile_name, company, stage)');

        if (prospect_id) query = query.eq('prospect_id', prospect_id);
        if (status) query = query.eq('status', status);

        // Fix #79: non-admin cannot use assigned_to to see other users' tasks
        if (isSuperAdmin && assigned_to) {
          query = query.eq('assigned_to', assigned_to);
        }

        // Non-admin: only see tasks assigned to them or linked to their prospects
        if (!isSuperAdmin && !prospect_id) {
          query = query.eq('assigned_to', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) return c.json({ error: error.message }, 500);
        return c.json({ tasks: data || [] });
      }

      case 'create': {
        const { prospect_id, title, description, task_type, due_at } = body;
        if (!title) return c.json({ error: 'title required' }, 400);

        if (due_at && isNaN(new Date(due_at).getTime())) return c.json({ error: 'Invalid due_at date' }, 400);

        // Verify ownership of the prospect if one is specified
        if (prospect_id && !isSuperAdmin) {
          const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
          if (!allowed) return c.json({ error: 'Forbidden' }, 403);
        }

        const { data, error } = await supabase
          .from('sales_tasks')
          .insert({
            prospect_id: prospect_id || null,
            assigned_to: user.id,
            title,
            description: description || null,
            task_type: task_type || 'manual',
            due_at: due_at || null,
          })
          .select()
          .single();

        if (error) return c.json({ error: error.message }, 500);

        if (prospect_id) {
          logProspectEvent(prospect_id, 'task_created', { task_id: data.id, title }, `admin:${user.id}`);
        }

        return c.json({ task: data });
      }

      case 'update': {
        const { task_id, title, description, status, due_at } = body;
        if (!task_id) return c.json({ error: 'task_id required' }, 400);

        // Verify the user owns this task (or is super admin)
        if (!isSuperAdmin) {
          const { data: task } = await supabase
            .from('sales_tasks')
            .select('assigned_to')
            .eq('id', task_id)
            .maybeSingle();
          if (!task || task.assigned_to !== user.id) return c.json({ error: 'Forbidden' }, 403);
        }

        const validStatuses = ['pending', 'in_progress', 'completed'];
        if (status !== undefined && !validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400);

        if (due_at !== undefined && due_at && isNaN(new Date(due_at).getTime())) return c.json({ error: 'Invalid due_at date' }, 400);

        const updatePayload: Record<string, any> = {};
        if (title !== undefined) updatePayload.title = title;
        if (description !== undefined) updatePayload.description = description;
        if (status !== undefined) updatePayload.status = status;
        if (due_at !== undefined) updatePayload.due_at = due_at;

        if (status === 'completed') {
          updatePayload.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from('sales_tasks')
          .update(updatePayload)
          .eq('id', task_id)
          .select()
          .single();

        if (error) return c.json({ error: error.message }, 500);
        return c.json({ task: data });
      }

      case 'complete': {
        const { task_id } = body;
        if (!task_id) return c.json({ error: 'task_id required' }, 400);

        // Verify the user owns this task (or is super admin)
        if (!isSuperAdmin) {
          const { data: task } = await supabase
            .from('sales_tasks')
            .select('assigned_to')
            .eq('id', task_id)
            .maybeSingle();
          if (!task || task.assigned_to !== user.id) return c.json({ error: 'Forbidden' }, 403);
        }

        const { data, error } = await supabase
          .from('sales_tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', task_id)
          .select()
          .single();

        if (error) return c.json({ error: error.message }, 500);
        return c.json({ task: data });
      }

      default:
        return c.json({ error: 'Invalid action. Use: list, create, update, complete' }, 400);
    }
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** Auto-generate tasks based on prospect stage/score */
export async function salesTasksAutoGenerate(c: Context) {
  try {
    const { prospect_id } = await c.req.json();
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant scoping
    const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);

    // If prospect_id given, generate for one; else for all active prospects
    let prospects: any[];

    if (prospect_id) {
      // Verify ownership if not super admin
      if (!isSuperAdmin) {
        const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
        if (!allowed) return c.json({ error: 'Forbidden' }, 403);
      }
      const data = await safeQuerySingleOrDefault<any>(
        supabase.from('wa_prospects').select('id, stage, lead_score, name, phone, meeting_status').eq('id', prospect_id).single(),
        null,
        'salesTasks.getProspectById',
      );
      prospects = data ? [data] : [];
    } else {
      let query = supabase
        .from('wa_prospects')
        .select('id, stage, lead_score, name, phone, meeting_status')
        .not('stage', 'in', '(converted,lost)')
        .order('updated_at', { ascending: false })
        .limit(50);

      // Non-admin: only auto-generate for their own prospects
      // Bug #38 fix: .in() excludes NULL converted_client_id (active pipeline prospects)
      if (!isSuperAdmin) {
        if (clientIds.length === 0) return c.json({ created: 0, prospects_evaluated: 0 });
        const clientList = clientIds.map((id: string) => `converted_client_id.eq.${id}`).join(',');
        query = query.or(`${clientList},converted_client_id.is.null`);
      }

      const data = await safeQueryOrDefault<any>(query, [], 'salesTasks.getActiveProspects');
      prospects = data || [];
    }

    // Guard against too many prospects to prevent Cartesian product DoS
    if (prospects.length > 100) {
      return c.json({ error: 'Too many prospects for auto-generate (max 100)' }, 400);
    }

    // Get existing pending tasks to avoid duplicates
    const prospectIds = prospects.map(p => p.id);
    const existingTasks = await safeQueryOrDefault<any>(
      supabase
        .from('sales_tasks')
        .select('prospect_id, task_type, status')
        .in('prospect_id', prospectIds)
        .eq('status', 'pending'),
      [],
      'salesTasks.getExistingTasks',
    );

    const existingSet = new Set(
      (existingTasks || []).map(t => `${t.prospect_id}:${t.task_type}`)
    );

    const tasksToInsert: any[] = [];

    for (const p of prospects) {
      const stage = p.stage || 'new';
      const score = p.lead_score || 0;

      const addTask = (type: string, title: string, desc: string) => {
        if (!existingSet.has(`${p.id}:${type}`)) {
          tasksToInsert.push({
            prospect_id: p.id,
            assigned_to: user?.id || null,
            title,
            description: desc,
            task_type: type,
            status: 'pending',
            due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // +24h
          });
        }
      };

      if (stage === 'new') {
        addTask('auto_followup', `Revisar perfil: ${p.name || p.phone}`, 'Revisar primera interacción y perfil del prospecto. Evaluar potencial.');
      }

      if (stage === 'qualifying' && score >= 50) {
        addTask('auto_followup', `Preparar pitch: ${p.name || p.phone}`, `Score ${score}. Preparar pitch personalizado basado en su negocio.`);
      }

      if (stage === 'pitching') {
        addTask('auto_proposal', `Enviar propuesta: ${p.name || p.phone}`, 'El prospecto está en etapa de pitching. Generar y enviar propuesta formal.');
      }

      if (stage === 'closing') {
        addTask('auto_followup', `Follow up cierre: ${p.name || p.phone}`, 'El prospecto está en closing. Hacer follow up para cerrar la venta.');
      }

      if (p.meeting_status === 'scheduled') {
        addTask('auto_meeting_prep', `Preparar reunión: ${p.name || p.phone}`, 'Reunión agendada. Preparar material, deck, y puntos a cubrir.');
      }
    }

    if (tasksToInsert.length > 0) {
      const { error } = await supabase.from('sales_tasks').insert(tasksToInsert);
      if (error) return c.json({ error: error.message }, 500);
    }

    return c.json({ created: tasksToInsert.length, prospects_evaluated: prospects.length });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
