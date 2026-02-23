import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
  const allUrls = competitorContents.map(c => c.split('\n')[0].replace('## ', '').trim());
  const urlListStr = allUrls.map((u, i) => `  ${i + 1}. ${u}${i < clientProvidedUrls.length ? ' ← indicado por el cliente' : ' ← detectado automáticamente'}`).join('\n');

  const competitorSection = competitorContents.length > 0
    ? `=== CONTENIDO DE COMPETIDORES ANALIZADOS ===
CRÍTICO: El array "competitors" en tu respuesta JSON DEBE contener EXACTAMENTE ${competitorContents.length} objetos — uno por cada URL de la lista a continuación. No omitas ninguno.

URLs a analizar (${competitorContents.length} total):
${urlListStr}

Contenido analizado de cada competidor:
${competitorContents.join('\n\n').slice(0, 12000)}`
    : '=== COMPETIDORES: No proporcionados ===';

  const websiteSection = websiteContent
    ? `=== CONTENIDO DEL SITIO WEB ===\n${websiteContent.slice(0, 5000)}`
    : '=== SITIO WEB: No se pudo analizar ===';

  return `Eres un consultor senior de marketing digital especializado en SEO, Meta Ads, Google Ads e inteligencia competitiva para e-commerce LATAM.

MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

=== BRIEF DE MARCA ===
${brandContext}

Genera un JSON con EXACTAMENTE estas 7 secciones. Responde SOLO JSON válido, sin markdown:

{
  "seo_audit": {
    "score": 0-100,
    "issues": ["5 problemas SEO detectados"],
    "recommendations": ["5 acciones SEO prioritarias"],
    "meta_analysis": "Análisis de title tags, meta descriptions, H1/H2",
    "content_quality": "Análisis de keywords, legibilidad, CTAs",
    "technical_seo_priority": "Top 3 acciones técnicas SEO",
    "competitive_seo_gap": "Comparación SEO vs competidores"
  },
  "competitor_analysis": {
    "competitors": [{"name":"","url":"","seo_score":0,"strengths":["3"],"weaknesses":["3"],"positioning":"","value_proposition":"","ad_strategy_inferred":"","attack_vector":""}],
    "market_gaps": ["4 oportunidades"],
    "competitive_advantage": "Ventaja competitiva de ${clientName}",
    "benchmark_summary": "Comparativa narrativa"
  },
  "keywords": {
    "primary": ["5 keywords con volumen estimado"],
    "long_tail": ["5 long tail"],
    "competitor_keywords": ["4 keywords de competidores"],
    "negative_keywords": ["4 keywords negativas con razón"],
    "recommended_strategy": "Estrategia 3 fases: Quick wins, Crecimiento, Dominación",
    "google_ads_match_types": {"exact":["3"],"phrase":["3"],"broad_modified":["2"]}
  },
  "ads_library_analysis": {
    "meta_ads_strategy": {
      "funnel_structure": "TOFU-MOFU-BOFU con % presupuesto",
      "copy_hooks": ["4 hooks textuales"],
      "cta_recommendations": ["3 CTAs"],
      "audience_targeting": {"cold":"","warm":"","hot":"","lookalike":""}
    },
    "google_ads_strategy": {
      "campaign_structure": "Estructura de campañas",
      "search_ad_copy": {"headlines_examples":["5 headlines 30 chars"],"descriptions_examples":["2 descripciones 90 chars"]},
      "bidding_strategy": "Estrategia de bidding por fases"
    },
    "winning_patterns": ["4 patrones ganadores"]
  },
  "cost_benchmarks": {
    "meta_benchmarks": {"cpm_range":"","ctr_benchmark":"","cpa_target":"","roas_target":"","budget_recommendation":""},
    "google_benchmarks": {"cpc_range":"","ctr_search_benchmark":"","cpa_target":""},
    "pause_rules": ["3 reglas de pausa"],
    "scale_triggers": ["2 triggers de escalamiento"]
  },
  "competitive_domination": {
    "vulnerability_map": [{"competitor":"","vulnerability":"","attack_tactic":"","channel":"","timeline":""}],
    "messaging_per_competitor": ["Mensaje por competidor"],
    "blue_ocean_opportunities": ["3 oportunidades"]
  },
  "executive_summary": "Resumen ejecutivo 3 párrafos: Situación actual, Oportunidades, Top 3 acciones inmediatas con KPIs."
}

REGLAS:
1. Responde SOLO JSON válido, sin markdown, sin backticks
2. Usa datos REALES del contenido. Si no hay datos, usa benchmarks sector LATAM 2024
3. Sé específico con NÚMEROS: CPM, CPC, CTR, CVR, ROAS
4. El array competitors debe incluir TODOS los analizados (${competitorContents.length})
5. Keywords en el idioma del mercado objetivo
6. Sé CONCISO. Máximo 1-2 frases por campo de texto.`;
}



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

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

    if (!isInternalCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { client_id, research, fase_negocio, presupuesto_ads } = await req.json();

    if (!client_id || !research) {
      return new Response(JSON.stringify({ error: 'Missing client_id or research data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { websiteContent, competitorContents, clientProvidedUrls, brandContext, clientName, clientCompany, websiteUrl } = research;

    // Fetch full knowledge base (all categories)
    const [{ data: knowledge }, { data: bugs }] = await Promise.all([
      supabase.from('steve_knowledge').select('categoria, titulo, contenido').eq('activo', true).order('orden', { ascending: true }).limit(10),
      supabase.from('steve_bugs').select('categoria, descripcion, ejemplo_malo, ejemplo_bueno').eq('activo', true).limit(5),
    ]);

    const knowledgeContext = knowledge?.map((k: any) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const bugsContext = bugs?.map((b: any) =>
      `❌ EVITAR: ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`
    ).join('\n\n') || '';

    const knowledgeSection = knowledgeContext ? `\nMETODOLOGÍA Y CONOCIMIENTO:\n${knowledgeContext}\n` : '';
    const bugSection = bugsContext ? `\nERRORES A EVITAR EN LA ESTRATEGIA:\n${bugsContext}\n` : '';

    const phaseRulesSection = fase_negocio
      ? `\nFASE DEL NEGOCIO: ${fase_negocio}\nPRESUPUESTO MENSUAL DE ADS: ${presupuesto_ads || 'No especificado'} CLP\n\nREGLAS POR FASE:\n- Fase Inicial: Broad Retargeting + producto ancla + boosts orgánicos. NUNCA prospección fría.\n- Fase Crecimiento: Broad Retargeting + prospección fría básica.\n- Fase Escalado: Campaña maestra + catálogos dinámicos.\n- Fase Avanzada: Framework completo + Partnership Ads + Advantage+.\nNunca recomendar estrategias que superen el presupuesto disponible.\nSiempre medir GPT no ROAS.\n`
      : '';

    const analysisPrompt = buildAnalysisPrompt(
      clientName,
      clientCompany,
      websiteUrl,
      websiteContent || '',
      competitorContents || [],
      clientProvidedUrls || [],
      brandContext || ''
    );

    // Update progress to show AI phase
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Analizando con equipo de Marketing Steve AI', pct: 80, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // Use AbortController to prevent edge function timeout (wall time ~150s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 140000); // 140s
    let aiResponse: Response;
    try {
      aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          system: `Eres un estratega de marketing digital experto en e-commerce latinoamericano.\n${knowledgeSection}${bugSection}${phaseRulesSection}Responde SOLO en JSON válido sin markdown. Nunca uses \`\`\`json ni \`\`\`. Solo el JSON puro y completo.`,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.error('[analyze-brand-strategy] Fetch timeout or network error:', fetchErr.name, fetchErr.message);
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_status', research_data: { status: 'error', error: `AI timeout: ${fetchErr.message}` } },
        { onConflict: 'client_id,research_type' }
      );
      return new Response(JSON.stringify({ error: 'AI request timed out' }), {
        status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_status', research_data: { status: 'error', error: `AI error ${aiResponse.status}` } },
        { onConflict: 'client_id,research_type' }
      );
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const stopReason = aiData.stop_reason;
    let rawContent = aiData.content?.[0]?.text || '{}';
    console.log(`[analyze-brand-strategy] AI responded: stop_reason=${stopReason}, content_length=${rawContent.length}`);

    if (stopReason === 'max_tokens') {
      console.warn(`[analyze-brand-strategy] Claude response hit max_tokens limit (${rawContent.length} chars) — JSON may be truncated`);
    }

    // Strip markdown fences, then extract the outermost JSON object to handle any preamble/postamble text
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const firstBrace = rawContent.indexOf('{');
    if (firstBrace > 0) rawContent = rawContent.slice(firstBrace);
    // Find matching closing brace
    (() => {
      let depth = 0, inStr = false, esc = false;
      for (let i = 0; i < rawContent.length; i++) {
        const ch = rawContent[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') inStr = !inStr;
        if (!inStr) {
          if (ch === '{') depth++;
          if (ch === '}') { depth--; if (depth === 0) { rawContent = rawContent.slice(0, i + 1); return; } }
        }
      }
    })();

    let result: any = {};
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'stop_reason:', stopReason, 'Raw (first 500):', rawContent.slice(0, 500));
      result = { executive_summary: rawContent, parse_error: true };
    }

    // If AI returned everything inside executive_summary.summary as stringified JSON, parse and use it
    const es = result.executive_summary;
    if (es && typeof es === 'object' && typeof es.summary === 'string') {
      const str = es.summary.trim();
      if ((str.startsWith('{') && str.includes('"seo_audit"')) || str.includes('"competitor_analysis"')) {
        try {
          const parsed = JSON.parse(str);
          if (parsed.seo_audit || parsed.competitor_analysis || parsed.keywords || parsed.ads_library_analysis) {
            if (parsed.seo_audit) result.seo_audit = parsed.seo_audit;
            if (parsed.competitor_analysis) result.competitor_analysis = parsed.competitor_analysis;
            if (parsed.keywords) result.keywords = parsed.keywords;
            if (parsed.ads_library_analysis) result.ads_library_analysis = parsed.ads_library_analysis;
            if (parsed.cost_benchmarks) result.cost_benchmarks = parsed.cost_benchmarks;
            if (parsed.seo_roadmap) result.seo_roadmap = parsed.seo_roadmap;
            if (parsed.competitive_domination) result.competitive_domination = parsed.competitive_domination;
            result.executive_summary = typeof parsed.executive_summary === 'string' ? parsed.executive_summary : (parsed.executive_summary?.summary ?? str.slice(0, 800));
          }
        } catch (_) {}
      }
    }

    // Persist each section
    const researchTypes = ['seo_audit', 'competitor_analysis', 'keywords', 'ads_library_analysis', 'cost_benchmarks', 'competitive_domination'];
    const savedSections: string[] = [];
    for (const rt of researchTypes) {
      if (result[rt]) {
        const { error: upsertErr } = await supabase.from('brand_research').upsert(
          { client_id, research_type: rt, research_data: result[rt] },
          { onConflict: 'client_id,research_type' }
        );
        if (upsertErr) {
          console.error(`[analyze-brand-strategy] Failed to save ${rt}:`, upsertErr.message);
        } else {
          savedSections.push(rt);
        }
      } else {
        console.warn(`[analyze-brand-strategy] Section missing in AI response: ${rt}`);
      }
    }
    console.log(`[analyze-brand-strategy] Saved sections: ${savedSections.join(', ') || 'none'} | parse_error: ${!!result.parse_error}`);

    if (result.executive_summary) {
      const summaryForDb = typeof result.executive_summary === 'string'
        ? result.executive_summary.slice(0, 12000)
        : (result.executive_summary?.summary && typeof result.executive_summary.summary === 'string')
          ? result.executive_summary.summary.slice(0, 12000)
          : JSON.stringify(result.executive_summary).slice(0, 4000);
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'executive_summary', research_data: { summary: summaryForDb } },
        { onConflict: 'client_id,research_type' }
      );
    }

    if (websiteUrl) {
      await supabase.from('clients').update({ website_url: websiteUrl }).eq('id', client_id);
    }

    // BUG 5 FIX 1: Save brand_strategy marker — used by StatusPoll fallback to confirm Phase 2 finished
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'brand_strategy', research_data: { completed_at: new Date().toISOString(), sections: savedSections } },
      { onConflict: 'client_id,research_type' }
    );

    // Mark complete
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_status', research_data: { status: 'complete', completed_at: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    console.log('analyze-brand-strategy: complete for client', client_id);

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-brand-strategy error:', error);
    // Try to mark analysis as failed so frontend stops polling
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      const body = await new Response(req.clone?.()?.body).text().catch(() => '{}');
      const clientId = JSON.parse(body)?.client_id;
      if (clientId) {
        await sb.from('brand_research').upsert(
          { client_id: clientId, research_type: 'analysis_status', research_data: { status: 'error', error: String(error) } },
          { onConflict: 'client_id,research_type' }
        );
      }
    } catch (_) {}
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
