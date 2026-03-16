import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioEmailEvaluate } from '../ai/criterio-email.js';

export async function uploadKlaviyoDrafts(c: Context) {
  try {
    // Auth: verify JWT
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

    const { connectionId, campaign } = await c.req.json();
    console.log('upload-klaviyo-drafts received:', JSON.stringify({
      connectionId,
      campaignName: campaign?.name,
      campaignSubject: campaign?.subject,
      hasHtml: !!campaign?.html,
      htmlLength: campaign?.html?.length,
      hasAudienceId: !!campaign?.audienceId,
    }));

    if (!connectionId || !campaign) {
      throw new Error('connectionId and campaign are required');
    }

    // Verify connection ownership
    const { data: conn, error: connErr } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connErr || !conn) {
      console.error('Connection not found:', connErr?.message);
      throw new Error('Connection not found');
    }

    const clientData = (conn as any).clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // CRITERIO pre-flight check
    const { data: connClient } = await supabase
      .from('platform_connections')
      .select('client_id, clients!inner(shop_id)')
      .eq('id', connectionId)
      .single();
    const shopId = (connClient as any)?.clients?.shop_id;

    if (shopId) {
      const criterioResult = await criterioEmailEvaluate({
        subject: campaign.subject || campaign.name,
        preview_text: campaign.previewText || '',
        html: campaign.html || '',
      }, shopId);

      if (!criterioResult.can_publish) {
        return c.json({
          error: 'CRITERIO rechazó el email',
          email_subject: campaign.subject || campaign.name,
          score: criterioResult.score,
          reason: criterioResult.reason,
          failed_rules: criterioResult.failed_rules,
        }, 422);
      }
    }

    const { data: apiKeyData } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted
    });
    const apiKey = apiKeyData as string;
    if (!apiKey) throw new Error('No API key found for Klaviyo connection');
    console.log('Klaviyo API key found, length:', apiKey.length);

    const klaviyoHeaders = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    };

    // 1. Create template in Klaviyo
    const templateName = `Steve - ${campaign.name} - ${Date.now()}`;
    console.log(`Creating template: ${templateName}`);
    const tplResp = await fetch('https://a.klaviyo.com/api/templates/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify({
        data: {
          type: 'template',
          attributes: {
            name: templateName,
            editor_type: 'CODE',
            html: campaign.html || '<html><body><p>Email generado por Steve</p></body></html>',
          }
        }
      })
    });

    if (!tplResp.ok) {
      const errBody = await tplResp.text();
      console.error('Klaviyo template creation error:', tplResp.status, errBody);
      throw new Error(`Template creation failed: ${tplResp.status} - ${errBody.substring(0, 200)}`);
    }

    const tplData: any = await tplResp.json();
    const templateId = tplData.data?.id;
    console.log(`Template created: ${templateId}`);

    await new Promise(r => setTimeout(r, 1000));

    // 2. Create campaign with campaign-messages (without template -- assigned separately)
    const campaignPayload = {
      data: {
        type: 'campaign',
        attributes: {
          name: campaign.name,
          audiences: {
            included: campaign.audienceId ? [campaign.audienceId] : [],
            excluded: [],
          },
          'campaign-messages': {
            data: [{
              type: 'campaign-message',
              attributes: {
                channel: 'email',
                label: campaign.name,
                content: {
                  subject: campaign.subject || campaign.name,
                  preview_text: campaign.previewText || '',
                  from_email: '{{ organization.default.email }}',
                  from_label: '{{ organization.default.sender_name }}',
                },
              },
            }]
          },
          send_strategy: {
            method: 'static',
            options_static: {
              datetime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        }
      }
    };

    console.log(`Creating campaign: ${campaign.name}`);
    console.log('Campaign payload:', JSON.stringify(campaignPayload).substring(0, 800));
    const campResp = await fetch('https://a.klaviyo.com/api/campaigns/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify(campaignPayload)
    });

    if (!campResp.ok) {
      const errBody = await campResp.text();
      console.error('Klaviyo campaign creation error:', campResp.status, errBody);
      throw new Error(`Campaign creation failed: ${campResp.status} - ${errBody.substring(0, 300)}`);
    }

    const campData: any = await campResp.json();
    const campaignId = campData.data?.id;
    console.log(`Campaign created: ${campaignId}`);

    // 3. Get campaign message ID and assign template
    const msgRelData = campData.data?.relationships?.['campaign-messages']?.data;
    const messageId = msgRelData?.[0]?.id;
    if (messageId && templateId) {
      await new Promise(r => setTimeout(r, 500));
      const assignResp = await fetch('https://a.klaviyo.com/api/campaign-message-assign-template/', {
        method: 'POST',
        headers: klaviyoHeaders,
        body: JSON.stringify({
          data: {
            type: 'campaign-message',
            id: messageId,
            relationships: {
              template: {
                data: { type: 'template', id: templateId }
              }
            }
          }
        })
      });
      if (!assignResp.ok) {
        console.error('Template assign error:', assignResp.status, await assignResp.text());
      } else {
        console.log(`Template ${templateId} assigned to message ${messageId}`);
      }
    }
    console.log(`Campaign created as draft: ${campaignId}`);

    return c.json({
      success: true,
      campaignId,
      templateId,
    });

  } catch (err: any) {
    console.error('upload-klaviyo-drafts error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}
