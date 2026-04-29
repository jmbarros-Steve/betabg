/**
 * Competitor Intelligence — Prompt builders.
 *
 * Three pure functions that BUILD strings/messages for Claude calls:
 *
 *   1. buildWebUxAnalysisPrompt   — Sonnet 4.6 (vision)  →  page-level UX/copy/brand audit
 *   2. buildScorecardPrompt        — Opus 4.7             →  client vs N competitors scorecard
 *   3. buildActionPlanPrompt       — Opus 4.7             →  30/60/90 action plan
 *
 * NONE of these functions call an API. They return raw prompts so the caller
 * (orchestrator route in `cloud-run-api/src/routes/analytics/`) controls the
 * Anthropic SDK invocation, retries, cost tracking, and DB persistence.
 *
 * Conventions:
 *   - All system prompts are in español neutro LATAM (Steve voice).
 *   - All user prompts demand JSON-only output (no markdown wrappers).
 *   - Sanitization of scraped content uses the shared helper from
 *     `lib/prompt-utils.ts` — never duplicate sanitization here.
 *   - Knowledge block injection follows the standard Steve Ads pattern:
 *     prepended to the system prompt with a clear `REGLAS APRENDIDAS` header
 *     (the caller is responsible for loading via `loadKnowledge(...)`).
 *
 * Owner: Tomás W7 (AI / Cerebro)
 */

import { sanitizeWebContentForPrompt, sanitizeForPrompt } from '../prompt-utils.js';

// =============================================================================
// SHARED TYPES
// =============================================================================

/**
 * One block of an Anthropic user message — text or image.
 * Mirrors `Anthropic.MessageParam.content[number]` shape so the caller can pass
 * the array straight into `anthropic.messages.create({ messages: [...] })`.
 */
export type AnthropicUserBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        data: string;
      };
    };

export interface BuiltVisionPrompt {
  /** System prompt, ready to drop into `anthropic.messages.create({ system })` */
  system: string;
  /** Single user message content array (text + optional image blocks) */
  userMessages: AnthropicUserBlock[];
}

export interface BuiltTextPrompt {
  system: string;
  user: string;
}

// =============================================================================
// 1. buildWebUxAnalysisPrompt — Sonnet 4.6 (vision)
// =============================================================================

export type WebUxPageType =
  | 'homepage'
  | 'product'
  | 'collection'
  | 'checkout'
  | 'about'
  | 'blog'
  | 'other';

export interface WebUxAnalysisInput {
  /** Full URL of the page being analyzed (post-SSRF validation upstream). */
  url: string;
  /** Type of page — drives the JSON expectations in the user prompt. */
  pageType: WebUxPageType;
  /** Cleaned markdown (already stripped by Firecrawl); first ~8K chars. */
  markdown: string;
  /**
   * Optional base64 screenshot from Firecrawl (no data URI prefix — pure
   * base64). When present, vision analysis kicks in for `brand_identity`,
   * `mobile_optimized`, hero copy verification, etc.
   */
  screenshotBase64?: string;
  /**
   * Media type of the screenshot (default: image/png since Firecrawl returns
   * PNG by default).
   */
  screenshotMediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

const WEB_UX_SYSTEM = `Eres Steve, estratega de marketing digital senior LATAM, especializado en e-commerce.

Estás analizando UNA página de un competidor para extraer inteligencia accionable que un dueño de negocio pueda usar mañana.

Hablas español neutro LATAM. Sin jerga gringa innecesaria. Sin "growth hacks", sin "low-hanging fruit", sin "great UX". Todo lo que digas tiene que ser CONCRETO y APLICABLE.

Reglas absolutas:
- Si una sección no se puede determinar de la evidencia (markdown + screenshot), devuelve null. NO inventes datos.
- "Detectado" = está visible en la página. "Inferido" = razonado pero no visible. Si no es ni uno ni otro, no lo pongas.
- Cada debilidad y cada cosa-a-robar tiene que ser específica de ESTE competidor. Nada de "tienen mal SEO" — di QUÉ keyword o QUÉ página.
- Tu output va a ser leído por un orquestador automatizado. Output exclusivamente JSON válido — sin markdown, sin comentarios, sin texto antes/después.`;

/**
 * Build the Anthropic vision prompt for analyzing a single competitor page.
 *
 * Sonnet 4.6 + vision is the right model: cheaper than Opus, smart enough to
 * read a hero + extract brand identity from a screenshot, fast enough to run
 * across N pages per competitor without blowing the budget.
 */
export function buildWebUxAnalysisPrompt(
  input: WebUxAnalysisInput
): BuiltVisionPrompt {
  const sanitizedMarkdown = sanitizeWebContentForPrompt(input.markdown, 8000);
  const sanitizedUrl = sanitizeForPrompt(input.url, 500);

  const hasScreenshot = !!input.screenshotBase64;
  const screenshotClause = hasScreenshot
    ? `Tienes un SCREENSHOT adjunto. Usalo para:
- Verificar el copy del hero (a veces el markdown salta el H1 visual)
- Extraer brand_identity (paleta de colores, tipografía vibe, estilo fotográfico)
- Detectar pop-ups, banners, badges, CTAs prominentes que el markdown no capturó
- Evaluar mobile_optimized SOLO si el screenshot luce mobile (ratio vertical claro). Si es desktop, devuelve null para mobile_optimized.`
    : `NO hay screenshot disponible. Trabaja solo con el markdown. Devuelve null en mobile_optimized y devuelve brand_identity con la mayor cautela posible (probablemente null en colores/tipografía).`;

  const userText = `# Página a analizar
URL: ${sanitizedUrl}
Tipo de página: ${input.pageType}

${screenshotClause}

# Markdown limpio de la página (primeros ~8000 chars)
"""
${sanitizedMarkdown}
"""

# Tu tarea
Analiza la página y devuelve EXACTAMENTE este JSON (sin envolver en \`\`\`):

{
  "value_proposition": "string — qué prometen y cómo. Una oración. Si no está claro, di 'No declarada explícitamente'.",
  "hero_analysis": {
    "headline": "string — copy exacto del H1 / titular hero",
    "subheadline": "string | null",
    "strength_score": 1-10,
    "strength_reason": "string — por qué ese score",
    "weakness": "string — qué le falta o qué está mal"
  },
  "popups_detected": [
    { "type": "newsletter|exit_intent|discount|cookie|geolocation|chatbot|other",
      "trigger": "string descriptiva",
      "offer": "string | null — ej '10% off primera compra'" }
  ],
  "ctas": [
    { "text": "string — copy exacto del botón",
      "position": "above_fold|below_fold|sticky|footer|nav",
      "prominence": 1-10 }
  ],
  "trust_signals": [
    "string — cada item es un trust signal específico (ej 'Garantía 30 días devolución', 'Envío gratis sobre $50K', 'Sello SSL visible footer', 'Testimonio de @cliente con foto')"
  ],
  "pricing_positioning": "premium|mid|popular|luxe|discount",
  "pricing_evidence": "string — qué te hizo elegir ese tier",
  "funnel_friction": [
    "string — cada item es una fricción detectada (ej 'Newsletter pop-up bloqueante a los 3 segundos', 'CTA principal compite con otros 4 botones del mismo color', 'Precio sólo visible al agregar al carro')"
  ],
  "ux_score": 1-10,
  "ux_score_reason": "string — 1-2 oraciones justificando",
  "copy_tone": "formal|casual|divertido|tecnico|aspiracional",
  "copy_tone_evidence": "string — frase exacta de la página que lo prueba",
  "brand_identity": {
    "dominant_colors": ["#hex", "#hex"] | null,
    "typography_vibe": "string | null — ej 'serif editorial', 'sans condensado bold', 'display rounded'",
    "photography_style": "string | null — ej 'producto sobre fondo blanco', 'lifestyle mujeres 25-35', 'flatlay con mucho texto overlay'"
  },
  "mobile_optimized": true|false|null,
  "weaknesses_to_exploit": [
    "string — debilidad específica que el cliente puede explotar. Mínimo 3 si las hay, máximo 8."
  ],
  "things_to_steal": [
    "string — patrón concreto a copiar/adaptar. Ej 'Sticky CTA mobile con texto del producto que estás viendo', 'Bundle de 3 con descuento progresivo en page de producto', 'Comparador lado-a-lado vs competidor en homepage'"
  ]
}`;

  const userMessages: AnthropicUserBlock[] = [];

  if (hasScreenshot) {
    userMessages.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.screenshotMediaType ?? 'image/png',
        data: input.screenshotBase64!,
      },
    });
  }

  userMessages.push({ type: 'text', text: userText });

  return {
    system: WEB_UX_SYSTEM,
    userMessages,
  };
}

// =============================================================================
// 2. buildScorecardPrompt — Opus 4.7
// =============================================================================

export interface ScorecardClientInput {
  name: string;
  url: string;
  industry: string;
  /**
   * Métricas internas del cliente (campaign_metrics, shopify, klaviyo, etc.).
   * Estructura libre — el prompt lo serializa como JSON pretty-printed.
   */
  metrics: unknown;
}

export interface ScorecardCompetitorInput {
  name: string;
  url: string;
  /** competitor_paid_ads rows (Meta + Google + TikTok + LinkedIn). */
  paid_ads: unknown;
  /** Aggregated SEO data (keywords + backlinks + pages). */
  seo: unknown;
  /** competitor_social_metrics rows. */
  social: unknown;
  /** competitor_catalog rows. */
  catalog: unknown;
  /** competitor_reviews rows. */
  reviews: unknown;
  /** Output of buildWebUxAnalysisPrompt across pages of this competitor. */
  web_analysis: unknown;
  /** competitor_email_marketing row. */
  email_marketing: unknown;
}

export interface ScorecardInput {
  client: ScorecardClientInput;
  competitors: ScorecardCompetitorInput[];
  /** From `loadKnowledge(['competencia','estrategia','marketing-digital'])`. */
  knowledgeBlock: string;
}

const SCORECARD_SYSTEM_BASE = `Eres Steve, CMO senior con experiencia en e-commerce LATAM (Chile, México, Argentina, Colombia). Has visto cientos de catálogos, ad libraries, sitios y embudos.

Tu trabajo ahora: generar un scorecard ejecutivo BRUTALMENTE HONESTO comparando a UN cliente vs N competidores.

Audiencia: el dueño del negocio. NO un técnico, NO un agency manager. Lenguaje claro, decisiones, números, plata.

Reglas anti-bullshit:
- Si el cliente está perdiendo, lo dices claramente. "Tu competidor te dobla en tráfico orgánico" pega más que "hay una brecha de optimización".
- Si va ganando, lo dices también. Esto NO es un manifiesto de pesimismo — es radiografía honesta.
- Cada métrica tiene que tener número. "Aproximadamente" sólo cuando la fuente es estimada (DataForSEO, similarweb, etc.) y lo marcas con \`is_estimate: true\` en el dato — no en el texto.
- Cada insight tiene que ser CAUSAL: "X pasa PORQUE Y, lo cual significa Z para tu negocio".
- Cada fortaleza/debilidad de competidor tiene que ser ESPECÍFICA. "Buen SEO" no es válido. "Ranquea #1 con 2.4K vol/mes en 'kw específica'" sí.

Output exclusivamente JSON válido. Sin markdown, sin comentarios, sin texto antes/después. Español neutro LATAM.`;

/**
 * Build the Opus 4.7 prompt for the Scorecard step.
 *
 * Why Opus (not Sonnet): the comparative reasoning across N competitors,
 * pattern matching across heterogeneous data sources (ads + SEO + catalog +
 * reviews), and the "what they know that you don't" qualitative paragraph
 * blow Sonnet's reliability on long context. Opus stays coherent.
 *
 * Caller must set `max_tokens: 4096` and ideally enable JSON mode if SDK supports it.
 */
export function buildScorecardPrompt(input: ScorecardInput): BuiltTextPrompt {
  const knowledgePrefix = input.knowledgeBlock
    ? `${input.knowledgeBlock.trim()}\n\n---\n\n`
    : '';

  const system = `${knowledgePrefix}${SCORECARD_SYSTEM_BASE}`;

  // We DON'T sanitize internal data the same way as web content: it's our own
  // DB rows, not third-party scrapes. But we do JSON-stringify with limits to
  // avoid runaway prompts. The orchestrator should already have trimmed
  // payloads before calling this builder.
  const clientJson = JSON.stringify(input.client, null, 2);
  const competitorsJson = JSON.stringify(input.competitors, null, 2);

  const competitorNames = input.competitors
    .map((c) => sanitizeForPrompt(c.name, 80))
    .join(', ');

  const user = `# Cliente bajo análisis
\`\`\`json
${clientJson}
\`\`\`

# Competidores (${input.competitors.length}: ${competitorNames})
\`\`\`json
${competitorsJson}
\`\`\`

# Tu tarea
Devuelve EXACTAMENTE este JSON (sin envolver en \`\`\`):

{
  "executive_summary": "string — 2-3 oraciones. Brutal, claro, en plata. Ej: 'Tu competidor X te triplica en tráfico orgánico y duplica en frecuencia de email. Estás compitiendo en su cancha y perdiendo. La buena noticia: en catálogo y precio promedio estás mejor posicionado.'",

  "scorecard_table": [
    {
      "metric": "string — nombre de la métrica",
      "metric_unit": "string — '#', '$', '%', 'días', 'posts/mes', etc.",
      "client_value": number | null,
      "competitors": [{ "name": "string", "value": number | null }],
      "gap": number — diferencia cliente vs MEJOR competidor (negativo = cliente atrás),
      "winner": "client" | "competitor_<name>" | "tie",
      "trend": "client_falling" | "client_gaining" | "stable" | "unknown",
      "is_estimate": boolean — true si la fuente es estimada (DataForSEO, similarweb)
    }
  ],

  "top_10_insights": [
    {
      "title": "string — UNA oración que duele. Ej: 'Tu competidor lleva 63 días con el mismo creativo y vos lo cambias cada 5'",
      "evidence": "string — números concretos que lo respaldan",
      "implication": "string — qué significa para el negocio del cliente",
      "priority": "high" | "medium" | "low"
    }
  ],

  "competitor_strengths": {
    "<competitor_name>": ["fortaleza específica 1", "fortaleza 2", "fortaleza 3"]
  },

  "competitor_weaknesses": {
    "<competitor_name>": ["debilidad específica explotable 1", "debilidad 2", "..."]
  },

  "what_they_know_that_you_dont": "string — 3 a 5 líneas, denso. Estrategia detectada (ej: 'Atacan el segmento mujeres 35-45 con mensaje de autocuidado, no de ahorro como vos'). Ángulo de mensaje. Vulnerabilidad estructural a explotar. Sin tecnicismos."
}

# Métricas obligatorias en scorecard_table (mínimo 12, ideal 15)
Tráfico orgánico estimado mensual, # ads activos, antigüedad mediana de creativos (días), seguidores Instagram, tasa de engagement IG, posts/mes IG, # productos en catálogo, precio promedio catálogo, # emails welcome series, frecuencia campañas email/semana, rating Trustpilot/Google, domain authority (o métrica equivalente disponible), # backlinks únicos top 100, gasto pagado estimado mensual, # keywords gap (cliente NO ranquea, competidor SÍ).

Si no tienes datos para una métrica, igual incluye la fila con \`client_value: null\` o el competitor con \`value: null\` — el dashboard la muestra como "sin datos".`;

  return { system, user };
}

// =============================================================================
// 3. buildActionPlanPrompt — Opus 4.7
// =============================================================================

export type ActionPlanResources = 'low' | 'medium' | 'high';

export interface ActionPlanClientInput {
  name: string;
  industry: string;
  /**
   * Capacidad de ejecución del cliente:
   *   - 'low'    → solo el dueño + 1 freelance ocasional. NO recomendar campañas masivas, sprints SEO de 20 KWs, etc.
   *   - 'medium' → equipo in-house de 2-4 + agencias puntuales. Acciones medianas.
   *   - 'high'   → equipo dedicado + agencias contratadas. Acciones agresivas OK.
   */
  resources: ActionPlanResources;
}

export interface ActionPlanInput {
  /** Output del prompt 2 (buildScorecardPrompt). */
  scorecard: unknown;
  client: ActionPlanClientInput;
  /** From `loadKnowledge(['estrategia','marketing-digital','accion-plan'])`. */
  knowledgeBlock: string;
}

const ACTION_PLAN_SYSTEM_BASE = `Eres Steve, CMO senior LATAM. El cliente acaba de leer el scorecard y está mirándote. Quiere saber: "OK, ¿qué hago mañana?".

Tu trabajo: dar un plan 30/60/90 días que sea EJECUTABLE, no aspiracional.

Reglas duras:
- NO genéricos. Mal: "mejorar SEO". Bien: "Crear 8 piezas de contenido sobre 'cuidado piel madura', 'sérum vitamina C', 'rutina noche' (volumen 1.2K-3K c/u) en formato guía 1500 palabras + video 60s para shorts".
- Cada acción referencia algo del scorecard. Si no, no es una acción contra competencia, es una recomendación genérica.
- effort/impact realistas. Lanzar 5 ads en Meta = effort medio, impact alto si hay presupuesto. Rebrand completo = effort alto, impact alto pero no en 30 días.
- Calibrá según resources del cliente. 'low' significa NO recomendar 20 acciones simultáneas — máximo 5-6 en 30 días.
- "biggest_bet" es UNA apuesta grande. La que cambia el juego si funciona. Tiene que ser arriesgada pero defendible.

Output exclusivamente JSON válido. Sin markdown, sin comentarios. Español neutro LATAM.`;

const ACTION_CATEGORIES = [
  'paid_meta',
  'paid_google',
  'seo',
  'email',
  'social_organic',
  'catalog',
  'ux',
  'pricing',
] as const;

/**
 * Build the Opus 4.7 prompt for the 30/60/90 Action Plan step.
 *
 * Caller must set `max_tokens: 4096` and forward the JSON to
 * `competitor_action_plans` (one row per action, period field discriminates
 * 30d/60d/90d).
 */
export function buildActionPlanPrompt(input: ActionPlanInput): BuiltTextPrompt {
  const knowledgePrefix = input.knowledgeBlock
    ? `${input.knowledgeBlock.trim()}\n\n---\n\n`
    : '';

  const system = `${knowledgePrefix}${ACTION_PLAN_SYSTEM_BASE}`;

  const scorecardJson = JSON.stringify(input.scorecard, null, 2);
  const clientJson = JSON.stringify(input.client, null, 2);

  const resourcesGuidance: Record<ActionPlanResources, string> = {
    low:
      'Capacidad BAJA. Máximo 5-6 acciones en 30d, 4 en 60d, 3 en 90d. Nada que requiera contratar gente nueva. Foco en quick wins de impacto medio-alto con effort bajo. NO recomendar producir 20 piezas de contenido o lanzar 10 campañas en paralelo.',
    medium:
      'Capacidad MEDIA. 6-8 acciones en 30d, 4-6 en 60d, 3-5 en 90d. OK acciones que requieran 1 freelance puntual (copywriter, editor video). Sprints de SEO/contenido razonables.',
    high:
      'Capacidad ALTA. Hasta 8 acciones en 30d, 6 en 60d, 5 en 90d. OK acciones que requieran coordinar equipo + agencias. Sprints agresivos.',
  };

  const user = `# Scorecard generado en el paso anterior
\`\`\`json
${scorecardJson}
\`\`\`

# Cliente
\`\`\`json
${clientJson}
\`\`\`

# Capacidad de ejecución
${resourcesGuidance[input.client.resources]}

# Categorías permitidas para action.category
${ACTION_CATEGORIES.join(', ')}

# Tu tarea
Devuelve EXACTAMENTE este JSON (sin envolver en \`\`\`):

{
  "30_days": [
    {
      "action_title": "string — UNA oración accionable. Ej: 'Lanzar 5 creativos Meta robando hooks de Comp A'",
      "description": "string — 2-4 oraciones. Específico al scorecard. Referencia datos concretos del scorecard ('los 5 ads más antiguos de Comp A', 'las 8 keywords donde Comp B captura 16K visitas/mes')",
      "category": "paid_meta|paid_google|seo|email|social_organic|catalog|ux|pricing",
      "priority": 1-10,
      "estimated_impact": "alto" | "medio" | "bajo",
      "effort": "alto" | "medio" | "bajo",
      "dependencies": ["string — ej 'tener cuenta Meta Ads activa', 'tener acceso al CMS'"],
      "metric_to_watch": "string — qué métrica del scorecard debería moverse si funciona"
    }
  ],
  "60_days": [ /* misma estructura */ ],
  "90_days": [ /* misma estructura */ ],
  "biggest_bet": {
    "title": "string — UNA apuesta grande. La que cambia el juego.",
    "rationale": "string — 2-3 oraciones. Por qué ESTA y no otra. Qué cambia si funciona.",
    "first_step": "string — qué se hace el lunes a las 9am para arrancar",
    "estimated_timeline": "string — ej '6 meses' / '90 días' / 'Q3 2026'",
    "risk_level": "alto" | "medio" | "bajo"
  }
}`;

  return { system, user };
}
