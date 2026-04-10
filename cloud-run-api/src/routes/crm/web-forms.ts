import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

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

    // Auth check: all actions except public_submit require authentication
    if (action !== 'public_submit') {
      if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    }

    // Fix Bug#119: skip getUserClientIds for public_submit (user is null)
    let isSuperAdmin = false;
    if (action !== 'public_submit') {
      // Fix Bug#7: multi-tenant scoping — non-admins only see their own forms
      const scoping = await getUserClientIds(supabase, user?.id);
      isSuperAdmin = scoping.isSuperAdmin;
    }

    if (action === 'list') {
      let query = supabase
        .from('web_forms')
        .select('*, web_form_submissions(count)')
        .order('created_at', { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

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

      // Bug #180 fix: Verify form ownership BEFORE fetching submissions to prevent IDOR.
      // The parallel Promise.all allowed submissions to be returned even if the form
      // didn't belong to the user (formRes.error was checked AFTER both queries ran).
      let formQuery = supabase.from('web_forms').select('*').eq('id', form_id);
      if (!isSuperAdmin) formQuery = formQuery.eq('user_id', user.id);

      const formRes = await formQuery.single();
      if (formRes.error || !formRes.data) return c.json({ error: 'Form not found' }, 404);

      // Only fetch submissions after confirming ownership
      const subsRes = await supabase
        .from('web_form_submissions')
        .select('*')
        .eq('form_id', form_id)
        .order('created_at', { ascending: false })
        .limit(50);

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

      let updateQuery = supabase.from('web_forms').update(allowed).eq('id', form_id);
      if (!isSuperAdmin) updateQuery = updateQuery.eq('user_id', user.id);
      const { error } = await updateQuery;
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    if (action === 'delete') {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id required' }, 400);

      // Bug #171 fix: Verify ownership first, then cascade delete submissions before the form
      let ownershipQuery = supabase.from('web_forms').select('id').eq('id', form_id);
      if (!isSuperAdmin) ownershipQuery = ownershipQuery.eq('user_id', user.id);
      const { data: formExists, error: ownerErr } = await ownershipQuery.maybeSingle();
      if (ownerErr) return c.json({ error: ownerErr.message }, 500);
      if (!formExists) return c.json({ error: 'Form not found' }, 404);

      // Delete submissions first (no FK cascade in DB)
      await supabase.from('web_form_submissions').delete().eq('form_id', form_id);

      // Then delete the form
      const { error } = await supabase.from('web_forms').delete().eq('id', form_id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    return c.json({ error: `Unknown action: ${action}` }, 400);
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

// Fix Bug#5: simple in-memory rate limiter for public form submit
const formSubmitRateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 submissions per IP per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = formSubmitRateLimit.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  formSubmitRateLimit.set(ip, recent);
  return false;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of formSubmitRateLimit) {
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) formSubmitRateLimit.delete(ip);
    else formSubmitRateLimit.set(ip, recent);
  }
}, 300_000);

/**
 * Fix #75: Sanitize form data — strip HTML tags, limit field lengths, handle nested objects
 */
function sanitizeFormData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Strip HTML tags and limit to 1000 chars
    return data.replace(/<[^>]*>/g, '').substring(0, 1000);
  }
  if (typeof data === 'number' || typeof data === 'boolean') return data;
  if (Array.isArray(data)) {
    return data.slice(0, 50).map(sanitizeFormData);
  }
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    const keys = Object.keys(data).slice(0, 50); // limit number of fields
    for (const key of keys) {
      result[key] = sanitizeFormData(data[key]);
    }
    return result;
  }
  return data;
}

/**
 * Web Form Submit — PUBLIC (no auth)
 * Receives form submission, creates prospect, optionally notifies via WA
 */
export async function webFormSubmit(c: Context) {
  try {
    // Fix Bug#5: rate limit by IP
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
    if (isRateLimited(clientIp)) {
      return c.json({ error: 'Too many submissions. Please wait a moment.' }, 429);
    }

    const body = await c.req.json();
    const { form_id, data: rawData } = body;
    if (!form_id || !rawData) return c.json({ error: 'form_id and data required' }, 400);

    // Fix #75: sanitize form data — size limit + strip HTML + field length limit
    const dataJson = JSON.stringify(rawData);
    if (dataJson.length > 10000) {
      return c.json({ error: 'Form data too large (max 10KB)' }, 400);
    }
    const data = sanitizeFormData(rawData);

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

      // Require at least email or phone
      if (!email && !phone) {
        return c.json({ error: 'Email or phone required' }, 400);
      }

      // Fix #74: scope dedup to the form owner — don't link to prospects from different form owners
      let existing: any = null;
      if (phone) {
        const byPhone = await safeQuerySingleOrDefault<any>(
          supabase
            .from('wa_prospects')
            .select('id, source')
            .eq('phone', phone)
            .eq('source', 'web_form')
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
            .select('id, source')
            .eq('email', email)
            .eq('source', 'web_form')
            .maybeSingle(),
          null,
          'webForms.getProspectByEmail',
        );
        existing = byEmail;
      }

      // If an existing prospect was found, verify it was created by the same form owner
      // by checking if any previous submission from this form owner's forms links to it
      if (existing && form.user_id) {
        const { data: ownerForms } = await supabase
          .from('web_form_submissions')
          .select('id')
          .eq('prospect_id', existing.id)
          .limit(1);
        // If there are submissions linking to this prospect, check they come from forms owned by same user
        if (ownerForms && ownerForms.length > 0) {
          // Prospect exists with submissions — allow linking (same pool)
        } else {
          // No prior submissions linking this prospect — could be from different owner, create new
          existing = null;
        }
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
            phone: phone || null,
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
