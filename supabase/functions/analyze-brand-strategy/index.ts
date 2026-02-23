import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ── 11 secciones individuales para llamadas paralelas ──
const SECTIONS = [
  {
    id: 'executive_summary',
    keys: ['executive_summary'],
    maxTokens: 4000,
    prompt: `Genera ÚNICAMENTE la sección "executive_summary". Debe incluir:
- Situación actual de la marca basada en los datos reales del sitio (qué venden, cómo se presentan, qué propuesta de valor comunican)
- Posición relativa frente a los 6 competidores analizados (en qué están mejor, en qué están peor)
- Las 3 oportunidades más importantes detectadas del análisis competitivo
- Las 3 amenazas más importantes
- Top 3 recomendaciones priorizadas con impacto estimado
Basa TODO en los datos reales proporcionados. Cita ejemplos específicos del sitio web y de los competidores.
Responde con JSON válido: { "executive_summary": { ... } }`,
  },
  {
    id: 'brand_identity',
    keys: ['brand_identity'],
    maxTokens: 4000,
    prompt: `Genera ÚNICAMENTE la sección "brand_identity". Debe incluir:
- Propuesta de valor actual: qué promete la marca según su sitio web (extrae las frases exactas que usan)
- Tono y voz: analiza el lenguaje del sitio (formal/informal, técnico/accesible, emocional/racional)
- Valores de marca identificados del contenido
- Personalidad de marca (arquetipos)
- Diferenciadores vs los 6 competidores: qué dice esta marca que NO dicen los competidores
- Gaps de identidad: qué deberían comunicar y no lo hacen
Extrae información REAL del contenido del sitio. Cita frases o secciones específicas.
Responde con JSON válido: { "brand_identity": { ... } }`,
  },
  {
    id: 'financial_analysis',
    keys: ['financial_analysis'],
    maxTokens: 4000,
    prompt: `Genera ÚNICAMENTE la sección "financial_analysis". Debe incluir:
- Modelo de negocio identificado (e-commerce, SaaS, servicios, infoproducto, marketplace, etc.)
- Productos/servicios detectados en el sitio con sus precios si están visibles
- Rango de precios del cliente vs lo que ofrecen los competidores
- Estrategia de pricing detectada (premium, low-cost, freemium, basada en valor)
- Oportunidades de monetización no explotadas (comparando con lo que hacen los competidores)
Si los precios no son visibles en el scraping, indícalo claramente y analiza lo que SÍ puedes inferir.
Responde con JSON válido: { "financial_analysis": { ... } }`,
  },
  {
    id: 'consumer_profile',
    keys: ['consumer_profile'],
    maxTokens: 4000,
    prompt: `Genera ÚNICAMENTE la sección "consumer_profile". Debe incluir:
- Buyer persona principal: nombre ficticio, demografía, psicografía, comportamiento digital, pain points, motivadores de compra, barreras/objeciones, frase que lo define
- Buyer persona secundario (mismo formato pero más breve)
- Journey de compra: Descubrimiento (cómo llegan), Consideración (qué evalúan), Decisión (qué los convence), Post-compra (qué esperan después)
Infiere los buyer personas del CONTENIDO del sitio (a quién le hablan, qué lenguaje usan, qué problemas mencionan).
Responde con JSON válido: { "consumer_profile": { ... } }`,
  },
  {
    id: 'competitive_analysis',
    keys: ['competitive_analysis'],
    maxTokens: 6000,
    prompt: `Genera ÚNICAMENTE la sección "competitive_analysis". Debe incluir:
a) Análisis INDIVIDUAL de CADA uno de los 6 competidores:
   Para CADA competidor: Nombre/URL, Propuesta de valor principal (cita frases reales si las hay), Fortalezas detectadas (mínimo 2), Debilidades detectadas (mínimo 2), Qué hacen MEJOR que el cliente, Qué hace el cliente MEJOR que ellos, Estrategia de contenido observada, Nivel de amenaza: "alto", "medio" o "bajo" con justificación
b) Matriz comparativa: Tabla resumen de los 6 competidores vs el cliente
c) Insights estratégicos: Gaps de mercado que NINGÚN competidor cubre, Ventajas competitivas del cliente que debe explotar, Tendencias del mercado inferidas
CRÍTICO: Analiza CADA competidor individualmente con datos REALES de su sitio. NUNCA dejes competidores sin analizar.
Responde con JSON válido: { "competitive_analysis": { ... } }`,
  },
  {
    id: 'positioning_strategy',
    keys: ['positioning_strategy'],
    maxTokens: 5000,
    prompt: `Genera ÚNICAMENTE la sección "positioning_strategy". Debe incluir:
- Posicionamiento actual del cliente: cómo se percibe según su sitio web
- Posicionamiento de cada competidor: en 1 línea, cómo se posiciona cada uno
- Mapa perceptual: 2 ejes recomendados relevantes para este mercado, ubicación del cliente y cada competidor
- Posicionamiento recomendado: dónde debería posicionarse basado en gaps competitivos
- Statement de posicionamiento: "Para [audiencia], [marca] es [categoría] que [beneficio diferencial] porque [razón para creer]"
- Mensajes clave diferenciadores (3-5 mensajes que debe usar consistentemente)
- Territorios de comunicación que debe "adueñarse"
El posicionamiento debe basarse en los gaps reales detectados del análisis competitivo.
Responde con JSON válido: { "positioning_strategy": { ... } }`,
  },
  {
    id: 'action_plan',
    keys: ['action_plan'],
    maxTokens: 7000,
    prompt: `Genera ÚNICAMENTE la sección "action_plan". Debe contener exactamente 7 accionables estratégicos usando framework SCR.
Para CADA uno de los 7 accionables:
- "title": Nombre claro y accionable
- "situation": La situación actual con datos reales del análisis
- "complication": Por qué es un problema y qué pasa si NO se actúa
- "resolution": Qué hacer exactamente — pasos específicos, herramientas, métricas de éxito
- "priority": "alta", "media" o "baja"
- "timeline": Tiempo estimado de implementación
- "expected_impact": Impacto esperado cuantificado
Los 7 accionables deben cubrir: 1) Branding, 2) Contenido, 3) SEO, 4) Paid media, 5) Conversión/CRO, 6) Retención, 7) Crecimiento
Cada accionable debe ser ESPECÍFICO al cliente basado en datos reales. NADA genérico.
Responde con JSON válido: { "action_plan": [...] }`,
  },
  {
    id: 'seo_audit',
    keys: ['seo_audit'],
    maxTokens: 6000,
    prompt: `Genera ÚNICAMENTE la sección "seo_audit". Debe incluir:
a) SCORE SEO (0-100): Calcula basado en datos disponibles. SOLO da 0 si literalmente NO hay ningún dato. Si tienes meta tags, títulos o contenido, analízalos y da un score real con justificación.
b) Análisis del sitio del CLIENTE: Meta titles y evaluación, Meta descriptions y evaluación, Estructura de headings H1/H2/H3, Contenido (densidad, relevancia), Estructura de URLs, Schema markup (presencia o ausencia)
c) Análisis SEO COMPARATIVO con los 6 competidores: Para cada competidor con datos: qué hacen bien en SEO que el cliente NO hace, meta tags comparadas, estructura de contenido comparada
d) Problemas detectados (lista priorizada por impacto)
e) Acciones prioritarias (lista priorizada con impacto estimado y esfuerzo)
CRÍTICO: Usa los datos de scraping REALES. Si los competidores tienen mejor SEO, muestra específicamente POR QUÉ.
Responde con JSON válido: { "seo_audit": { ... } }`,
  },
  {
    id: 'keywords',
    keys: ['keywords'],
    maxTokens: 5000,
    prompt: `Genera ÚNICAMENTE la sección "keywords". Debe incluir:
a) "primary_keywords": 5-6 keywords principales. Para cada una: keyword, search_intent (transaccional/informacional/comercial/navegacional), rationale (por qué es estratégica, qué competidores la usan), estimated_difficulty (alta/media/baja), priority (invertir inmediatamente o monitorear)
b) "longtail_keywords": 5 keywords long-tail de baja competencia. Para cada una: keyword, search_intent, rationale (gaps que los competidores NO cubren), buyer_persona_match
c) "negative_keywords": 3 keywords negativas para ads. Para cada una: keyword, reason
d) "keyword_strategy_roadmap": Hoja de ruta por fases:
   - phase_1 (mes 1-2): Quick wins — keywords fáciles con acciones rápidas
   - phase_2 (mes 3-4): Growth — keywords de dificultad media
   - phase_3 (mes 5-6): Dominance — keywords competitivas a largo plazo
   Para cada fase: keywords objetivo, acciones concretas, KPIs
Las keywords DEBEN estar basadas en el análisis real del contenido de los competidores.
Responde con JSON válido: { "keywords": { ... } }`,
  },
  {
    id: 'meta_ads_strategy',
    keys: ['meta_ads_strategy'],
    maxTokens: 5000,
    prompt: `Genera ÚNICAMENTE la sección "meta_ads_strategy". Debe incluir:
a) Objetivos de campaña recomendados por etapa de funnel
b) Estructura de campañas: TOF (objetivo, audiencia, contenido), MOF (objetivo, retargeting, contenido), BOF (objetivo, audiencia, contenido)
c) Segmentación de audiencias: fría (intereses, demografía, lookalikes), tibia (visitantes, engagement), caliente (remarketing, carrito abandonado)
d) Creativos recomendados: 3 hooks creativos ESPECÍFICOS para el cliente (no genéricos), formato para cada uno (video, carrusel, imagen), copy de ejemplo, CTA recomendado
e) Budget y distribución recomendada por funnel (ej: 60% TOF, 25% MOF, 15% BOF)
f) KPIs objetivo por etapa de funnel
Los hooks y creativos deben ser ESPECÍFICOS al negocio del cliente basados en su propuesta de valor.
Responde con JSON válido: { "meta_ads_strategy": { ... } }`,
  },
  {
    id: 'google_ads_and_creative',
    keys: ['google_ads_strategy', 'ads_library_analysis'],
    maxTokens: 7000,
    prompt: `Genera ÚNICAMENTE estas 2 secciones en un solo JSON:
1. "google_ads_strategy": Estrategia de Google Ads con:
   - Tipos de campaña recomendados (Search, Display, YouTube, Performance Max)
   - Copy de anuncios: 3 variantes de Search Ads con headlines (máx 30 chars) y descriptions (máx 90 chars)
   - Extensiones recomendadas (sitelinks, callouts, structured snippets)
   - Estrategia de bidding con justificación
   - Budget recomendado por tipo de campaña
   - Landing page recommendations
2. "ads_library_analysis": Análisis de estrategia publicitaria competitiva con:
   a) Para CADA competidor: tipo de mensajes que usan, propuesta de valor que promueven, CTAs detectados en su sitio, ángulos de venta, fortaleza creativa estimada (alta/media/baja)
   b) Patrones creativos del mercado: qué contenido domina, mensajes comunes, formatos probables
   c) 5 conceptos creativos para el cliente. Para CADA uno: concept, hook, format (video/carrusel/imagen/UGC), primary_copy, cta, why_it_works, platform (Meta/Google/ambos)
   d) Calendario creativo mensual: semana 1-2 y semana 3-4 qué lanzar, qué variables testear
CRÍTICO: ads_library_analysis NO PUEDE estar vacía.
Responde con JSON válido: { "google_ads_strategy": { ... }, "ads_library_analysis": { ... } }`,
  },
];

// ── Llamada individual a Claude ──
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

async function callClaude(
  systemPrompt: string,
  researchData: string,
  maxTokens: number = 2500
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  console.log(`[callClaude] Starting request — maxTokens: ${maxTokens}, researchLength: ${researchData.length}`);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Aquí están los datos de research del sitio web del cliente y sus competidores. Analízalos a fondo:\n\n${researchData}\n\nResponde ÚNICAMENTE con JSON válido. Sin markdown, sin backticks, sin texto antes o después del JSON.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Claude API error ${res.status}: ${errorBody}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "{}";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    console.log(`[callClaude] Response OK — textLength: ${text.length}, cleanedLength: ${cleaned.length}`);
    return JSON.parse(cleaned);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Claude API timeout after 120s");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ANTHROPIC_API_KEY) {
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

    // Build structured research data with client + 6 competitors
    const numUserProvided = clientProvidedUrls?.length || 0;
    const userCompetitors: { url: string; scraping: unknown }[] = [];
    const autoCompetitors: { url: string; scraping: unknown }[] = [];

    if (competitorContents?.length > 0) {
      for (let i = 0; i < competitorContents.length; i++) {
        const entry = {
          url: clientProvidedUrls?.[i] || `competidor_${i + 1}`,
          scraping: competitorContents[i],
        };
        if (i < numUserProvided) {
          userCompetitors.push(entry);
        } else {
          autoCompetitors.push(entry);
        }
      }
    }

    const researchData = {
      client: {
        name: clientName,
        company: clientCompany || null,
        url: websiteUrl || null,
        scraping: websiteContent || null,
        brief: brandContext || null,
        fase_negocio: fase_negocio || null,
        presupuesto_ads: presupuesto_ads || null,
      },
      user_competitors: userCompetitors,
      auto_competitors: autoCompetitors,
    };

    // Truncate to 20,000 chars — prioritize: client complete > user competitors > auto competitors
    const truncatedResearch = JSON.stringify(researchData).slice(0, 20_000);

    // Update progress
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Ejecutando 11 análisis en paralelo...', pct: 60, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // ══════════════════════════════════════════════
    //  11 LLAMADAS EN 3 OLEADAS (rate limit friendly)
    // ══════════════════════════════════════════════
    const fullSystemBase = `Eres un estratega de marketing digital experto en e-commerce LATAM.${knowledgeContext ? `\nMETODOLOGÍA:\n${knowledgeContext}` : ''}${bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}` : ''}${phaseSection}`;

    const wave1 = SECTIONS.slice(0, 4);   // secciones 1-4
    const wave2 = SECTIONS.slice(4, 8);   // secciones 5-8
    const wave3 = SECTIONS.slice(8, 11);  // secciones 9-11

    console.log(`[analyze-brand-strategy] Wave 1: starting ${wave1.map(s => s.id).join(', ')}`);
    const results1 = await Promise.allSettled(
      wave1.map(section => callClaude(
        `${fullSystemBase}\n${section.prompt}\nResponde SOLO JSON válido sin markdown.`,
        truncatedResearch,
        section.maxTokens
      ).then(data => ({ sectionId: section.id, keys: section.keys, data })))
    );

    console.log(`[analyze-brand-strategy] Wave 1 done. Waiting 15s for rate limit reset...`);
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log(`[analyze-brand-strategy] Wave 2: starting ${wave2.map(s => s.id).join(', ')}`);
    const results2 = await Promise.allSettled(
      wave2.map(section => callClaude(
        `${fullSystemBase}\n${section.prompt}\nResponde SOLO JSON válido sin markdown.`,
        truncatedResearch,
        section.maxTokens
      ).then(data => ({ sectionId: section.id, keys: section.keys, data })))
    );

    console.log(`[analyze-brand-strategy] Wave 2 done. Waiting 15s for rate limit reset...`);
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log(`[analyze-brand-strategy] Wave 3: starting ${wave3.map(s => s.id).join(', ')}`);
    const results3 = await Promise.allSettled(
      wave3.map(section => callClaude(
        `${fullSystemBase}\n${section.prompt}\nResponde SOLO JSON válido sin markdown.`,
        truncatedResearch,
        section.maxTokens
      ).then(data => ({ sectionId: section.id, keys: section.keys, data })))
    );

    const results = [...results1, ...results2, ...results3];
    console.log(`[analyze-brand-strategy] All 3 waves complete.`);

    // Log detallado de cada resultado
    for (let i = 0; i < results.length; i++) {
      const section = SECTIONS[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        const keys = Object.keys(result.value.data || {});
        console.log(`[analyze-brand-strategy] ✅ Section "${section.id}" OK — keys: [${keys.join(', ')}]`);
      } else {
        console.log(`[analyze-brand-strategy] ❌ Section "${section.id}" FAILED — error: ${result.reason?.message || result.reason}`);
      }
    }

    // Log resumen
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;
    console.log(`[analyze-brand-strategy] SUMMARY: ${fulfilled}/11 OK, ${rejected}/11 FAILED`);

    // ── Consolidar resultados ──
    const finalBrief: Record<string, unknown> = {};
    const errors: string[] = [];
    const completedSections: string[] = [];
    const failedSections: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { sectionId, keys, data } = result.value;
        // Si keys tiene múltiples valores (como google_ads_and_creative que genera 2 keys)
        for (const key of keys) {
          if (data[key]) {
            finalBrief[key] = data[key];
            completedSections.push(key);
          }
        }
        // Si Claude respondió sin wrapper (el JSON directo sin la key), asignar a la primera key
        if (keys.length === 1 && !data[keys[0]]) {
          finalBrief[keys[0]] = data;
          completedSections.push(keys[0]);
        }
      } else {
        const sectionIndex = results.indexOf(result);
        const section = SECTIONS[sectionIndex];
        const sectionId = section?.id ?? 'unknown';
        errors.push(`${sectionId}: ${result.reason?.message ?? 'Unknown error'}`);
        failedSections.push(sectionId);
      }
    }

    // Determinar status
    const status = errors.length === 0
      ? 'completed'
      : completedSections.length > 0
      ? 'partial'
      : 'failed';

    console.log(`[analyze-brand-strategy] Status: ${status}, completed: ${completedSections.join(', ')}, failed: ${failedSections.join(', ')}`);

    // Guardar cada sección individualmente en brand_research
    for (const key of completedSections) {
      const value = finalBrief[key];
      const researchData = key === 'executive_summary'
        ? { summary: typeof value === 'string' ? (value as string).slice(0, 12000) : JSON.stringify(value).slice(0, 4000), ...((typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}) }
        : value;

      const { error: upsertErr } = await supabase.from('brand_research').upsert(
        { client_id, research_type: key, research_data: researchData },
        { onConflict: 'client_id,research_type' }
      );
      if (upsertErr) {
        console.error(`[analyze-brand-strategy] Failed to save ${key}:`, upsertErr.message);
      }
    }

    // Update client website if provided
    if (websiteUrl) {
      await supabase.from('clients').update({ website_url: websiteUrl }).eq('id', client_id);
    }

    // Save brand_strategy marker with status
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'brand_strategy', research_data: {
        status,
        completed_at: new Date().toISOString(),
        completed_sections: completedSections,
        failed_sections: failedSections.length > 0 ? failedSections : null,
        errors: errors.length > 0 ? errors : null,
      }},
      { onConflict: 'client_id,research_type' }
    );

    // Mark analysis_status complete
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_status', research_data: {
        status: status === 'failed' ? 'error' : 'complete',
        completed_at: new Date().toISOString(),
        partial: status === 'partial',
        sections_saved: completedSections.length,
        errors: errors.length > 0 ? errors : undefined,
      }},
      { onConflict: 'client_id,research_type' }
    );

    console.log(`[analyze-brand-strategy] Complete for client ${client_id} (status=${status}, saved=${completedSections.length}/11)`);

    return new Response(JSON.stringify({ success: true, status, data: finalBrief, completed_sections: completedSections, failed_sections: failedSections, errors }), {
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
