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
    const brandContext = JSON.stringify(briefContext).slice(0, 3000);
    const analysisPrompt = `Eres un analista senior de marketing digital con experiencia en SEO técnico, inteligencia competitiva y estrategia de keywords. Analiza EXHAUSTIVAMENTE la siguiente información.

MARCA: ${client.name} (${client.company || 'Sin empresa'})
WEBSITE: ${website_url || 'No proporcionado'}

${websiteContent ? `=== CONTENIDO DEL SITIO WEB (scrapeado) ===\n${websiteContent.slice(0, 6000)}` : '=== SITIO WEB: No se pudo scrapear ==='}

${competitorContents.length > 0 ? `=== CONTENIDO DE COMPETIDORES (scrapeado) ===\n${competitorContents.join('\n\n').slice(0, 8000)}` : '=== COMPETIDORES: No proporcionados o no scrapeados ==='}

=== BRIEF DE MARCA ===
${brandContext}

Genera un JSON EXHAUSTIVO con estas secciones. Sé MUY específico con datos reales del contenido scrapeado:

{
  "seo_audit": {
    "score": [número 0-100 basado en calidad del contenido, estructura, keywords, etc.],
    "issues": [
      "Problema técnico específico detectado en el sitio 1",
      "Problema técnico específico detectado en el sitio 2",
      "Problema de contenido específico 3",
      "Problema de estructura 4",
      "Problema de velocidad/UX estimado 5"
    ],
    "recommendations": [
      "Acción concreta recomendación 1 con métricas esperadas",
      "Acción concreta recomendación 2",
      "Acción concreta recomendación 3",
      "Acción concreta recomendación 4",
      "Acción concreta recomendación 5"
    ],
    "meta_analysis": "Análisis detallado de: títulos H1/H2, meta descriptions, estructura de URLs, uso de schema markup. Basado en el contenido scrapeado del sitio.",
    "content_quality": "Análisis de: densidad de keywords, legibilidad, profundidad del contenido, CTAs, propuesta de valor visible. Menciona hallazgos CONCRETOS del sitio.",
    "mobile_readiness": "Evaluación de: responsive design, velocidad estimada, experiencia móvil, core web vitals estimados.",
    "competitive_seo_gap": "Comparación SEO específica entre ${client.name} y los competidores scrapeados. Quién está ganando en qué keywords y por qué."
  },
  "competitor_analysis": {
    "competitors": [
      {
        "name": "Nombre de la marca competidora",
        "url": "url exacta del competidor",
        "strengths": ["Fortaleza específica detectada en su sitio 1", "Fortaleza 2", "Fortaleza 3"],
        "weaknesses": ["Debilidad específica detectada 1", "Debilidad 2", "Debilidad 3"],
        "positioning": "Cómo se posicionan EXACTAMENTE según su sitio web scrapeado",
        "value_proposition": "Cuál es su propuesta de valor principal según su H1 y contenido hero",
        "ad_strategy": "Tipo de anuncios estimado basado en su contenido y llamados a la acción",
        "price_positioning": "Alto/Medio/Bajo — justificado con datos del sitio",
        "tech_stack": "Plataforma detectada (Shopify, WooCommerce, etc.) si es identificable"
      }
    ],
    "market_gaps": [
      "Oportunidad específica de mercado no cubierta por los competidores 1",
      "Oportunidad 2",
      "Oportunidad 3",
      "Oportunidad 4"
    ],
    "competitive_advantage": "Ventaja competitiva CONCRETA y diferenciada que ${client.name} puede explotar basándose en los gaps detectados",
    "benchmark_summary": "Tabla comparativa narrativa: cómo se compara ${client.name} vs cada competidor en: precio, contenido, UX, propuesta de valor"
  },
  "keywords": {
    "primary": [
      "keyword principal 1 — alta intención comercial",
      "keyword principal 2",
      "keyword principal 3",
      "keyword principal 4",
      "keyword principal 5"
    ],
    "long_tail": [
      "frase de búsqueda larga 1 — baja competencia alta conversión",
      "frase larga 2",
      "frase larga 3",
      "frase larga 4",
      "frase larga 5",
      "frase larga 6",
      "frase larga 7"
    ],
    "competitor_keywords": [
      "keyword que usa el competidor 1 y ${client.name} debería atacar",
      "keyword competidor 2",
      "keyword competidor 3",
      "keyword competidor 4"
    ],
    "negative_keywords": ["keyword a excluir 1", "keyword a excluir 2"],
    "seasonal_keywords": ["keyword estacional o de tendencia 1", "keyword estacional 2"],
    "recommended_strategy": "Estrategia de keywords COMPLETA: qué keywords atacar primero (Quick wins), cuáles son para largo plazo, cómo estructurar el contenido por intención de búsqueda. Include búsquedas de marca vs genéricas.",
    "google_ads_match_types": {
      "exact": ["[keyword exacta 1]", "[keyword exacta 2]"],
      "phrase": ["\"frase keyword 1\"", "\"frase keyword 2\""],
      "broad_modified": ["+keyword +modificada 1", "+keyword +modificada 2"]
    }
  },
  "ads_library_analysis": {
    "estimated_ad_types": ["Tipo de anuncio recomendado 1 para esta industria", "Tipo 2", "Tipo 3"],
    "recommended_formats": ["Formato específico 1 (ej: Video testimonial 15s)", "Formato 2", "Formato 3"],
    "winning_patterns": [
      "Patrón ganador detectado en competidores o industria 1",
      "Patrón 2",
      "Patrón 3",
      "Patrón 4"
    ],
    "cta_analysis": "Análisis de llamados a la acción: qué CTAs usan los competidores, cuáles tienen mayor tasa de conversión estimada en esta industria, recomendaciones específicas para ${client.name}",
    "creative_recommendations": [
      "Recomendación creativa específica basada en el análisis 1",
      "Recomendación 2",
      "Recomendación 3"
    ],
    "hook_ideas": ["Idea de hook/gancho para video/imagen 1", "Hook idea 2", "Hook idea 3"]
  },
  "executive_summary": "Resumen ejecutivo profesional de 3 párrafos estilo McKinsey: 1) Situación actual del sitio y posición competitiva. 2) Principales oportunidades identificadas. 3) Las 3 acciones prioritarias inmediatas con impacto estimado."
}

REGLAS CRÍTICAS:
1. Responde SOLO con el JSON válido, sin texto adicional, sin markdown, sin \`\`\`json
2. Usa datos REALES del contenido scrapeado, no genérico
3. Si no se pudo scrapear un competidor, usa el conocimiento del sector para estimar
4. Sé específico: menciona textos exactos encontrados en los sitios, H1s, precios, CTAs
5. Todas las keywords deben ser en el idioma del mercado objetivo (infiere del contenido)`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Eres un analista senior de marketing digital especializado en SEO, keywords y análisis competitivo. Responde SOLO en JSON válido sin markdown. Nunca uses ```json ni ```. Solo el JSON puro.' },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.2,
        max_tokens: 6000,
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
