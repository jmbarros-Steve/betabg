import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

// ── 12 secciones individuales para llamadas paralelas ──
const SECTIONS = [
  {
    id: 'executive_summary',
    keys: ['executive_summary'],
    maxTokens: 6000,
    model: 'claude-sonnet-4-6' as const,
    dataScope: 'all' as const,
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
    model: 'claude-sonnet-4-6' as const,
    dataScope: 'client_and_competitors' as const,
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
    maxTokens: 5000,
    model: 'claude-sonnet-4-6' as const,
    dataScope: 'client_and_competitors' as const,
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
    model: 'claude-sonnet-4-6' as const,
    dataScope: 'client_only' as const,
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
    maxTokens: 10000,
    dataScope: 'all' as const,
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
    dataScope: 'all' as const,
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
    maxTokens: 16000,
    dataScope: 'all' as const,
    prompt: `Genera ÚNICAMENTE la sección "action_plan". DEBE contener EXACTAMENTE 7 accionables estratégicos usando framework SCR.

ESTRUCTURA OBLIGATORIA — Para CADA uno de los 7 accionables:
{
  "title": "Título claro y accionable (ej: 'Implementar estrategia de contenido SEO para capturar tráfico orgánico')",
  "situation": "La situación actual con datos REALES del análisis — mínimo 3 oraciones. Cita datos del scraping, comparaciones con competidores, métricas observadas.",
  "complication": "Por qué es un problema AHORA y qué pasa si NO se actúa — mínimo 3 oraciones. Cuantifica el costo de la inacción.",
  "resolution": "Qué hacer EXACTAMENTE — mínimo 5 oraciones con: pasos concretos numerados, herramientas específicas, canales, frecuencia, responsable sugerido, métricas de éxito.",
  "priority": "alta" / "media" / "baja",
  "timeline": "Tiempo estimado (ej: '2-4 semanas')",
  "expected_impact": "Impacto cuantificado (ej: '+30% tráfico orgánico en 60 días', 'Reducción CPA de $X a $Y')"
}

Los 7 accionables DEBEN cubrir estos 7 pilares:
1) Branding/Identidad — cómo fortalecer la marca
2) Contenido/Comunicación — qué contenido crear y dónde publicar
3) SEO/Orgánico — optimizaciones técnicas y de contenido
4) Paid Media (Meta/Google) — estructura de campañas y creativos
5) Conversión/CRO — mejoras en sitio web para convertir más
6) Retención/Email — estrategia de fidelización y lifecycle
7) Crecimiento/Escalamiento — cómo escalar lo que funciona

CRÍTICO: Cada accionable debe ser ESPECÍFICO al negocio del cliente basado en datos REALES del análisis. NADA genérico. El campo "resolution" debe tener pasos tan detallados que el cliente pueda ejecutarlos mañana.
Responde con JSON válido: { "action_plan": [...] }`,
  },
  {
    id: 'seo_audit',
    keys: ['seo_audit'],
    maxTokens: 8000,
    dataScope: 'client_and_competitors' as const,
    prompt: `Genera ÚNICAMENTE la sección "seo_audit". Debe incluir:

a) "score" (OBLIGATORIO, número 0-100): Calcula el score SEO sumando estos criterios:
   - Meta title presente y optimizado (0-15 pts)
   - Meta description presente y < 160 chars (0-10 pts)
   - H1 único y relevante (0-10 pts)
   - Estructura de headings H2/H3 (0-10 pts)
   - Contenido de calidad y extensión (0-15 pts)
   - URLs amigables y descriptivas (0-10 pts)
   - Schema markup implementado (0-10 pts)
   - Velocidad estimada por plataforma (0-10 pts)
   - Mobile-friendly (0-5 pts)
   - Internal linking (0-5 pts)
   NUNCA pongas 0 si hay datos de scraping. Evalúa lo que hay y da un score REAL con justificación.
   "score_justification": explica cómo calculaste cada punto.

b) "analisis_cliente": Para el sitio del cliente analiza con DATOS REALES del scraping:
   - "meta_titles": { "detectado": "el title real", "evaluacion": "bueno/regular/malo y por qué", "mejora": "sugerencia específica" }
   - "meta_descriptions": { "detectado": "la description real", "evaluacion": "...", "mejora": "..." }
   - "headings": { "h1_detectado": "el H1 real", "evaluacion": "...", "mejora": "..." }
   - "contenido": { "evaluacion": "análisis de calidad/extensión", "fortalezas": "...", "mejora": "..." }
   - "urls": { "evaluacion": "...", "mejora": "..." }
   - "schema": { "presente": true/false, "mejora": "..." }

c) "analisis_competidores": Comparación SEO con CADA competidor que tenga datos. Para cada uno: qué hacen MEJOR en SEO y qué puede aprender el cliente.

d) "problemas_detectados": Array de objetos [{ "problema": "...", "impacto": "alto/medio/bajo", "solucion": "paso a paso específico" }]. Mínimo 5 problemas.

e) "acciones_prioritarias": Array de objetos [{ "accion": "...", "impacto_esperado": "ej: +20% tráfico orgánico", "plazo": "ej: 2 semanas", "esfuerzo": "bajo/medio/alto" }]. Mínimo 5 acciones.

CRÍTICO: El score NO puede ser 0 ni N/D si hay cualquier dato de scraping. Analiza todo lo disponible.
Responde con JSON válido: { "seo_audit": { ... } }`,
  },
  {
    id: 'keywords',
    keys: ['keywords'],
    maxTokens: 7000,
    dataScope: 'client_and_competitors' as const,
    prompt: `Genera ÚNICAMENTE la sección "keywords". Debe incluir:

a) "primary_keywords": 8-10 keywords principales (NO genéricas — específicas al nicho del cliente). Para cada una:
   - "keyword": la keyword exacta como la buscaría un usuario en Google
   - "search_intent": "transaccional" / "informacional" / "comercial" / "navegacional"
   - "rationale": por qué es estratégica + qué competidores ya la usan + estimación de volumen mensual
   - "estimated_difficulty": "alta" / "media" / "baja" con justificación
   - "priority": "invertir inmediatamente" / "monitorear" / "ataque a largo plazo"
   - "accion_concreta": QUÉ HACER exactamente con esta keyword (ej: "Crear landing page optimizada con esta keyword en H1 y meta title")

b) "longtail_keywords": 8 keywords long-tail de baja competencia. Para cada una:
   - "keyword": frase exacta 3-5 palabras
   - "search_intent", "rationale": gaps que los competidores NO cubren
   - "buyer_persona_match": a qué etapa del journey corresponde
   - "contenido_sugerido": qué tipo de contenido crear (blog post, landing, FAQ, etc.)

c) "negative_keywords": 5 keywords negativas para ads con razón detallada de por qué excluirlas

d) "keyword_strategy_roadmap": Hoja de ruta por fases:
   - "phase_1" (mes 1-2): Quick wins — keywords fáciles de posicionar
     - "focus": descripción del enfoque
     - "keywords": array de keywords objetivo
     - "acciones_concretas": array de pasos específicos (ej: "Optimizar meta title de homepage con [keyword]")
     - "kpis": array de métricas medibles
     - "timeline": "Mes 1-2"
   - "phase_2" (mes 3-4): Growth — keywords de dificultad media
   - "phase_3" (mes 5-6): Dominance — keywords competitivas

CRÍTICO: Las keywords deben ser REALES y ESPECÍFICAS al negocio del cliente basadas en el scraping. NO pongas keywords genéricas como "comprar online" o "mejor producto". Usa el contenido de los competidores para identificar oportunidades.
Responde con JSON válido: { "keywords": { ... } }`,
  },
  {
    id: 'meta_ads_strategy',
    keys: ['meta_ads_strategy'],
    maxTokens: 7000,
    dataScope: 'client_only' as const,
    prompt: `Genera ÚNICAMENTE la sección "meta_ads_strategy". DEBE ser 100% PERSONALIZADA al negocio del cliente (usa nombre de marca, productos, propuesta de valor real).

a) "objetivos_campana": Objetivos por etapa del funnel:
   - "tofu": { "meta": "objetivo específico", "estrategia": "detallada para ESTE cliente", "formato": "video/reels/carrusel", "presupuesto_pct": 40 }
   - "mofu": { "meta": "...", "estrategia": "...", "formato": "...", "presupuesto_pct": 30 }
   - "bofu": { "meta": "...", "estrategia": "...", "formato": "...", "presupuesto_pct": 30 }

b) "audiencias": Array de 5+ audiencias ESPECÍFICAS al nicho:
   [{ "nombre": "nombre descriptivo", "tipo": "fría/tibia/caliente", "descripcion": "segmentación exacta con intereses, demografía y comportamientos REALES para este nicho", "tamaño_estimado": "500K-1M" }]

c) "creativos_recomendados": 5 creativos ESPECÍFICOS (NO genéricos). Para cada uno:
   - "hook": frase de apertura LISTA PARA USAR basada en el dolor real del buyer persona
   - "formato": "Video 15s / Reels / Carrusel / Imagen estática / UGC"
   - "copy": texto COMPLETO del anuncio listo para copiar y pegar (mínimo 3 oraciones)
   - "cta": CTA específico
   - "por_que_funciona": justificación basada en datos del análisis

d) "kpis_objetivo": KPIs por etapa con números CALCULADOS basados en el margen del cliente:
   - "tofu": { "cpm": "$X-$X USD", "ctr": ">X%", "cpc": "<$X" }
   - "mofu": { "ctr": ">X%", "engagement_rate": ">X%" }
   - "bofu": { "roas": "Xx", "cpa": "<$X CLP", "cvr": ">X%" }

e) "presupuesto_sugerido": { "total": número CLP, "tofu": número, "mofu": número, "bofu": número, "justificacion": "por qué este monto para este cliente" }

CRÍTICO: Los copies y hooks deben mencionar el PRODUCTO/SERVICIO real del cliente. NUNCA uses hooks genéricos como "¿Cansado de X?". Basa todo en los datos del brief y scraping.
Responde con JSON válido: { "meta_ads_strategy": { ... } }`,
  },
  {
    id: 'google_ads_and_creative',
    keys: ['google_ads_strategy', 'ads_library_analysis'],
    maxTokens: 10000,
    dataScope: 'all' as const,
    prompt: `Genera ÚNICAMENTE estas 2 secciones en un solo JSON:

1. "google_ads_strategy": Estrategia COMPLETA de Google Ads:
   - "campaign_types": Array de 4+ tipos de campaña [{ "type": "Search/Shopping/PMax/Display/YouTube", "objetivo": "...", "presupuesto_pct": X, "prioridad": "inmediata/alta/media" }]
   - "ad_copies": 5 variantes de Search Ads COMPLETAS (no cortadas). Para cada una:
     { "variant": 1, "headline1": "máx 30 chars", "headline2": "máx 30 chars", "headline3": "máx 30 chars", "description1": "máx 90 chars - TEXTO COMPLETO", "description2": "máx 90 chars - TEXTO COMPLETO" }
     Los headlines y descriptions deben ser ESPECÍFICOS al negocio del cliente.
   - "extensions": Array de 4+ extensiones [{ "type": "Sitelink/Callout/Structured Snippet/Price", "content": "texto específico", "url": "página destino sugerida" }]
   - "bidding_strategy": { "fase_1": "Manual CPC - justificación", "fase_2": "tROAS cuando X conv/mes", "fase_3": "Maximize conversions", "justificacion": "..." }
   - "landing_page_recommendations": Array de 3+ recomendaciones específicas para mejorar landing pages

2. "ads_library_analysis": Análisis publicitario COMPLETO:
   a) "competitor_analysis": Para CADA competidor [{ "name": "...", "mensajes": "tipo de mensajes que usan", "propuesta_valor": "...", "ctas": ["CTA1", "CTA2"], "angulos_venta": "...", "fortaleza_creativa": "alta/media/baja" }]
   b) "market_patterns": { "dominant_content": "...", "common_messages": "...", "probable_formats": "..." }
   c) "creative_concepts": 5 conceptos creativos COMPLETOS. Para CADA uno:
      { "nombre": "nombre del concepto", "hook": "frase de apertura de 3 seg LISTA PARA USAR", "formato": "Video/Carrusel/Imagen/UGC", "copy": "TEXTO COMPLETO del anuncio — mínimo 4-5 oraciones, listo para copiar y pegar directamente en Meta/Google. NO lo cortes.", "cta": "CTA específico", "why_it_works": "justificación basada en datos", "platform": "Meta/Google/ambos" }
   d) "creative_calendar": { "week_1_2": { "launch": "qué lanzar", "test_variables": ["variable1", "variable2"] }, "week_3_4": { ... } }

CRÍTICO: Los copies en creative_concepts deben ser COMPLETOS (4-5 oraciones mínimo), NO cortados. Específicos al negocio del cliente.
Responde con JSON válido: { "google_ads_strategy": { ... }, "ads_library_analysis": { ... } }`,
  },
  {
    id: 'budget_and_funnel',
    keys: ['budget_and_funnel'],
    maxTokens: 5000,
    dataScope: 'client_only' as const,
    prompt: `Genera la estrategia de inversión publicitaria y distribución de presupuesto REAL para este cliente.

IMPORTANTE: Para la estrategia de Meta Ads, prioriza las siguientes reglas de tu knowledge base:
- Adopción Total del Algoritmo (Advantage+ Shopping / Advantage+ Audience)
- Consolidación Extrema de Ad Sets (1 Ad Set consolidado, no múltiples)
- Open Targeting cuando hay historial de conversiones
- Fusión de Tráfico Frío y Cálido en el mismo Ad Set
- Audiencias Web de Máximo Volumen (180 días, sin fragmentar)
- Respeto a la Fase de Aprendizaje (no editar constantemente)
- Unit Economics: CPA máximo = 30% del margen bruto

Estructura de campañas Meta Ads:
- Campaña 1: TESTING (Advantage+ o CBO consolidado) — para testear creativos y encontrar ganadores. Presupuesto mínimo por Ad Set = 2x CPA máximo viable. Kill rule: si gasta 2x CPA sin compra, apagar.
- Campaña 2: SCALING — mover creativos ganadores del testing. Subir presupuesto 20% cada 48hrs si ROAS se mantiene.
- Campaña 3: RETARGETING — audiencias web 180 días + interacciones sociales 365 días. Creativos diferentes a prospecting.

Calcula TODO basándote en los datos reales del cliente (presupuesto mensual, margen bruto, CPA máximo viable, industria). NO inventes números genéricos.

Responde SOLO con JSON válido:
{
  "budget_and_funnel": {
    "monthly_budget_clp": número,
    "channel_distribution": {
      "meta_ads": { "percentage": número, "amount_clp": número, "justification": "por qué este % para este cliente específico" },
      "google_ads": { "percentage": número, "amount_clp": número, "justification": "por qué" },
      "seo_content": { "percentage": número, "amount_clp": número, "justification": "por qué" },
      "ugc_influencers": { "percentage": número, "amount_clp": número, "justification": "por qué" }
    },
    "meta_ads_structure": {
      "testing": {
        "budget_percentage": número,
        "budget_clp": número,
        "campaign_type": "Advantage+ Shopping o CBO consolidado",
        "ad_sets": [
          { "name": "nombre descriptivo", "variable_tested": "qué se testea", "budget_per_adset_clp": número, "kill_rule": "regla específica con números del cliente", "audiences": ["descripción"] }
        ],
        "success_metrics": { "hook_rate": ">25%", "hold_rate": ">15%", "ctr": ">1.5%", "cpa_target_clp": número }
      },
      "scaling": {
        "budget_percentage": número,
        "budget_clp": número,
        "rules": "Reglas específicas para este cliente",
        "scale_method": "Incremento 20% cada 48hrs si ROAS > Xx"
      },
      "retargeting": {
        "budget_percentage": número,
        "budget_clp": número,
        "audiences": [
          { "name": "Web visitors 180d", "message": "mensaje específico para este cliente" },
          { "name": "Social engagement 365d", "message": "mensaje específico" },
          { "name": "ATC sin compra 14d", "message": "mensaje específico" }
        ]
      }
    },
    "google_ads_structure": {
      "search_brand": { "budget_percentage": número, "budget_clp": número, "keywords": ["kw1", "kw2"] },
      "search_competitors": { "budget_percentage": número, "budget_clp": número, "keywords": ["kw1", "kw2"] },
      "search_generic": { "budget_percentage": número, "budget_clp": número, "keywords": ["kw1", "kw2"] },
      "display_remarketing": { "budget_percentage": número, "budget_clp": número }
    },
    "roas_projection": {
      "day_30": { "roas": "texto", "phase": "Testing", "reasoning": "por qué para este cliente" },
      "day_60": { "roas": "texto", "phase": "Scaling", "reasoning": "por qué" },
      "day_90": { "roas": "texto", "phase": "Optimización", "reasoning": "por qué" }
    },
    "implementation_calendar": {
      "phase_1": { "days": "0-30", "focus": "Testing y validación", "meta_ads": "acción específica", "google_ads": "acción", "seo": "acción", "email": "acción", "ugc": "acción" },
      "phase_2": { "days": "30-60", "focus": "Scaling ganadores", "meta_ads": "acción", "google_ads": "acción", "seo": "acción", "email": "acción", "ugc": "acción" },
      "phase_3": { "days": "60-90", "focus": "Optimización full", "meta_ads": "acción", "google_ads": "acción", "seo": "acción", "email": "acción", "ugc": "acción" }
    },
    "weekly_optimization_checklist": [
      "checklist item 1 específico",
      "checklist item 2 específico",
      "checklist item 3 específico",
      "checklist item 4 específico",
      "checklist item 5 específico"
    ]
  }
}`,
  },
];

// ── Reparar JSON truncado por max_tokens ──
function repairTruncatedJson(text: string): Record<string, unknown> {
  // Primero intentar parse directo
  try { return JSON.parse(text); } catch {}

  // Quitar markdown wrappers
  let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

  // Intentar cerrar strings y brackets abiertos
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (const ch of cleaned) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Si estamos dentro de un string, cerrarlo
  if (inString) cleaned += '"';

  // Quitar trailing incomplete key-value (e.g. truncated mid-value)
  cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  cleaned = cleaned.replace(/,\s*$/, '');

  // Cerrar todo lo que quedó abierto
  while (stack.length > 0) {
    cleaned += stack.pop();
  }

  try { return JSON.parse(cleaned); } catch {}

  // Segundo intento: quitar el último elemento incompleto del array/object
  // Buscar la última coma seguida de un objeto/array incompleto y cortarlo
  const lastGoodComma = cleaned.lastIndexOf('},');
  if (lastGoodComma > 0) {
    const trimmed = cleaned.slice(0, lastGoodComma + 1);
    // Re-close brackets
    let inStr2 = false;
    let esc2 = false;
    const stack2: string[] = [];
    for (const ch of trimmed) {
      if (esc2) { esc2 = false; continue; }
      if (ch === '\\') { esc2 = true; continue; }
      if (ch === '"') { inStr2 = !inStr2; continue; }
      if (inStr2) continue;
      if (ch === '{') stack2.push('}');
      else if (ch === '[') stack2.push(']');
      else if (ch === '}' || ch === ']') stack2.pop();
    }
    let attempt = trimmed;
    while (stack2.length > 0) attempt += stack2.pop();
    try { return JSON.parse(attempt); } catch {}
  }

  // Último intento: encontrar el último } o ] que haga parse válido
  for (let i = cleaned.length - 1; i > 0; i--) {
    if (cleaned[i] === '}' || cleaned[i] === ']') {
      try { return JSON.parse(cleaned.slice(0, i + 1)); } catch {}
    }
  }

  // Falló todo, devolver lo que tenemos como string
  console.warn('[repairJson] Could not repair JSON, returning as raw text');
  return { raw_text: text.slice(0, 40000), _repair_failed: true };
}

// ── Normalización server-side: keys canónicas antes de guardar en DB ──
function normalizeSection(key: string, data: any): any {
  if (!data || typeof data !== 'object') return data;

  // Helper: rename keys in an object
  const renameKeys = (obj: any, map: Record<string, string>): any => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const [from, to] of Object.entries(map)) {
      if (from !== to && obj[from] !== undefined && obj[to] === undefined) {
        obj[to] = obj[from];
        delete obj[from];
      }
    }
    return obj;
  };

  // Helper: ensure value is array
  const ensureArray = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') return Object.values(val);
    return val ? [val] : [];
  };

  // Helper: extract string from array of objects
  const extractStrings = (arr: any[], field: string): string[] => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((item: any) =>
      typeof item === 'string' ? item : (item?.[field] || JSON.stringify(item))
    );
  };

  switch (key) {
    case 'competitive_analysis': {
      const d = { ...data };
      // Normalize individual competitors array
      const competitorsKey = ['individual_analysis', 'individual_analyses', 'individual_competitor_analysis', 'analisis_individual_competidores']
        .find(k => d[k]);
      if (competitorsKey && competitorsKey !== 'competitors') {
        d.competitors = d[competitorsKey];
        delete d[competitorsKey];
      }
      // Normalize each competitor
      if (Array.isArray(d.competitors)) {
        d.competitors = d.competitors.map((c: any) => {
          if (!c || typeof c !== 'object') return c;
          const comp = { ...c };
          renameKeys(comp, {
            'fortalezas': 'strengths',
            'fortalezas_detectadas': 'strengths',
            'debilidades': 'weaknesses',
            'debilidades_detectadas': 'weaknesses',
            'propuesta_de_valor': 'value_proposition',
            'propuesta_valor': 'value_proposition',
            'propuesta_valor_principal': 'value_proposition',
            'estrategia_contenido_observada': 'ad_strategy_inferred',
            'estrategia_contenido': 'ad_strategy_inferred',
            'que_hace_mejor_que_cliente': 'que_hacen_mejor',
            'nombre_url': 'nombre_url',
            'nombre': 'nombre_url',
            'url': 'nombre_url',
          });
          if (comp.strengths) comp.strengths = ensureArray(comp.strengths);
          if (comp.weaknesses) comp.weaknesses = ensureArray(comp.weaknesses);
          return comp;
        });
      }
      // Normalize market gaps
      if (d.insights_estrategicos) {
        const gapsKey = ['gaps_de_mercado_sin_cubrir', 'gaps_de_mercado', 'gaps_mercado']
          .find(k => d.insights_estrategicos[k]);
        if (gapsKey && gapsKey !== 'market_gaps') {
          d.insights_estrategicos.market_gaps = d.insights_estrategicos[gapsKey];
          delete d.insights_estrategicos[gapsKey];
        }
        if (d.insights_estrategicos.market_gaps) {
          d.insights_estrategicos.market_gaps = ensureArray(d.insights_estrategicos.market_gaps);
        }
      }
      return d;
    }

    case 'meta_ads_strategy': {
      const d = { ...data };
      // creativos_recomendados: ensure array
      if (d.creativos_recomendados && !Array.isArray(d.creativos_recomendados) && typeof d.creativos_recomendados === 'object') {
        d.creativos_recomendados = Object.values(d.creativos_recomendados);
      }
      // Normalize funnel keys in objetivos_campana
      if (d.objetivos_campana) {
        const obj = { ...d.objetivos_campana };
        renameKeys(obj, {
          'tof_awareness': 'tofu', 'tof': 'tofu',
          'mof_consideration': 'mofu', 'mof': 'mofu',
          'bof_conversion': 'bofu', 'bof': 'bofu',
        });
        d.objetivos_campana = obj;
      }
      // Normalize funnel keys in kpis_objetivo
      if (d.kpis_objetivo) {
        const kpis = { ...d.kpis_objetivo };
        renameKeys(kpis, {
          'tof': 'tofu', 'tof_awareness': 'tofu',
          'mof': 'mofu', 'mof_consideration': 'mofu',
          'bof': 'bofu', 'bof_conversion': 'bofu',
        });
        d.kpis_objetivo = kpis;
      }
      // segmentacion_audiencias object → audiencias array
      if (d.segmentacion_audiencias && !Array.isArray(d.segmentacion_audiencias) && typeof d.segmentacion_audiencias === 'object') {
        if (!d.audiencias) d.audiencias = Object.values(d.segmentacion_audiencias);
      }
      // budget_distribucion → presupuesto_sugerido
      if (d.budget_distribucion && !d.presupuesto_sugerido) {
        d.presupuesto_sugerido = d.budget_distribucion;
      }
      // estructura_campañas → estructura_campanas (sin ñ)
      if (d['estructura_campañas'] && !d.estructura_campanas) {
        d.estructura_campanas = d['estructura_campañas'];
        delete d['estructura_campañas'];
      }
      return d;
    }

    case 'google_ads_strategy': {
      const d = { ...data };
      // search_ad_copies → ad_copies
      if (d.search_ad_copies && !d.ad_copies) {
        d.ad_copies = d.search_ad_copies;
        delete d.search_ad_copies;
      }
      // Normalize each ad copy
      if (Array.isArray(d.ad_copies)) {
        d.ad_copies = d.ad_copies.map((ad: any) => {
          if (!ad || typeof ad !== 'object') return ad;
          const copy = { ...ad };
          renameKeys(copy, {
            'headline_1': 'headline1', 'headline_2': 'headline2', 'headline_3': 'headline3',
            'description_1': 'description1', 'description_2': 'description2',
          });
          return copy;
        });
      }
      // campaign_types: object → array
      if (d.campaign_types && !Array.isArray(d.campaign_types) && typeof d.campaign_types === 'object') {
        d.campaign_types = Object.entries(d.campaign_types).map(([name, config]: [string, any]) => ({
          name,
          ...(typeof config === 'object' ? config : { description: config }),
        }));
      }
      // ad_extensions / extensiones → extensions array
      const extKey = d.ad_extensions ? 'ad_extensions' : d.extensiones ? 'extensiones' : null;
      if (extKey) {
        let ext = d[extKey];
        if (ext && !Array.isArray(ext) && typeof ext === 'object') ext = Object.values(ext);
        d.extensions = ext;
        delete d[extKey];
      }
      // budget_recommendation → presupuesto_sugerido
      if (d.budget_recommendation && !d.presupuesto_sugerido) {
        d.presupuesto_sugerido = d.budget_recommendation;
      }
      return d;
    }

    case 'consumer_profile': {
      const d = { ...data };
      const normalizePersona = (persona: any): any => {
        if (!persona || typeof persona !== 'object') return persona;
        const p = { ...persona };
        // nombre → nombre_ficticio
        if (p.nombre && !p.nombre_ficticio) {
          p.nombre_ficticio = p.nombre;
          delete p.nombre;
        }
        // Flatten demografia
        if (p.demografia && typeof p.demografia === 'object') {
          const demo = p.demografia;
          for (const field of ['edad', 'genero', 'ubicacion', 'ocupacion', 'nivel_socioeconomico', 'educacion']) {
            if (demo[field] !== undefined && p[field] === undefined) p[field] = demo[field];
          }
        }
        renameKeys(p, {
          'frase_definitoria': 'frase_que_lo_define',
          'motivadores_compra': 'motivadores_de_compra',
          'barreras_objeciones': 'barreras_y_objeciones',
        });
        // comportamiento_digital object → string
        if (p.comportamiento_digital && typeof p.comportamiento_digital === 'object' && !p.comportamiento_digital_desc) {
          const cd = p.comportamiento_digital;
          p.comportamiento_digital_desc = Object.entries(cd)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join('; ');
        }
        // psicografia.estilo_vida → estilo_de_vida
        if (p.psicografia && typeof p.psicografia === 'object') {
          const psi = { ...p.psicografia };
          if (psi.estilo_vida && !psi.estilo_de_vida) {
            psi.estilo_de_vida = psi.estilo_vida;
            delete psi.estilo_vida;
          }
          p.psicografia = psi;
        }
        return p;
      };
      if (d.buyer_persona_principal) d.buyer_persona_principal = normalizePersona(d.buyer_persona_principal);
      if (d.buyer_persona_secundario) d.buyer_persona_secundario = normalizePersona(d.buyer_persona_secundario);
      // journey normalization
      const journeyKey = d.journey_de_compra ? 'journey_de_compra' : d.customer_journey ? 'customer_journey' : null;
      if (journeyKey && !d.journey_compra) {
        d.journey_compra = d[journeyKey];
        delete d[journeyKey];
      }
      return d;
    }

    case 'seo_audit': {
      const d = { ...data };
      if (d.score_seo !== undefined && d.score === undefined) {
        d.score = d.score_seo;
        delete d.score_seo;
      }
      if (d.analisis_sitio_cliente && !d.analisis_cliente) {
        d.analisis_cliente = d.analisis_sitio_cliente;
        delete d.analisis_sitio_cliente;
      }
      // analisis_competidores: object → array
      if (d.analisis_competidores && !Array.isArray(d.analisis_competidores) && typeof d.analisis_competidores === 'object') {
        d.analisis_competidores = Object.values(d.analisis_competidores);
      }
      // problemas_detectados → issues
      if (d.problemas_detectados && !d.issues) {
        d.issues = extractStrings(ensureArray(d.problemas_detectados), 'problema');
        delete d.problemas_detectados;
      }
      // acciones_prioritarias → recommendations
      if (d.acciones_prioritarias && !d.recommendations) {
        d.recommendations = extractStrings(ensureArray(d.acciones_prioritarias), 'accion');
        delete d.acciones_prioritarias;
      }
      return d;
    }

    case 'keywords': {
      const d = { ...data };
      // primary_keywords → primary (strings)
      if (d.primary_keywords && !d.primary) {
        d.primary = extractStrings(ensureArray(d.primary_keywords), 'keyword');
        delete d.primary_keywords;
      }
      // longtail_keywords / long_tail_keywords → long_tail
      const ltKey = d.longtail_keywords ? 'longtail_keywords' : d.long_tail_keywords ? 'long_tail_keywords' : null;
      if (ltKey && !d.long_tail) {
        d.long_tail = extractStrings(ensureArray(d[ltKey]), 'keyword');
        delete d[ltKey];
      }
      // negative_keywords: keep rich + add flat
      if (d.negative_keywords && !d.negative) {
        d.negative = extractStrings(ensureArray(d.negative_keywords), 'keyword');
      }
      return d;
    }

    case 'ads_library_analysis': {
      const d = { ...data };
      // creative_concepts normalization
      if (Array.isArray(d.creative_concepts)) {
        d.creative_concepts = d.creative_concepts.map((c: any) => {
          if (!c || typeof c !== 'object') return c;
          const concept = { ...c };
          renameKeys(concept, {
            'primary_copy': 'copy',
            'why_it_works': 'rationale',
          });
          return concept;
        });
      }
      // market_patterns.dominant_content → dominant_content_type
      if (d.market_patterns && typeof d.market_patterns === 'object') {
        const mp = { ...d.market_patterns };
        if (mp.dominant_content && !mp.dominant_content_type) {
          mp.dominant_content_type = mp.dominant_content;
          delete mp.dominant_content;
        }
        d.market_patterns = mp;
      }
      // competitor_analysis → competitor_strategies
      if (d.competitor_analysis && !d.competitor_strategies) {
        d.competitor_strategies = d.competitor_analysis;
        delete d.competitor_analysis;
      }
      return d;
    }

    case 'action_plan': {
      let d = data;
      // If _repair_failed, try to extract from raw_text
      if (d._repair_failed && d.raw_text) {
        try {
          const match = d.raw_text.match(/\[[\s\S]*\]/);
          if (match) d = JSON.parse(match[0]);
        } catch {}
      }
      // Ensure array
      if (d && !Array.isArray(d) && typeof d === 'object' && !d._repair_failed) {
        const vals = Object.values(d);
        if (vals.length > 0 && vals.every((v: any) => typeof v === 'object')) {
          d = vals;
        }
      }
      return d;
    }

    // Pass-through sections (already consistent)
    case 'budget_and_funnel':
    case 'brand_identity':
    case 'financial_analysis':
    case 'positioning_strategy':
    case 'executive_summary':
    default:
      return data;
  }
}

// ── Llamada individual a Claude con prompt caching ──
async function callClaudeOnce(
  baseSystemPrompt: string,
  sectionPrompt: string,
  researchData: string,
  maxTokens: number,
  model: string
): Promise<Record<string, unknown>> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: baseSystemPrompt,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `${sectionPrompt}\nResponde SOLO JSON válido sin markdown.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Aquí están los datos de research del sitio web del cliente y sus competidores. Analízalos a fondo:\n\n`,
            },
            {
              type: "text",
              text: researchData,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `\n\nResponde ÚNICAMENTE con JSON válido. Sin markdown, sin backticks, sin texto antes o después del JSON.`,
            },
          ],
        },
      ],
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!res.ok) {
    const errorBody = await res.text();
    const status = res.status;
    const err = new Error(`Claude API error ${status}: ${errorBody}`) as any;
    err.statusCode = status;
    throw err;
  }

  const data: any = await res.json();
  const usage = data.usage || {};
  const cached = usage.cache_read_input_tokens || 0;
  const stopReason = data.stop_reason || 'unknown';
  const text = data.content?.[0]?.text ?? "{}";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  console.log(`[callClaude] ${model} OK — output: ${text.length} chars, cached: ${cached} tokens, stop: ${stopReason}`);

  if (stopReason === 'max_tokens') {
    console.warn(`[callClaude] Response truncated (max_tokens reached). Attempting JSON repair...`);
    return repairTruncatedJson(cleaned);
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.warn(`[callClaude] JSON parse failed, attempting repair: ${(parseError as Error).message}`);
    return repairTruncatedJson(cleaned);
  }
}

// ── Retry con backoff exponencial ──
async function callClaude(
  baseSystemPrompt: string,
  sectionPrompt: string,
  researchData: string,
  maxTokens: number = 2500,
  model: string = 'claude-opus-4-6'
): Promise<Record<string, unknown>> {
  const MAX_RETRIES = 2;
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // 5s, 10s
        console.log(`[callClaude] Retry ${attempt}/${MAX_RETRIES} for ${model} after ${backoff}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
      const result = await callClaudeOnce(baseSystemPrompt, sectionPrompt, researchData, maxTokens, model);

      // If JSON repair failed, retry once with more tokens
      if ((result as any)._repair_failed && attempt < MAX_RETRIES) {
        const boostedTokens = Math.min(maxTokens + 8000, 32000);
        console.warn(`[callClaude] _repair_failed detected, retrying with ${boostedTokens} tokens (was ${maxTokens})`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const retryResult = await callClaudeOnce(baseSystemPrompt, sectionPrompt, researchData, boostedTokens, model);
        if (!(retryResult as any)._repair_failed) {
          console.log(`[callClaude] Retry with boosted tokens succeeded!`);
          return retryResult;
        }
        console.warn(`[callClaude] Retry with boosted tokens also failed, returning partial data`);
        return retryResult;
      }

      return result;
    } catch (error: any) {
      lastError = error;
      const code = error.statusCode || 0;
      // Retry on rate limit (429), overloaded (529), timeout, or server error (500+)
      const isRetryable = code === 429 || code === 529 || code >= 500 || error.name === 'AbortError';
      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error(`[callClaude] ${model} FAILED (attempt ${attempt + 1}): ${error.message}`);
        throw error;
      }
      console.warn(`[callClaude] ${model} retryable error (${code || 'timeout'}), will retry...`);
    }
  }
  throw lastError;
}

export async function analyzeBrandStrategy(c: Context) {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return c.json({ error: 'AI not configured' }, 500);
    }

    const supabase = getSupabaseAdmin();

    const { client_id, research, fase_negocio, presupuesto_ads } = await c.req.json();

    if (!client_id || !research) {
      return c.json({ error: 'Missing client_id or research data' }, 400);
    }

    const { websiteContent, competitorContents, clientProvidedUrls, numUserProvided: researchNumUserProvided, brandContext, clientName, clientCompany, websiteUrl } = research;

    // Fetch knowledge base
    const [{ data: knowledge }, { data: bugs }] = await Promise.all([
      supabase.from('steve_knowledge').select('id, categoria, titulo, contenido')
        .in('categoria', ['meta_ads', 'brief', 'anuncios', 'google', 'seo', 'shopify', 'klaviyo'])
        .eq('activo', true)
        .eq('approval_status', 'approved')
        .order('orden', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('steve_bugs').select('categoria, descripcion, ejemplo_malo, ejemplo_bueno').eq('activo', true).limit(5),
    ]);

    const absRuleIds = (knowledge || []).map((k: any) => k.id).filter(Boolean);
    if (absRuleIds.length > 0) {
      supabase.from('qa_log').insert({ check_type: 'knowledge_injection', status: 'info', details: JSON.stringify({ source: 'analyze-brand-strategy', rule_count: absRuleIds.length, rule_ids: absRuleIds }), detected_by: 'analyze-brand-strategy' }).then(({ error }: any) => { if (error) console.error('[analyze-brand] qa_log:', error.message); });
    }
    const knowledgeContext = knowledge?.map((k: any) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const bugsContext = bugs?.map((b: any) =>
      `❌ EVITAR: ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`
    ).join('\n\n') || '';

    const phaseSection = fase_negocio ? `\nFASE: ${fase_negocio} | PRESUPUESTO: ${presupuesto_ads || 'N/A'} CLP` : '';

    // Build structured research data with client + 6 competitors
    // Use numUserProvided from research payload to correctly split user vs AI-detected
    const numUserProvided = researchNumUserProvided ?? clientProvidedUrls?.length ?? 0;
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

    // ══════════════════════════════════════════════════════════════
    //  INPUT SELECTIVO + 2 OLEADAS INTELIGENTES + RETRY + PROMPT CACHING
    // ══════════════════════════════════════════════════════════════

    // Build scoped research payloads — each section gets ONLY what it needs
    const clientOnlyData = {
      client: researchData.client,
    };
    const clientAndCompetitorsData = {
      client: { ...researchData.client, brief: undefined }, // No brief for these — just scraping
      user_competitors: userCompetitors,
      auto_competitors: autoCompetitors,
    };
    // 'all' scope gets everything
    const scopedResearch: Record<string, string> = {
      client_only: JSON.stringify(clientOnlyData).slice(0, 30_000),
      client_and_competitors: JSON.stringify(clientAndCompetitorsData).slice(0, 60_000),
      all: JSON.stringify(researchData).slice(0, 80_000),
    };

    console.log(`[analyze-brand-strategy] Research sizes — client_only: ${scopedResearch.client_only.length}, client_and_competitors: ${scopedResearch.client_and_competitors.length}, all: ${scopedResearch.all.length}`);

    // Update progress
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: 'Generando tu estrategia de marketing...', pct: 60, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );

    // Include client financial data in context for all sections
    const clientFinancials = researchData.client?.brief ? (() => {
      const brief = typeof researchData.client.brief === 'string' ? researchData.client.brief : JSON.stringify(researchData.client.brief);
      const priceMatch = brief.match(/(?:precio|ticket|venta)[^$\d]*[\$]?\s*([\d.,]+)/i);
      const costMatch = brief.match(/(?:costo|cost)[^$\d]*[\$]?\s*([\d.,]+)/i);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
      const cost = costMatch ? parseFloat(costMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
      const margin = price > 0 ? price - cost : 0;
      const marginPct = price > 0 ? ((margin / price) * 100).toFixed(1) : '0';
      const cpaMax = margin > 0 ? (margin * 0.3).toFixed(0) : '0';
      return price > 0 ? `\nDATOS FINANCIEROS DEL CLIENTE: Precio promedio: $${price} CLP, Costo: $${cost} CLP, Margen bruto: $${margin} CLP (${marginPct}%), CPA máximo viable: $${cpaMax} CLP` : '';
    })() : '';
    const budgetContext = presupuesto_ads ? `\nPRESUPUESTO MENSUAL ADS: ${presupuesto_ads}` : '';

    const fullSystemBase = `Eres un estratega senior de marketing digital con 15+ años de experiencia en e-commerce LATAM. Tu análisis debe ser de nivel McKinsey/BCG — datos concretos, cálculos reales, recomendaciones específicas.\n\nREGLA DE PRIORIDAD: Si hay conflicto entre reglas, priorizar las de orden más alto (más recientes). Las reglas con orden 99 son las más actualizadas y deben prevalecer.\n\nREGLA CRÍTICA DE REDACCIÓN: NUNCA copies texto del cliente verbatim. Reescribe TODO en tercera persona profesional. Transforma respuestas coloquiales en análisis estratégico. NO uses placeholders como [X] o N/D — calcula o estima con los datos disponibles.${clientFinancials}${budgetContext}\n${knowledgeContext ? `\nREGLAS APRENDIDAS (aplicar obligatoriamente):\n${knowledgeContext}` : ''}${bugsContext ? `\nERRORES A EVITAR:\n${bugsContext}` : ''}${phaseSection}`;

    // ── Helper: ejecutar sección con guardado progresivo ──
    let completedCount = 0;
    const totalSections = SECTIONS.length;

    async function runSection(section: typeof SECTIONS[number]) {
      const sectionModel = (section as any).model || 'claude-opus-4-6';
      const scope = (section as any).dataScope || 'all';
      const sectionResearchInput = scopedResearch[scope] || scopedResearch.all;

      const data = await callClaude(
        fullSystemBase,
        section.prompt,
        sectionResearchInput,
        section.maxTokens,
        sectionModel
      );

      // Guardado progresivo
      completedCount++;
      for (const key of section.keys) {
        const rawValue = data[key] || (section.keys.length === 1 ? data : null);
        if (rawValue) {
          // Normalizar keys canónicas ANTES de guardar
          const normalized = normalizeSection(key, rawValue);
          // Actualizar data con la versión normalizada para consolidación posterior
          if (data[key]) data[key] = normalized;
          const sectionResearchData = key === 'executive_summary'
            ? { summary: typeof normalized === 'string' ? (normalized as string).slice(0, 12000) : JSON.stringify(normalized).slice(0, 4000), ...((typeof normalized === 'object' && normalized !== null) ? normalized as Record<string, unknown> : {}) }
            : normalized;
          await supabase.from('brand_research').upsert(
            { client_id, research_type: key, research_data: sectionResearchData },
            { onConflict: 'client_id,research_type' }
          ).then(({ error }) => {
            if (error) console.error(`[progressive-save] Failed ${key}:`, error.message);
            else console.log(`[progressive-save] Saved ${key} (${completedCount}/${totalSections})`);
          });
        }
      }
      // Update progress
      const pct = Math.min(60 + Math.round((completedCount / totalSections) * 38), 98);
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_progress', research_data: { step: 'ia', detail: `${completedCount}/${totalSections} secciones listas (${section.id})`, pct, ts: new Date().toISOString() } },
        { onConflict: 'client_id,research_type' }
      );
      return { sectionId: section.id, keys: section.keys, data };
    }

    // ── 2 oleadas inteligentes ──
    // Oleada 1: 4 Sonnet (rapidas) + 2 Opus ligeros = 6 llamadas
    // Oleada 2: 6 Opus pesados (con todo el output TPM disponible)
    const wave1Ids = ['executive_summary', 'brand_identity', 'financial_analysis', 'consumer_profile', 'competitive_analysis', 'positioning_strategy'];
    const wave1Sections = SECTIONS.filter(s => wave1Ids.includes(s.id));
    const wave2Sections = SECTIONS.filter(s => !wave1Ids.includes(s.id));

    console.log(`[analyze-brand-strategy] Wave 1 (${wave1Sections.length}): ${wave1Sections.map(s => `${s.id}[${(s as any).model || 'opus'}]`).join(', ')}`);
    const results1 = await Promise.allSettled(wave1Sections.map(runSection));

    // Breve pausa para asegurar que el output TPM se resetee
    console.log(`[analyze-brand-strategy] Wave 1 done (${completedCount}/${totalSections}). 2s pause...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`[analyze-brand-strategy] Wave 2 (${wave2Sections.length}): ${wave2Sections.map(s => s.id).join(', ')}`);
    const results2 = await Promise.allSettled(wave2Sections.map(runSection));

    const results = [...results1, ...results2];
    // Rebuild section mapping for results
    const allSectionsOrdered = [...wave1Sections, ...wave2Sections];
    console.log(`[analyze-brand-strategy] All ${totalSections} sections complete.`);

    // Log detallado de cada resultado
    for (let i = 0; i < results.length; i++) {
      const section = allSectionsOrdered[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        const keys = Object.keys(result.value.data || {});
        console.log(`[analyze-brand-strategy] Section "${section.id}" OK — keys: [${keys.join(', ')}]`);
      } else {
        console.log(`[analyze-brand-strategy] Section "${section.id}" FAILED — error: ${result.reason?.message || result.reason}`);
      }
    }

    // Log resumen
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;
    console.log(`[analyze-brand-strategy] SUMMARY: ${fulfilled}/12 OK, ${rejected}/12 FAILED`);

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
        // Si Claude respondió sin wrapper (el JSON directo sin la key), normalizar y asignar
        if (keys.length === 1 && !data[keys[0]]) {
          finalBrief[keys[0]] = normalizeSection(keys[0], data);
          completedSections.push(keys[0]);
        }
      } else {
        const sectionIndex = results.indexOf(result);
        const section = allSectionsOrdered[sectionIndex];
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

    // Secciones ya guardadas progresivamente en el .then() de cada llamada
    // Solo guardamos las que fallaron en el guardado progresivo (fallback)
    for (const key of completedSections) {
      const { data: existing } = await supabase.from('brand_research')
        .select('id').eq('client_id', client_id).eq('research_type', key).maybeSingle();
      if (!existing) {
        const value = finalBrief[key];
        const sectionResearchData = key === 'executive_summary'
          ? { summary: typeof value === 'string' ? (value as string).slice(0, 12000) : JSON.stringify(value).slice(0, 4000), ...((typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}) }
          : value;
        await supabase.from('brand_research').upsert(
          { client_id, research_type: key, research_data: sectionResearchData },
          { onConflict: 'client_id,research_type' }
        );
        console.log(`[fallback-save] Saved ${key} (was missing from progressive save)`);
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

    console.log(`[analyze-brand-strategy] Complete for client ${client_id} (status=${status}, saved=${completedSections.length}/12)`);

    return c.json({ success: true, status, data: finalBrief, completed_sections: completedSections, failed_sections: failedSections, errors });

  } catch (error: any) {
    console.error('analyze-brand-strategy error:', error);
    try {
      const supabase = getSupabaseAdmin();
      const body = await c.req.text().catch(() => '{}');
      const clientId = JSON.parse(body)?.client_id;
      if (clientId) {
        await supabase.from('brand_research').upsert(
          { client_id: clientId, research_type: 'analysis_status', research_data: { status: 'error', error: String(error) } },
          { onConflict: 'client_id,research_type' }
        );
      }
    } catch (statusErr) {
      console.error('[analyze-brand-strategy] Failed to save error status:', statusErr);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
}
