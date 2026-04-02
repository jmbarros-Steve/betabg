/**
 * Steve Product Catalog — Single source of truth for ALL features Steve can sell.
 * Used by steve-wa-brain.ts to inject product knowledge into the sales prompt.
 * Prices sourced from src/lib/plan-features.ts (PLAN_INFO).
 */

// ---------------------------------------------------------------------------
// Plan Pricing (CLP)
// ---------------------------------------------------------------------------

export interface PlanPricing {
  slug: string;
  nombre: string;
  precioNormal: number;
  precioLanzamiento: number;
  tagline: string;
}

export const PLANES: PlanPricing[] = [
  {
    slug: 'visual',
    nombre: 'Visual',
    precioNormal: 49_990,
    precioLanzamiento: 24_995,
    tagline: 'Ve tus datos en un solo lugar',
  },
  {
    slug: 'estrategia',
    nombre: 'Estrategia',
    precioNormal: 99_990,
    precioLanzamiento: 49_995,
    tagline: 'Ve + Inteligencia de Steve IA + análisis estratégico',
  },
  {
    slug: 'full',
    nombre: 'Full',
    precioNormal: 199_990,
    precioLanzamiento: 99_995,
    tagline: 'Ve + Estrategia + Crea y Ejecuta campañas',
  },
];

// ---------------------------------------------------------------------------
// Feature Modules
// ---------------------------------------------------------------------------

export interface FeatureModule {
  nombre: string;
  descripcion: string;
  planMinimo: string;
  highlights: string[];
}

export const MODULOS: FeatureModule[] = [
  {
    nombre: 'Dashboard de Métricas',
    descripcion: 'Todas tus métricas de Shopify, Meta, Google y Klaviyo en un solo panel. Sync automático cada 6 horas.',
    planMinimo: 'Visual',
    highlights: [
      'Ventas, ROAS, CPA, CTR, AOV en tiempo real',
      'Comparación por período',
      'Reportes semanales automáticos por email',
    ],
  },
  {
    nombre: 'Steve AI Chat',
    descripcion: 'Consultor de marketing AI disponible 24/7 por WhatsApp y en la plataforma. Responde preguntas sobre tus datos reales.',
    planMinimo: 'Visual',
    highlights: [
      'Consultas sobre métricas, campañas y productos',
      'Análisis de marca y brand research (plan Estrategia+)',
      'Ejecutar acciones directamente desde el chat (plan Full)',
    ],
  },
  {
    nombre: 'Meta Ads Manager',
    descripcion: 'Gestiona campañas de Facebook e Instagram Ads desde Steve. Crea audiencias, monitorea pixel, optimiza automáticamente.',
    planMinimo: 'Visual (ver) / Full (crear)',
    highlights: [
      'Ver campañas y métricas',
      'Análisis de rendimiento con IA (plan Estrategia+)',
      'Crear, editar y optimizar campañas (plan Full)',
      'Audiencias lookalike y custom',
      'Social Inbox (responder comentarios de ads)',
    ],
  },
  {
    nombre: 'Google Ads',
    descripcion: 'Conecta Google Ads y monitorea campañas de Search, Display y Shopping.',
    planMinimo: 'Visual (ver) / Full (crear)',
    highlights: [
      'Ver campañas y métricas',
      'Análisis de rendimiento IA (plan Estrategia+)',
      'Crear y editar campañas (plan Full)',
    ],
  },
  {
    nombre: 'Shopify Analytics',
    descripcion: 'Vista completa de tu tienda Shopify: productos, órdenes, ventas en tiempo real, cross-sell automático.',
    planMinimo: 'Visual',
    highlights: [
      'Productos, órdenes y métricas de ventas',
      'Sync automático cada 6 horas',
      'Editar productos y crear descuentos (plan Full)',
      'Cross-sell automático y revenue por colección',
    ],
  },
  {
    nombre: 'Klaviyo Studio',
    descripcion: 'Si ya usas Klaviyo, conectamos y centralizamos tus métricas de email marketing. Puedes importar templates y ver tus flows.',
    planMinimo: 'Visual (ver) / Full (crear)',
    highlights: [
      'Métricas de email centralizadas',
      'Ver flows y campañas existentes',
      'Crear campañas, importar templates, editor drag & drop (plan Full)',
    ],
  },
  {
    nombre: 'Steve Mail',
    descripcion: 'Sistema de email marketing nativo de Steve. Editor drag & drop, flujos automatizados, segmentación, A/B testing. No necesitas Klaviyo ni Mailchimp.',
    planMinimo: 'Full',
    highlights: [
      'Editor de emails drag & drop',
      'Flujos automatizados (bienvenida, carrito abandonado, winback, cumpleaños)',
      'Segmentación avanzada de suscriptores',
      'A/B testing nativo',
      'Formularios de suscripción para tu tienda',
      'Alertas de productos y recomendaciones AI',
      'Smart send time (envía cuando tu audiencia abre más)',
    ],
  },
  {
    nombre: 'WhatsApp Marketing',
    descripcion: 'Envía mensajes directos a tus clientes por WhatsApp. Campañas masivas, carrito abandonado automático, inbox centralizado.',
    planMinimo: 'Full',
    highlights: [
      'Inbox de conversaciones con clientes',
      'Campañas masivas de WhatsApp',
      'Recuperación de carrito abandonado automática',
      'Mensajes post-compra y seguimiento',
    ],
  },
  {
    nombre: 'Análisis de Competencia',
    descripcion: 'Espía los anuncios de tus competidores en Meta. Deep Dive con análisis profundo e insights accionables.',
    planMinimo: 'Estrategia',
    highlights: [
      'Scraping de Meta Ad Library (competidores)',
      'Deep Dive: análisis profundo de datos',
      'Insights accionables para diferenciarte',
    ],
  },
  {
    nombre: 'Generación de Video AI',
    descripcion: 'Genera videos cortos para Reels e Stories usando inteligencia artificial. Scripts + video automático.',
    planMinimo: 'Full',
    highlights: [
      'Generación de scripts para video',
      'Creación de video AI (Reels, Stories)',
      'Optimizado para formato vertical mobile',
    ],
  },
  {
    nombre: 'Generación de Creativos AI',
    descripcion: 'Genera imágenes para ads, copies para Meta y Google, y edita imágenes con IA.',
    planMinimo: 'Estrategia (copies) / Full (imágenes)',
    highlights: [
      'Copies para Meta Ads y Google Ads',
      'Generación de imágenes AI para anuncios',
      'Edición de imágenes con Gemini',
      'Preview de creativos antes de publicar',
    ],
  },
  {
    nombre: 'Auditoría de Tienda',
    descripcion: 'Pega el link de tu tienda y Steve la analiza: SEO, UX, productos, precios, oportunidades de mejora.',
    planMinimo: 'Gratis (landing page)',
    highlights: [
      'Scraping completo de la tienda',
      'Análisis AI con recomendaciones accionables',
      'Feedback de productos, precios y UX',
    ],
  },
  {
    nombre: 'Brand Brief',
    descripcion: 'Genera un brief completo de tu marca: audiencia, tono, diferenciadores, estrategia de contenido.',
    planMinimo: 'Estrategia',
    highlights: [
      'Brief automático basado en tus datos',
      'Audiencia, buyer persona, tono de voz',
      'Estrategia de contenido y diferenciación',
    ],
  },
  {
    nombre: 'Instagram Publisher',
    descripcion: 'Publica contenido en Instagram directo desde Steve: fotos, carruseles, Reels y Stories. Genera captions con IA y programa publicaciones.',
    planMinimo: 'Visual (ver métricas) / Full (publicar)',
    highlights: [
      'Publicar fotos, carruseles (hasta 10 imágenes), Reels y Stories',
      'Programar publicaciones para fecha/hora futura',
      'Generación de captions y hashtags con IA (basado en tu brand brief)',
      'Subir imágenes o generarlas con IA desde Steve',
      'Preview tipo Instagram antes de publicar',
      'Métricas de feed e insights (plan Visual+)',
      'Análisis de contenido con IA (plan Estrategia+)',
    ],
  },
];

// ---------------------------------------------------------------------------
// Compact prompt text (for injection into the sales prompt)
// ---------------------------------------------------------------------------

export function getProductCatalogPrompt(): string {
  const planesText = PLANES.map(p =>
    `  - ${p.nombre}: $${p.precioNormal.toLocaleString('es-CL')}/mes → LANZAMIENTO 50% OFF: $${p.precioLanzamiento.toLocaleString('es-CL')}/mes — ${p.tagline}`
  ).join('\n');

  const modulosText = MODULOS.map(m =>
    `• ${m.nombre} (${m.planMinimo}): ${m.descripcion}`
  ).join('\n');

  return `📦 CATÁLOGO DE PRODUCTOS STEVE (FUENTE OFICIAL — NO INVENTES features que no estén aquí):

PLANES Y PRECIOS (50% descuento de lanzamiento activo):
${planesText}

MÓDULOS DISPONIBLES:
${modulosText}

REGLAS DE PRODUCTO:
- Si preguntan por WhatsApp Marketing → Steve tiene inbox, campañas masivas, carrito abandonado automático (plan Full)
- Si preguntan por Steve Mail / email → Steve tiene email marketing nativo con editor drag & drop, flujos y A/B testing (plan Full)
- Si preguntan por videos → Steve genera videos AI cortos para Reels/Stories (plan Full)
- Si preguntan por Instagram → Steve SÍ PUEDE publicar en Instagram: fotos, carruseles, Reels y Stories con captions AI y scheduling (plan Full). También ve métricas (plan Visual+)
- Si preguntan por precio → Siempre menciona el precio con descuento de lanzamiento (50% OFF)
- Si preguntan por algo que NO está en el catálogo → Di honestamente que no lo tenemos aún
- NUNCA inventes módulos, integraciones o features que no estén listados arriba

CÓMO SE CONTRATA (MUY IMPORTANTE — NO digas que pueden comprar directo en steve.cl):
- El flujo principal es AGENDAR UNA REUNIÓN de 15 min: meetings.hubspot.com/jose-manuel15
- En la reunión se hace la demo, se elige plan y se activa la cuenta
- NO digas "entra a steve.cl/planes y compra" ni "paga en steve.cl" — eso NO existe como self-service
- Si quieren contratar YA → "Agenda una reunión rápida de 15 min y te activamos la cuenta al toque"
- Si preguntan por formas de pago → "Eso lo vemos en la reunión, aceptamos tarjeta y transferencia"
- NUNCA pidas datos de pago por WhatsApp`;
}
