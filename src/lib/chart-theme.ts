// Steve Ads — Chart Design System
// Colores de marca como hex (Recharts no usa CSS vars directamente)

export const CHART_COLORS = {
  primary: '#1E3A7B',       // navy
  primaryLight: '#2A4F9E',  // navy-light
  primaryDark: '#162D5F',   // navy-dark
  success: '#10B981',       // emerald-500
  successLight: '#34D399',  // emerald-400
  warning: '#F59E0B',       // amber-500
  danger: '#EF4444',        // red-500
  dangerLight: '#F87171',   // red-400
  accent: '#F97316',        // orange-500
  purple: '#8B5CF6',        // violet-500
  muted: '#94A3B8',         // slate-400
  grid: '#F1F5F9',          // slate-100
};

// Tooltip style compartido (glass-morphism)
export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  padding: '12px 16px',
};

// Formatters reutilizables
export function formatCLP(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
}
