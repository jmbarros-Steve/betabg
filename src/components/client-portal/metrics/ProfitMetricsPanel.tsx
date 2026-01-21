import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, DollarSign, Target, Users, Percent, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfitMetric {
  label: string;
  value: string;
  previousValue?: string;
  changePercent?: number;
  description: string;
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
  const poasChange = previousPoas ? ((poas - previousPoas) / previousPoas) * 100 : undefined;
  const cacChange = previousCac ? ((cac - previousCac) / previousCac) * 100 : undefined;
  const merChange = previousMer ? ((mer - previousMer) / previousMer) * 100 : undefined;

  const isRoasAboveBreakeven = currentRoas >= breakEvenRoas;

  const metrics: ProfitMetric[] = [
    {
      label: 'POAS',
      value: `${poas.toFixed(2)}x`,
      previousValue: previousPoas ? `${previousPoas.toFixed(2)}x` : undefined,
      changePercent: poasChange,
      description: 'Profit on Ad Spend (Beneficio real por $ invertido)',
      icon: DollarSign,
    },
    {
      label: 'CAC',
      value: `$${cac.toLocaleString('es-CL')}`,
      previousValue: previousCac ? `$${previousCac.toLocaleString('es-CL')}` : undefined,
      changePercent: cacChange ? -cacChange : undefined, // Invert because lower CAC is better
      description: 'Costo de Adquisición por Cliente',
      icon: Users,
    },
    {
      label: 'MER',
      value: `${mer.toFixed(2)}x`,
      previousValue: previousMer ? `${previousMer.toFixed(2)}x` : undefined,
      changePercent: merChange,
      description: 'Marketing Efficiency Ratio (Revenue / Total Ad Spend)',
      icon: BarChart3,
    },
    {
      label: 'Break-even ROAS',
      value: `${breakEvenRoas.toFixed(2)}x`,
      description: 'ROAS mínimo para no perder dinero',
      icon: Target,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Percent className="w-5 h-5" />
          Métricas de Rentabilidad
        </h3>
        <span className="text-xs text-muted-foreground">vs. período anterior</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="glow-box">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {metric.label}
                </CardTitle>
                <metric.icon className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{metric.value}</p>
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
      <Card className={cn('border-2', isRoasAboveBreakeven ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5')}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isRoasAboveBreakeven ? (
                <TrendingUp className="w-6 h-6 text-primary" />
              ) : (
                <TrendingDown className="w-6 h-6 text-destructive" />
              )}
              <div>
                <p className="font-semibold">
                  {isRoasAboveBreakeven ? '✅ Operación rentable' : '⚠️ Por debajo del break-even'}
                </p>
                <p className="text-sm text-muted-foreground">
                  ROAS actual: {currentRoas.toFixed(2)}x | Break-even: {breakEvenRoas.toFixed(2)}x
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn('text-2xl font-bold', isRoasAboveBreakeven ? 'text-primary' : 'text-destructive')}>
                {isRoasAboveBreakeven ? '+' : ''}
                {((currentRoas - breakEvenRoas) / breakEvenRoas * 100).toFixed(0)}%
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
