import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, DollarSign, Target, Users, Percent, BarChart3, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfitMetric {
  label: string;
  value: string;
  previousValue?: string;
  changePercent?: number;
  description: string;
  tooltip: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

interface ProfitMetricsPanelProps {
  poas: number;
  previousPoas?: number;
  cac: number;
  previousCac?: number;
  mer: number;
  previousMer?: number;
  breakEvenRoas: number;
  currentRoas: number;
  currency?: string;
}

function ChangeIndicator({ change }: { change?: number }) {
  if (change === undefined || change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground rounded-full px-2 py-0.5 bg-muted/50">
        <Minus className="w-3 h-3" />
        Sin cambio
      </span>
    );
  }

  const isPositive = change > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
        isPositive ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
      )}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}
      {change.toFixed(1)}%
    </span>
  );
}

export function ProfitMetricsPanel({
  poas,
  previousPoas,
  cac,
  previousCac,
  mer,
  previousMer,
  breakEvenRoas,
  currentRoas,
  currency = 'CLP',
}: ProfitMetricsPanelProps) {
  const poasChange = previousPoas && previousPoas !== 0 ? ((poas - previousPoas) / Math.abs(previousPoas)) * 100 : undefined;
  const cacChange = previousCac && previousCac !== 0 ? ((cac - previousCac) / Math.abs(previousCac)) * 100 : undefined;
  const merChange = previousMer && previousMer !== 0 ? ((mer - previousMer) / Math.abs(previousMer)) * 100 : undefined;

  const isRoasAboveBreakeven = currentRoas >= breakEvenRoas;

  const metrics: ProfitMetric[] = [
    {
      label: 'POAS',
      value: `${poas.toFixed(2)}x`,
      previousValue: previousPoas ? `${previousPoas.toFixed(2)}x` : undefined,
      changePercent: poasChange,
      description: 'Profit on Ad Spend (Beneficio real por $ invertido)',
      tooltip: 'Profit Over Ad Spend — ganancia neta por cada $1 en publicidad. Sobre 1x significa que estás ganando dinero',
      icon: DollarSign,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'CAC',
      value: `$${Math.round(cac).toLocaleString('es-CL')}`,
      previousValue: previousCac ? `$${Math.round(previousCac).toLocaleString('es-CL')}` : undefined,
      changePercent: cacChange !== undefined ? -cacChange : undefined,
      description: 'Costo por cada nuevo cliente',
      tooltip: 'Cuánto cuesta conseguir un nuevo cliente a través de publicidad. Mientras más bajo, mejor. El cambio % se muestra invertido: verde significa que bajó (bueno)',
      icon: Users,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'MER',
      value: `${mer.toFixed(2)}x`,
      previousValue: previousMer ? `${previousMer.toFixed(2)}x` : undefined,
      changePercent: merChange,
      description: 'Ratio de Eficiencia de Marketing (Ingresos / Inversión Total)',
      tooltip: 'Marketing Efficiency Ratio — ingresos totales dividido por gasto total en marketing. Sobre 3x es saludable',
      icon: BarChart3,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-100',
    },
    {
      label: 'Break-even ROAS',
      value: `${breakEvenRoas.toFixed(2)}x`,
      description: 'ROAS mínimo para no perder dinero',
      tooltip: 'ROAS mínimo necesario para no perder dinero, considerando tus costos y márgenes',
      icon: Target,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-100',
    },
  ];

  return (
    <div className="space-y-4 chart-animate">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Percent className="w-5 h-5" />
          Métricas de Rentabilidad
        </h3>
        <span className="text-xs text-muted-foreground">vs. período anterior</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="bg-card border border-border rounded-xl card-hover">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  {metric.label}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>{metric.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <div className={cn('p-2 rounded-lg', metric.iconBg)}>
                  <metric.icon className={cn('w-4 h-4', metric.iconColor)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{metric.value}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{metric.description}</p>
              {metric.changePercent !== undefined && (
                <div className="mt-2">
                  <ChangeIndicator change={metric.changePercent} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ROAS vs Break-even indicator */}
      <Card
        className="border-2 overflow-hidden"
        style={{
          borderImage: isRoasAboveBreakeven
            ? 'linear-gradient(90deg, #2563EB, #10B981) 1'
            : 'linear-gradient(90deg, #EF4444, #F59E0B) 1',
          background: isRoasAboveBreakeven
            ? 'linear-gradient(135deg, rgba(37,99,235,0.03), rgba(16,185,129,0.05))'
            : 'linear-gradient(135deg, rgba(239,68,68,0.03), rgba(245,158,11,0.05))',
        }}
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isRoasAboveBreakeven ? (
                <div className="p-2 rounded-lg bg-emerald-100">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-red-100">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
              )}
              <div>
                <p className="font-semibold flex items-center gap-1.5">
                  {isRoasAboveBreakeven
                    ? <><CheckCircle className="w-4 h-4 text-green-600 inline" /> Operación rentable</>
                    : <><AlertTriangle className="w-4 h-4 text-amber-600 inline" /> Por debajo del break-even</>}
                </p>
                <p className="text-sm text-muted-foreground">
                  ROAS actual: {currentRoas.toFixed(2)}x | Break-even: {breakEvenRoas.toFixed(2)}x
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn('text-2xl font-bold', isRoasAboveBreakeven ? 'text-emerald-600' : 'text-red-600')}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {breakEvenRoas > 0
                  ? `${isRoasAboveBreakeven ? '+' : ''}${((currentRoas - breakEvenRoas) / breakEvenRoas * 100).toFixed(0)}%`
                  : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isRoasAboveBreakeven ? 'sobre break-even' : 'bajo break-even'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
