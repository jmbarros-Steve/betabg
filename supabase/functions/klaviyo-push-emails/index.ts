import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
  send_strategy: 'immediate' | 'scheduled' | 'smart_send';
  scheduled_at?: string; // ISO datetime for scheduled sends
}

function klaviyoHeaders(apiKey: string) {
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
    headers: { ...klaviyoHeaders(apiKey), ...(options.headers || {}) },
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
  const data = await klaviyoFetch(`${KLAVIYO_BASE}/lists/?page[size]=50`, apiKey);
  return (data.data || []).map((l: any) => ({
    id: l.id,
    name: l.attributes?.name || 'Sin nombre',
    profile_count: l.attributes?.profile_count || 0,
  }));
}

// Step 2: Create a template
async function createTemplate(apiKey: string, name: string, html: string, textContent: string) {
  const data = await klaviyoFetch(`${KLAVIYO_BASE}/templates/`, apiKey, {
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
      ...(sendStrategy === 'scheduled' && scheduledAt
        ? { options_static: { datetime: scheduledAt } }
        : {}),
    },
    campaign_messages: {
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

  const data = await klaviyoFetch(`${KLAVIYO_BASE}/campaigns/`, apiKey, {
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
  const data = await klaviyoFetch(
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
  ${email.content.replace(/\n/g, '<br>')}
</body>
</html>`.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // Handle "fetch_lists" action
    if (body.action === 'fetch_lists') {
      const { connection_id } = body;
      if (!connection_id) {
        return new Response(JSON.stringify({ error: 'connection_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const apiKey = await decryptApiKey(connection_id);
      const lists = await fetchLists(apiKey);

      return new Response(JSON.stringify({ lists }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default action: push emails as complete campaigns
    const { plan_id, connection_id, list_id, send_strategy, scheduled_at }: PushEmailsRequest = body;

    if (!plan_id || !connection_id || !list_id) {
      return new Response(JSON.stringify({ error: 'plan_id, connection_id, and list_id are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the plan
    const { data: plan, error: planError } = await supabase
      .from('klaviyo_email_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await decryptApiKey(connection_id);
    const emails = plan.emails as EmailStep[];
    const results: Array<{ email_subject: string; template_id: string; campaign_id: string; status: string }> = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const emailName = `${plan.name} - Email ${i + 1}: ${email.subject}`;

      console.log(`[${i + 1}/${emails.length}] Creating campaign: ${emailName}`);

      // 1. Create template
      const templateId = await createTemplate(
        apiKey,
        emailName,
        generateEmailHtml(email),
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
        send_strategy || 'scheduled',
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

      // 7. Schedule/send based on strategy
      if (send_strategy === 'draft') {
        console.log(`  Campaign created as draft`);
        results.push({ email_subject: email.subject, template_id: templateId, campaign_id: campaignId, status: 'draft' });
      } else if (send_strategy === 'immediate' && i === 0) {
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
    await supabase
      .from('klaviyo_email_plans')
      .update({
        status: 'implemented',
        admin_notes: `Pushed to Klaviyo on ${new Date().toISOString()}. ${results.length} campaigns created. IDs: ${results.map(r => r.campaign_id).join(', ')}`,
      })
      .eq('id', plan_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.length} campañas creadas en Klaviyo`,
        campaigns: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in klaviyo-push-emails:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function decryptApiKey(connectionId: string): Promise<string> {
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

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
