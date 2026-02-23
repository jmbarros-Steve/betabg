import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function buildPromptCall1(
  clientName: string,
  clientCompany: string,
  websiteUrl: string,
  websiteContent: string,
  competitorContents: string[],
  brandContext: string
): string {
  const websiteSection = websiteContent
    ? `=== SITIO WEB ===\n${websiteContent.slice(0, 4000)}`
    : '=== SITIO WEB: No disponible ===';

  const competitorSection = competitorContents.length > 0
    ? `=== COMPETIDORES (${competitorContents.length}) ===\n${competitorContents.join('\n\n').slice(0, 6000)}`
    : '=== COMPETIDORES: No proporcionados ===';

  return `MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

=== BRIEF ===
${brandContext}

Genera JSON con estas 6 secciones. SOLO JSON válido, sin markdown:

{
  "executive_summary": "Resumen ejecutivo 2 párrafos: situación actual y top 3 acciones inmediatas",
  "brand_identity": {"essence":"","values":["3"],"personality":"","tone_of_voice":"","visual_identity":""},
  "financial_analysis": {"current_situation":"","revenue_drivers":["3"],"cost_optimization":["2"],"growth_forecast":""},
  "consumer_profile": {"primary_audience":"","demographics":"","psychographics":"","pain_points":["3"],"buying_triggers":["3"]},
  "competitive_analysis": {"competitors":[{"name":"","strengths":["2"],"weaknesses":["2"],"positioning":""}],"market_gaps":["3"],"competitive_advantage":""},
  "positioning_strategy": {"current_positioning":"","desired_positioning":"","differentiation":"","value_proposition":"","messaging_pillars":["3"]}
}

REGLAS: Solo JSON. Sé conciso (1-2 frases por campo). Usa datos reales del contenido.`;
}

function buildPromptCall2(
  clientName: string,
  clientCompany: string,
  websiteUrl: string,
  websiteContent: string,
  competitorContents: string[],
  clientProvidedUrls: string[],
  brandContext: string
): string {
  const allUrls = competitorContents.map(c => c.split('\n')[0].replace('## ', '').trim());
  const urlListStr = allUrls.map((u, i) => `  ${i + 1}. ${u}${i < clientProvidedUrls.length ? ' ← cliente' : ' ← auto'}`).join('\n');

  const websiteSection = websiteContent
    ? `=== SITIO WEB ===\n${websiteContent.slice(0, 3000)}`
    : '=== SITIO WEB: No disponible ===';

  const competitorSection = competitorContents.length > 0
    ? `=== COMPETIDORES (${competitorContents.length}) ===\nURLs:\n${urlListStr}\n\n${competitorContents.join('\n\n').slice(0, 5000)}`
    : '=== COMPETIDORES: No proporcionados ===';

  return `MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

=== BRIEF ===
${brandContext}

Genera JSON con estas 6 secciones. SOLO JSON válido, sin markdown:

{
  "action_plan": [{"action":"","channel":"","timeline":"","kpi":"","priority":"alta/media/baja"}],
  "seo_audit": {"score":0,"issues":["5"],"recommendations":["5"],"technical_seo_priority":"Top 3 acciones"},
  "keywords": {"primary":["5"],"long_tail":["5"],"negative_keywords":["3"],"strategy":"Estrategia 3 fases"},
  "competitor_analysis": {"competitors":[{"name":"","url":"","strengths":["2"],"weaknesses":["2"],"attack_vector":""}],"market_gaps":["3"]},
  "meta_ads_strategy": {"funnel_structure":"TOFU-MOFU-BOFU","copy_hooks":["4"],"cta_recommendations":["3"],"audience_targeting":{"cold":"","warm":"","hot":""}},
  "google_ads_strategy": {"campaign_structure":"","headlines_examples":["5 de 30 chars"],"descriptions_examples":["2 de 90 chars"],"bidding_strategy":""}
}

REGLAS: Solo JSON. Sé conciso. El array competitors debe incluir ${competitorContents.length} competidores. Keywords en idioma del mercado.`;
}

async function callClaude(
  anthropicApiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number = 60000
): Promise<{ data: any; raw: string; stopReason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await res.json();
    const stopReason = aiData.stop_reason || 'unknown';
    let raw = aiData.content?.[0]?.text || '{}';

    // Clean markdown fences and extract JSON object
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const firstBrace = raw.indexOf('{');
    if (firstBrace > 0) raw = raw.slice(firstBrace);
    // Find matching closing brace
    let depth = 0, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { raw = raw.slice(0, i + 1); break; } }
      }
    }

    const data = JSON.parse(raw);
    return { data, raw, stopReason };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw err;
  }
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

    // Fetch knowledge base
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

    const knowledgeSection = knowledgeContext ? `\nMETODOLOGÍA:\n${knowledgeContext}\n` : '';
    const bugSection = bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}\n` : '';

    const phaseSection = fase_negocio
      ? `\nFASE: ${fase_negocio} | PRESUPUESTO: ${presupuesto_ads || 'N/A'} CLP\n`
      : '';

    const systemPrompt = `Eres un estratega de marketing digital experto en e-commerce LATAM.${knowledgeSection}${bugSection}${phaseSection}Responde SOLO JSON válido sin markdown.`;

    // Update progress
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Llamada 1/2: Fundamentos de marca', pct: 60, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // ========== LLAMADA 1: Fundamentos ==========
    const prompt1 = buildPromptCall1(clientName, clientCompany, websiteUrl, websiteContent || '', competitorContents || [], brandContext || '');
    let result1: any;
    try {
      const { data, stopReason } = await callClaude(anthropicApiKey, systemPrompt, prompt1, 60000);
      result1 = data;
      console.log(`[analyze-brand-strategy] Call 1 OK: stop=${stopReason}, keys=${Object.keys(data).join(',')}`);
    } catch (err: any) {
      console.error('[analyze-brand-strategy] Call 1 FAILED:', err.message);
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_status', research_data: { status: 'error', error: `Call 1: ${err.message}` } },
        { onConflict: 'client_id,research_type' }
      );
      return new Response(JSON.stringify({ error: `Call 1 failed: ${err.message}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save Call 1 results immediately
    const call1Types = ['executive_summary', 'brand_identity', 'financial_analysis', 'consumer_profile', 'competitive_analysis', 'positioning_strategy'];
    const savedSections: string[] = [];
    for (const rt of call1Types) {
      if (result1[rt]) {
        const researchData = rt === 'executive_summary'
          ? { summary: typeof result1[rt] === 'string' ? result1[rt].slice(0, 12000) : JSON.stringify(result1[rt]).slice(0, 4000) }
          : result1[rt];
        const { error: upsertErr } = await supabase.from('brand_research').upsert(
          { client_id, research_type: rt, research_data: researchData },
          { onConflict: 'client_id,research_type' }
        );
        if (!upsertErr) savedSections.push(rt);
        else console.error(`[Call1] Failed to save ${rt}:`, upsertErr.message);
      }
    }
    console.log(`[analyze-brand-strategy] Call 1 saved: ${savedSections.join(', ')}`);

    // Update progress for Call 2
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Llamada 2/2: Estrategia y SEO', pct: 80, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // ========== LLAMADA 2: Estrategia ==========
    const prompt2 = buildPromptCall2(clientName, clientCompany, websiteUrl, websiteContent || '', competitorContents || [], clientProvidedUrls || [], brandContext || '');
    let result2: any;
    try {
      const { data, stopReason } = await callClaude(anthropicApiKey, systemPrompt, prompt2, 60000);
      result2 = data;
      console.log(`[analyze-brand-strategy] Call 2 OK: stop=${stopReason}, keys=${Object.keys(data).join(',')}`);
    } catch (err: any) {
      console.error('[analyze-brand-strategy] Call 2 FAILED:', err.message);
      // Call 1 data is already saved — mark partial completion
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'brand_strategy', research_data: { completed_at: new Date().toISOString(), sections: savedSections, partial: true } },
        { onConflict: 'client_id,research_type' }
      );
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_status', research_data: { status: 'complete', completed_at: new Date().toISOString(), partial: true, error_call2: err.message } },
        { onConflict: 'client_id,research_type' }
      );
      return new Response(JSON.stringify({ success: true, partial: true, data: result1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save Call 2 results
    const call2Types = ['action_plan', 'seo_audit', 'keywords', 'competitor_analysis', 'meta_ads_strategy', 'google_ads_strategy'];
    for (const rt of call2Types) {
      if (result2[rt]) {
        const { error: upsertErr } = await supabase.from('brand_research').upsert(
          { client_id, research_type: rt, research_data: result2[rt] },
          { onConflict: 'client_id,research_type' }
        );
        if (!upsertErr) savedSections.push(rt);
        else console.error(`[Call2] Failed to save ${rt}:`, upsertErr.message);
      }
    }
    console.log(`[analyze-brand-strategy] Call 2 saved. All sections: ${savedSections.join(', ')}`);

    // Also save ads_library_analysis as a combined view for backward compatibility
    if (result2.meta_ads_strategy || result2.google_ads_strategy) {
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'ads_library_analysis', research_data: { meta_ads_strategy: result2.meta_ads_strategy, google_ads_strategy: result2.google_ads_strategy } },
        { onConflict: 'client_id,research_type' }
      );
    }

    if (websiteUrl) {
      await supabase.from('clients').update({ website_url: websiteUrl }).eq('id', client_id);
    }

    // Save brand_strategy marker
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

    const fullResult = { ...result1, ...result2 };
    return new Response(JSON.stringify({ success: true, data: fullResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-brand-strategy error:', error);
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
