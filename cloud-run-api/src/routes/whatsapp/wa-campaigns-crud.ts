import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/**
 * POST /api/whatsapp/campaigns
 * CRUD operations for WhatsApp campaign drafts.
 * Auth: JWT (authMiddleware)
 *
 * Body: {
 *   action: 'create' | 'list' | 'update' | 'delete',
 *   client_id: string,
 *   // For create:
 *   name?: string,
 *   template_name?: string,
 *   template_body?: string,
 *   segment_query?: object,   // e.g. { segment: 'all' }
 *   // For update/delete:
 *   campaign_id?: string,
 *   data?: Record<string, any>,
 * }
 */
export async function waCampaignsCrud(c: Context) {
  try {
    const body = await c.req.json();
    const { action, client_id } = body;

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

    // --- CREATE ---
    if (action === 'create') {
      const { name, template_name, template_body, segment_query } = body;

      if (!name) return c.json({ error: 'Missing name' }, 400);
      if (!template_body) return c.json({ error: 'Missing template_body' }, 400);

      if (template_body.length > 1024) {
        return c.json({ error: 'El mensaje no puede superar los 1024 caracteres' }, 400);
      }

      const { data: campaign, error: createError } = await supabase
        .from('wa_campaigns')
        .insert({
          client_id,
          name,
          template_name: template_name || name.toLowerCase().replace(/\s+/g, '_'),
          template_body,
          segment_query: segment_query || { segment: 'all' },
          status: 'draft',
          recipient_count: 0,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          credits_used: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error('[wa-campaigns-crud] Create error:', createError);
        return c.json({ error: 'Failed to create campaign', details: createError.message }, 500);
      }

      console.log(`[wa-campaigns-crud] Created campaign "${name}" for client ${client_id}`);
      return c.json({ success: true, campaign });
    }

    // --- LIST ---
    if (action === 'list') {
      const { data: campaigns, error: listError } = await supabase
        .from('wa_campaigns')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (listError) {
        console.error('[wa-campaigns-crud] List error:', listError);
        return c.json({ error: 'Failed to list campaigns' }, 500);
      }

      return c.json({ success: true, campaigns: campaigns || [] });
    }

    // --- UPDATE ---
    if (action === 'update') {
      const { campaign_id, data: updateData } = body;
      if (!campaign_id) return c.json({ error: 'Missing campaign_id' }, 400);
      if (!updateData) return c.json({ error: 'Missing data' }, 400);

      // Only allow updating draft campaigns
      const { data: existing } = await supabase
        .from('wa_campaigns')
        .select('status')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (!existing) return c.json({ error: 'Campaign not found' }, 404);
      if (existing.status !== 'draft') {
        return c.json({ error: 'Solo se pueden editar borradores' }, 400);
      }

      const allowedFields = ['name', 'template_name', 'template_body', 'segment_query', 'scheduled_at'];
      const safeUpdate: Record<string, any> = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          safeUpdate[field] = updateData[field];
        }
      }

      if (safeUpdate.scheduled_at && isNaN(new Date(safeUpdate.scheduled_at as string).getTime())) return c.json({ error: 'Invalid scheduled_at date' }, 400);

      const { error: updateError } = await supabase
        .from('wa_campaigns')
        .update(safeUpdate)
        .eq('id', campaign_id)
        .eq('client_id', client_id);

      if (updateError) {
        console.error('[wa-campaigns-crud] Update error:', updateError);
        return c.json({ error: 'Failed to update campaign' }, 500);
      }

      return c.json({ success: true });
    }

    // --- DELETE ---
    if (action === 'delete') {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'Missing campaign_id' }, 400);

      // Only allow deleting draft campaigns
      const { data: existing } = await supabase
        .from('wa_campaigns')
        .select('status')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (!existing) return c.json({ error: 'Campaign not found' }, 404);
      if (existing.status !== 'draft') {
        return c.json({ error: 'Solo se pueden eliminar borradores' }, 400);
      }

      const { error: deleteError } = await supabase
        .from('wa_campaigns')
        .delete()
        .eq('id', campaign_id)
        .eq('client_id', client_id);

      if (deleteError) {
        console.error('[wa-campaigns-crud] Delete error:', deleteError);
        return c.json({ error: 'Failed to delete campaign' }, 500);
      }

      return c.json({ success: true });
    }

    return c.json({ error: `Invalid action: ${action}` }, 400);
  } catch (err: any) {
    console.error('[wa-campaigns-crud] Error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
}
