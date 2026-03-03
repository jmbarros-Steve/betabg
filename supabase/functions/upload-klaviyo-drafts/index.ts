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
    // Auth: verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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

    // Verify connection ownership
    const { data: conn, error: connErr } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single()

    if (connErr || !conn) {
      console.error('Connection not found:', connErr?.message)
      throw new Error('Connection not found')
    }

    const clientData = (conn as any).clients as { user_id: string; client_user_id: string | null }
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
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

    // 2. Create campaign with campaign-messages (without template — assigned separately)
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
    }

    console.log(`Creating campaign: ${campaign.name}`)
    console.log('Campaign payload:', JSON.stringify(campaignPayload).substring(0, 800))
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

    // 3. Get campaign message ID and assign template
    const msgRelData = campData.data?.relationships?.['campaign-messages']?.data
    const messageId = msgRelData?.[0]?.id
    if (messageId && templateId) {
      await new Promise(r => setTimeout(r, 500))
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
      })
      if (!assignResp.ok) {
        console.error('Template assign error:', assignResp.status, await assignResp.text())
      } else {
        console.log(`Template ${templateId} assigned to message ${messageId}`)
      }
    }
    console.log(`✅ Campaign created as draft: ${campaignId}`)

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
