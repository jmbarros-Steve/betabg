import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioEmailEvaluate } from '../ai/criterio-email.js';
import { detectAngle } from '../../lib/angle-detector.js';
import { deleteKlaviyoTemplate, sendCampaignJob } from './_helpers.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

export async function uploadKlaviyoDrafts(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();

    const { connectionId, campaign, send_strategy, scheduled_at } = await c.req.json();
    console.log('upload-klaviyo-drafts received:', JSON.stringify({
      connectionId,
      campaignName: campaign?.name,
      campaignSubject: campaign?.subject,
      hasHtml: !!campaign?.html,
      htmlLength: campaign?.html?.length,
      hasAudienceId: !!campaign?.audienceId,
    }));

    if (!connectionId || !campaign) {
      return c.json({ error: 'connectionId and campaign are required' }, 400);
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
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = (conn as any).clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Decrypt API key first (needed for all operations)
    if (!conn.api_key_encrypted) {
      console.error('[upload-klaviyo-drafts] No encrypted API key for connection:', connectionId);
      return c.json({ error: 'No encrypted API key found for this connection' }, 500);
    }
    const { data: apiKeyData, error: decryptError } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted
    });
    if (decryptError) {
      console.error('[upload-klaviyo-drafts] decrypt_platform_token failed:', decryptError.message, decryptError.code);
    }
    const apiKey = apiKeyData as string;
    if (!apiKey) return c.json({ error: 'No API key found for Klaviyo connection' }, 500);

    // CRITERIO pre-flight check
    const connClient = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('client_id, clients!inner(shop_id)')
        .eq('id', connectionId)
        .single(),
      null,
      'uploadKlaviyoDrafts.getConnClient',
    );
    const shopId = (connClient as any)?.clients?.shop_id;
    const clientId = (connClient as any)?.client_id;
    let _criterioScore: number | null = null;

    if (shopId) {
      const criterioResult = await criterioEmailEvaluate({
        subject: campaign.subject || campaign.name,
        preview_text: campaign.previewText || '',
        html: campaign.html || '',
      }, shopId);

      _criterioScore = criterioResult.score;

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

    const klaviyoHeaders = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/vnd.api+json',
      'revision': '2025-01-15',
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
      return c.json({ error: `Template creation failed: ${tplResp.status} - ${errBody.substring(0, 200)}` }, 500);
    }

    const tplData: any = await tplResp.json();
    const templateId = tplData.data?.id;
    console.log(`Template created: ${templateId}`);

    await new Promise(r => setTimeout(r, 1000));

    // 2. Create campaign with campaign-messages
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
          send_strategy: send_strategy === 'smart_send'
            ? { method: 'smart_send_time' }
            : {
                method: 'static',
                options_static: {
                  datetime: (send_strategy === 'scheduled' && scheduled_at)
                    ? scheduled_at
                    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
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
      // Cleanup: delete the orphaned template
      if (templateId) {
        await deleteKlaviyoTemplate(apiKey, templateId);
      }
      return c.json({ error: `Campaign creation failed: ${campResp.status} - ${errBody.substring(0, 300)}` }, 500);
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
        // Delete the Steve-created template (Klaviyo already copied the HTML into the message)
        await deleteKlaviyoTemplate(apiKey, templateId);
        console.log(`Template cleaned up: ${templateId}`);
      }
    }
    // Trigger send job if strategy is not draft
    let finalStatus = 'draft';
    if (send_strategy && send_strategy !== 'draft' && campaignId) {
      try {
        await sendCampaignJob(apiKey, campaignId);
        finalStatus = send_strategy === 'immediate' ? 'queued' : 'scheduled';
        console.log(`Campaign ${finalStatus}: ${campaignId}`);
      } catch (sendErr: any) {
        console.error(`Failed to trigger send for campaign ${campaignId}:`, sendErr.message);
        finalStatus = 'draft';
      }
    } else {
      console.log(`Campaign created as draft: ${campaignId}`);
    }

    // D.6: Save to creative_history with angle + criterio_score
    if (clientId) {
      try {
        const copyForAngle = campaign.subject || campaign.name || '';
        const angle = await detectAngle(copyForAngle);
        await supabase.from('creative_history').insert({
          client_id: clientId,
          channel: 'klaviyo',
          type: 'email_campaign',
          angle,
          content_summary: copyForAngle.substring(0, 200),
          copy_text: copyForAngle.substring(0, 2000),
          entity_type: 'email_campaign',
          entity_id: campaignId,
          cqs_score: _criterioScore,
          criterio_score: _criterioScore,
          espejo_score: null,
        });
      } catch (chErr) {
        console.error('[upload-klaviyo-drafts] creative_history insert error:', chErr);
      }
    }

    return c.json({
      success: true,
      campaignId,
      templateId,
      status: finalStatus,
    });

  } catch (err: any) {
    console.error('upload-klaviyo-drafts error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}
