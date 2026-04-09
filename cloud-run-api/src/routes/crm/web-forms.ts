import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Web Forms CRUD — authenticated (admin dashboard)
 * Actions: list, create, get, update, delete
 */
export async function webFormsCrud(c: Context) {
  try {
    const body = await c.req.json();
    const action = body.action || 'list';
    const supabase = getSupabaseAdmin();
    const user = c.get('user');

    if (action === 'list') {
      const { data, error } = await supabase
        .from('web_forms')
        .select('*, web_form_submissions(count)')
        .order('created_at', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ forms: data || [] });
    }

    if (action === 'create') {
      const { form_name, fields, redirect_url, notify_whatsapp, auto_create_prospect } = body;
      const { data, error } = await supabase
        .from('web_forms')
        .insert({
          user_id: user?.id || null,
          form_name: form_name || 'Nuevo formulario',
          fields: fields || undefined,
          redirect_url: redirect_url || null,
          notify_whatsapp: notify_whatsapp ?? true,
          auto_create_prospect: auto_create_prospect ?? true,
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ form: data });
    }

    if (action === 'get') {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id required' }, 400);

      const [formRes, subsRes] = await Promise.all([
        supabase.from('web_forms').select('*').eq('id', form_id).single(),
        supabase.from('web_form_submissions').select('*').eq('form_id', form_id).order('created_at', { ascending: false }).limit(50),
      ]);

      if (formRes.error) return c.json({ error: formRes.error.message }, 500);
      return c.json({ form: formRes.data, submissions: subsRes.data || [] });
    }

    if (action === 'update') {
      const { form_id, ...updates } = body;
      if (!form_id) return c.json({ error: 'form_id required' }, 400);

      const allowed: Record<string, any> = {};
      if (updates.form_name !== undefined) allowed.form_name = updates.form_name;
      if (updates.fields !== undefined) allowed.fields = updates.fields;
      if (updates.redirect_url !== undefined) allowed.redirect_url = updates.redirect_url;
      if (updates.notify_whatsapp !== undefined) allowed.notify_whatsapp = updates.notify_whatsapp;
      if (updates.auto_create_prospect !== undefined) allowed.auto_create_prospect = updates.auto_create_prospect;
      if (updates.is_active !== undefined) allowed.is_active = updates.is_active;

      const { error } = await supabase.from('web_forms').update(allowed).eq('id', form_id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    if (action === 'delete') {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id required' }, 400);
      const { error } = await supabase.from('web_forms').delete().eq('id', form_id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    return c.json({ error: `Unknown action: ${action}` }, 400);
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/**
 * Web Form Submit — PUBLIC (no auth)
 * Receives form submission, creates prospect, optionally notifies via WA
 */
export async function webFormSubmit(c: Context) {
  try {
    const body = await c.req.json();
    const { form_id, data } = body;
    if (!form_id || !data) return c.json({ error: 'form_id and data required' }, 400);

    const supabase = getSupabaseAdmin();

    // Load form config
    const { data: form, error: formErr } = await supabase
      .from('web_forms')
      .select('*')
      .eq('id', form_id)
      .eq('is_active', true)
      .single();

    if (formErr || !form) {
      return c.json({ error: 'Form not found or inactive' }, 404);
    }

    // Validate required fields
    const fields = (form.fields || []) as Array<{ name: string; required: boolean }>;
    for (const field of fields) {
      if (field.required && !data[field.name]) {
        return c.json({ error: `Campo requerido: ${field.name}` }, 400);
      }
    }

    let prospectId: string | null = null;

    // Auto-create prospect if enabled
    if (form.auto_create_prospect) {
      const phone = data.telefono || data.phone || null;
      const name = data.nombre || data.name || null;
      const email = data.email || null;
      const company = data.empresa || data.company || null;

      // Check for existing prospect by phone or email
      let existing: any = null;
      if (phone) {
        const byPhone = await safeQuerySingleOrDefault<any>(
          supabase
            .from('wa_prospects')
            .select('id')
            .eq('phone', phone)
            .maybeSingle(),
          null,
          'webForms.getProspectByPhone',
        );
        existing = byPhone;
      }
      if (!existing && email) {
        const byEmail = await safeQuerySingleOrDefault<any>(
          supabase
            .from('wa_prospects')
            .select('id')
            .eq('email', email)
            .maybeSingle(),
          null,
          'webForms.getProspectByEmail',
        );
        existing = byEmail;
      }

      if (existing) {
        prospectId = existing.id;
        // Update last_activity
        await supabase.from('wa_prospects').update({
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        const { data: newProspect, error: insertErr } = await supabase
          .from('wa_prospects')
          .insert({
            phone: phone || `web-${Date.now()}`,
            name,
            email,
            company,
            stage: 'new',
            lead_score: 10,
            source: 'web_form',
            profile_name: name,
            last_activity_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (!insertErr && newProspect) {
          prospectId = newProspect.id;
          logProspectEvent(newProspect.id, 'prospect_created', { source: 'web_form', form_id, form_name: form.form_name }, 'system');
        }
      }
    }

    // Save submission
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '';
    const userAgent = c.req.header('user-agent') || '';

    const { data: submission, error: subErr } = await supabase
      .from('web_form_submissions')
      .insert({
        form_id,
        data,
        prospect_id: prospectId,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (subErr) return c.json({ error: subErr.message }, 500);

    // Notify admin via WhatsApp (fire & forget)
    if (form.notify_whatsapp && prospectId) {
      const adminPhone = process.env.ADMIN_WA_PHONE || process.env.JOSE_WHATSAPP_NUMBER;
      if (adminPhone) {
        try {
          const { sendWhatsApp } = await import('../../lib/twilio-client.js');
          const name = data.nombre || data.name || 'Desconocido';
          const msg = `Nuevo lead via formulario "${form.form_name}":\n${name}\n${data.email || ''}\n${data.telefono || data.phone || ''}`;
          await sendWhatsApp(adminPhone, msg);
        } catch {} // Don't fail on notification error
      }
    }

    return c.json({
      success: true,
      submission_id: submission?.id,
      prospect_id: prospectId,
      redirect_url: form.redirect_url || null,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/**
 * Get form config — PUBLIC (for rendering the form)
 */
export async function webFormConfig(c: Context) {
  try {
    const { form_id } = await c.req.json();
    if (!form_id) return c.json({ error: 'form_id required' }, 400);

    const supabase = getSupabaseAdmin();
    const { data: form, error } = await supabase
      .from('web_forms')
      .select('id, form_name, fields, redirect_url, is_active')
      .eq('id', form_id)
      .eq('is_active', true)
      .single();

    if (error || !form) return c.json({ error: 'Form not found or inactive' }, 404);
    return c.json({ form });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
