import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioEmailEvaluate } from '../ai/criterio-email.js';
import { espejoEmail } from '../ai/espejo.js';
import { escapeHtml, decryptKlaviyoApiKey, sendCampaignJob, deleteKlaviyoTemplate } from './_helpers.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const KLAVIYO_REVISION = '2025-01-15';
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
  scheduled_at?: string;
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

async function fetchLists(apiKey: string) {
  const data: any = await klaviyoFetch(`${KLAVIYO_BASE}/lists/`, apiKey);
  return (data.data || []).map((l: any) => ({
    id: l.id,
    name: l.attributes?.name || 'Sin nombre',
    profile_count: l.attributes?.profile_count || 0,
  }));
}

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

async function createCampaign(
  apiKey: string,
  name: string,
  listId: string,
  sendStrategy: string,
  scheduledAt?: string,
) {
  // Build send_strategy based on user selection
  const sendStrategyObj: any = {};
  if (sendStrategy === 'smart_send') {
    sendStrategyObj.method = 'smart_send_time';
  } else {
    sendStrategyObj.method = 'static';
    sendStrategyObj.options_static = {
      // For 'immediate': use scheduledAt (set to now+5min by caller) or 1 year default for draft
      // For 'scheduled': use the user-provided datetime
      // For 'draft': use 1 year in the future (Klaviyo requires a datetime)
      datetime: sendStrategy === 'draft'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : scheduledAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const attributes: any = {
    name,
    audiences: {
      included: [listId],
      excluded: [],
    },
    send_strategy: sendStrategyObj,
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

async function getCampaignMessageId(apiKey: string, campaignId: string) {
  const data: any = await klaviyoFetch(
    `${KLAVIYO_BASE}/campaigns/${campaignId}/?include=campaign-messages`,
    apiKey,
  );
  const messages = data.included || [];
  const msg = messages.find((m: any) => m.type === 'campaign-message');
  return msg?.id || null;
}

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

function generateEmailHtml(email: EmailStep): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(email.subject)}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preheader">${escapeHtml(email.previewText || '')}</div>
  ${(email.content || '').replace(/\n/g, '<br>')}
</body>
</html>`.trim();
}

export async function klaviyoPushEmails(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();
    const userId = user.id;
    const body = await c.req.json();

    // Helper: verify connection ownership (reuses existing supabase instance)
    async function verifyConnectionOwnership(connId: string) {
      const { data: conn, error } = await supabase
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
      const apiKey = await decryptKlaviyoApiKey(supabase, connection_id);
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
    const { data: plan, error: planError } = await supabase
      .from('klaviyo_email_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    // Parse emails once and reuse
    const rawEmails = plan.emails;
    let emails: EmailStep[];
    try {
      emails = typeof rawEmails === 'string'
        ? JSON.parse(rawEmails)
        : Array.isArray(rawEmails) ? rawEmails as EmailStep[] : [];
    } catch {
      return c.json({ error: 'Formato inválido de emails en el plan' }, 400);
    }
    if (!Array.isArray(emails) || emails.length === 0) {
      return c.json({ error: 'El plan no tiene emails válidos' }, 400);
    }

    // Get shop_id from the plan's client connection
    const connData = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('client_id, clients!inner(shop_id)')
        .eq('id', connection_id)
        .single(),
      null,
      'klaviyoPushEmails.getConnData',
    );
    const shopId = (connData as any)?.clients?.shop_id;
    const clientId = (connData as any)?.client_id;

    // CRITERIO pre-flight: evaluate each email before pushing
    const criterioWarnings: Array<{ email_subject: string; score: number; warnings: any[] }> = [];
    if (shopId) {
      for (const emailToCheck of emails) {
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
        // Collect warnings (passed but with low score or minor issues)
        if (criterioResult.score < 80 || (criterioResult.failed_rules?.length ?? 0) > 0) {
          criterioWarnings.push({
            email_subject: emailToCheck.subject,
            score: criterioResult.score,
            warnings: criterioResult.failed_rules ?? [],
          });
        }
      }
    }

    // Respect user's send strategy. CRITERIO already blocked non-compliant emails above.
    const effectiveSendStrategy = send_strategy || 'draft';

    const apiKey = await decryptKlaviyoApiKey(supabase, connection_id);
    const results: Array<{ email_subject: string; template_id: string; campaign_id: string; status: string }> = [];
    const createdTemplateIds: string[] = []; // Track for cleanup on partial failure

    // Fetch brand info for ESPEJO evaluation
    let brandInfo: { brand_name?: string; colors?: string } | null = null;
    if (clientId) {
      const bi = await safeQuerySingleOrDefault<any>(
        supabase
          .from('brand_research')
          .select('brand_name, colors')
          .eq('shop_id', shopId)
          .maybeSingle(),
        null,
        'klaviyoPushEmails.getBrandInfo',
      );
      brandInfo = bi;
    }

    // Cumulative scheduled date — each email's delay adds on top of the previous
    let cumulativeDate = scheduled_at ? new Date(scheduled_at) : null;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const emailName = `${plan.name} - Email ${i + 1}: ${email.subject}`;

      console.log(`[${i + 1}/${emails.length}] Creating campaign: ${emailName}`);

      // ESPEJO visual check
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
        console.warn(`[klaviyo-push-emails] ESPEJO evaluation failed (non-blocking): ${espejoErr?.message}`);
      }

      // 1. Create template
      let templateId: string;
      try {
        templateId = await createTemplate(apiKey, emailName, emailHtml, email.content);
      } catch (tplErr: any) {
        // Cleanup all templates created so far
        await Promise.allSettled(createdTemplateIds.map(id => deleteKlaviyoTemplate(apiKey, id)));
        throw new Error(`Error creando template para "${email.subject}": ${tplErr.message}`);
      }
      createdTemplateIds.push(templateId);
      console.log(`  Template created: ${templateId}`);

      // 2. Calculate scheduled time — cumulative: each delay adds on top of previous
      const emailScheduledAt = cumulativeDate?.toISOString() ?? scheduled_at;
      // Advance cumulative date for the next email
      if (cumulativeDate && i < emails.length - 1) {
        const nextEmail = emails[i + 1];
        const next = new Date(cumulativeDate);
        next.setDate(next.getDate() + (nextEmail.delayDays ?? 0));
        next.setHours(next.getHours() + (nextEmail.delayHours ?? 0));
        cumulativeDate = next;
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

      // 5. Assign template to message (Klaviyo copies HTML into the message)
      await assignTemplateToMessage(apiKey, messageId, templateId);
      console.log(`  Template assigned to message`);

      // 6. Small wait so Klaviyo finishes copying the HTML before we delete the template
      await new Promise(r => setTimeout(r, 500));

      // 7. Delete the Steve-created template (Klaviyo already copied the HTML)
      await deleteKlaviyoTemplate(apiKey, templateId);
      console.log(`  Template cleaned up: ${templateId}`);

      // 7. Update message with subject & preview text
      await updateCampaignMessage(apiKey, messageId, email.subject, email.previewText || '');
      console.log(`  Message updated with subject`);

      // 8. If not draft, trigger send job
      if (effectiveSendStrategy === 'immediate' || effectiveSendStrategy === 'scheduled' || effectiveSendStrategy === 'smart_send') {
        try {
          await sendCampaignJob(apiKey, campaignId);
          const sendStatus = effectiveSendStrategy === 'immediate' ? 'queued' : 'scheduled';
          console.log(`  Campaign ${sendStatus}: ${campaignId}`);
          results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: sendStatus });
        } catch (sendErr: any) {
          console.error(`  Failed to trigger send for campaign ${campaignId}:`, sendErr.message);
          results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: `send_failed: ${sendErr.message}` });
        }
      } else {
        console.log(`  Campaign created as draft: ${campaignId}`);
        results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'draft' });
      }
    }

    // Update plan status
    await supabase
      .from('klaviyo_email_plans')
      .update({
        status: 'implemented',
        admin_notes: `Pushed to Klaviyo on ${new Date().toISOString()}. ${results.length} campaigns created. IDs: ${results.map(r => r.campaign_id).join(', ')}`,
      })
      .eq('id', plan_id);

    return c.json({
      success: true,
      message: `${results.length} campanas creadas en Klaviyo`,
      criterio_warnings: criterioWarnings.length > 0 ? criterioWarnings : undefined,
      campaigns: results,
    });
  } catch (error: unknown) {
    console.error('Error in klaviyo-push-emails:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Forbidden' ? 403 : message === 'Connection not found' ? 404 : 500;
    return c.json({ error: message }, status);
  }
}
