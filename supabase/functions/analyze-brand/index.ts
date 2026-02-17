import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { client_id, website_url, competitor_urls, research_type } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify access
    const { data: client } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id, name, company')
      .eq('id', client_id)
      .single();

    if (!client || (client.client_user_id !== user.id && client.user_id !== user.id)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get brand brief for context
    const { data: persona } = await supabase
      .from('buyer_personas')
      .select('persona_data')
      .eq('client_id', client_id)
      .maybeSingle();

    const briefContext = persona?.persona_data || {};

    let result: any = {};

    // Scrape website if URL provided and firecrawl available
    let websiteContent = '';
    if (website_url && firecrawlApiKey) {
      try {
        const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: website_url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });
        const scrapeData = await scrapeResp.json();
        websiteContent = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        console.log('Scraped website, length:', websiteContent.length);
      } catch (e) {
        console.error('Scrape error:', e);
      }
    }

    // Scrape competitors
    let competitorContents: string[] = [];
    if (competitor_urls?.length && firecrawlApiKey) {
      for (const url of competitor_urls.slice(0, 3)) {
        try {
          const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
          });
          const data = await resp.json();
          competitorContents.push(`## ${url}\n${(data?.data?.markdown || data?.markdown || '').slice(0, 3000)}`);
        } catch (e) {
          console.error('Competitor scrape error:', e);
        }
      }
    }

    // Build comprehensive analysis prompt
    const analysisPrompt = `Eres un analista senior de marketing digital. Analiza la siguiente información y genera un reporte COMPLETO en español.

MARCA: ${client.name} (${client.company || 'Sin empresa'})
WEBSITE: ${website_url || 'No proporcionado'}

${websiteContent ? `CONTENIDO DEL SITIO WEB:\n${websiteContent.slice(0, 5000)}` : ''}

${competitorContents.length > 0 ? `CONTENIDO DE COMPETIDORES:\n${competitorContents.join('\n\n').slice(0, 8000)}` : ''}

BRIEF DE MARCA (si disponible):
${JSON.stringify(briefContext).slice(0, 3000)}

Genera un JSON con las siguientes secciones:

{
  "seo_audit": {
    "score": 0-100,
    "issues": ["problema 1", "problema 2"],
    "recommendations": ["recomendación 1", "recomendación 2"],
    "meta_analysis": "análisis de meta tags y estructura",
    "content_quality": "análisis de calidad de contenido",
    "mobile_readiness": "análisis de responsividad"
  },
  "competitor_analysis": {
    "competitors": [
      {
        "name": "nombre",
        "url": "url",
        "strengths": ["fortaleza 1"],
        "weaknesses": ["debilidad 1"],
        "positioning": "cómo se posicionan",
        "ad_strategy": "qué tipo de anuncios usan (si es visible)"
      }
    ],
    "market_gaps": ["oportunidad 1"],
    "competitive_advantage": "ventaja competitiva sugerida"
  },
  "keywords": {
    "primary": ["keyword principal 1", "keyword 2"],
    "long_tail": ["keyword long tail 1"],
    "competitor_keywords": ["keyword de competidor"],
    "recommended_strategy": "estrategia recomendada"
  },
  "ads_library_analysis": {
    "estimated_ad_types": ["tipo 1"],
    "recommended_formats": ["formato recomendado"],
    "winning_patterns": ["patrón ganador 1"],
    "cta_analysis": "análisis de llamados a la acción",
    "creative_recommendations": ["recomendación creativa 1"]
  },
  "executive_summary": "Resumen ejecutivo de 2-3 párrafos con los hallazgos más importantes y recomendaciones prioritarias."
}

IMPORTANTE: Responde SOLO con el JSON válido, sin texto adicional. Sé específico y accionable.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Eres un analista de marketing. Responde SOLO en JSON válido.' },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    let rawContent = aiData.choices?.[0]?.message?.content || '{}';
    
    // Clean markdown code fences if present
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw:', rawContent.slice(0, 500));
      result = { executive_summary: rawContent, parse_error: true };
    }

    // Save each research type
    const researchTypes = ['seo_audit', 'competitor_analysis', 'keywords', 'ads_library_analysis'];
    for (const rt of researchTypes) {
      if (result[rt]) {
        await supabase
          .from('brand_research')
          .upsert({
            client_id,
            research_type: rt,
            research_data: result[rt],
          }, { onConflict: 'client_id,research_type' });
      }
    }

    // Save executive summary in brand_research too
    if (result.executive_summary) {
      await supabase
        .from('brand_research')
        .upsert({
          client_id,
          research_type: 'executive_summary',
          research_data: { summary: result.executive_summary },
        }, { onConflict: 'client_id,research_type' });
    }

    // Update client's website_url
    if (website_url) {
      await supabase.from('clients').update({ website_url }).eq('id', client_id);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analyze brand error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
