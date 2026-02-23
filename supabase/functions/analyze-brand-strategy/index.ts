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
    maxTokens: 2000,
    prompt: `Eres un estratega de marketing senior con 15 años de experiencia. Con base en los datos de research del sitio web del cliente y sus competidores, genera ÚNICAMENTE la sección "executive_summary".

Debe incluir:
- Situación actual de la marca basada en los datos reales del sitio (qué venden, cómo se presentan, qué propuesta de valor comunican)
- Posición relativa frente a los competidores analizados (en qué están mejor, en qué están peor)
- Las 3 oportunidades más importantes detectadas del análisis competitivo
- Las 3 amenazas más importantes
- Top 3 recomendaciones priorizadas con impacto estimado

IMPORTANTE: Basa TODO en los datos reales proporcionados. Cita ejemplos específicos del sitio web y de los competidores. No inventes datos.

Responde ÚNICAMENTE con JSON válido: { "executive_summary": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'brand_identity',
    keys: ['brand_identity'],
    maxTokens: 2000,
    prompt: `Eres un experto en branding y estrategia de marca. Analiza los datos de research del sitio web del cliente y sus competidores para generar ÚNICAMENTE la sección "brand_identity".

Debe incluir:
- "essence": Propuesta de valor actual: qué promete la marca según su sitio web (extrae frases exactas)
- "values": Valores de marca identificados del contenido (array de strings)
- "personality": Personalidad de marca (arquetipos)
- "tone_of_voice": Tono y voz: analiza el lenguaje del sitio (formal/informal, técnico/accesible, emocional/racional)
- "visual_identity": Identidad visual observada (colores, estilo, fotografía si hay datos)
- "differentiators": Diferenciadores vs los competidores: qué dice esta marca que NO dicen los competidores
- "identity_gaps": Gaps de identidad: qué deberían comunicar y no lo hacen (basado en lo que sí comunican los competidores)

IMPORTANTE: Extrae información REAL del contenido del sitio. Cita frases o secciones específicas que hayas encontrado en los datos.

Responde ÚNICAMENTE con JSON válido: { "brand_identity": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'financial_analysis',
    keys: ['financial_analysis'],
    maxTokens: 2000,
    prompt: `Eres un analista de mercado y modelo de negocio. Con base en los datos del sitio web del cliente y sus competidores, genera ÚNICAMENTE la sección "financial_analysis".

Debe incluir:
- "current_situation": Modelo de negocio identificado (e-commerce, SaaS, servicios, etc.)
- "products_detected": Productos/servicios detectados en el sitio con sus precios si están visibles
- "pricing_comparison": Rango de precios del cliente vs competidores
- "pricing_strategy": Estrategia de pricing detectada (premium, low-cost, freemium, basada en valor)
- "revenue_drivers": Fuentes de ingreso identificadas o inferidas (array)
- "growth_forecast": Oportunidades de monetización no explotadas
- "cost_optimization": Oportunidades de optimización (array)
- "benchmarks": Cómo se comparan las ofertas del cliente vs competidores

IMPORTANTE: Si los precios no son visibles en el scraping, indícalo claramente. No inventes precios.

Responde ÚNICAMENTE con JSON válido: { "financial_analysis": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'consumer_profile',
    keys: ['consumer_profile'],
    maxTokens: 2000,
    prompt: `Eres un experto en investigación de consumidor y buyer personas. Con base en los datos del sitio web del cliente y sus competidores, genera ÚNICAMENTE la sección "consumer_profile".

Debe incluir:
- "primary_audience": Buyer persona principal con nombre ficticio, demografía (edad, género, ubicación, NSE), psicografía (valores, intereses, estilo de vida), comportamiento digital, pain points, motivadores de compra, barreras/objeciones, frase que lo define
- "secondary_audience": Buyer persona secundario (mismo formato, más breve)
- "demographics": Datos demográficos inferidos del contenido
- "psychographics": Datos psicográficos inferidos
- "pain_points": Pain points principales (array, basados en lo que el sitio promete resolver)
- "buying_triggers": Motivadores de compra (array)
- "purchase_journey": Journey de compra estimado: descubrimiento, consideración, decisión, post-compra

IMPORTANTE: Infiere los buyer personas del CONTENIDO del sitio (a quién le hablan, qué lenguaje usan, qué problemas mencionan).

Responde ÚNICAMENTE con JSON válido: { "consumer_profile": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'competitive_analysis',
    keys: ['competitive_analysis'],
    maxTokens: 3000,
    prompt: `Eres un estratega competitivo senior. Tienes los datos de scraping del sitio web del cliente Y de sus competidores. Genera ÚNICAMENTE la sección "competitive_analysis".

Debe incluir:

a) "competitors": Array — análisis INDIVIDUAL de CADA competidor:
   Para CADA competidor genera un objeto con:
   - "name": Nombre/URL del competidor
   - "url": URL del competidor
   - "value_proposition": Propuesta de valor principal (extraída de su sitio, cita frases reales)
   - "strengths": Fortalezas detectadas (array, mínimo 2, basadas en datos reales)
   - "weaknesses": Debilidades detectadas (array, mínimo 2)
   - "positioning": Posicionamiento detectado en su contenido
   - "ad_strategy_inferred": Estrategia publicitaria inferida del sitio
   - "attack_vector": Cómo el cliente puede quitarles clientes
   - "seo_score": número de 0 a 100 basado en meta tags y contenido
   - "price_positioning": Posicionamiento de precios detectado
   - "threat_level": "alto", "medio" o "bajo" con justificación

b) "market_gaps": Gaps de mercado que NINGÚN competidor cubre (array)
c) "competitive_advantage": Ventajas competitivas del cliente que debe explotar
d) "market_trends": Tendencias del mercado inferidas del análisis

CRÍTICO: Analiza CADA competidor individualmente con datos REALES. NUNCA dejes competidores sin analizar.

Responde ÚNICAMENTE con JSON válido: { "competitive_analysis": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'positioning_strategy',
    keys: ['positioning_strategy'],
    maxTokens: 2500,
    prompt: `Eres un experto en posicionamiento de marca y estrategia. Con base en los datos del cliente y sus competidores, genera ÚNICAMENTE la sección "positioning_strategy".

Debe incluir:
- "current_positioning": Posicionamiento actual del cliente (percibido del sitio)
- "competitor_positioning": Posicionamiento de cada competidor en 1 línea
- "perceptual_map": Mapa perceptual con 2 ejes relevantes y ubicación de cada player
- "desired_positioning": Posicionamiento recomendado basado en gaps competitivos
- "differentiation": Diferenciación principal recomendada
- "value_proposition": Statement de posicionamiento: "Para [audiencia], [marca] es [categoría] que [beneficio] porque [razón]"
- "messaging_pillars": Mensajes clave diferenciadores (array de 3-5)
- "communication_territories": Territorios de comunicación que debe "adueñarse"

IMPORTANTE: El posicionamiento debe basarse en los gaps reales detectados. No propongas posicionamiento genérico.

Responde ÚNICAMENTE con JSON válido: { "positioning_strategy": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'action_plan',
    keys: ['action_plan'],
    maxTokens: 3500,
    prompt: `Eres un consultor estratégico senior. Con base en TODOS los datos de research del cliente y sus competidores, genera ÚNICAMENTE la sección "action_plan".

Debe contener exactamente 7 accionables estratégicos usando el framework SCR:

Para CADA uno de los 7 accionables:
- "title": Nombre claro y accionable
- "situation": La situación actual con datos reales del análisis
- "complication": Por qué es un problema y qué pasa si NO se actúa
- "resolution": Qué hacer exactamente — pasos específicos, herramientas, métricas de éxito
- "priority": "alta", "media" o "baja"
- "timeline": Tiempo estimado de implementación
- "expected_impact": Impacto esperado cuantificado

Los 7 accionables deben cubrir: 1) Branding/Identidad, 2) Contenido/Content marketing, 3) SEO, 4) Paid media, 5) Conversión/CRO, 6) Retención/Fidelización, 7) Crecimiento/Escalamiento.

CRÍTICO: Cada accionable debe ser ESPECÍFICO al cliente y basado en datos reales. NADA genérico.

Responde ÚNICAMENTE con JSON válido: { "action_plan": [...] }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'seo_audit',
    keys: ['seo_audit'],
    maxTokens: 3000,
    prompt: `Eres un experto SEO técnico y estratégico. Tienes los datos de scraping del sitio web del cliente Y de sus competidores. Genera ÚNICAMENTE la sección "seo_audit".

Debe incluir:

a) "score": número de 0 a 100. Calcula basándote en:
   - Presencia y calidad de meta tags (20 pts)
   - Estructura de headings H1-H3 (15 pts)
   - Calidad del contenido (20 pts)
   - URLs y navegación (15 pts)
   - Contenido duplicado o thin content (15 pts)
   - Schema markup y técnicos (15 pts)
   SOLO da 0 si LITERALMENTE no hay ningún dato del sitio.

b) "meta_analysis": Meta titles y descriptions encontrados, evaluación de calidad
c) "content_structure": Estructura de headings H1/H2/H3, evaluación de jerarquía
d) "issues": Problemas detectados priorizados por impacto (array de strings)
e) "recommendations": Acciones prioritarias con impacto estimado (array de strings)
f) "technical_seo_priority": Top 3 acciones técnicas SEO
g) "competitive_seo_gap": Qué hacen bien los competidores en SEO que el cliente NO hace
h) "competitor_comparison": Para cada competidor con datos: sus meta tags vs las del cliente, estructura comparada, oportunidades SEO que explotan

CRÍTICO: Usa los datos de scraping REALES. Analiza meta tags, títulos y contenido que realmente están en los datos.

Responde ÚNICAMENTE con JSON válido: { "seo_audit": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'keywords',
    keys: ['keywords'],
    maxTokens: 2500,
    prompt: `Eres un experto en keyword research y estrategia de contenido. Tienes los datos de scraping del sitio del cliente Y de sus competidores. Genera ÚNICAMENTE la sección "keywords".

Debe incluir:

a) "primary": Array de 5-6 keywords principales. Cada una con:
   - "keyword": la keyword exacta
   - "search_intent": "transaccional", "informacional", "comercial" o "navegacional"
   - "rationale": por qué es estratégica (qué competidores la usan, dónde aparece)
   - "estimated_difficulty": "alta", "media" o "baja"

b) "long_tail": Array de 5 keywords long-tail. Cada una con:
   - "keyword": la keyword exacta
   - "search_intent": tipo de intención
   - "rationale": por qué es oportunidad (gaps que competidores NO cubren)
   - "buyer_persona_match": a cuál buyer persona apunta

c) "negative_keywords": Array de 3 keywords negativas. Cada una con:
   - "keyword": la keyword a excluir
   - "reason": por qué excluirla

d) "competitor_keywords": Keywords que los competidores usan en sus títulos y metas (array)

e) "strategy": Hoja de ruta por fases:
   - "phase_1": Quick wins (mes 1-2) — keywords, acciones, KPIs
   - "phase_2": Growth (mes 3-4) — keywords, acciones, KPIs
   - "phase_3": Dominance (mes 5-6) — keywords, acciones, KPIs

f) "recommended_strategy": Resumen de la estrategia basada en análisis competitivo

CRÍTICO: Las keywords DEBEN estar basadas en análisis real del contenido de los competidores.

Responde ÚNICAMENTE con JSON válido: { "keywords": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'meta_ads_strategy',
    keys: ['meta_ads_strategy'],
    maxTokens: 2500,
    prompt: `Eres un experto en Meta Ads (Facebook + Instagram) con experiencia en performance marketing. Con los datos del cliente y sus competidores, genera ÚNICAMENTE la sección "meta_ads_strategy".

Debe incluir:

a) "funnel_structure": Estructura de campañas TOF/MOF/BOF detallada

b) "audience_targeting": {
   "cold": Segmentación para audiencias frías (intereses, demografía, lookalikes),
   "warm": Segmentación para retargeting (visitantes, engagement),
   "hot": Segmentación para conversión (remarketing, carrito abandonado)
}

c) "copy_hooks": Array de 3 hooks creativos ESPECÍFICOS para el cliente (no genéricos), cada uno con formato recomendado

d) "primary_texts": Array de 2 textos principales de ejemplo para anuncios

e) "cta_recommendations": Array de 3 CTAs recomendados con justificación

f) "hooks": Array de 3 hooks de video de 3 segundos

g) "budget_distribution": Distribución recomendada por funnel (ej: 60% TOF, 25% MOF, 15% BOF)

h) "kpis": KPIs objetivo por etapa de funnel

IMPORTANTE: Hooks y creativos ESPECÍFICOS al negocio del cliente, basados en su propuesta de valor y diferenciadores.

Responde ÚNICAMENTE con JSON válido: { "meta_ads_strategy": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
  {
    id: 'google_ads_and_creative',
    keys: ['google_ads_strategy', 'ads_library_analysis'],
    maxTokens: 3500,
    prompt: `Eres un experto en Google Ads y estrategia creativa publicitaria. Con los datos del sitio del cliente y sus competidores, genera ÚNICAMENTE estas 2 secciones:

1. "google_ads_strategy": {
   "campaign_structure": Tipos de campaña recomendados (Search, Display, YouTube, PMax) con estructura,
   "headlines": Array de 5 headlines de máximo 30 caracteres,
   "descriptions": Array de 2 descripciones de máximo 90 caracteres,
   "extensions": Extensiones de anuncio recomendadas (sitelinks, callouts, snippets),
   "bidding_strategy": Estrategia de bidding con justificación,
   "budget_distribution": Budget recomendado y distribución por tipo,
   "landing_recommendations": Recomendaciones para landing pages basadas en el sitio actual
}

2. "ads_library_analysis": {
   "competitor_strategies": Array — para CADA competidor con datos:
   {
     "name": Nombre del competidor,
     "messaging_approach": Tipo de mensajes que usan basado en su sitio,
     "value_proposition_promoted": Propuesta de valor que promueven,
     "probable_formats": Formatos creativos probables (video, carrusel, imagen),
     "cta_used": CTAs encontrados en su sitio,
     "sales_angles": Ángulos de venta detectados en su contenido,
     "creative_strength": "alta", "media" o "baja"
   },
   "market_patterns": {
     "dominant_content_type": Qué tipo de contenido/ofertas dominan,
     "probable_formats": Formatos más utilizados,
     "common_messages": Mensajes más utilizados por los competidores
   },
   "creative_concepts": Array de 5 conceptos creativos — para CADA uno:
   {
     "concept": nombre del concepto,
     "hook": gancho principal (1 frase),
     "format": formato recomendado (video, carrusel, imagen, UGC),
     "copy": texto principal del anuncio,
     "cta": llamado a acción,
     "rationale": por qué funcionaría basado en análisis competitivo,
     "platform": dónde usarlo (Meta, Google, ambos)
   },
   "winning_patterns": Array de 3 patrones ganadores del mercado,
   "hook_ideas": Array de 4 ideas de hook/gancho,
   "creative_recommendations": Array de 3 recomendaciones creativas diferenciadas,
   "creative_calendar": Calendario creativo mensual (semana 1-2, semana 3-4, testing)
}

CRÍTICO: ads_library_analysis NO PUEDE estar vacía. Analiza los sitios de los competidores para inferir su estrategia publicitaria.

Responde ÚNICAMENTE con JSON válido: { "google_ads_strategy": { ... }, "ads_library_analysis": { ... } }
Sin markdown, sin backticks, sin texto adicional.`,
  },
];

// ── Llamada individual a Claude ──
async function callClaude(
  anthropicApiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2500,
): Promise<{ data: Record<string, unknown>; stopReason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

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
        model: 'claude-opus-4-6',
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
    return { data, stopReason };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('AI request timed out (120s)');
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
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Ejecutando 11 análisis en paralelo...', pct: 60, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // ══════════════════════════════════════════════
    //  11 LLAMADAS EN PARALELO con Promise.allSettled
    // ══════════════════════════════════════════════
    console.log(`[analyze-brand-strategy] Starting 11 parallel calls for client ${client_id}`);

    const results = await Promise.allSettled(
      SECTIONS.map(async (section) => {
        const systemPrompt = `Eres un estratega de marketing digital experto en e-commerce LATAM.${knowledgeContext ? `\nMETODOLOGÍA:\n${knowledgeContext}` : ''}${bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}` : ''}${phaseSection}\nResponde SOLO JSON válido sin markdown.`;
        const userPrompt = `Aquí están los datos de research del sitio web del cliente y sus competidores. Analízalos a fondo:\n\n${truncatedResearch}\n\n${section.prompt}\n\nREGLAS: Solo JSON válido. Sé conciso pero específico. Usa datos reales del contenido proporcionado.`;
        const { data, stopReason } = await callClaude(anthropicApiKey, systemPrompt, userPrompt, section.maxTokens);
        console.log(`[analyze-brand-strategy] Section "${section.id}" OK: stop=${stopReason}, keys=${Object.keys(data).join(',')}`);
        return { sectionId: section.id, keys: section.keys, data };
      })
    );

    // ── Consolidar y guardar resultados ──
    const fullResult: Record<string, unknown> = {};
    const savedSections: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        const { sectionId, keys, data } = result.value;
        for (const key of keys) {
          // Extract the value: try wrapped { "key": value } first, then use data directly
          const value = data[key] ?? (keys.length === 1 ? data : undefined);
          if (value) {
            const researchData = key === 'executive_summary'
              ? { summary: typeof value === 'string' ? (value as string).slice(0, 12000) : JSON.stringify(value).slice(0, 4000), ...((typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}) }
              : value;

            const { error: upsertErr } = await supabase.from('brand_research').upsert(
              { client_id, research_type: key, research_data: researchData },
              { onConflict: 'client_id,research_type' }
            );
            if (!upsertErr) {
              savedSections.push(key);
              fullResult[key] = value;
            } else {
              console.error(`[${sectionId}] Failed to save ${key}:`, upsertErr.message);
            }
          }
        }
      } else {
        const sectionId = SECTIONS[i]?.id || 'unknown';
        const errMsg = result.reason?.message || 'Unknown error';
        console.error(`[analyze-brand-strategy] Section "${sectionId}" FAILED:`, errMsg);
        errors.push(`${sectionId}: ${errMsg}`);
      }
    }

    console.log(`[analyze-brand-strategy] Saved ${savedSections.length} sections: ${savedSections.join(', ')}`);
    if (errors.length > 0) console.log(`[analyze-brand-strategy] Errors: ${errors.join('; ')}`);

    // Save ads_library_analysis for backward compatibility if not already saved
    if (!savedSections.includes('ads_library_analysis') && (fullResult.meta_ads_strategy || fullResult.google_ads_strategy)) {
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

    console.log(`[analyze-brand-strategy] Complete for client ${client_id} (partial=${isPartial}, saved=${savedSections.length}/11)`);

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
