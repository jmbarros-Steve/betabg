import { Eye, Brain, Rocket, type LucideIcon } from 'lucide-react';

// ─── Plan Types ──────────────────────────────────────────────
export type PlanSlug = 'visual' | 'estrategia' | 'full';
export type FeatureKey = string;

// ─── Plan Tiers (for numeric comparison) ─────────────────────
export const PLAN_TIERS: Record<PlanSlug, number> = {
  visual: 1,
  estrategia: 2,
  full: 3,
};

// ─── Plan Info (UI metadata) ─────────────────────────────────
export interface PlanInfo {
  nombre: string;
  emoji: string;
  tagline: string;
  color: string;
  headerColor: string;
  icon: LucideIcon;
  badgeClass: string;
  priceMonthly: number;
}

export const PLAN_INFO: Record<PlanSlug, PlanInfo> = {
  visual: {
    nombre: 'Visual',
    emoji: '🔍',
    tagline: 'Ve tus datos en un solo lugar',
    color: 'bg-slate-100 border-slate-300',
    headerColor: 'bg-slate-600 text-white',
    icon: Eye,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    priceMonthly: 49990,
  },
  estrategia: {
    nombre: 'Estrategia',
    emoji: '🧠',
    tagline: 'Ve + Inteligencia de Steve IA',
    color: 'bg-blue-50 border-blue-300',
    headerColor: 'bg-[#1E3A7B] text-white',
    icon: Brain,
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300',
    priceMonthly: 99990,
  },
  full: {
    nombre: 'Full',
    emoji: '🚀',
    tagline: 'Ve + Estrategia + Crea y Ejecuta',
    color: 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300',
    headerColor: 'bg-gradient-to-r from-purple-600 to-blue-600 text-white',
    icon: Rocket,
    badgeClass: 'bg-purple-100 text-purple-700 border-purple-300',
    priceMonthly: 199990,
  },
};

export const PLAN_SLUGS: PlanSlug[] = ['visual', 'estrategia', 'full'];

// ─── Feature Access Matrix ───────────────────────────────────
// Maps feature keys → minimum plan required
export const FEATURE_ACCESS: Record<FeatureKey, PlanSlug> = {
  // Shopify
  'shopify.view': 'visual',
  'shopify.orders': 'visual',
  'shopify.metrics': 'visual',
  'shopify.sync': 'visual',
  'shopify.edit': 'full',
  'shopify.discounts': 'full',

  // Steve Chat (merchant habla con Steve por WhatsApp)
  'steve_chat.basic': 'visual',            // Preguntar, consultar métricas
  'steve_chat.brand_research': 'estrategia', // Análisis de marca
  'steve_chat.recommendations': 'estrategia', // Recomendaciones estratégicas
  'steve_chat.execute': 'full',            // Ejecutar acciones desde el chat

  // Steve Estrategia
  'estrategia.diagnosis': 'estrategia',
  'estrategia.marketing_plan': 'estrategia',
  'estrategia.competitor_analysis': 'estrategia',
  'estrategia.auto_execute': 'full',

  // Deep Dive
  'deepdive.analysis': 'estrategia',
  'deepdive.insights': 'estrategia',

  // Brief
  'brief.view': 'estrategia',
  'brief.generate': 'estrategia',

  // Copies
  'copies.view': 'visual',
  'copies.generate': 'estrategia',
  'copies.publish': 'full',

  // Meta Ads
  'meta_ads.sync': 'visual',
  'meta_ads.view': 'visual',
  'meta_ads.analysis': 'estrategia',
  'meta_ads.create': 'full',
  'meta_ads.edit': 'full',
  'meta_ads.social_inbox': 'visual',

  // Klaviyo
  'klaviyo.view': 'visual',
  'klaviyo.metrics': 'visual',
  'klaviyo.create': 'full',
  'klaviyo.editor': 'full',
  'klaviyo.import_templates': 'full',

  // Instagram
  'instagram.view': 'visual',
  'instagram.analysis': 'estrategia',
  'instagram.publish': 'full',

  // Google Ads
  'google_ads.view': 'visual',
  'google_ads.analysis': 'estrategia',
  'google_ads.create': 'full',

  // Steve Mail
  'email.view': 'full',
  'email.create': 'full',
  'email.editor': 'full',

  // WhatsApp a Clientes (enviar mensajes a clientes finales del merchant)
  'whatsapp.view': 'full',
  'whatsapp.send': 'full',
  'whatsapp.automations': 'full',

  // Academy
  'academy.courses': 'visual',
  'academy.advanced': 'estrategia',

  // Metrics
  'metrics.dashboard': 'visual',
  'metrics.advanced_reports': 'estrategia',
  'metrics.weekly_report': 'estrategia',

  // Connections
  'connections.manage': 'visual',
  'connections.tokens': 'visual',

  // Config
  'config.profile': 'visual',
  'config.user_management': 'estrategia',

  // Chonga (soporte — disponible en todos los planes)
  'chonga.assistant': 'visual',
  'chonga.images': 'full',

  // Discount Button
  'discount.widget': 'full',
  'discount.rules': 'full',
};

// ─── Tab → Minimum Plan ─────────────────────────────────────
export const TAB_MIN_PLAN: Record<string, PlanSlug> = {
  steve: 'visual',
  brief: 'estrategia',
  metrics: 'visual',
  connections: 'visual',
  config: 'visual',
  shopify: 'visual',
  campaigns: 'visual',
  deepdive: 'estrategia',
  estrategia: 'estrategia',
  copies: 'visual',       // ver = visual, crear = full (gated internamente)
  social: 'visual',
  google: 'visual',
  klaviyo: 'visual',
  email: 'full',
  wa_credits: 'full',
  academy: 'visual',
};

// ─── Utility Functions ───────────────────────────────────────

/** Check if a user with a given plan can access a specific feature */
export function canAccess(feature: FeatureKey, userPlan: PlanSlug): boolean {
  const required = FEATURE_ACCESS[feature];
  if (!required) return true; // Feature not in matrix = unrestricted
  return PLAN_TIERS[userPlan] >= PLAN_TIERS[required];
}

/** Check if a user plan can access a tab */
export function canAccessTab(tabId: string, userPlan: PlanSlug): boolean {
  const required = TAB_MIN_PLAN[tabId];
  if (!required) return true;
  return PLAN_TIERS[userPlan] >= PLAN_TIERS[required];
}

/** Get the minimum plan required for a feature */
export function getRequiredPlan(feature: FeatureKey): PlanSlug | null {
  return FEATURE_ACCESS[feature] ?? null;
}

/** Get the minimum plan required for a tab */
export function getTabRequiredPlan(tabId: string): PlanSlug | null {
  return TAB_MIN_PLAN[tabId] ?? null;
}

/** Format price in CLP */
export function formatPriceCLP(price: number): string {
  return `$${price.toLocaleString('es-CL')}`;
}

// ─── Feature Comparison Matrix (for Admin & Landing) ─────────

export interface FeatureRow {
  nombre: string;
  visual: boolean;
  estrategia: boolean;
  full: boolean;
}

export interface ModuloSection {
  modulo: string;
  features: FeatureRow[];
}

export const COMPARATIVA: ModuloSection[] = [
  {
    modulo: 'Shopify',
    features: [
      { nombre: 'Vista de productos', visual: true, estrategia: true, full: true },
      { nombre: 'Vista de órdenes', visual: true, estrategia: true, full: true },
      { nombre: 'Métricas de ventas', visual: true, estrategia: true, full: true },
      { nombre: 'Sync automático', visual: true, estrategia: true, full: true },
      { nombre: 'Editar productos', visual: false, estrategia: false, full: true },
      { nombre: 'Crear descuentos', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Steve Chat (WhatsApp con Steve)',
    features: [
      { nombre: 'Consultar métricas y preguntas', visual: true, estrategia: true, full: true },
      { nombre: 'Análisis de marca (brand research)', visual: false, estrategia: true, full: true },
      { nombre: 'Recomendaciones estratégicas', visual: false, estrategia: true, full: true },
      { nombre: 'Ejecutar acciones desde WhatsApp', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Steve Estrategia',
    features: [
      { nombre: 'Diagnóstico de marca', visual: false, estrategia: true, full: true },
      { nombre: 'Plan de marketing mensual', visual: false, estrategia: true, full: true },
      { nombre: 'Análisis de competencia', visual: false, estrategia: true, full: true },
      { nombre: 'Ejecución automática del plan', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Deep Dive',
    features: [
      { nombre: 'Análisis profundo de datos', visual: false, estrategia: true, full: true },
      { nombre: 'Insights accionables', visual: false, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Brief View',
    features: [
      { nombre: 'Ver briefs de campaña', visual: false, estrategia: true, full: true },
      { nombre: 'Generar briefs con IA', visual: false, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Copies',
    features: [
      { nombre: 'Ver copies existentes', visual: true, estrategia: true, full: true },
      { nombre: 'Generar copies con IA', visual: false, estrategia: true, full: true },
      { nombre: 'Publicar copies a plataformas', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Meta Ads',
    features: [
      { nombre: 'Ver campañas y métricas', visual: true, estrategia: true, full: true },
      { nombre: 'Análisis de rendimiento IA', visual: false, estrategia: true, full: true },
      { nombre: 'Crear campañas', visual: false, estrategia: false, full: true },
      { nombre: 'Editar y optimizar campañas', visual: false, estrategia: false, full: true },
      { nombre: 'Social Inbox', visual: true, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Klaviyo',
    features: [
      { nombre: 'Ver métricas de email', visual: true, estrategia: true, full: true },
      { nombre: 'Ver flows y campañas', visual: true, estrategia: true, full: true },
      { nombre: 'Crear campañas de email', visual: false, estrategia: false, full: true },
      { nombre: 'Editor drag & drop', visual: false, estrategia: false, full: true },
      { nombre: 'Importar templates', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Instagram',
    features: [
      { nombre: 'Ver feed y métricas', visual: true, estrategia: true, full: true },
      { nombre: 'Análisis de contenido IA', visual: false, estrategia: true, full: true },
      { nombre: 'Publicar contenido', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Google Ads',
    features: [
      { nombre: 'Ver campañas y métricas', visual: true, estrategia: true, full: true },
      { nombre: 'Análisis de rendimiento IA', visual: false, estrategia: true, full: true },
      { nombre: 'Crear y editar campañas', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Steve Mail',
    features: [
      { nombre: 'Ver emails enviados', visual: true, estrategia: true, full: true },
      { nombre: 'Crear y enviar emails', visual: false, estrategia: false, full: true },
      { nombre: 'Editor visual de emails', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'WhatsApp a Clientes',
    features: [
      { nombre: 'Ver conversaciones con clientes', visual: true, estrategia: true, full: true },
      { nombre: 'Enviar mensajes a clientes', visual: false, estrategia: false, full: true },
      { nombre: 'Automatizaciones (carritos abandonados)', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Academy',
    features: [
      { nombre: 'Cursos y tutoriales', visual: true, estrategia: true, full: true },
      { nombre: 'Contenido avanzado', visual: false, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Métricas',
    features: [
      { nombre: 'Dashboard de métricas', visual: true, estrategia: true, full: true },
      { nombre: 'Reportes avanzados', visual: false, estrategia: true, full: true },
      { nombre: 'Reporte semanal automático', visual: false, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Conexiones',
    features: [
      { nombre: 'Conectar plataformas', visual: true, estrategia: true, full: true },
      { nombre: 'Gestión de tokens', visual: true, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Configuración',
    features: [
      { nombre: 'Perfil y cuenta', visual: true, estrategia: true, full: true },
      { nombre: 'Gestión de usuarios', visual: false, estrategia: true, full: true },
    ],
  },
  {
    modulo: 'Chonga (Soporte)',
    features: [
      { nombre: 'Asistente de soporte IA', visual: true, estrategia: true, full: true },
      { nombre: 'Generación de imágenes', visual: false, estrategia: false, full: true },
    ],
  },
  {
    modulo: 'Botón Descuento',
    features: [
      { nombre: 'Widget de descuento en tienda', visual: false, estrategia: false, full: true },
      { nombre: 'Configuración de reglas', visual: false, estrategia: false, full: true },
    ],
  },
];
