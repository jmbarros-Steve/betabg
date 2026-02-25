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
    const results: Record<string, any> = {}

    // === TEST 1: Try different revisions with profile_count ===
    console.log('=== TEST 1: Revisions with profile_count ===')
    const revisions = ['2025-01-15', '2024-10-15', '2024-07-15', '2024-06-15']
    results.revision_tests = {}
    for (const rev of revisions) {
      console.log(`Trying revision: ${rev}`)
      const resp = await fetch(
        'https://a.klaviyo.com/api/lists/?additional-fields[list]=profile_count&page[size]=50',
        {
          headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'accept': 'application/json',
            'revision': rev
          }
        }
      )
      console.log(`Revision ${rev} status:`, resp.status)
      if (resp.ok) {
        const data = await resp.json()
        results.revision_tests[rev] = { status: resp.status, lists_count: data.data?.length, first_list: data.data?.[0]?.attributes }
        console.log(`Revision ${rev} WORKS! Lists: ${data.data?.length}`)
      } else {
        const err = await resp.text()
        results.revision_tests[rev] = { status: resp.status, error: err.substring(0, 200) }
        console.log(`Revision ${rev} FAILED:`, err.substring(0, 200))
      }
      await new Promise(r => setTimeout(r, 500))
    }

    await new Promise(r => setTimeout(r, 1000))

    // === TEST 2: Lists WITHOUT additional-fields ===
    console.log('=== TEST 2: Lists without additional-fields ===')
    const listsResp = await fetch('https://a.klaviyo.com/api/lists/', {
      headers: { 'Authorization': `Klaviyo-API-Key ${apiKey}`, 'accept': 'application/json', 'revision': '2024-10-15' }
    })
    console.log('Lists basic status:', listsResp.status)
    if (listsResp.ok) {
      const listsData = await listsResp.json()
      results.lists_basic = { status: 200, count: listsData.data?.length, first: listsData.data?.[0]?.attributes }
    } else {
      results.lists_basic = { status: listsResp.status, error: (await listsResp.text()).substring(0, 300) }
    }

    await new Promise(r => setTimeout(r, 1000))

    // === TEST 3: Segments WITHOUT additional-fields ===
    console.log('=== TEST 3: Segments without additional-fields ===')
    const segsResp = await fetch('https://a.klaviyo.com/api/segments/', {
      headers: { 'Authorization': `Klaviyo-API-Key ${apiKey}`, 'accept': 'application/json', 'revision': '2024-10-15' }
    })
    console.log('Segments basic status:', segsResp.status)
    if (segsResp.ok) {
      const segsData = await segsResp.json()
      results.segments_basic = { status: 200, count: segsData.data?.length, first: segsData.data?.[0]?.attributes }
    } else {
      results.segments_basic = { status: segsResp.status, error: (await segsResp.text()).substring(0, 300) }
    }

    await new Promise(r => setTimeout(r, 1000))

    // === TEST 4: Campaigns ===
    console.log('=== TEST 4: Campaigns ===')
    const campsResp = await fetch(
      'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&page[size]=50',
      { headers: { 'Authorization': `Klaviyo-API-Key ${apiKey}`, 'accept': 'application/json', 'revision': '2024-10-15' } }
    )
    console.log('Campaigns status:', campsResp.status)
    if (campsResp.ok) {
      const campsData = await campsResp.json()
      results.campaigns = { status: 200, count: campsData.data?.length, first: campsData.data?.[0]?.attributes?.name }
    } else {
      const errText = await campsResp.text()
      results.campaigns = { status: campsResp.status, error: errText.substring(0, 300) }
      // Try without page[size]
      console.log('Trying campaigns without page[size]...')
      await new Promise(r => setTimeout(r, 500))
      const camps2 = await fetch(
        'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")',
        { headers: { 'Authorization': `Klaviyo-API-Key ${apiKey}`, 'accept': 'application/json', 'revision': '2024-10-15' } }
      )
      if (camps2.ok) {
        const d = await camps2.json()
        results.campaigns_no_pagesize = { status: 200, count: d.data?.length, first: d.data?.[0]?.attributes?.name }
      } else {
        results.campaigns_no_pagesize = { status: camps2.status, error: (await camps2.text()).substring(0, 300) }
      }
    }

    console.log('=== ALL TESTS DONE ===')
    return new Response(JSON.stringify(results, null, 2), {
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
