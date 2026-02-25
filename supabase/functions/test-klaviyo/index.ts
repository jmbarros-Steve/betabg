import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const apiKey = 'pk_f7fcca7425a6e2e94b182237ccb33e5792'

    console.log('Step 1: Calling Klaviyo lists...')
    const listsResp = await fetch(
      'https://a.klaviyo.com/api/lists/?additional-fields[list]=profile_count&page[size]=50',
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': '2024-10-15'
        }
      }
    )
    console.log('Step 2: Lists status:', listsResp.status)
    const listsText = await listsResp.text()
    console.log('Step 3: Lists response:', listsText.substring(0, 500))

    await new Promise(r => setTimeout(r, 1500))

    console.log('Step 4: Calling Klaviyo segments...')
    const segsResp = await fetch(
      'https://a.klaviyo.com/api/segments/?additional-fields[segment]=profile_count&page[size]=50',
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': '2024-10-15'
        }
      }
    )
    console.log('Step 5: Segments status:', segsResp.status)
    const segsText = await segsResp.text()
    console.log('Step 6: Segments response:', segsText.substring(0, 500))

    await new Promise(r => setTimeout(r, 1500))

    console.log('Step 7: Calling Klaviyo campaigns...')
    const campsResp = await fetch(
      'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&page[size]=50',
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': '2024-10-15'
        }
      }
    )
    console.log('Step 8: Campaigns status:', campsResp.status)
    const campsText = await campsResp.text()
    console.log('Step 9: Campaigns response:', campsText.substring(0, 500))

    return new Response(JSON.stringify({
      lists_status: listsResp.status,
      lists_response: listsText.substring(0, 1000),
      segments_status: segsResp.status,
      segments_response: segsText.substring(0, 1000),
      campaigns_status: campsResp.status,
      campaigns_response: campsText.substring(0, 1000)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
