import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const API_BASE_URL = () =>
  process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';

// ---------------------------------------------------------------------------
// Helper: get Shopify credentials from platform_connections
// ---------------------------------------------------------------------------

async function getShopifyCredentials(supabase: any, clientId: string) {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('shop_domain, access_token, access_token_encrypted')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data || !data.shop_domain) return null;

  const shopDomain = data.shop_domain;

  // Decrypt access token if needed
  let accessToken = data.access_token;
  if (data.access_token_encrypted) {
    const { data: decrypted } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: data.access_token_encrypted,
    });
    if (decrypted) accessToken = decrypted;
  }

  return { shopDomain, accessToken };
}

// ---------------------------------------------------------------------------
// Helper: install Shopify ScriptTag for the form widget
// ---------------------------------------------------------------------------

async function installScriptTag(
  supabase: any,
  clientId: string,
  formId: string
): Promise<{ scriptTagId: string } | { error: string }> {
  const creds = await getShopifyCredentials(supabase, clientId);
  if (!creds || !creds.shopDomain || !creds.accessToken) {
    return { error: 'No active Shopify connection found for this client' };
  }

  const widgetUrl = `${API_BASE_URL()}/api/email-form-widget?form_id=${formId}`;

  const res = await fetch(
    `https://${creds.shopDomain}/admin/api/2024-10/script_tags.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script_tag: {
          event: 'onload',
          src: widgetUrl,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Shopify ScriptTag install failed (${res.status}):`, errText);
    return { error: `Shopify API error ${res.status}: ${errText}` };
  }

  const data: any = await res.json();
  const scriptTagId = String(data.script_tag?.id || '');

  // Persist the script_tag_id on the form record
  await supabase
    .from('email_forms')
    .update({ script_tag_id: scriptTagId, updated_at: new Date().toISOString() })
    .eq('id', formId)
    .eq('client_id', clientId);

  return { scriptTagId };
}

// ---------------------------------------------------------------------------
// Helper: remove Shopify ScriptTag
// ---------------------------------------------------------------------------

async function removeScriptTag(
  supabase: any,
  clientId: string,
  scriptTagId: string
): Promise<void> {
  const creds = await getShopifyCredentials(supabase, clientId);
  if (!creds || !creds.shopDomain || !creds.accessToken) {
    console.warn('Cannot remove ScriptTag: no Shopify credentials');
    return;
  }

  const res = await fetch(
    `https://${creds.shopDomain}/admin/api/2024-10/script_tags/${scriptTagId}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': creds.accessToken },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Shopify ScriptTag delete failed (${res.status}):`, errText);
  }
}

// ---------------------------------------------------------------------------
// Authenticated handler: CRUD + activate / pause
// POST /api/email-signup-forms
// ---------------------------------------------------------------------------

export async function signupForms(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    // ----- list -----
    case 'list': {
      const { data, error } = await supabase
        .from('email_forms')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ forms: data });
    }

    // ----- create -----
    case 'create': {
      const {
        name,
        form_type,
        design,
        trigger_rules,
        incentive_type,
        incentive_value,
        tags_to_apply,
      } = body;

      if (!name) return c.json({ error: 'name is required' }, 400);

      const validTypes = ['popup', 'slide_in', 'inline', 'full_page'];
      if (form_type && !validTypes.includes(form_type)) {
        return c.json({ error: `form_type must be one of: ${validTypes.join(', ')}` }, 400);
      }

      const { data, error } = await supabase
        .from('email_forms')
        .insert({
          client_id,
          name,
          form_type: form_type || 'popup',
          design: design || {},
          trigger_rules: trigger_rules || {},
          incentive_type: incentive_type || 'none',
          incentive_value: incentive_value || null,
          tags_to_apply: tags_to_apply || [],
          status: 'draft',
          total_views: 0,
          total_submissions: 0,
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, form: data });
    }

    // ----- update -----
    case 'update': {
      const { form_id, ...updates } = body;
      if (!form_id) return c.json({ error: 'form_id is required' }, 400);

      const allowedFields = [
        'name',
        'form_type',
        'design',
        'trigger_rules',
        'incentive_type',
        'incentive_value',
        'tags_to_apply',
      ];
      const cleanUpdates: any = { updated_at: new Date().toISOString() };
      for (const field of allowedFields) {
        if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
      }

      const { data, error } = await supabase
        .from('email_forms')
        .update(cleanUpdates)
        .eq('id', form_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, form: data });
    }

    // ----- delete -----
    case 'delete': {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id is required' }, 400);

      // Check for existing script tag to remove first
      const { data: existing } = await supabase
        .from('email_forms')
        .select('script_tag_id')
        .eq('id', form_id)
        .eq('client_id', client_id)
        .single();

      if (existing?.script_tag_id) {
        await removeScriptTag(supabase, client_id, existing.script_tag_id);
      }

      const { error } = await supabase
        .from('email_forms')
        .delete()
        .eq('id', form_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    // ----- activate -----
    case 'activate': {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id is required' }, 400);

      // Set status to active
      const { data: form, error: updateErr } = await supabase
        .from('email_forms')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', form_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (updateErr) return c.json({ error: updateErr.message }, 500);

      // Try to install ScriptTag on Shopify store (optional — form works via embed too)
      let script_tag_id: string | null = null;
      const result = await installScriptTag(supabase, client_id, form_id);
      if ('error' in result) {
        console.warn(`ScriptTag install skipped for form ${form_id}: ${result.error}`);
      } else {
        script_tag_id = result.scriptTagId;
      }

      return c.json({ success: true, form, script_tag_id });
    }

    // ----- pause -----
    case 'pause': {
      const { form_id } = body;
      if (!form_id) return c.json({ error: 'form_id is required' }, 400);

      // Get existing script_tag_id
      const { data: existing } = await supabase
        .from('email_forms')
        .select('script_tag_id')
        .eq('id', form_id)
        .eq('client_id', client_id)
        .single();

      if (existing?.script_tag_id) {
        await removeScriptTag(supabase, client_id, existing.script_tag_id);
      }

      const { data: form, error } = await supabase
        .from('email_forms')
        .update({
          status: 'paused',
          script_tag_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', form_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, form });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

// ---------------------------------------------------------------------------
// Public handler: get_config + submit (no auth required)
// POST /api/email-signup-form-public
// ---------------------------------------------------------------------------

export async function signupFormPublic(c: Context) {
  const body = await c.req.json();
  const { action, form_id } = body;

  if (!form_id) return c.json({ error: 'form_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    // ----- get_config -----
    case 'get_config': {
      const { data: form, error } = await supabase
        .from('email_forms')
        .select('id, form_type, design, trigger_rules, incentive_type, incentive_value, total_views')
        .eq('id', form_id)
        .eq('status', 'active')
        .single();

      if (error || !form) {
        return c.json({ error: 'Form not found or inactive' }, 404);
      }

      // Increment total_views (fire-and-forget)
      Promise.resolve(
        supabase
          .from('email_forms')
          .update({ total_views: ((form as any).total_views || 0) + 1 })
          .eq('id', form_id)
      ).catch(() => {});

      // Strip total_views from response — not needed by the widget
      const { total_views: _tv, ...formConfig } = form as any;
      return c.json({ form: formConfig });
    }

    // ----- submit -----
    case 'submit': {
      const { email, first_name, last_name } = body;

      if (!email) return c.json({ error: 'email is required' }, 400);

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return c.json({ error: 'Invalid email address' }, 400);
      }

      // Fetch form to get client_id, tags, incentive
      const { data: form, error: formErr } = await supabase
        .from('email_forms')
        .select('client_id, tags_to_apply, incentive_type, incentive_value, status, total_submissions')
        .eq('id', form_id)
        .single();

      if (formErr || !form) {
        return c.json({ error: 'Form not found' }, 404);
      }

      if (form.status !== 'active') {
        return c.json({ error: 'Form is not currently active' }, 400);
      }

      // Upsert subscriber
      const { error: subErr } = await supabase
        .from('email_subscribers')
        .upsert(
          {
            client_id: form.client_id,
            email: email.toLowerCase().trim(),
            first_name: first_name || null,
            last_name: last_name || null,
            source: 'form',
            tags: form.tags_to_apply || [],
            status: 'subscribed',
            subscribed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,email' }
        );

      if (subErr) {
        console.error('Subscriber upsert error:', subErr);
        return c.json({ error: 'Failed to save subscriber' }, 500);
      }

      // Increment total_submissions (fire-and-forget)
      Promise.resolve(
        supabase
          .from('email_forms')
          .update({
            total_submissions: ((form as any).total_submissions || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', form_id)
      ).catch((err: any) => console.error('Failed to increment submissions:', err));

      return c.json({
        success: true,
        incentive_type: form.incentive_type,
        incentive_value: form.incentive_value,
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
