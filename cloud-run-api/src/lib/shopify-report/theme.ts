/**
 * Theme central del informe Shopify.
 * Paleta Steve sobria: navy + cream + acentos sutiles.
 * Tipografía editorial: serif headers + sans body.
 */

export const colors = {
  // Primarios
  navy: '#0B1F3A',
  navyDark: '#06122A',
  navyLight: '#1A3358',

  // Secundarios
  cream: '#F5F0E8',
  creamLight: '#FAF7F2',
  paper: '#FFFFFF',

  // Acentos
  accent: '#C5A572', // dorado sobrio para highlights
  accentDark: '#9F7E47',

  // Semánticos
  positive: '#2D7A5F',
  negative: '#A03939',
  warning: '#B8860B',

  // Texto
  textPrimary: '#0B1F3A',
  textSecondary: '#4A5568',
  textMuted: '#718096',
  textDivider: '#E2E8F0',

  // Backgrounds
  bgSubtle: '#F7FAFC',
  bgCard: '#FFFFFF',
};

export const fonts = {
  // En Sprint 1 usamos los nombres lógicos.
  // En Sprint 4 (polish) registramos Source Serif y Inter via Font.register().
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
  margin: 56, // 0.78"

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
  kpiCardHeight: 78,
  headerHeight: 38,
  footerHeight: 30,
};

export const formatCurrency = (value: number | null | undefined, currency = 'CLP'): string => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `$${Math.round(value).toLocaleString('es-CL')}`;
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
