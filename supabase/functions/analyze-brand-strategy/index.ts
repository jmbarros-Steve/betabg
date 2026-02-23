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
    maxTokens: 3000,
    prompt: `Eres un estratega de marketing senior. Con base en los datos de research del sitio web del cliente y sus competidores, genera SOLO estas 2 secciones en JSON:

1. "executive_summary": Un resumen ejecutivo que incluya:
   - Situación actual de la marca basada en los datos del sitio
   - Posición relativa frente a los competidores analizados
   - Oportunidades y amenazas principales detectadas
   - Recomendaciones top 3 priorizadas
   Formato: string de 2 párrafos densos

2. "brand_identity": Análisis de identidad de marca:
   - "essence": Propuesta de valor actual extraída del sitio
   - "values": ["3 valores de marca identificados del contenido"]
   - "personality": Personalidad de marca detectada
   - "tone_of_voice": Tono y voz analizado del contenido
   - "visual_identity": Descripción de identidad visual
   - "differentiators": Diferenciadores vs competencia basados en datos reales

IMPORTANTE: Basa tu análisis en los DATOS REALES proporcionados, no en suposiciones. Cita ejemplos específicos del sitio web y de los competidores.

Responde ÚNICAMENTE con JSON válido con estas 2 keys. Sin markdown, sin backticks.`,
  },
  {
    id: 'market_analysis',
    sections: ['financial_analysis', 'consumer_profile'],
    maxTokens: 3000,
    prompt: `Eres un analista de mercado senior. Con base en los datos de research del sitio web del cliente y sus competidores, genera SOLO estas 2 secciones en JSON:

1. "financial_analysis": {
   "current_situation": "Modelo de negocio identificado del cliente",
   "revenue_drivers": ["3 fuentes principales de ingreso detectadas"],
   "cost_optimization": ["2 oportunidades de optimización de costos"],
   "growth_forecast": "Oportunidades de monetización no explotadas",
   "pricing_comparison": "Rango de precios del cliente vs competidores (extraído de datos)"
}

2. "consumer_profile": {
   "primary_audience": "Buyer persona principal (demografía, psicografía)",
   "demographics": "Datos demográficos inferidos del contenido",
   "psychographics": "Datos psicográficos inferidos",
   "pain_points": ["3 pain points basados en contenido del sitio y competidores"],
   "buying_triggers": ["3 motivadores de compra detectados"]
}

IMPORTANTE: Usa los datos reales de los sitios analizados. Compara precios, ofertas y propuestas de valor.

Responde ÚNICAMENTE con JSON válido con estas 2 keys. Sin markdown, sin backticks.`,
  },
  {
    id: 'competitive',
    sections: ['competitive_analysis', 'positioning_strategy'],
    maxTokens: 4000,
    prompt: `Eres un estratega competitivo senior. Tienes los datos de scraping de los competidores del cliente. Genera SOLO estas 2 secciones en JSON:

1. "competitive_analysis": {
   "competitors": [
     Para CADA competidor del que tengas datos, incluye:
     {
       "name": "Nombre/dominio del competidor",
       "url": "URL del competidor",
       "value_proposition": "Propuesta de valor principal extraída de su sitio",
       "strengths": ["2 fortalezas detectadas con datos reales"],
       "weaknesses": ["2 debilidades detectadas"],
       "positioning": "Posicionamiento detectado en su contenido",
       "ad_strategy_inferred": "Estrategia publicitaria inferida del sitio",
       "attack_vector": "Cómo el cliente puede quitarles clientes",
       "seo_score": número de 0 a 100 basado en meta tags y contenido,
       "price_positioning": "Posicionamiento de precios detectado"
     }
   ],
   "market_gaps": ["3 gaps de mercado no cubiertos por ningún competidor"],
   "competitive_advantage": "Ventaja competitiva principal del cliente"
}

2. "positioning_strategy": {
   "current_positioning": "Posicionamiento actual del cliente percibido del sitio",
   "desired_positioning": "Posicionamiento recomendado basado en gaps",
   "differentiation": "Diferenciación principal recomendada",
   "value_proposition": "Statement de propuesta de valor propuesto",
   "messaging_pillars": ["3 mensajes clave diferenciadores"]
}

CRÍTICO: Analiza CADA competidor individualmente con datos reales. No generalices.

Responde ÚNICAMENTE con JSON válido con estas 2 keys. Sin markdown, sin backticks.`,
  },
  {
    id: 'action_plan',
    sections: ['action_plan'],
    maxTokens: 4000,
    prompt: `Eres un consultor estratégico senior. Con base en todos los datos de research del cliente y sus competidores, genera SOLO esta sección en JSON:

"action_plan": Un array con exactamente 7 objetos, cada uno con:
{
  "title": "Nombre del accionable",
  "situation": "La situación actual con datos reales del análisis",
  "complication": "Por qué es un problema, qué pasa si no se actúa",
  "resolution": "Qué hacer exactamente, pasos específicos, métricas de éxito",
  "priority": "alta/media/baja",
  "timeline": "Tiempo estimado de implementación",
  "expected_impact": "Impacto esperado cuantificado"
}

Los 7 accionables deben cubrir: branding, contenido, SEO, paid media, conversión, retención, y crecimiento.

IMPORTANTE: Cada accionable debe ser específico al cliente y basado en los datos reales, NO genérico.

Responde ÚNICAMENTE con JSON válido con la key "action_plan". Sin markdown, sin backticks.`,
  },
  {
    id: 'seo',
    sections: ['seo_audit', 'keywords'],
    maxTokens: 4000,
    prompt: `Eres un experto SEO senior. Tienes los datos de scraping del sitio web del cliente Y de sus competidores. Genera SOLO estas 2 secciones en JSON:

1. "seo_audit": {
   "score": número de 0 a 100 (analiza meta tags, títulos, contenido real del sitio - NUNCA des 0 si hay datos disponibles),
   "issues": ["5 problemas SEO detectados del contenido real, específicos y accionables"],
   "recommendations": ["5 acciones prioritarias con impacto estimado"],
   "technical_seo_priority": "Top 3 acciones técnicas SEO",
   "competitive_seo_gap": "Qué están haciendo bien los competidores en SEO que el cliente NO hace",
   "meta_analysis": "Análisis de meta tags del cliente vs competidores",
   "content_structure": "Evaluación de estructura de contenido y headings"
}

IMPORTANTE SOBRE EL SCORE: Si tienes datos reales del sitio (meta tags, títulos, contenido), analízalos y da un score real basado en:
- Presencia y calidad de meta tags (20 puntos)
- Estructura de headings H1-H3 (15 puntos)
- Calidad del contenido (20 puntos)
- URLs y navegación (15 puntos)
- Contenido duplicado o thin content (15 puntos)
- Schema markup y técnicos (15 puntos)
Solo da 0/100 si LITERALMENTE no hay ningún dato disponible del sitio.

2. "keywords": {
   "primary": ["5-6 keywords principales, cada una basada en contenido real de competidores"],
   "long_tail": ["5 keywords long-tail de baja competencia enfocadas en gaps"],
   "negative_keywords": ["3 keywords negativas para ads"],
   "competitor_keywords": ["5 keywords que los competidores usan en sus títulos y metas"],
   "strategy": "Estrategia de 3 fases: Fase 1 (mes 1-2): Quick wins. Fase 2 (mes 3-4): Growth. Fase 3 (mes 5-6): Dominance.",
   "recommended_strategy": "Resumen de la estrategia de keywords basada en análisis competitivo"
}

CRÍTICO: Las keywords deben estar basadas en el análisis REAL del contenido de los competidores y del cliente.

Responde ÚNICAMENTE con JSON válido con estas 2 keys. Sin markdown, sin backticks.`,
  },
  {
    id: 'paid_media',
    sections: ['meta_ads_strategy', 'google_ads_strategy', 'ads_library_analysis'],
    maxTokens: 5000,
    prompt: `Eres un experto en paid media y creatividad publicitaria. Tienes los datos del sitio del cliente y de sus competidores. Genera SOLO estas 3 secciones en JSON:

1. "meta_ads_strategy": {
   "funnel_structure": "Estructura TOFU-MOFU-BOFU detallada",
   "copy_hooks": ["4 hooks creativos específicos para el cliente basados en su diferenciador"],
   "cta_recommendations": ["3 CTAs recomendados con justificación"],
   "audience_targeting": {
     "cold": "Segmentación para audiencias frías",
     "warm": "Segmentación para retargeting",
     "hot": "Segmentación para conversión"
   },
   "primary_texts": ["2 textos principales de ejemplo para anuncios"],
   "hooks": ["3 hooks de video de 3 segundos"]
}

2. "google_ads_strategy": {
   "campaign_structure": "Tipos de campaña recomendados con estructura",
   "headlines": ["5 headlines de máximo 30 caracteres"],
   "descriptions": ["2 descripciones de máximo 90 caracteres"],
   "bidding_strategy": "Estrategia de bidding recomendada",
   "landing_recommendations": "Recomendaciones para landing pages"
}

3. "ads_library_analysis": {
   "competitor_strategies": [
     Para cada competidor analizado:
     {
       "name": "Nombre del competidor",
       "messaging_approach": "Tipo de mensajes que usan basado en su sitio",
       "value_proposition_promoted": "Propuesta de valor que promueven",
       "probable_formats": "Formatos creativos probables (video, carrusel, imagen)",
       "cta_used": "CTAs encontrados en su sitio que probablemente replican en ads",
       "sales_angles": "Ángulos de venta detectados en su contenido"
     }
   ],
   "market_patterns": {
     "dominant_content_type": "Qué tipo de contenido/ofertas dominan en este nicho",
     "probable_formats": "Formatos más utilizados",
     "common_messages": "Mensajes más utilizados por los competidores"
   },
   "creative_concepts": [
     5 conceptos creativos con:
     {
       "concept": "Nombre del concepto/Hook",
       "format": "Formato recomendado (video, carrusel, imagen)",
       "copy": "Copy principal del anuncio",
       "cta": "CTA recomendado",
       "rationale": "Por qué funcionaría basado en el análisis competitivo"
     }
   ],
   "winning_patterns": ["3 patrones ganadores detectados en el mercado"],
   "hook_ideas": ["4 ideas de hook/gancho para anuncios"],
   "creative_recommendations": ["3 recomendaciones creativas diferenciadas vs competidores"],
   "creative_calendar": "Calendario creativo mensual recomendado"
}

CRÍTICO: La sección ads_library_analysis NO puede estar vacía. Analiza los sitios de los competidores para inferir su estrategia publicitaria.

Responde ÚNICAMENTE con JSON válido con estas 3 keys. Sin markdown, sin backticks.`,
  },
];

// ── Llamada individual a Claude ──
async function callClaude(
  anthropicApiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 3000,
): Promise<{ data: Record<string, unknown>; stopReason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
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

    // Build structured research context with ALL competitor data
    const websiteSection = websiteContent ? `SITIO WEB DEL CLIENTE (${websiteUrl || 'URL no proporcionada'}):\n${websiteContent.slice(0, 4000)}` : 'SITIO WEB: No disponible';
    
    // Build competitor sections with clear labeling
    let competitorSection = '';
    if (competitorContents?.length > 0) {
      const competitorParts: string[] = [];
      for (let i = 0; i < competitorContents.length; i++) {
        const content = competitorContents[i];
        const url = clientProvidedUrls?.[i] || '';
        const label = i < (clientProvidedUrls?.length || 0) ? 'INGRESADO POR USUARIO' : 'DETECTADO AUTOMÁTICAMENTE';
        competitorParts.push(`### COMPETIDOR ${i + 1} (${label})${url ? ` — ${url}` : ''}\n${typeof content === 'string' ? content.slice(0, 2500) : JSON.stringify(content).slice(0, 2500)}`);
      }
      competitorSection = `COMPETIDORES ANALIZADOS (${competitorContents.length} total):\n\n${competitorParts.join('\n\n')}`;
    } else {
      competitorSection = 'COMPETIDORES: No proporcionados';
    }

    const researchContext = `MARCA: ${clientName} (${clientCompany || 'Sin empresa'})
WEBSITE: ${websiteUrl || 'No proporcionado'}

${websiteSection}

${competitorSection}

BRIEF DEL CLIENTE:
${brandContext || 'Sin contexto adicional'}`;

    // Truncate to 20,000 chars to fit all competitor data
    const truncatedResearch = researchContext.slice(0, 20000);

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
        const systemPrompt = `Eres un estratega de marketing digital experto en e-commerce LATAM.${knowledgeContext ? `\nMETODOLOGÍA:\n${knowledgeContext}` : ''}${bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}` : ''}${phaseSection}\nResponde SOLO JSON válido sin markdown.`;
        const userPrompt = `${truncatedResearch}\n\n${group.prompt}\n\nREGLAS: Solo JSON válido. Sé conciso pero específico. Usa datos reales del contenido proporcionado.`;
        const { data, stopReason } = await callClaude(anthropicApiKey, systemPrompt, userPrompt, group.maxTokens);
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

    console.log(`[analyze-brand-strategy] Saved ${savedSections.length} sections: ${savedSections.join(', ')}`);
    if (errors.length > 0) console.log(`[analyze-brand-strategy] Errors: ${errors.join('; ')}`);

    // Save ads_library_analysis for backward compatibility
    if (fullResult.meta_ads_strategy || fullResult.google_ads_strategy || fullResult.ads_library_analysis) {
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'ads_library_analysis', research_data: fullResult.ads_library_analysis || { meta_ads_strategy: fullResult.meta_ads_strategy, google_ads_strategy: fullResult.google_ads_strategy } },
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
