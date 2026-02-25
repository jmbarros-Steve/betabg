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

    // 1. Create template in Klaviyo with editor_type
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
      throw new Error(`Error creating template in Klaviyo: ${tplResp.status} - ${errBody.substring(0, 200)}`)
    }

    const tplData = await tplResp.json()
    const templateId = tplData.data?.id
    console.log(`Template created: ${templateId}`)

    await new Promise(r => setTimeout(r, 1000))

    // 2. Create campaign in Klaviyo as DRAFT
    const campaignPayload: any = {
      data: {
        type: 'campaign',
        attributes: {
          name: campaign.name,
          audiences: {
            included: campaign.audienceId ? [campaign.audienceId] : [],
            excluded: [],
          },
          campaign_messages: {
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
            }]
          },
          send_strategy: {
            method: 'static',
            options_static: null, // No scheduling = stays as draft
          },
        }
      }
    }

    console.log(`Creating campaign: ${campaign.name}`)
    const campResp = await fetch('https://a.klaviyo.com/api/campaigns/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify(campaignPayload)
    })

    if (!campResp.ok) {
      const errBody = await campResp.text()
      console.error('Klaviyo campaign creation error:', campResp.status, errBody)
      throw new Error(`Error creating campaign in Klaviyo: ${campResp.status} - ${errBody.substring(0, 200)}`)
    }

    const campData = await campResp.json()
    const campaignId = campData.data?.id
    console.log(`Campaign created as draft: ${campaignId}`)

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