import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { deleteKlaviyoTemplate } from './_helpers.js';

const KLAVIYO_REVISION = '2025-01-15';
const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

function headers(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/vnd.api+json',
    'revision': KLAVIYO_REVISION,
  };
}

/**
 * POST /api/klaviyo/create-campaign
 * Wrapper that creates a Klaviyo campaign draft in one step:
 *   1. Creates template from HTML
 *   2. Creates campaign (draft) with audience
 *   3. Assigns template to campaign message
 *   4. Updates subject & preview text
 *
 * Body: { connection_id, name, subject, preview_text, html, list_id }
 */
export async function createKlaviyoCampaign(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isInternal = c.get('isInternal') === true;

    let userId: string | null = null;
    if (!isInternal) {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
      userId = user.id;
    }

    const { connection_id, name, subject, preview_text, html, list_id } = await c.req.json();

    if (!connection_id || !name || !subject || !html || !list_id) {
      return c.json({ error: 'connection_id, name, subject, html, and list_id are required' }, 400);
    }

    // Verify connection + ownership
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted, clients!inner(user_id, client_user_id)')
      .eq('id', connection_id)
      .eq('platform', 'klaviyo')
      .single();

    if (!conn?.api_key_encrypted) {
      return c.json({ error: 'Klaviyo connection not found' }, 404);
    }

    if (!isInternal) {
      const client = (conn as any).clients as { user_id: string; client_user_id: string | null };
      if (client.user_id !== userId && client.client_user_id !== userId) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const { data: apiKey } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted,
    });
    if (!apiKey) return c.json({ error: 'Failed to decrypt API key' }, 500);

    const h = headers(apiKey);

    // 1. Create template
    const tplRes = await fetch(`${KLAVIYO_BASE}/templates/`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        data: { type: 'template', attributes: { name, editor_type: 'CODE', html } },
      }),
    });
    if (!tplRes.ok) {
      const err = await tplRes.text();
      return c.json({ error: 'Failed to create template', detail: err }, 500);
    }
    const templateId = (await tplRes.json() as any).data.id;

    // 2. Create campaign as draft
    const campRes = await fetch(`${KLAVIYO_BASE}/campaigns/`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        data: {
          type: 'campaign',
          attributes: {
            name,
            audiences: { included: [list_id], excluded: [] },
            send_strategy: {
              method: 'static',
              options_static: {
                datetime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              },
            },
            'campaign-messages': {
              data: [{ type: 'campaign-message', attributes: { channel: 'email', label: name } }],
            },
          },
        },
      }),
    });
    if (!campRes.ok) {
      const err = await campRes.text();
      // Cleanup: delete orphaned template
      await deleteKlaviyoTemplate(apiKey, templateId);
      return c.json({ error: 'Failed to create campaign', detail: err }, 500);
    }
    const campaignId = (await campRes.json() as any).data.id;

    // 3. Get message ID
    const msgRes = await fetch(`${KLAVIYO_BASE}/campaigns/${campaignId}/?include=campaign-messages`, { headers: h });
    const msgData = await msgRes.json() as any;
    const messageId = (msgData.included || []).find((m: any) => m.type === 'campaign-message')?.id;
    if (!messageId) return c.json({ error: 'No message found in campaign' }, 500);

    // 4. Assign template
    const assignRes = await fetch(`${KLAVIYO_BASE}/campaign-message-assign-template/`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        data: {
          type: 'campaign-message',
          id: messageId,
          relationships: { template: { data: { type: 'template', id: templateId } } },
        },
      }),
    });
    if (!assignRes.ok) {
      const err = await assignRes.text();
      console.error('[klaviyo/create-campaign] Template assign failed:', assignRes.status, err);
      return c.json({ error: 'Failed to assign template to campaign message', detail: err }, 500);
    }

    // 5. Delete the Steve-created template (Klaviyo already copied the HTML into the message)
    await deleteKlaviyoTemplate(apiKey, templateId);
    console.log(`[klaviyo/create-campaign] Template cleaned up: ${templateId}`);

    // 6. Update subject & preview
    const patchRes = await fetch(`${KLAVIYO_BASE}/campaign-messages/${messageId}/`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({
        data: {
          type: 'campaign-message',
          id: messageId,
          attributes: {
            label: subject,
            content: { subject, preview_text: preview_text || '' },
          },
        },
      }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      console.error('[klaviyo/create-campaign] Subject update failed:', patchRes.status, err);
      return c.json({ error: 'Failed to update campaign subject', detail: err }, 500);
    }

    return c.json({
      success: true,
      campaign_id: campaignId,
      template_id: templateId,
      message_id: messageId,
      status: 'draft',
    });
  } catch (error: any) {
    console.error('[klaviyo/create-campaign] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
