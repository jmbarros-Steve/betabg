/**
 * Theme central del informe Meta Ads.
 * Paleta agencia performance: navy Steve + coral Instagram + funnel colors.
 * Más vibrante que el informe Shopify para diferenciar el universo Meta.
 */

export const colors = {
  // Primarios Steve
  navy: '#0B1F3A',
  navyDark: '#06122A',
  navyLight: '#1A3358',

  // Acento Meta — coral Instagram (sexy wow)
  meta: '#E4405F',
  metaDark: '#B82F4A',
  metaLight: '#F5A0AE',

  // Secundarios
  cream: '#F5F0E8',
  creamLight: '#FAF7F2',
  paper: '#FFFFFF',
  accent: '#C5A572', // dorado highlights
  accentDark: '#9F7E47',

  // Funnel layers
  tofu: '#5B9BD5',
  mofu: '#ED7D31',
  bofu: '#70AD47',

  // BCG quadrants
  star: '#F2C744',
  question: '#3D7BD5',
  cow: '#8B7355',
  dog: '#C4564A',

  // Semánticos
  positive: '#2D7A5F',
  negative: '#A03939',
  warning: '#B8860B',

  // Fatiga heat
  fatigueRed: '#C4564A',
  fatigueAmber: '#E8A33D',
  fatigueGreen: '#5DA672',

  // Texto
  textPrimary: '#0B1F3A',
  textSecondary: '#4A5568',
  textMuted: '#718096',
  textDivider: '#E2E8F0',

  // Backgrounds
  bgSubtle: '#F7FAFC',
  bgCard: '#FFFFFF',
  bgWarm: '#FFF5F1',
};

export const fonts = {
  serif: 'Times-Roman',
  serifBold: 'Times-Bold',
  serifItalic: 'Times-Italic',
  sans: 'Helvetica',
  sansBold: 'Helvetica-Bold',
  sansLight: 'Helvetica',
  mono: 'Courier',
};

export const sizes = {
  // Page (Letter portrait)
  pageWidth: 612,
  pageHeight: 792,
  margin: 56,

  // Tipografía
  hero: 36,
  h1: 26,
  h2: 18,
  h3: 14,
  body: 10,
  small: 9,
  micro: 7,

  // Espaciado
  gutter: 16,
  sectionSpacing: 28,
  blockSpacing: 14,

  // Componentes
  kpiCardHeight: 86,
  headerHeight: 38,
  footerHeight: 30,
};

export const formatCurrency = (value: number | null | undefined, _currency = 'CLP'): string => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `$${Math.round(value).toLocaleString('es-CL')}`;
};

export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return Math.round(value).toLocaleString('es-CL');
};

export const formatCompact = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('es-CL');
};

export const formatPercent = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
};

export const formatDelta = (current: number, previous: number): { sign: '+' | '-' | ''; pct: string; isPositive: boolean } => {
  if (!previous || previous === 0) return { sign: '', pct: '—', isPositive: false };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return {
    sign: change > 0 ? '+' : change < 0 ? '-' : '',
    pct: `${Math.abs(change).toFixed(1)}%`,
    isPositive: change > 0,
  };
};

export const formatDateRange = (start: string, end: string): string => {
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return `${fmt(start)} — ${fmt(end)}`;
};

export const periodLengthDays = (start: string, end: string): number => {
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
};

export const periodWord = (days: number): string => {
  if (days <= 9) return 'esta semana';
  if (days <= 16) return 'estas dos semanas';
  if (days <= 35) return 'este mes';
  if (days <= 100) return 'este trimestre';
  return 'este período';
};

export type FunnelStage = 'tofu' | 'mofu' | 'bofu';

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  tofu: 'TOFU · Reconocimiento',
  mofu: 'MOFU · Consideración',
  bofu: 'BOFU · Conversión',
};

export const FUNNEL_COLORS: Record<FunnelStage, string> = {
  tofu: colors.tofu,
  mofu: colors.mofu,
  bofu: colors.bofu,
};
