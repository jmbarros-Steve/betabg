import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Email templates: CRUD for system + custom templates.
 * POST /api/email-templates
 */
export async function emailTemplatesApi(c: Context) {
  const body = await c.req.json();
  const { action } = body;

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'list': {
      const { client_id, category, industry, template_type } = body;
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);

      // Fetch system templates (available to all clients)
      let systemQuery = supabase
        .from('email_templates')
        .select('*')
        .eq('is_system', true)
        .order('created_at', { ascending: false });

      if (category) systemQuery = systemQuery.eq('category', category);
      if (industry) systemQuery = systemQuery.eq('industry', industry);
      if (template_type) systemQuery = systemQuery.eq('template_type', template_type);

      const { data: systemTemplates, error: sysErr } = await systemQuery;
      if (sysErr) return c.json({ error: sysErr.message }, 500);

      // Fetch client's custom templates
      let clientQuery = supabase
        .from('email_templates')
        .select('*')
        .eq('is_system', false)
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      if (category) clientQuery = clientQuery.eq('category', category);
      if (template_type) clientQuery = clientQuery.eq('template_type', template_type);

      const { data: clientTemplates, error: clientErr } = await clientQuery;
      if (clientErr) return c.json({ error: clientErr.message }, 500);

      return c.json({
        templates: [...(systemTemplates || []), ...(clientTemplates || [])],
        system_count: systemTemplates?.length || 0,
        custom_count: clientTemplates?.length || 0,
      });
    }

    case 'get': {
      const { template_id } = body;
      if (!template_id) return c.json({ error: 'template_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', template_id)
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ template: data });
    }

    case 'create': {
      const { client_id, name, description, category, design_json, html_preview } = body;
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);
      if (!name) return c.json({ error: 'name is required' }, 400);

      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          client_id,
          name,
          description: description || null,
          category: category || 'custom',
          design_json: design_json || null,
          html_preview: html_preview || null,
          is_system: false,
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, template: data });
    }

    case 'delete': {
      const { template_id, client_id } = body;
      if (!template_id) return c.json({ error: 'template_id is required' }, 400);
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);

      // Only allow deleting custom (non-system) templates owned by the client
      const { data: existing, error: fetchErr } = await supabase
        .from('email_templates')
        .select('id, is_system, client_id')
        .eq('id', template_id)
        .single();

      if (fetchErr || !existing) return c.json({ error: 'Template not found' }, 404);
      if (existing.is_system) return c.json({ error: 'Cannot delete system templates' }, 400);
      if (existing.client_id !== client_id) return c.json({ error: 'Not authorized to delete this template' }, 403);

      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', template_id)
        .eq('client_id', client_id)
        .eq('is_system', false);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Universal blocks: reusable design blocks for email builder.
 * POST /api/universal-blocks
 */
export async function universalBlocksApi(c: Context) {
  const body = await c.req.json();
  const { action } = body;

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'list': {
      const { client_id } = body;
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_universal_blocks')
        .select('*')
        .eq('client_id', client_id)
        .order('usage_count', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ blocks: data || [] });
    }

    case 'save': {
      const { client_id, name, category, block_json } = body;
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);
      if (!name) return c.json({ error: 'name is required' }, 400);
      if (!block_json) return c.json({ error: 'block_json is required' }, 400);

      const { data, error } = await supabase
        .from('email_universal_blocks')
        .insert({
          client_id,
          name,
          category: category || 'custom',
          block_json,
          usage_count: 0,
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, block: data });
    }

    case 'update': {
      const { block_id, client_id, name, category, block_json } = body;
      if (!block_id) return c.json({ error: 'block_id is required' }, 400);
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);

      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.category = category;
      if (block_json !== undefined) updates.block_json = block_json;

      const { data, error } = await supabase
        .from('email_universal_blocks')
        .update(updates)
        .eq('id', block_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, block: data });
    }

    case 'delete': {
      const { block_id, client_id } = body;
      if (!block_id) return c.json({ error: 'block_id is required' }, 400);
      if (!client_id) return c.json({ error: 'client_id is required' }, 400);

      const { error } = await supabase
        .from('email_universal_blocks')
        .delete()
        .eq('id', block_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'increment_usage': {
      const { block_id } = body;
      if (!block_id) return c.json({ error: 'block_id is required' }, 400);

      const { data: existing, error: fetchErr } = await supabase
        .from('email_universal_blocks')
        .select('usage_count')
        .eq('id', block_id)
        .single();

      if (fetchErr || !existing) return c.json({ error: 'Block not found' }, 404);

      const { data, error } = await supabase
        .from('email_universal_blocks')
        .update({
          usage_count: (existing.usage_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', block_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, block: data });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
