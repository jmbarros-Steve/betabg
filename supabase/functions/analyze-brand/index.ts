import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildAnalysisPrompt(
  clientName: string,
  clientCompany: string,
  websiteUrl: string,
  websiteContent: string,
  competitorContents: string[],
  clientProvidedUrls: string[],
  brandContext: string
): string {
  // Build an explicit numbered URL list for the AI so it can't "lose" any competitor
  const allUrls = competitorContents.map(c => c.split('\n')[0].replace('## ', '').trim());
  const urlListStr = allUrls.map((u, i) => `  ${i + 1}. ${u}${i < clientProvidedUrls.length ? ' ← indicado por el cliente' : ' ← detectado automáticamente'}`).join('\n');

  const competitorSection = competitorContents.length > 0
    ? `=== CONTENIDO DE COMPETIDORES ANALIZADOS ===
CRÍTICO: El array "competitors" en tu respuesta JSON DEBE contener EXACTAMENTE ${competitorContents.length} objetos — uno por cada URL de la lista a continuación. No omitas ninguno.

URLs a analizar (${competitorContents.length} total):
${urlListStr}

Contenido scrapeado de cada competidor:
${competitorContents.join('\n\n').slice(0, 14000)}`
    : '=== COMPETIDORES: No proporcionados ===';

  const websiteSection = websiteContent
    ? `=== CONTENIDO DEL SITIO WEB ===\n${websiteContent.slice(0, 6000)}`
    : '=== SITIO WEB: No se pudo analizar ===';

  return `Eres un consultor senior de marketing digital (nivel McKinsey/BCG) especializado en SEO, Meta Ads, Google Ads e inteligencia competitiva para e-commerce. Analiza EXHAUSTIVAMENTE la información y genera un plan estratégico completo.

MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

=== BRIEF DE MARCA ===
${brandContext}

Genera un JSON con estas secciones (responde SOLO JSON válido, sin markdown):

{
  "seo_audit": {
    "score": 0,
    "issues": ["Problema 1","Problema 2","Problema 3","Problema 4","Problema 5"],
    "recommendations": ["Acción 1","Acción 2","Acción 3","Acción 4","Acción 5"],
    "meta_analysis": "Análisis de title tags, meta descriptions, H1/H2, schema markup.",
    "content_quality": "Análisis de densidad de keywords, legibilidad, profundidad, CTAs.",
    "mobile_readiness": "Evaluación de responsive, velocidad estimada, experiencia móvil.",
    "technical_seo_priority": "Las 3 acciones técnicas SEO con mayor ROI.",
    "competitive_seo_gap": "Comparación SEO entre ${clientName} y competidores."
  },
  "competitor_analysis": {
    "competitors": [
      {
        "name": "Nombre competidor",
        "url": "url",
        "seo_score": 0,
        "strengths": ["Fortaleza 1","Fortaleza 2","Fortaleza 3"],
        "weaknesses": ["Debilidad 1","Debilidad 2","Debilidad 3"],
        "positioning": "Cómo se posicionan",
        "value_proposition": "Propuesta de valor principal",
        "ad_strategy_inferred": "Estrategia de ads inferida del contenido",
        "price_positioning": "Alto/Medio/Bajo con justificación",
        "tech_stack": "Plataforma detectada",
        "attack_vector": "Táctica concreta para quitarles clientes"
      }
    ],
    "market_gaps": ["Oportunidad 1","Oportunidad 2","Oportunidad 3","Oportunidad 4"],
    "competitive_advantage": "Ventaja competitiva concreta y sostenible de ${clientName}.",
    "benchmark_summary": "Comparativa narrativa ${clientName} vs cada competidor."
  },
  "keywords": {
    "primary": ["keyword 1 — volumen estimado, competencia","keyword 2","keyword 3","keyword 4","keyword 5"],
    "long_tail": ["long tail 1","long tail 2","long tail 3","long tail 4","long tail 5","long tail 6","long tail 7"],
    "competitor_keywords": ["keyword competidora 1","keyword 2","keyword 3","keyword 4"],
    "negative_keywords": ["keyword negativa 1 — razón","keyword 2","keyword 3","keyword 4"],
    "seasonal_keywords": ["estacional 1 — temporada","estacional 2"],
    "recommended_strategy": "Estrategia en 3 fases: (1) Quick wins 30 días. (2) Crecimiento 30-90 días. (3) Dominación 90+ días.",
    "google_ads_match_types": {
      "exact": ["[keyword 1]","[keyword 2]","[keyword 3]"],
      "phrase": ["\"frase 1\"","\"frase 2\"","\"frase 3\""],
      "broad_modified": ["+keyword +modificada 1","+keyword +modificada 2"]
    },
    "content_cluster_topics": ["Tema evergreen 1","Tema 2","Tema 3"]
  },
  "ads_library_analysis": {
    "meta_ads_strategy": {
      "funnel_structure": "Estructura TOFU-MOFU-BOFU con porcentajes de presupuesto.",
      "creative_formats_priority": ["Formato 1: descripción detallada","Formato 2","Formato 3","Formato 4 Retargeting"],
      "copy_hooks": ["Hook 1: frase textual","Hook 2","Hook 3","Hook 4"],
      "primary_text_templates": ["Template TOFU: texto completo","Template BOFU: texto con urgencia"],
      "cta_recommendations": ["CTA 1","CTA 2","CTA 3"],
      "audience_targeting": {
        "cold": "Audiencia fría: intereses, comportamientos, demografía específica",
        "warm": "Audiencia tibia: engagement y retargeting",
        "hot": "Audiencia caliente: visitantes de producto, add-to-cart",
        "lookalike": "Lookalike: base recomendada y porcentaje"
      },
      "objections_to_address": ["Objeción 1 y cómo neutralizarla","Objeción 2 y táctica"]
    },
    "google_ads_strategy": {
      "campaign_structure": "Estructura: Search Brand + Search Genérico + Shopping/PMax + Display Remarketing.",
      "search_ad_copy": {
        "headlines_examples": ["Headline 1 (30 chars)","Headline 2","Headline 3","Headline 4","Headline 5"],
        "descriptions_examples": ["Description 1 (90 chars)","Description 2"],
        "extensions": ["Sitelink 1","Sitelink 2","Callout 1","Callout 2","Callout 3"]
      },
      "bidding_strategy": "Estrategia de bidding por fases: Fase 1 → Fase 2 → Fase 3.",
      "pmax_recommendation": "Cuándo activar PMax, señales de audiencia, assets mínimos."
    },
    "winning_patterns": ["Patrón 1","Patrón 2","Patrón 3","Patrón 4"]
  },
  "cost_benchmarks": {
    "meta_benchmarks": {
      "cpm_range": "Rango CPM estimado para este sector y geografía",
      "ctr_benchmark": "CTR promedio por formato",
      "cvr_benchmark": "Tasa de conversión promedio en este sector",
      "cpa_target": "CPA objetivo basado en el margen",
      "roas_minimum": "ROAS mínimo aceptable",
      "roas_target": "ROAS objetivo para escalar",
      "budget_recommendation": "Presupuesto mínimo para 30 días de datos"
    },
    "google_benchmarks": {
      "cpc_range": "Rango CPC para keywords principales",
      "ctr_search_benchmark": "CTR promedio en Search",
      "cvr_search_benchmark": "Tasa de conversión desde Search",
      "quality_score_targets": "QS objetivo: 7+",
      "cpa_target": "CPA objetivo en Google Ads"
    },
    "pause_rules": ["Regla pausa 1 con condición numérica","Regla pausa 2 keywords","Regla pausa 3 creativos"],
    "scale_triggers": ["Señal escalamiento 1: cuándo y cómo","Señal escalamiento 2: KPI"]
  },
  "seo_roadmap": {
    "horizon_1_quick_wins": [
      {"action": "Acción 1", "impact": "Impacto", "difficulty": "Baja", "week": "1-2"},
      {"action": "Acción 2", "impact": "Impacto", "difficulty": "Baja", "week": "1-2"},
      {"action": "Acción 3", "impact": "Impacto", "difficulty": "Baja", "week": "2-3"},
      {"action": "Acción 4", "impact": "Rich snippets", "difficulty": "Media", "week": "3-4"},
      {"action": "Acción 5", "impact": "LCP < 2.5s", "difficulty": "Baja", "week": "1-2"}
    ],
    "horizon_2_growth": [
      {"action": "Cluster de contenido", "description": "Descripción del cluster"},
      {"action": "Linkbuilding", "description": "Estrategia de backlinks"},
      {"action": "Páginas de categoría", "description": "Copy SEO en páginas clave"}
    ],
    "horizon_3_authority": ["Evergreen content strategy","Keywords top 3 en 90 días","Objetivo DA/DR a 6 meses"],
    "kpi_targets": {
      "traffic_growth_30d": "X% mejora tráfico orgánico 30 días",
      "keywords_top10_90d": "X keywords en top 10 en 90 días",
      "ctr_improvement": "Mejora CTR orgánico X%"
    },
    "recommended_tools": ["Google Search Console","Semrush o Ahrefs","Screaming Frog","PageSpeed Insights","Herramienta según plataforma"]
  },
  "competitive_domination": {
    "vulnerability_map": [
      {"competitor": "Competidor 1", "vulnerability": "Debilidad explotable", "attack_tactic": "Táctica concreta", "channel": "Meta/Google/SEO", "timeline": "Corto plazo"},
      {"competitor": "Competidor 2", "vulnerability": "Debilidad", "attack_tactic": "Táctica", "channel": "Canal", "timeline": "Mediano plazo"},
      {"competitor": "Competidor 3", "vulnerability": "Debilidad", "attack_tactic": "Táctica", "channel": "Canal", "timeline": "Plazo"}
    ],
    "competitive_keyword_strategy": {
      "bidding_on_competitors": "Análisis si conviene pujar por marca de competidores",
      "comparison_content": "Plan de contenido comparativo SEO",
      "featured_snippet_opportunities": ["Pregunta featured snippet 1","Pregunta 2","Pregunta 3"]
    },
    "messaging_per_competitor": ["Para capturar clientes de Competidor 1: mensaje","Para Competidor 2: mensaje","Para Competidor 3: mensaje"],
    "blue_ocean_opportunities": ["Oportunidad blue ocean 1","Oportunidad 2","Oportunidad 3"],
    "success_kpis_6months": ["Share of Voice en keywords objetivo: X%","Posición promedio top X","% tráfico orgánico de búsquedas de competidores"]
  },
  "executive_summary": "Resumen ejecutivo estilo McKinsey 4 párrafos: (1) Situación competitiva actual. (2) Oportunidades prioritarias de ROI. (3) Riesgos y brechas críticas 30 días. (4) Las 3 acciones inmediatas de mayor impacto con KPIs."
}

REGLAS:
1. Responde SOLO JSON válido, sin markdown, sin backticks
2. Usa datos REALES del contenido analizado. Si no hay datos, usa benchmarks reales del sector LATAM 2024
3. Sé específico con NÚMEROS reales de industria: CPM, CPC, CTR, CVR, ROAS
4. Los competidores del array deben incluir TODOS los analizados (hasta 6): primero los que indicó el cliente, luego los detectados automáticamente
5. Las keywords deben estar en el idioma del mercado objetivo`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!anthropicApiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const isInternalCall = token === supabaseServiceKey;

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

    const { client_id, website_url, competitor_urls, fase_negocio, presupuesto_ads } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { data: persona } = await supabase
      .from('buyer_personas')
      .select('persona_data')
      .eq('client_id', client_id)
      .maybeSingle();

    const briefContext = persona?.persona_data || {};

    // Helper to persist progress steps
    async function updateProgress(step: string, detail: string, pct: number) {
      await supabase
        .from('brand_research')
        .upsert(
          { client_id, research_type: 'analysis_progress', research_data: { step, detail, pct, ts: new Date().toISOString() } },
          { onConflict: 'client_id,research_type' }
        );
    }

    await updateProgress('inicio', 'Iniciando análisis de marca...', 5);

    // Scrape website
    let websiteContent = '';
    if (website_url && firecrawlApiKey) {
      try {
        await updateProgress('sitio_web', `Analizando tu sitio web (${website_url})...`, 10);
        const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: website_url, formats: ['markdown'], onlyMainContent: true }),
        });
        const scrapeData = await scrapeResp.json();
        websiteContent = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        console.log('Scraped website, length:', websiteContent.length);
      } catch (e) {
        console.error('Scrape error:', e);
      }
    }

    // Extract competitor URLs from brief Q9
    const briefCompetitorUrls: string[] = [];
    if (briefContext && (briefContext as any).raw_responses && (briefContext as any).questions) {
      const rawResponses: string[] = (briefContext as any).raw_responses || [];
      const questions: string[] = (briefContext as any).questions || [];
      const competitorsIdx = questions.indexOf('competitors');
      if (competitorsIdx >= 0) {
        const competitorsResponse = rawResponses[competitorsIdx] || '';
        const urlMatches = competitorsResponse.match(/(?:Web[^:]*:\s*|🌐\s*)([^\s\n,]+\.[a-z]{2,})/gi) || [];
        for (const match of urlMatches) {
          const url = match.replace(/^(?:Web[^:]*:\s*|🌐\s*)/i, '').trim();
          if (url && !url.includes(client.name?.toLowerCase())) {
            briefCompetitorUrls.push(url.startsWith('http') ? url : `https://${url}`);
          }
        }
        if (briefCompetitorUrls.length === 0) {
          const domainMatches = competitorsResponse.match(/\b[\w-]+\.(?:cl|com|com\.ar|mx|pe|co)\b/g) || [];
          for (const domain of domainMatches) {
            if (!domain.includes(client.name?.toLowerCase())) {
              briefCompetitorUrls.push(`https://${domain}`);
            }
          }
        }
        console.log('Competitor URLs from brief:', briefCompetitorUrls);
      }
    }

    // Build competitor list: 3 from explicit (frontend) + brief fallback + up to 3 auto-detected
    // Priority: competitor_urls from frontend FIRST, then fill remaining from brief
    const explicitUrls = (competitor_urls || []).filter((u: string) => u.trim());
    const remainingSlots = 3 - Math.min(explicitUrls.length, 3);
    const fillFromBrief = briefCompetitorUrls.filter(u => !explicitUrls.some((e: string) => e.includes(u.replace('https://','').replace('http://','').split('/')[0]))).slice(0, remainingSlots);
    const clientProvidedUrls = [...new Set([...explicitUrls, ...fillFromBrief])].slice(0, 3);
    let allCompetitorUrls = [...clientProvidedUrls];

    if (firecrawlApiKey) {
      try {
        await updateProgress('detectando', 'Detectando competidores adicionales en el mercado...', 20);

        // Build industry-based search queries (NOT brand name — we want competitors, not mentions)
        const industryKeywords = websiteContent.slice(0, 2000);
        const productHints = industryKeywords.match(/(?:pijamas?|ropa|camas?|s[aá]banas?|textil|moda|hogar|deco|calzado|zapatillas?|joyería|electr[oó]nico|cosm[eé]tica|suplemento|deporte|prendas?|vestimenta|lencería)/gi) || [];
        const productCategory = productHints.length > 0 ? [...new Set(productHints.map(h => h.toLowerCase()))].slice(0, 2).join(' ') : 'tienda online';
        const country = website_url?.includes('.cl') ? 'cl' : website_url?.includes('.ar') ? 'ar' : website_url?.includes('.mx') ? 'mx' : 'cl';
        const countryLabel = country === 'cl' ? 'Chile' : country === 'ar' ? 'Argentina' : 'México';

        const searchQueries = [
          `tienda online ${productCategory} ${countryLabel} envío gratis`,
          `comprar ${productCategory} online ${countryLabel}`,
          `mejores marcas ${productCategory} ${countryLabel} e-commerce`,
        ];

        // Comprehensive blocklist of non-competitor domains
        const BLOCKED_DOMAINS = [
          'google', 'facebook', 'instagram', 'twitter', 'youtube', 'wikipedia',
          'linkedin', 'tiktok', 'pinterest', 'reddit', 'tumblr', 'snapchat', 'whatsapp',
          'repositorio', 'udd.cl', 'uchile', 'puc.cl', 'udp.cl', 'academia.edu', 'researchgate',
          'mercadolibre', 'mercadopago', 'falabella', 'ripley', 'paris', 'hites', 'sodimac',
          'amazon', 'ebay', 'aliexpress', 'wish', 'shein', 'zara',
          'shopify.com', 'woocommerce.com', 'wordpress.com', 'wix.com',
          'gov.cl', '.edu.cl', 'blogger', 'medium.com', 'blogspot',
          'emol', 'latercera', 'elmercurio', 'biobiochile',
        ];

        const seenHosts = new Set(allCompetitorUrls.map(u => {
          try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace('www.', ''); } catch { return u; }
        }));
        if (website_url) {
          try { seenHosts.add(new URL(website_url.startsWith('http') ? website_url : `https://${website_url}`).hostname.replace('www.', '')); } catch {}
        }

        const foundUrls: string[] = [];
        for (const searchQuery of searchQueries) {
          if (foundUrls.length >= 3) break;
          try {
            const searchResp = await fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
              // Use limit:15 so we have enough candidates after filtering
              body: JSON.stringify({ query: searchQuery, limit: 15, lang: 'es', country }),
            });
            if (searchResp.ok) {
              const searchData = await searchResp.json();
              const candidates = (searchData?.data || searchData?.results || []);
              for (const r of candidates) {
                if (foundUrls.length >= 3) break;
                const rawUrl = r.url || r.link || '';
                if (!rawUrl) continue;
                try {
                  // Always normalize to root hostname — ignore paths/querystrings
                  const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
                  const rootUrl = `https://${parsed.hostname}`;
                  const hostname = parsed.hostname.replace('www.', '');
                  if (seenHosts.has(hostname)) continue;
                  if (BLOCKED_DOMAINS.some(blocked => hostname.includes(blocked))) continue;
                  if (!hostname.match(/\.(cl|com|com\.ar|mx|pe|co|ar|store|shop|net)$/)) continue;
                  seenHosts.add(hostname);
                  foundUrls.push(rootUrl);
                } catch { continue; }
              }
            }
          } catch (e) {
            console.error('Search query failed:', searchQuery, e);
          }
        }
        allCompetitorUrls = [...allCompetitorUrls, ...foundUrls];
        console.log('Auto-detected additional competitors:', foundUrls);
        console.log('Total to analyze:', allCompetitorUrls.length);
      } catch (e) {
        console.error('Auto competitor detection error:', e);
      }
    }

    // Analyze all competitors with progress per competitor
    const competitorContents: string[] = [];
    const urlsToAnalyze = allCompetitorUrls.slice(0, 6);
    const isClientCompetitor = (url: string) => clientProvidedUrls.some(c => url.includes(c.replace('https://', '').replace('http://', '').split('/')[0]));

    if (urlsToAnalyze.length && firecrawlApiKey) {
      for (let i = 0; i < urlsToAnalyze.length; i++) {
        const url = urlsToAnalyze[i];
        try {
          let formattedUrl = url.trim();
          if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`;
          const domain = new URL(formattedUrl).hostname.replace('www.', '');
          const label = isClientCompetitor(formattedUrl) ? `Analizando competidor (indicado por ti): ${domain}` : `Analizando competidor detectado: ${domain}`;
          const pct = 25 + Math.round((i / urlsToAnalyze.length) * 40);
          await updateProgress(`competidor_${i}`, label, pct);
          const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: formattedUrl, formats: ['markdown'], onlyMainContent: true }),
          });
          const data = await resp.json();
          const content = (data?.data?.markdown || data?.markdown || '').slice(0, 2500);
          // Lower threshold: include even if minimal content (just URL as header is enough for AI context)
          competitorContents.push(`## ${formattedUrl}\n${content || '(Sin contenido disponible)'}`);

        } catch (e) {
          console.error('Competitor scrape error:', e);
        }
      }
    }

    const categoria = 'brief';
    const [{ data: kbBugs }, { data: kbKnowledge }] = await Promise.all([
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoria).eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').eq('categoria', categoria).eq('activo', true).order('orden'),
    ]);
    const bugSection = kbBugs && kbBugs.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugs.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
    const knowledgeSection = kbKnowledge && kbKnowledge.length > 0 ? `\nCONOCIMIENTO BASE:\n${kbKnowledge.map((k: any) => `## ${k.titulo}\n${k.contenido}`).join('\n\n')}\n` : '';

    const brandContext = JSON.stringify(briefContext).slice(0, 3000);
    const analysisPrompt = buildAnalysisPrompt(
      client.name,
      client.company || '',
      website_url || '',
      websiteContent,
      competitorContents,
      clientProvidedUrls,
      brandContext
    );

    await updateProgress('ia', `Generando plan estratégico con inteligencia artificial (${competitorContents.length} competidores analizados)...`, 70);

    // Extract phase from brief if not provided directly
    const briefPersonaData = persona?.persona_data as any;
    const resolvedFase = fase_negocio || briefPersonaData?.fase_negocio || '';
    const resolvedPresupuesto = presupuesto_ads || briefPersonaData?.presupuesto_ads || '';

    const phaseRulesSection = resolvedFase ? `\nFASE DEL NEGOCIO: ${resolvedFase}\nPRESUPUESTO MENSUAL DE ADS: ${resolvedPresupuesto || 'No especificado'} CLP\n\nREGLAS POR FASE:\n- Fase Inicial: Broad Retargeting + producto ancla + boosts orgánicos. NUNCA prospección fría.\n- Fase Crecimiento: Broad Retargeting + prospección fría básica.\n- Fase Escalado: Campaña maestra + catálogos dinámicos.\n- Fase Avanzada: Framework completo + Partnership Ads + Advantage+.\nNunca recomendar estrategias que superen el presupuesto disponible.\nSiempre medir GPT no ROAS.\n` : '';

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8000,
        system: `${bugSection}${knowledgeSection}${phaseRulesSection}Eres un consultor senior de marketing digital. Responde SOLO en JSON válido sin markdown. Nunca uses \`\`\`json ni \`\`\`. Solo el JSON puro y completo.`,
        messages: [{ role: 'user', content: analysisPrompt }],
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
    let rawContent = aiData.content?.[0]?.text || '{}';
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let result: any = {};
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw:', rawContent.slice(0, 500));
      result = { executive_summary: rawContent, parse_error: true };
    }

    const researchTypes = ['seo_audit', 'competitor_analysis', 'keywords', 'ads_library_analysis', 'cost_benchmarks', 'seo_roadmap', 'competitive_domination'];
    for (const rt of researchTypes) {
      if (result[rt]) {
        const { error: upsertErr } = await supabase
          .from('brand_research')
          .upsert({ client_id, research_type: rt, research_data: result[rt] }, { onConflict: 'client_id,research_type' });
        if (upsertErr) console.error(`Error saving ${rt}:`, upsertErr);
      }
    }

    if (result.executive_summary) {
      await supabase
        .from('brand_research')
        .upsert({ client_id, research_type: 'executive_summary', research_data: { summary: result.executive_summary } }, { onConflict: 'client_id,research_type' });
    }

    await supabase
      .from('brand_research')
      .upsert({ client_id, research_type: 'analysis_status', research_data: { status: 'complete', completed_at: new Date().toISOString() } }, { onConflict: 'client_id,research_type' });

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
