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
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3 h-3" />
        Sin cambio
      </span>
    );
  }

  const isPositive = change > 0;
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        isPositive ? 'text-primary' : 'text-destructive'
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
    },
    {
      label: 'CAC',
      value: `$${Math.round(cac).toLocaleString('es-CL')}`,
      previousValue: previousCac ? `$${Math.round(previousCac).toLocaleString('es-CL')}` : undefined,
      changePercent: cacChange !== undefined ? -cacChange : undefined, // Invert because lower CAC is better
      description: 'Costo por cada nuevo cliente',
      tooltip: 'Cuánto cuesta conseguir un nuevo cliente a través de publicidad. Mientras más bajo, mejor. El cambio % se muestra invertido: verde significa que bajó (bueno)',
      icon: Users,
    },
    {
      label: 'MER',
      value: `${mer.toFixed(2)}x`,
      previousValue: previousMer ? `${previousMer.toFixed(2)}x` : undefined,
      changePercent: merChange,
      description: 'Ratio de Eficiencia de Marketing (Ingresos / Inversión Total)',
      tooltip: 'Marketing Efficiency Ratio — ingresos totales dividido por gasto total en marketing. Sobre 3x es saludable',
      icon: BarChart3,
    },
    {
      label: 'Break-even ROAS',
      value: `${breakEvenRoas.toFixed(2)}x`,
      description: 'ROAS mínimo para no perder dinero',
      tooltip: 'ROAS mínimo necesario para no perder dinero, considerando tus costos y márgenes',
      icon: Target,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Percent className="w-5 h-5" />
          Métricas de Rentabilidad
        </h3>
        <span className="text-xs text-muted-foreground">vs. período anterior</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/[0.12] transition-all">
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
                <metric.icon className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tabular-nums">{metric.value}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground line-clamp-1">{metric.description}</p>
              </div>
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
      <Card className={cn('border-2 rounded-2xl backdrop-blur-sm', isRoasAboveBreakeven ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5')}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isRoasAboveBreakeven ? (
                <TrendingUp className="w-6 h-6 text-primary" />
              ) : (
                <TrendingDown className="w-6 h-6 text-destructive" />
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
              <p className={cn('text-2xl font-bold tabular-nums', isRoasAboveBreakeven ? 'text-primary' : 'text-destructive')}>
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
