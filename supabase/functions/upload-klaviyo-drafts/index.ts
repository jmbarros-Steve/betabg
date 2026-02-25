import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { connectionId, campaign } = await req.json()
    console.log('upload-klaviyo-drafts received:', JSON.stringify({
      connectionId,
      campaignName: campaign?.name,
      campaignSubject: campaign?.subject,
      hasHtml: !!campaign?.html,
      htmlLength: campaign?.html?.length,
      hasAudienceId: !!campaign?.audienceId,
    }))
    
    if (!connectionId || !campaign) {
      throw new Error('connectionId and campaign are required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get API key from connection
    const { data: conn, error: connErr } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted')
      .eq('id', connectionId)
      .single()

    if (connErr || !conn) {
      console.error('Connection not found:', connErr?.message)
      throw new Error('Connection not found')
    }

    const { data: apiKeyData } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted
    })
    const apiKey = apiKeyData as string
    if (!apiKey) throw new Error('No API key found for Klaviyo connection')
    console.log('Klaviyo API key found, length:', apiKey.length)

    const klaviyoHeaders = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    }

    // 1. Create template in Klaviyo
    const templateName = `Steve - ${campaign.name} - ${Date.now()}`
    console.log(`Creating template: ${templateName}`)
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
    })

    if (!tplResp.ok) {
      const errBody = await tplResp.text()
      console.error('Klaviyo template creation error:', tplResp.status, errBody)
      throw new Error(`Template creation failed: ${tplResp.status} - ${errBody.substring(0, 200)}`)
    }

    const tplData = await tplResp.json()
    const templateId = tplData.data?.id
    console.log(`Template created: ${templateId}`)

    await new Promise(r => setTimeout(r, 1000))

    // 2. Create campaign in Klaviyo (WITHOUT campaign_messages - not a valid field)
    const campaignPayload: any = {
      data: {
        type: 'campaign',
        attributes: {
          name: campaign.name,
          audiences: {
            included: campaign.audienceId ? [campaign.audienceId] : [],
            excluded: [],
          },
          send_strategy: {
            method: 'static',
            options_static: null,
          },
        }
      }
    }

    console.log(`Creating campaign: ${campaign.name}`)
    console.log('Campaign payload:', JSON.stringify(campaignPayload))
    const campResp = await fetch('https://a.klaviyo.com/api/campaigns/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify(campaignPayload)
    })

    if (!campResp.ok) {
      const errBody = await campResp.text()
      console.error('Klaviyo campaign creation error:', campResp.status, errBody)
      throw new Error(`Campaign creation failed: ${campResp.status} - ${errBody.substring(0, 300)}`)
    }

    const campData = await campResp.json()
    const campaignId = campData.data?.id
    console.log(`Campaign created: ${campaignId}`)

    await new Promise(r => setTimeout(r, 1500))

    // 3. Get the campaign's message ID
    console.log('Fetching campaign messages...')
    const msgResp = await fetch(
      `https://a.klaviyo.com/api/campaigns/${campaignId}/campaign-messages/`,
      { headers: klaviyoHeaders }
    )

    let messageId: string | null = null
    if (msgResp.ok) {
      const msgData = await msgResp.json()
      messageId = msgData.data?.[0]?.id || null
      console.log('Message ID found:', messageId)
    } else {
      const msgErr = await msgResp.text()
      console.warn('Could not fetch messages:', msgResp.status, msgErr.substring(0, 200))
    }

    // 4. If we have a message, assign template and set subject/from
    if (messageId) {
      await new Promise(r => setTimeout(r, 1000))
      console.log('Assigning template to message...')
      const patchResp = await fetch(`https://a.klaviyo.com/api/campaign-messages/${messageId}/`, {
        method: 'PATCH',
        headers: klaviyoHeaders,
        body: JSON.stringify({
          data: {
            type: 'campaign-message',
            id: messageId,
            attributes: {
              label: campaign.name,
              content: {
                subject: campaign.subject || campaign.name,
                preview_text: campaign.previewText || '',
                from_email: '{{ organization.default.email }}',
                from_label: '{{ organization.default.sender_name }}',
              },
              render_options: {
                shorten_links: true,
                add_org_prefix: true,
                add_info_link: true,
                add_opt_out_link: true,
              },
            },
            relationships: {
              template: {
                data: { type: 'template', id: templateId }
              }
            }
          }
        })
      })

      if (!patchResp.ok) {
        const patchErr = await patchResp.text()
        console.error('Message patch error:', patchResp.status, patchErr.substring(0, 300))
        // Don't throw - campaign was created, just template assignment failed
        console.warn('Campaign created but template assignment failed')
      } else {
        console.log('Template assigned to campaign message successfully')
      }
    } else {
      console.warn('No message ID found - campaign created without template assignment')
    }

    console.log(`✅ Campaign "${campaign.name}" uploaded successfully`)

    return new Response(JSON.stringify({ 
      success: true,
      campaignId,
      templateId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('upload-klaviyo-drafts error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
