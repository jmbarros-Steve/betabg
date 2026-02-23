import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ── 6 grupos de secciones para llamadas paralelas ──
const SECTION_GROUPS = [
  {
    id: 'brand_core',
    sections: ['executive_summary', 'brand_identity'],
    prompt: `Genera SOLO estas 2 secciones en JSON:
{
  "executive_summary": "Resumen ejecutivo 2 párrafos: situación actual y top 3 acciones inmediatas",
  "brand_identity": {"essence":"","values":["3 valores"],"personality":"","tone_of_voice":"","visual_identity":""}
}`,
  },
  {
    id: 'market_analysis',
    sections: ['financial_analysis', 'consumer_profile'],
    prompt: `Genera SOLO estas 2 secciones en JSON:
{
  "financial_analysis": {"current_situation":"","revenue_drivers":["3"],"cost_optimization":["2"],"growth_forecast":""},
  "consumer_profile": {"primary_audience":"","demographics":"","psychographics":"","pain_points":["3"],"buying_triggers":["3"]}
}`,
  },
  {
    id: 'competitive',
    sections: ['competitive_analysis', 'positioning_strategy'],
    prompt: `Genera SOLO estas 2 secciones en JSON:
{
  "competitive_analysis": {"competitors":[{"name":"","strengths":["2"],"weaknesses":["2"],"positioning":""}],"market_gaps":["3"],"competitive_advantage":""},
  "positioning_strategy": {"current_positioning":"","desired_positioning":"","differentiation":"","value_proposition":"","messaging_pillars":["3"]}
}`,
  },
  {
    id: 'action_plan',
    sections: ['action_plan'],
    prompt: `Genera SOLO esta sección en JSON:
{
  "action_plan": [{"action":"","channel":"","timeline":"","kpi":"","priority":"alta/media/baja"}]
}
Incluye 7 accionables concretos usando framework SCR (Situación, Complicación, Resolución).`,
  },
  {
    id: 'seo',
    sections: ['seo_audit', 'keywords'],
    prompt: `Genera SOLO estas 2 secciones en JSON:
{
  "seo_audit": {"score":0,"issues":["5 problemas"],"recommendations":["5"],"technical_seo_priority":"Top 3 acciones"},
  "keywords": {"primary":["5"],"long_tail":["5"],"negative_keywords":["3"],"strategy":"Estrategia 3 fases"}
}`,
  },
  {
    id: 'paid_media',
    sections: ['meta_ads_strategy', 'google_ads_strategy'],
    prompt: `Genera SOLO estas 2 secciones en JSON:
{
  "meta_ads_strategy": {"funnel_structure":"TOFU-MOFU-BOFU","copy_hooks":["4"],"cta_recommendations":["3"],"audience_targeting":{"cold":"","warm":"","hot":""}},
  "google_ads_strategy": {"campaign_structure":"","headlines_examples":["5 de 30 chars"],"descriptions_examples":["2 de 90 chars"],"bidding_strategy":""}
}`,
  },
];

// ── Llamada individual a Claude ──
async function callClaude(
  anthropicApiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ data: Record<string, unknown>; stopReason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s por llamada

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
        max_tokens: 2000,
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

    // Clean markdown fences and extract JSON
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const firstBrace = raw.indexOf('{');
    if (firstBrace > 0) raw = raw.slice(firstBrace);

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
    return { data, stopReason };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('AI request timed out');
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

    // Auth check
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

    const phaseSection = fase_negocio ? `\nFASE: ${fase_negocio} | PRESUPUESTO: ${presupuesto_ads || 'N/A'} CLP` : '';

    const systemPrompt = `Eres un estratega de marketing digital experto en e-commerce LATAM.${knowledgeContext ? `\nMETODOLOGÍA:\n${knowledgeContext}` : ''}${bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}` : ''}${phaseSection}\nResponde SOLO JSON válido sin markdown.`;

    // Build research context string (truncated)
    const websiteSection = websiteContent ? `SITIO WEB:\n${websiteContent.slice(0, 3000)}` : 'SITIO WEB: No disponible';
    const competitorSection = (competitorContents?.length > 0)
      ? `COMPETIDORES (${competitorContents.length}):\n${competitorContents.join('\n\n').slice(0, 5000)}`
      : 'COMPETIDORES: No proporcionados';

    const researchContext = `MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

BRIEF:
${brandContext || 'Sin contexto adicional'}`;

    // Update progress
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Ejecutando 6 análisis en paralelo...', pct: 60, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // ══════════════════════════════════════════════
    //  6 LLAMADAS EN PARALELO con Promise.allSettled
    // ══════════════════════════════════════════════
    console.log(`[analyze-brand-strategy] Starting 6 parallel calls for client ${client_id}`);

    const results = await Promise.allSettled(
      SECTION_GROUPS.map(async (group) => {
        const userPrompt = `${researchContext}\n\n${group.prompt}\n\nREGLAS: Solo JSON válido. Sé conciso (1-2 frases por campo). Usa datos reales del contenido.`;
        const { data, stopReason } = await callClaude(anthropicApiKey, systemPrompt, userPrompt);
        console.log(`[analyze-brand-strategy] Group "${group.id}" OK: stop=${stopReason}, keys=${Object.keys(data).join(',')}`);
        return { groupId: group.id, sections: group.sections, data };
      })
    );

    // ── Consolidar y guardar resultados ──
    const fullResult: Record<string, unknown> = {};
    const savedSections: string[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { groupId, sections, data } = result.value;
        for (const rt of sections) {
          if (data[rt]) {
            const researchData = rt === 'executive_summary'
              ? { summary: typeof data[rt] === 'string' ? (data[rt] as string).slice(0, 12000) : JSON.stringify(data[rt]).slice(0, 4000) }
              : data[rt];

            const { error: upsertErr } = await supabase.from('brand_research').upsert(
              { client_id, research_type: rt, research_data: researchData },
              { onConflict: 'client_id,research_type' }
            );
            if (!upsertErr) {
              savedSections.push(rt);
              fullResult[rt] = data[rt];
            } else {
              console.error(`[${groupId}] Failed to save ${rt}:`, upsertErr.message);
            }
          }
        }
      } else {
        const groupIdx = results.indexOf(result);
        const groupId = SECTION_GROUPS[groupIdx]?.id || 'unknown';
        const errMsg = result.reason?.message || 'Unknown error';
        console.error(`[analyze-brand-strategy] Group "${groupId}" FAILED:`, errMsg);
        errors.push(`${groupId}: ${errMsg}`);
      }
    }

    console.log(`[analyze-brand-strategy] Saved ${savedSections.length}/11 sections: ${savedSections.join(', ')}`);
    if (errors.length > 0) console.log(`[analyze-brand-strategy] Errors: ${errors.join('; ')}`);

    // Save ads_library_analysis for backward compatibility
    if (fullResult.meta_ads_strategy || fullResult.google_ads_strategy) {
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'ads_library_analysis', research_data: { meta_ads_strategy: fullResult.meta_ads_strategy, google_ads_strategy: fullResult.google_ads_strategy } },
        { onConflict: 'client_id,research_type' }
      );
    }

    if (websiteUrl) {
      await supabase.from('clients').update({ website_url: websiteUrl }).eq('id', client_id);
    }

    // Save brand_strategy marker
    const isPartial = errors.length > 0;
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'brand_strategy', research_data: { completed_at: new Date().toISOString(), sections: savedSections, partial: isPartial, errors: errors.length > 0 ? errors : undefined } },
      { onConflict: 'client_id,research_type' }
    );

    // Mark complete
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_status', research_data: { status: 'complete', completed_at: new Date().toISOString(), partial: isPartial, sections_saved: savedSections.length, errors: errors.length > 0 ? errors : undefined } },
      { onConflict: 'client_id,research_type' }
    );

    console.log(`[analyze-brand-strategy] Complete for client ${client_id} (partial=${isPartial})`);

    return new Response(JSON.stringify({ success: true, partial: isPartial, data: fullResult, sections: savedSections, errors }), {
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
