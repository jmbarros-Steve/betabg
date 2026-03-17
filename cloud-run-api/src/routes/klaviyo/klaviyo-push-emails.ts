import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioEmailEvaluate } from '../ai/criterio-email.js';

import { espejoEmail } from '../ai/espejo.js';

const KLAVIYO_REVISION = '2024-10-15';
const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

interface EmailStep {
  id: string;
  subject: string;
  previewText: string;
  content: string;
  delayDays: number;
  delayHours: number;
}

interface PushEmailsRequest {
  plan_id: string;
  connection_id: string;
  list_id: string;
  send_strategy: 'immediate' | 'scheduled' | 'smart_send' | 'draft';
  scheduled_at?: string; // ISO datetime for scheduled sends
}

function klaviyoFetchHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/vnd.api+json',
    'revision': KLAVIYO_REVISION,
    'Accept': 'application/vnd.api+json',
  };
}

async function klaviyoFetch(url: string, apiKey: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...klaviyoFetchHeaders(apiKey), ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Klaviyo API error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// Step 1: Fetch available lists
async function fetchLists(apiKey: string) {
  const data: any = await klaviyoFetch(`${KLAVIYO_BASE}/lists/`, apiKey);
  return (data.data || []).map((l: any) => ({
    id: l.id,
    name: l.attributes?.name || 'Sin nombre',
    profile_count: l.attributes?.profile_count || 0,
  }));
}

// Step 2: Create a template
async function createTemplate(apiKey: string, name: string, html: string, textContent: string) {
  const data: any = await klaviyoFetch(`${KLAVIYO_BASE}/templates/`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'template',
        attributes: {
          name,
          editor_type: 'CODE',
          html,
          text: textContent,
        },
      },
    }),
  });
  return data.data.id;
}

// Step 3: Create a campaign
async function createCampaign(
  apiKey: string,
  name: string,
  listId: string,
  sendStrategy: string,
  scheduledAt?: string,
) {
  const attributes: any = {
    name,
    audiences: {
      included: [listId],
      excluded: [],
    },
    send_strategy: {
      method: sendStrategy === 'smart_send' ? 'smart_send_time' : 'static',
      options_static: {
        datetime: scheduledAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    'campaign-messages': {
      data: [
        {
          type: 'campaign-message',
          attributes: {
            channel: 'email',
            label: name,
          },
        },
      ],
    },
  };

  const data: any = await klaviyoFetch(`${KLAVIYO_BASE}/campaigns/`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign',
        attributes,
      },
    }),
  });
  return data.data;
}

// Step 4: Get campaign message ID from campaign
async function getCampaignMessageId(apiKey: string, campaignId: string) {
  const data: any = await klaviyoFetch(
    `${KLAVIYO_BASE}/campaigns/${campaignId}/?include=campaign-messages`,
    apiKey,
  );
  const messages = data.included || [];
  const msg = messages.find((m: any) => m.type === 'campaign-message');
  return msg?.id || null;
}

// Step 5: Assign template to campaign message
async function assignTemplateToMessage(apiKey: string, messageId: string, templateId: string) {
  await klaviyoFetch(`${KLAVIYO_BASE}/campaign-message-assign-template/`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign-message',
        id: messageId,
        relationships: {
          template: {
            data: { type: 'template', id: templateId },
          },
        },
      },
    }),
  });
}

// Step 6: Update campaign message with subject & preview text
async function updateCampaignMessage(
  apiKey: string,
  messageId: string,
  subject: string,
  previewText: string,
) {
  await klaviyoFetch(`${KLAVIYO_BASE}/campaign-messages/${messageId}/`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'campaign-message',
        id: messageId,
        attributes: {
          label: subject,
          content: {
            subject,
            preview_text: previewText || '',
          },
        },
      },
    }),
  });
}

// Step 7: Send/schedule the campaign
async function sendCampaign(apiKey: string, campaignId: string) {
  await klaviyoFetch(`${KLAVIYO_BASE}/campaign-send-jobs/`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign-send-job',
        attributes: {},
        relationships: {
          campaign: {
            data: { type: 'campaign', id: campaignId },
          },
        },
      },
    }),
  });
}

function generateEmailHtml(email: EmailStep): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${email.subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preheader">${email.previewText || ''}</div>
  ${(email.content || '').replace(/\n/g, '<br>')}
</body>
</html>`.trim();
}

async function decryptApiKey(connectionId: string): Promise<string> {
  const serviceSupabase = getSupabaseAdmin();

  const { data: connection, error } = await serviceSupabase
    .from('platform_connections')
    .select('api_key_encrypted')
    .eq('id', connectionId)
    .eq('platform', 'klaviyo')
    .single();

  if (error || !connection?.api_key_encrypted) {
    throw new Error('Klaviyo connection not found or missing API key');
  }

  const { data: apiKey, error: decryptError } = await serviceSupabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

  if (decryptError || !apiKey) {
    throw new Error('Failed to decrypt Klaviyo API key');
  }

  return apiKey;
}

export async function klaviyoPushEmails(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = user.id;
    const body = await c.req.json();

    // Helper: verify connection ownership
    async function verifyConnectionOwnership(connId: string) {
      const svc = getSupabaseAdmin();
      const { data: conn, error } = await svc
        .from('platform_connections')
        .select('id, clients!inner(user_id, client_user_id)')
        .eq('id', connId)
        .eq('platform', 'klaviyo')
        .single();
      if (error || !conn) throw new Error('Connection not found');
      const client = (conn as any).clients as { user_id: string; client_user_id: string | null };
      if (client.user_id !== userId && client.client_user_id !== userId) {
        throw new Error('Forbidden');
      }
    }

    // Handle "fetch_lists" action
    if (body.action === 'fetch_lists') {
      const { connection_id } = body;
      if (!connection_id) {
        return c.json({ error: 'connection_id required' }, 400);
      }

      await verifyConnectionOwnership(connection_id);
      const apiKey = await decryptApiKey(connection_id);
      const lists = await fetchLists(apiKey);

      return c.json({ lists });
    }

    // Default action: push emails as complete campaigns
    const { plan_id, connection_id, list_id, send_strategy, scheduled_at }: PushEmailsRequest = body;

    if (!plan_id || !connection_id || !list_id) {
      return c.json({ error: 'plan_id, connection_id, and list_id are required' }, 400);
    }

    await verifyConnectionOwnership(connection_id);

    // Fetch the plan using service role to bypass RLS
    const serviceSupabase = getSupabaseAdmin();
    const { data: plan, error: planError } = await serviceSupabase
      .from('klaviyo_email_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    // CRITERIO pre-flight: evaluate each email before pushing
    const rawEmailsForCheck = plan.emails;
    const emailsForCheck: EmailStep[] = typeof rawEmailsForCheck === 'string' ? JSON.parse(rawEmailsForCheck) : rawEmailsForCheck as EmailStep[];

    // Get shop_id from the plan's client connection
    const { data: connData } = await serviceSupabase
      .from('platform_connections')
      .select('client_id, clients!inner(shop_id)')
      .eq('id', connection_id)
      .single();
    const shopId = (connData as any)?.clients?.shop_id;

    if (shopId) {
      for (const emailToCheck of emailsForCheck) {
        const criterioResult = await criterioEmailEvaluate({
          subject: emailToCheck.subject,
          preview_text: emailToCheck.previewText,
          html: generateEmailHtml(emailToCheck),
        }, shopId);

        if (!criterioResult.can_publish) {
          return c.json({
            error: 'CRITERIO rechazó el email',
            email_subject: emailToCheck.subject,
            score: criterioResult.score,
            reason: criterioResult.reason,
            failed_rules: criterioResult.failed_rules,
          }, 422);
        }
      }
    }

    // REGLA INQUEBRANTABLE: all Klaviyo emails born as DRAFT
    const effectiveSendStrategy = 'draft';

    const apiKey = await decryptApiKey(connection_id);
    const rawEmails = plan.emails;
    const emails: EmailStep[] = typeof rawEmails === 'string' ? JSON.parse(rawEmails) : rawEmails as EmailStep[];
    const results: Array<{ email_subject: string; template_id: string; campaign_id: string; status: string }> = [];

    // Fetch client_id and brand info for ESPEJO evaluation
    const { data: connInfo } = await serviceSupabase
      .from('platform_connections')
      .select('client_id')
      .eq('id', connection_id)
      .single();
    const espejoShopId = connInfo?.client_id || 'unknown';

    let brandInfo: { brand_name?: string; colors?: string } | null = null;
    if (espejoShopId !== 'unknown') {
      const { data: bi } = await serviceSupabase
        .from('brand_research')
        .select('brand_name, colors')
        .eq('shop_id', shopId)
        .maybeSingle();
      brandInfo = bi;
    }

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const emailName = `${plan.name} - Email ${i + 1}: ${email.subject}`;

      console.log(`[${i + 1}/${emails.length}] Creating campaign: ${emailName}`);

      // ── ESPEJO visual check ──
      const emailHtml = generateEmailHtml(email);
      try {
        const espejoResult = await espejoEmail(
          emailHtml,
          shopId,
          `klaviyo-plan-${plan_id}-email-${i}`,
          brandInfo?.colors || '#000000',
          brandInfo?.brand_name || plan.name || 'Brand'
        );

        if (!espejoResult.pass) {
          console.log(`[klaviyo-push-emails] ESPEJO rejected email ${i + 1}: score=${espejoResult.score}`);
          results.push({
            email_subject: email.subject,
            template_id: '',
            campaign_id: '',
            status: `espejo_rejected (score=${espejoResult.score}, issues: ${espejoResult.issues.join('; ')})`,
          });
          continue;
        }
        console.log(`[klaviyo-push-emails] ESPEJO approved email ${i + 1}: score=${espejoResult.score}`);
      } catch (espejoErr: any) {
        // ESPEJO failure should not block email push — log and continue
        console.warn(`[klaviyo-push-emails] ESPEJO evaluation failed (non-blocking): ${espejoErr?.message}`);
      }

      // 1. Create template (reuse emailHtml from ESPEJO check above)
      const templateId = await createTemplate(
        apiKey,
        emailName,
        emailHtml,
        email.content,
      );
      console.log(`  Template created: ${templateId}`);

      // 2. Calculate scheduled time for this email
      let emailScheduledAt = scheduled_at;
      if (scheduled_at && (email.delayDays > 0 || email.delayHours > 0)) {
        const baseDate = new Date(scheduled_at);
        baseDate.setDate(baseDate.getDate() + email.delayDays);
        baseDate.setHours(baseDate.getHours() + email.delayHours);
        emailScheduledAt = baseDate.toISOString();
      }

      // 3. Create campaign
      const campaign = await createCampaign(
        apiKey,
        emailName,
        list_id,
        effectiveSendStrategy,
        emailScheduledAt,
      );
      const campaignId = campaign.id;
      console.log(`  Campaign created: ${campaignId}`);

      // 4. Get campaign message ID
      const messageId = await getCampaignMessageId(apiKey, campaignId);
      if (!messageId) {
        console.error(`  Could not find message ID for campaign ${campaignId}`);
        results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'error_no_message' });
        continue;
      }
      console.log(`  Message ID: ${messageId}`);

      // 5. Assign template to message
      await assignTemplateToMessage(apiKey, messageId, templateId);
      console.log(`  Template assigned to message`);

      // 6. Update message with subject & preview text
      await updateCampaignMessage(apiKey, messageId, email.subject, email.previewText || '');
      console.log(`  Message updated with subject`);

      // 7. All campaigns created as DRAFT (CRITERIO enforced)
      if (effectiveSendStrategy === 'draft') {
        console.log(`  Campaign created as draft (CRITERIO enforced)`);
        results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'draft' });
      } else if (effectiveSendStrategy === 'immediate' && i === 0) {
        try {
          await sendCampaign(apiKey, campaignId);
          console.log(`  Campaign sent!`);
          results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'sent' });
        } catch (sendErr) {
          console.error(`  Send failed:`, sendErr);
          results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'created_not_sent' });
        }
      } else {
        results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'ready' });
      }
    }

    // Update plan status
    await serviceSupabase
      .from('klaviyo_email_plans')
      .update({
        status: 'implemented',
        admin_notes: `Pushed to Klaviyo on ${new Date().toISOString()}. ${results.length} campaigns created. IDs: ${results.map(r => r.campaign_id).join(', ')}`,
      })
      .eq('id', plan_id);

    return c.json({
      success: true,
      message: `${results.length} campanas creadas en Klaviyo`,
      campaigns: results,
    });
  } catch (error: unknown) {
    console.error('Error in klaviyo-push-emails:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Forbidden' ? 403 : message === 'Connection not found' ? 404 : 500;
    return c.json({ error: message }, status);
  }
}
