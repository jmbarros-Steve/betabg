import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleHealthBannerProps {
  totals: {
    spend: number;
    conversions: number;
    revenue: number;
    roas: number;
  };
  activeCampaignCount: number;
  lastSyncAt: string | null;
  connectionActive: boolean;
  currency?: string;
}

type HealthLevel = 'good' | 'warning' | 'danger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(isoDate: string): string {
  if (!isoDate) return 'Nunca';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} dia${days !== 1 ? 's' : ''}`;
}

// #5 fix: usa la moneda detectada, no CLP hardcodeado
function buildFormatter(currency: string) {
  const fmt = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  });
  return (value: number): string => fmt.format(value);
}

function getHealthLevel(roas: number, spend: number, activeCampaigns: number): HealthLevel {
  if (spend === 0 || activeCampaigns === 0 || roas < 1) return 'danger';
  if (roas >= 2) return 'good';
  return 'warning';
}

const HEALTH_CONFIG: Record<HealthLevel, {
  icon: typeof CheckCircle2;
  title: string;
  border: string;
  bg: string;
  iconColor: string;
  titleColor: string;
}> = {
  good: {
    icon: CheckCircle2,
    title: 'Tu publicidad Google esta rentable',
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    iconColor: 'text-green-500',
    titleColor: 'text-green-700',
  },
  warning: {
    icon: AlertTriangle,
    title: 'Necesita atencion',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    iconColor: 'text-yellow-500',
    titleColor: 'text-yellow-700',
  },
  danger: {
    icon: XCircle,
    title: 'Pierdes dinero',
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    iconColor: 'text-red-500',
    titleColor: 'text-red-700',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GoogleHealthBanner({
  totals,
  activeCampaignCount,
  lastSyncAt,
  connectionActive,
  currency = 'CLP',
}: GoogleHealthBannerProps) {
  const health = useMemo(
    () => getHealthLevel(totals.roas, totals.spend, activeCampaignCount),
    [totals.roas, totals.spend, activeCampaignCount],
  );

  const formatMoney = useMemo(() => buildFormatter(currency), [currency]);

  const summary = useMemo(() => {
    if (!connectionActive) return 'Conexion Google Ads inactiva.';
    if (totals.spend === 0 && totals.conversions === 0) {
      return 'No hay datos del periodo seleccionado.';
    }
    const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    const verdict = totals.roas >= 2 ? 'Vas bien.' : totals.roas >= 1 ? 'Ajusta para mejorar.' : 'Revisa tus campanas.';
    return `Gastaste ${formatMoney(totals.spend)}, hiciste ${Math.round(totals.conversions)} conversion${totals.conversions !== 1 ? 'es' : ''}${cpa > 0 ? ` a ${formatMoney(cpa)} cada una` : ''}. Tu retorno fue ${totals.roas.toFixed(1)}x. ${verdict}`;
  }, [totals, connectionActive, formatMoney]);

  const cfg = HEALTH_CONFIG[health];
  const Icon = cfg.icon;

  return (
    <Card className={`${cfg.border} ${cfg.bg} overflow-hidden`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${cfg.bg}`}>
            <Icon className={`w-6 h-6 ${cfg.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className={`text-base font-bold ${cfg.titleColor}`}>{cfg.title}</h3>
              {lastSyncAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(lastSyncAt)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
