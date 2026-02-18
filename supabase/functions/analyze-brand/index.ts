import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Auth — support both user JWT and internal service-role calls (from steve-chat auto-trigger)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isInternalCall = token === serviceRoleKey;

    let userId: string | null = null;
    if (!isInternalCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const { client_id, website_url, competitor_urls, research_type } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify access — internal calls skip ownership check (service role can access any client)
    const { data: client } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id, name, company')
      .eq('id', client_id)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isInternalCall && userId && client.client_user_id !== userId && client.user_id !== userId) {
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

    // Scrape competitors (provided ones + auto-detect up to 3 more via Firecrawl search)
    let competitorContents: string[] = [];
    let allCompetitorUrls = [...(competitor_urls || [])].slice(0, 3);

    // Auto-detect additional competitors via Firecrawl search
    if (firecrawlApiKey && websiteContent) {
      try {
        // Extract brand/sector keywords from brief context for competitor search
        const briefStr = JSON.stringify(briefContext);
        const sectorMatch = briefStr.match(/"business_pitch"[^"]*"([^"]{20,200})"/) || briefStr.match(/pijama|ropa|moda|tienda|e-commerce|fashion|clothing/i);
        const searchQuery = `competidores sitios web similares a ${client.name} ${client.company || ''} e-commerce`;
        const searchResp = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, limit: 8, lang: 'es' }),
        });
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          const foundUrls: string[] = (searchData?.data || [])
            .map((r: any) => r.url)
            .filter((u: string) => u && !u.includes(client.name?.toLowerCase()) && !allCompetitorUrls.some(cu => u.includes(cu)))
            .slice(0, 3);
          allCompetitorUrls = [...allCompetitorUrls, ...foundUrls];
          console.log('Auto-detected additional competitors:', foundUrls);
        }
      } catch (e) {
        console.error('Auto competitor detection error:', e);
      }
    }

    if (allCompetitorUrls.length && firecrawlApiKey) {
      for (const url of allCompetitorUrls.slice(0, 6)) {
        try {
          let formattedUrl = url.trim();
          if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`;
          const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: formattedUrl, formats: ['markdown'], onlyMainContent: true }),
          });
          const data = await resp.json();
          const content = (data?.data?.markdown || data?.markdown || '').slice(0, 2500);
          if (content.length > 100) {
            competitorContents.push(`## ${formattedUrl}\n${content}`);
          }
        } catch (e) {
          console.error('Competitor scrape error:', e);
        }
      }
    }

    // Build comprehensive analysis prompt
    const brandContext = JSON.stringify(briefContext).slice(0, 3000);
    const analysisPrompt = `Eres un consultor senior de marketing digital de primer nivel (nivel McKinsey/BCG) especializado en SEO técnico, publicidad digital (Meta Ads y Google Ads), inteligencia competitiva y estrategia de performance marketing para e-commerce. Analiza EXHAUSTIVAMENTE la siguiente información y genera un plan estratégico completo que sirva como hoja de ruta ejecutable.

MARCA: ${client.name} (${client.company || 'Sin empresa'})
WEBSITE: ${website_url || 'No proporcionado'}

${websiteContent ? `=== CONTENIDO DEL SITIO WEB ===\n${websiteContent.slice(0, 6000)}` : '=== SITIO WEB: No se pudo analizar ==='}

${competitorContents.length > 0 ? `=== CONTENIDO DE COMPETIDORES (${competitorContents.length} analizados — incluye los 3 que el cliente indicó + hasta 3 detectados automáticamente) ===\n${competitorContents.join('\n\n').slice(0, 10000)}` : '=== COMPETIDORES: No proporcionados ==='}

=== BRIEF DE MARCA (datos del cliente) ===
${brandContext}

Genera un JSON EXHAUSTIVO con estas secciones. Sé MUY específico — cada recomendación debe ser accionable, con métricas, plazos y benchmarks de industria reales:

{
  "seo_audit": {
    "score": [número 0-100 basado en calidad del contenido, estructura técnica, keywords y UX],
    "issues": [
      "Problema técnico específico detectado 1 — con impacto estimado en rankings",
      "Problema técnico específico 2",
      "Problema de contenido/keywords específico 3",
      "Problema de estructura (H1/H2/schema) 4",
      "Problema de velocidad o Core Web Vitals estimado 5"
    ],
    "recommendations": [
      "Acción concreta 1 — impacto esperado + tiempo de implementación",
      "Acción concreta 2",
      "Acción concreta 3",
      "Acción concreta 4",
      "Acción concreta 5"
    ],
    "meta_analysis": "Análisis de: title tags (longitud, keyword principal), meta descriptions, H1/H2, estructura de URLs, schema markup presente. Con hallazgos CONCRETOS del contenido analizado.",
    "content_quality": "Análisis de: densidad de keywords, legibilidad, profundidad del contenido, CTAs visibles, propuesta de valor en above-the-fold. Menciona lo que SÍ está bien y lo que falta.",
    "mobile_readiness": "Evaluación de: diseño responsive, velocidad estimada (LCP, FID, CLS), experiencia móvil. Inferir desde el contenido analizado.",
    "technical_seo_priority": "Las 3 acciones técnicas SEO con mayor ROI estimado para este sitio específicamente, ordenadas por impacto.",
    "competitive_seo_gap": "Comparación SEO entre ${client.name} y los competidores analizados. Quién domina qué keywords, dónde está el gap y cómo cerrarlo."
  },
  "competitor_analysis": {
    "competitors": [
      {
        "name": "Nombre de la marca competidora",
        "url": "url exacta del competidor",
        "seo_score": [número 0-100 estimado],
        "strengths": ["Fortaleza específica detectada 1", "Fortaleza 2", "Fortaleza 3"],
        "weaknesses": ["Debilidad específica detectada 1 — explotable por el cliente", "Debilidad 2", "Debilidad 3"],
        "positioning": "Cómo se posicionan según su sitio — qué prometen y a quién le hablan",
        "value_proposition": "Propuesta de valor principal según su H1, hero text y contenido de portada",
        "ad_strategy_inferred": "Tipo de anuncios y mensajes inferidos según su contenido, CTAs y estructura de landing pages",
        "price_positioning": "Alto/Medio/Bajo — justificado con datos del sitio o del sector",
        "tech_stack": "Plataforma (Shopify, WooCommerce, Tiendanube, etc.) si es detectable",
        "attack_vector": "La MEJOR forma de quitarle clientes a este competidor específicamente — táctica concreta"
      }
    ],
    "market_gaps": [
      "Oportunidad específica de mercado que NADIE está cubriendo bien — con estimación de tamaño",
      "Oportunidad 2",
      "Oportunidad 3 — blue ocean",
      "Oportunidad 4"
    ],
    "competitive_advantage": "Ventaja competitiva CONCRETA y sostenible de ${client.name} basándose en los gaps detectados. Debe ser difícil de replicar.",
    "benchmark_summary": "Comparativa narrativa: ${client.name} vs cada competidor en: precio, propuesta de valor, UX percibida, contenido SEO, sofisticación de marketing digital."
  },
  "keywords": {
    "primary": [
      "keyword principal 1 — [volumen estimado] búsquedas/mes, [competencia: alta/media/baja]",
      "keyword principal 2 — [volumen estimado], [competencia]",
      "keyword principal 3 — [volumen estimado], [competencia]",
      "keyword principal 4 — [volumen estimado], [competencia]",
      "keyword principal 5 — [volumen estimado], [competencia]"
    ],
    "long_tail": [
      "frase long tail 1 — baja competencia, alta intención de compra",
      "frase long tail 2",
      "frase long tail 3",
      "frase long tail 4",
      "frase long tail 5",
      "frase long tail 6",
      "frase long tail 7"
    ],
    "competitor_keywords": [
      "keyword que usan competidores y ${client.name} debería atacar — con justificación",
      "keyword competidora 2",
      "keyword competidora 3",
      "keyword competidora 4"
    ],
    "negative_keywords": ["keyword a excluir 1 — razón", "keyword a excluir 2 — razón", "keyword 3", "keyword 4"],
    "seasonal_keywords": ["keyword estacional 1 — temporada relevante", "keyword estacional 2"],
    "recommended_strategy": "Estrategia de keywords en 3 fases: (1) Quick wins en 30 días: qué keywords atacar primero con contenido y Google Ads. (2) Crecimiento 30-90 días: cluster de contenido y SEO on-page. (3) Dominación 90+ días: linkbuilding y autoridad de dominio para keywords de alta competencia.",
    "google_ads_match_types": {
      "exact": ["[keyword exacta 1]", "[keyword exacta 2]", "[keyword exacta 3]"],
      "phrase": ["\"frase keyword 1\"", "\"frase keyword 2\"", "\"frase keyword 3\""],
      "broad_modified": ["+keyword +modificada 1", "+keyword +modificada 2"]
    },
    "content_cluster_topics": [
      "Tema de artículo evergreen 1 — alta búsqueda, baja competencia",
      "Tema de artículo 2",
      "Tema de artículo 3"
    ]
  },
  "ads_library_analysis": {
    "meta_ads_strategy": {
      "funnel_structure": "Descripción de la estructura TOFU-MOFU-BOFU recomendada para Meta Ads en este sector específico, con porcentajes de presupuesto sugeridos.",
      "creative_formats_priority": [
        "Formato #1 — [nombre]: [descripción DETALLADA del formato, duración si es video, composición visual, texto overlay recomendado, por qué funciona para este buyer persona]",
        "Formato #2 — [nombre]: [descripción detallada]",
        "Formato #3 — [nombre]: [descripción detallada]",
        "Formato #4 — Retargeting: [descripción detallada del formato para recuperar carritos abandonados y visitantes]"
      ],
      "copy_hooks": [
        "Hook de apertura 1 (para video/carrusel): [frase textual de apertura — debe conectar con el dolor del buyer persona en los primeros 3 segundos]",
        "Hook 2: [frase textual]",
        "Hook 3: [frase textual — variación emocional]",
        "Hook 4: [frase textual — variación social proof]"
      ],
      "primary_text_templates": [
        "Template de primary text para TOFU: [texto completo de ejemplo, máximo 125 caracteres para mobile, siguiendo estructura Problema → Agitación → Solución]",
        "Template para BOFU: [texto con urgencia, garantía y CTA directa]"
      ],
      "cta_recommendations": ["CTA 1 recomendado para conversión", "CTA 2", "CTA 3"],
      "audience_targeting": {
        "cold": "Descripción detallada de audiencia fría: intereses específicos, comportamientos, demografía — basada en el buyer persona de la marca",
        "warm": "Audiencia tibia: parámetros de engagement y retargeting de visitantes del sitio",
        "hot": "Audiencia caliente: visitantes de página de producto, add-to-cart, checkout iniciado — ventanas de tiempo recomendadas",
        "lookalike": "Configuración de lookalike: base recomendada y porcentaje"
      },
      "objections_to_address": [
        "Objeción #1 del comprador y cómo el copy la neutraliza en el anuncio",
        "Objeción #2 y táctica de neutralización"
      ]
    },
    "google_ads_strategy": {
      "campaign_structure": "Estructura de campañas recomendada: Search Brand + Search Genérico + Shopping/PMax + Display Remarketing. Justificación basada en el volumen de búsquedas del sector.",
      "search_ad_copy": {
        "headlines_examples": [
          "Headline 1 (máx 30 chars): [ejemplo específico para este negocio]",
          "Headline 2: [ejemplo con keyword principal]",
          "Headline 3: [ejemplo con propuesta de valor]",
          "Headline 4: [ejemplo con garantía]",
          "Headline 5: [ejemplo con CTA]"
        ],
        "descriptions_examples": [
          "Description 1 (máx 90 chars): [ejemplo con beneficio principal + CTA]",
          "Description 2: [ejemplo rebatiendo objeción principal]"
        ],
        "extensions": ["Sitelink 1: [texto + descripción]", "Sitelink 2", "Callout 1", "Callout 2", "Callout 3"]
      },
      "bidding_strategy": "Estrategia de bidding por fases: Fase 1 (0-30 días) → Fase 2 (30-90 días) → Fase 3 (90+ días). Con CPA objetivo y ROAS objetivo basados en el margen del negocio.",
      "pmax_recommendation": "Recomendación específica sobre Performance Max: cuándo activarlo, qué señales de audiencia usar, assets mínimos necesarios."
    },
    "winning_patterns": [
      "Patrón creativo ganador en esta industria 1 — con datos de por qué funciona",
      "Patrón 2",
      "Patrón 3",
      "Patrón 4"
    ]
  },
  "cost_benchmarks": {
    "meta_benchmarks": {
      "cpm_range": "Rango de CPM estimado para este sector y geografía (ej: $6-$14 USD en LATAM para moda)",
      "ctr_benchmark": "CTR promedio esperado por formato (feed: 0.9-1.5%, Stories: 0.5-0.8%)",
      "cvr_benchmark": "Tasa de conversión promedio en este sector (ej: moda e-commerce: 1.5-2.5%)",
      "cpa_target": "CPA objetivo recomendado basado en el margen del negocio (calcular si hay datos financieros en el brief)",
      "roas_minimum": "ROAS mínimo aceptable para este margen",
      "roas_target": "ROAS objetivo para ser rentable y escalar",
      "budget_recommendation": "Presupuesto mínimo recomendado para obtener data estadísticamente significativa en 30 días"
    },
    "google_benchmarks": {
      "cpc_range": "Rango de CPC estimado para keywords principales de este sector",
      "ctr_search_benchmark": "CTR promedio en Search para este sector (ej: e-commerce: 4-6%)",
      "cvr_search_benchmark": "Tasa de conversión desde Search (típicamente más alta que Meta por intención)",
      "quality_score_targets": "Calidad de anuncio objetivo: QS 7+ para reducir CPC en 20-30%",
      "cpa_target": "CPA objetivo en Google Ads (suele ser menor que Meta por mayor intención de compra)"
    },
    "pause_rules": [
      "Regla de pausa 1: [condición específica con números — ej: 'Pausar ad set si CPA > 2× objetivo después de $X de inversión sin conversión']",
      "Regla de pausa 2: [condición para keywords]",
      "Regla de pausa 3: [condición para creativos]"
    ],
    "scale_triggers": [
      "Señal de escalamiento 1: [cuándo y cómo duplicar presupuesto]",
      "Señal de escalamiento 2: [KPI que indica que se puede escalar ROAS agresivo]"
    ]
  },
  "seo_roadmap": {
    "horizon_1_quick_wins": [
      {"action": "Acción técnica 1", "impact": "Impacto estimado", "difficulty": "Baja/Media/Alta", "week": "1-2"},
      {"action": "Acción técnica 2", "impact": "Impacto estimado", "difficulty": "Baja", "week": "1-2"},
      {"action": "Acción on-page 3", "impact": "Impacto estimado", "difficulty": "Baja", "week": "2-3"},
      {"action": "Schema markup 4", "impact": "Rich snippets → +30% CTR", "difficulty": "Media", "week": "3-4"},
      {"action": "Optimización imágenes 5", "impact": "LCP < 2.5s", "difficulty": "Baja", "week": "1-2"}
    ],
    "horizon_2_growth": [
      {"action": "Cluster de contenido sobre [tema principal]", "description": "Descripción detallada del cluster"},
      {"action": "Linkbuilding inicial", "description": "Estrategia específica de backlinks para este sector"},
      {"action": "Optimización de páginas de categoría", "description": "Agregar copy SEO en páginas clave"}
    ],
    "horizon_3_authority": [
      "Estrategia de contenido evergreen: [3 temas específicos]",
      "Keywords target top 3 en 90 días: [listar keywords específicas alcanzables]",
      "Objetivo de DA/DR a 6 meses: [número estimado alcanzable]"
    ],
    "kpi_targets": {
      "traffic_growth_30d": "X% de mejora en tráfico orgánico en 30 días",
      "keywords_top10_90d": "X keywords en top 10 en 90 días",
      "ctr_improvement": "Mejora de CTR orgánico en X% con optimización de title tags y meta descriptions"
    },
    "recommended_tools": ["Google Search Console (obligatorio)", "Semrush o Ahrefs (keyword tracking)", "Screaming Frog (auditoría técnica)", "PageSpeed Insights (Core Web Vitals)", "[herramienta específica si es Shopify/WordPress/otra plataforma]"]
  },
  "competitive_domination": {
    "vulnerability_map": [
      {"competitor": "Nombre competidor 1", "vulnerability": "Debilidad explotable específica", "attack_tactic": "Táctica concreta de ataque", "channel": "Meta/Google/SEO/Contenido", "timeline": "Corto/Mediano plazo"},
      {"competitor": "Nombre competidor 2", "vulnerability": "Debilidad explotable", "attack_tactic": "Táctica concreta", "channel": "Canal", "timeline": "Plazo"},
      {"competitor": "Nombre competidor 3", "vulnerability": "Debilidad explotable", "attack_tactic": "Táctica concreta", "channel": "Canal", "timeline": "Plazo"}
    ],
    "competitive_keyword_strategy": {
      "bidding_on_competitors": "Análisis de si conviene pujar por keywords de marca de competidores — con estimación de CPC y ROI esperado",
      "comparison_content": "Plan de contenido SEO de comparación: '${client.name} vs [Competidor]' — qué páginas crear y cómo posicionarlas",
      "featured_snippet_opportunities": ["Pregunta de featured snippet 1 del sector", "Pregunta 2", "Pregunta 3"]
    },
    "messaging_per_competitor": [
      "Para capturar clientes de [Competidor 1]: mensaje '[mensaje diferenciador específico]' en ads de keywords comparativas",
      "Para capturar clientes de [Competidor 2]: mensaje '[mensaje específico]'",
      "Para capturar clientes de [Competidor 3]: mensaje '[mensaje específico]'"
    ],
    "blue_ocean_opportunities": [
      "Oportunidad blue ocean 1: segmento o propuesta no cubierta por ningún competidor — con potencial de mercado estimado",
      "Oportunidad 2",
      "Oportunidad 3 — con estrategia de entrada"
    ],
    "success_kpis_6months": [
      "Share of Voice en keywords objetivo: X% (desde X% actual)",
      "Posición promedio en Google para keywords competidoras: top X",
      "% de tráfico orgánico capturado de búsquedas de marca de competidores: X%"
    ]
  },
  "executive_summary": "Resumen ejecutivo de 4 párrafos estilo McKinsey: (1) Situación competitiva actual — posición de ${client.name} en el mercado vs. competidores. (2) Oportunidades prioritarias identificadas con mayor potencial de ROI. (3) Riesgos y brechas críticas a resolver en los próximos 30 días. (4) Recomendación final con las 3 acciones inmediatas de mayor impacto y sus KPIs de éxito esperados. Formal, concluyente, orientado a la acción."
}

REGLAS CRÍTICAS:
1. Responde SOLO con el JSON válido, sin texto adicional, sin markdown, sin \`\`\`json
2. Usa datos REALES del contenido analizado. Si no hay datos, usa benchmarks reales del sector
3. Sé específico con NÚMEROS: CPM, CPC, CTR, CVR, ROAS — usa rangos reales de industria 2024
4. Cada recomendación de copy debe sonar como copy REAL de un anuncio, no como descripción genérica
5. Las keywords deben estar en el idioma del mercado objetivo (inferir del contenido y la marca)
6. Los benchmarks de costo deben ser relevantes para LATAM si la marca opera en la región`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: 'Eres un consultor senior de marketing digital de primer nivel. Responde SOLO en JSON válido sin markdown. Nunca uses ```json ni ```. Solo el JSON puro y completo.' },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.2,
        max_tokens: 12000,
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
    const researchTypes = ['seo_audit', 'competitor_analysis', 'keywords', 'ads_library_analysis', 'cost_benchmarks', 'seo_roadmap', 'competitive_domination'];
    for (const rt of researchTypes) {
      if (result[rt]) {
        const { error: upsertErr } = await supabase
          .from('brand_research')
          .upsert({
            client_id,
            research_type: rt,
            research_data: result[rt],
          }, { onConflict: 'client_id,research_type' });
        if (upsertErr) console.error(`Error saving ${rt}:`, upsertErr);
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

    // CRITICAL: Mark analysis as complete so UI polling stops showing "pending"
    await supabase
      .from('brand_research')
      .upsert({
        client_id,
        research_type: 'analysis_status',
        research_data: { status: 'complete', completed_at: new Date().toISOString() },
      }, { onConflict: 'client_id,research_type' });

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
