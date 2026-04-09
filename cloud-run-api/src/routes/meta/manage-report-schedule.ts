import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/**
 * POST /api/manage-report-schedule
 * Manages scheduled report configurations for clients.
 * Uses steve_knowledge table as a generic store (category: 'report_schedule').
 * Auth: JWT (authMiddleware)
 *
 * Body: {
 *   action: 'save' | 'get' | 'delete',
 *   client_id: string,
 *   report_type: string,       // e.g. 'meta_analytics'
 *   frequency?: 'weekly' | 'monthly',
 *   day_of_week?: number,      // 0-6 for weekly
 *   day_of_month?: number,     // 1-31 for monthly
 *   recipient_email?: string,
 * }
 */
export async function manageReportSchedule(c: Context) {
  try {
    const { action, client_id, report_type, frequency, day_of_week, day_of_month, recipient_email } =
      await c.req.json();

    if (!action) return c.json({ error: 'Missing action' }, 400);
    if (!client_id) return c.json({ error: 'Missing client_id' }, 400);

    const supabase = getSupabaseAdmin();

    // IDOR prevention: verify authenticated user owns client_id
    const user = c.get('user');
    if (user?.id) {
      const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
      if (!isSuperAdmin && !clientIds.includes(client_id)) {
        return c.json({ error: 'Forbidden: you do not own this client' }, 403);
      }
    }

    // Use steve_knowledge as generic store: titulo = unique key, contenido = JSON payload
    const scheduleTitle = `report_schedule:${client_id}:${report_type || 'default'}`;

    // --- GET ---
    if (action === 'get') {
      const { data: existing } = await supabase
        .from('steve_knowledge')
        .select('contenido')
        .eq('categoria', 'report_schedule')
        .eq('titulo', scheduleTitle)
        .maybeSingle();

      let schedule = null;
      if (existing?.contenido) {
        try {
          schedule = JSON.parse(existing.contenido);
        } catch {
          schedule = null;
        }
      }
      return c.json({ success: true, schedule });
    }

    // --- SAVE ---
    if (action === 'save') {
      if (!report_type) return c.json({ error: 'Missing report_type' }, 400);
      if (!frequency) return c.json({ error: 'Missing frequency' }, 400);
      if (!recipient_email) return c.json({ error: 'Missing recipient_email' }, 400);

      const scheduleConfig = {
        client_id,
        report_type,
        frequency,
        day_of_week: frequency === 'weekly' ? day_of_week : null,
        day_of_month: frequency === 'monthly' ? day_of_month : null,
        recipient_email,
        updated_at: new Date().toISOString(),
      };

      // Check if record exists to decide insert vs update
      const { data: existing } = await supabase
        .from('steve_knowledge')
        .select('id')
        .eq('categoria', 'report_schedule')
        .eq('titulo', scheduleTitle)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('steve_knowledge')
          .update({ contenido: JSON.stringify(scheduleConfig) })
          .eq('id', existing.id);

        if (updateError) {
          console.error('[manage-report-schedule] Update error:', updateError);
          return c.json({ error: 'Failed to save schedule' }, 500);
        }
      } else {
        const { error: insertError } = await supabase
          .from('steve_knowledge')
          .insert({
            categoria: 'report_schedule',
            titulo: scheduleTitle,
            contenido: JSON.stringify(scheduleConfig),
            activo: true,
          });

        if (insertError) {
          console.error('[manage-report-schedule] Insert error:', insertError);
          return c.json({ error: 'Failed to save schedule' }, 500);
        }
      }

      console.log(`[manage-report-schedule] Saved schedule for client ${client_id}: ${report_type} ${frequency}`);
      return c.json({ success: true, schedule: scheduleConfig });
    }

    // --- DELETE ---
    if (action === 'delete') {
      const { error: deleteError } = await supabase
        .from('steve_knowledge')
        .delete()
        .eq('categoria', 'report_schedule')
        .eq('titulo', scheduleTitle);

      if (deleteError) {
        console.error('[manage-report-schedule] Delete error:', deleteError);
        return c.json({ error: 'Failed to delete schedule' }, 500);
      }

      return c.json({ success: true });
    }

    return c.json({ error: `Invalid action: ${action}` }, 400);
  } catch (err: any) {
    console.error('[manage-report-schedule] Error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
}
