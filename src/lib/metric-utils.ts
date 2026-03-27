// Steve Ads — Metric utilities for the "cachetón" dashboard
import { DollarSign, Eye, MousePointerClick, Percent, Target, TrendingUp, BarChart3, Layers } from 'lucide-react';

export type MetricKey = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'cpm' | 'conversions' | 'roas';

export interface MetricDef {
  key: MetricKey;
  label: string;
  icon: typeof DollarSign;
  color: string;        // tailwind border/accent color
  bgGradient: string;   // card gradient
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const fmtCurrency = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString('es-CL')}`;
};

const fmtNumber = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toLocaleString('es-CL');
};

const fmtPercent = (v: number) => `${v.toFixed(2)}%`;
const fmtRoas = (v: number) => `${v.toFixed(2)}x`;

export const METRICS: Record<MetricKey, MetricDef> = {
  spend: {
    key: 'spend',
    label: 'Gasto Total',
    icon: DollarSign,
    color: 'border-red-500',
    bgGradient: 'from-red-500/8 to-transparent',
    format: fmtCurrency,
    higherIsBetter: false,
  },
  impressions: {
    key: 'impressions',
    label: 'Impresiones',
    icon: Eye,
    color: 'border-blue-500',
    bgGradient: 'from-blue-500/8 to-transparent',
    format: fmtNumber,
    higherIsBetter: true,
  },
  clicks: {
    key: 'clicks',
    label: 'Clicks',
    icon: MousePointerClick,
    color: 'border-indigo-500',
    bgGradient: 'from-indigo-500/8 to-transparent',
    format: fmtNumber,
    higherIsBetter: true,
  },
  ctr: {
    key: 'ctr',
    label: 'CTR',
    icon: Percent,
    color: 'border-cyan-500',
    bgGradient: 'from-cyan-500/8 to-transparent',
    format: fmtPercent,
    higherIsBetter: true,
  },
  cpc: {
    key: 'cpc',
    label: 'CPC',
    icon: MousePointerClick,
    color: 'border-orange-500',
    bgGradient: 'from-orange-500/8 to-transparent',
    format: fmtCurrency,
    higherIsBetter: false,
  },
  cpm: {
    key: 'cpm',
    label: 'CPM',
    icon: Layers,
    color: 'border-purple-500',
    bgGradient: 'from-purple-500/8 to-transparent',
    format: fmtCurrency,
    higherIsBetter: false,
  },
  conversions: {
    key: 'conversions',
    label: 'Conversiones',
    icon: Target,
    color: 'border-amber-500',
    bgGradient: 'from-amber-500/8 to-transparent',
    format: fmtNumber,
    higherIsBetter: true,
  },
  roas: {
    key: 'roas',
    label: 'ROAS',
    icon: TrendingUp,
    color: 'border-green-500',
    bgGradient: 'from-green-500/8 to-transparent',
    format: fmtRoas,
    higherIsBetter: true,
  },
};

export const METRIC_ORDER: MetricKey[] = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'conversions', 'roas'];

// Date presets for the selector
export interface DatePreset {
  key: string;
  label: string;
  days: number;
}

export const DATE_PRESETS: DatePreset[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '14d', label: '14d', days: 14 },
  { key: '30d', label: '30d', days: 30 },
  { key: '60d', label: '60d', days: 60 },
  { key: '90d', label: '90d', days: 90 },
];

// Target performance colors
export type TargetStatus = 'good' | 'warning' | 'danger' | 'none';

export function getTargetStatus(
  actual: number,
  target: number,
  higherIsBetter: boolean
): TargetStatus {
  if (target <= 0) return 'none';
  const ratio = actual / target;

  if (higherIsBetter) {
    if (ratio >= 0.8) return 'good';
    if (ratio >= 0.5) return 'warning';
    return 'danger';
  } else {
    // Lower is better (spend, CPC, CPM)
    if (ratio <= 1.0) return 'good';
    if (ratio <= 1.2) return 'warning';
    return 'danger';
  }
}

export function getTargetColor(status: TargetStatus): string {
  switch (status) {
    case 'good': return 'text-green-500';
    case 'warning': return 'text-yellow-500';
    case 'danger': return 'text-red-500';
    default: return 'text-blue-500';
  }
}

export function getTargetBorderColor(status: TargetStatus): string {
  switch (status) {
    case 'good': return 'border-l-green-500';
    case 'warning': return 'border-l-yellow-500';
    case 'danger': return 'border-l-red-500';
    default: return 'border-l-blue-500';
  }
}

export function getTargetBgColor(status: TargetStatus): string {
  switch (status) {
    case 'good': return 'bg-green-500';
    case 'warning': return 'bg-yellow-500';
    case 'danger': return 'bg-red-500';
    default: return 'bg-blue-500';
  }
}

export function getProgressPercent(actual: number, target: number, higherIsBetter: boolean): number {
  if (target <= 0) return 0;
  if (higherIsBetter) {
    return Math.min((actual / target) * 100, 100);
  }
  // For lower-is-better, invert: 100% when actual = 0, 0% when actual >= 2*target
  return Math.max(0, Math.min(100, (1 - actual / (target * 2)) * 100));
}

// Donut chart colors palette
export const DONUT_COLORS = [
  '#1E3A7B', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE',
  '#8B5CF6', '#A78BFA', '#C4B5FD',
];

// Format a metric value using its definition
export function formatMetricValue(key: MetricKey, value: number): string {
  return METRICS[key].format(value);
}
