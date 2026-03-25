import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Eye, ShoppingCart, CreditCard, CheckCircle, TrendingDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelStage {
  label: string;
  value: number | null;
  icon: React.ElementType;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  bgColor: string;
  benchmark: { low: number; avg: number; high: number; unit: string };
  tooltip: string;
}

interface ConversionFunnelPanelProps {
  sessions: number | null;
  addToCarts: number | null;
  checkoutsInitiated: number;
  purchases: number;
}

function getBenchmarkStatus(actual: number, benchmark: { low: number; avg: number; high: number }): 'good' | 'ok' | 'bad' {
  if (actual >= benchmark.avg) return 'good';
  if (actual >= benchmark.low) return 'ok';
  return 'bad';
}

const BENCHMARK_COLORS = {
  good: { bar: '#10B981', barLight: '#34D399' },
  ok: { bar: '#F59E0B', barLight: '#FBBF24' },
  bad: { bar: '#EF4444', barLight: '#F87171' },
} as const;

export function ConversionFunnelPanel({ sessions, addToCarts, checkoutsInitiated, purchases }: ConversionFunnelPanelProps) {
  const stages: FunnelStage[] = [];
  const missingAnalytics = sessions === null && addToCarts === null;

  if (sessions !== null && sessions > 0) {
    stages.push({
      label: 'Visitas',
      value: sessions,
      icon: Eye,
      color: 'text-blue-600',
      gradientFrom: '#2563EB',
      gradientTo: '#3B82F6',
      bgColor: 'bg-blue-100',
      benchmark: { low: 0, avg: 0, high: 0, unit: '' },
      tooltip: 'Sesiones totales en tu tienda online durante el periodo',
    });
  }

  if (addToCarts !== null && addToCarts > 0) {
    stages.push({
      label: 'Agregar al Carrito',
      value: addToCarts,
      icon: ShoppingCart,
      color: 'text-purple-600',
      gradientFrom: '#8B5CF6',
      gradientTo: '#A78BFA',
      bgColor: 'bg-purple-100',
      benchmark: { low: 3, avg: 8, high: 15, unit: '% de visitas' },
      tooltip: 'Visitantes que agregaron al menos un producto al carrito. Benchmark ecommerce: 5-15%',
    });
  }

  if (checkoutsInitiated > 0 || purchases > 0) {
    stages.push({
      label: 'Checkout Iniciado',
      value: checkoutsInitiated,
      icon: CreditCard,
      color: 'text-amber-600',
      gradientFrom: '#F59E0B',
      gradientTo: '#FBBF24',
      bgColor: 'bg-amber-100',
      benchmark: { low: 25, avg: 45, high: 65, unit: '% de carritos' },
      tooltip: 'Personas que iniciaron el proceso de pago. Benchmark ecommerce: 30-60% de quienes agregan al carrito',
    });

    stages.push({
      label: 'Compra Completada',
      value: purchases,
      icon: CheckCircle,
      color: 'text-green-600',
      gradientFrom: '#10B981',
      gradientTo: '#34D399',
      bgColor: 'bg-green-100',
      benchmark: { low: 35, avg: 50, high: 70, unit: '% de checkouts' },
      tooltip: 'Pedidos pagados exitosamente. Benchmark ecommerce: 40-65% de quienes inician checkout',
    });
  }

  if (stages.length < 2) return null;

  const maxValue = stages[0].value || 1;

  const stepRates: { from: string; to: string; rate: number; benchmark: FunnelStage['benchmark'] }[] = [];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].value;
    const curr = stages[i].value;
    if (prev && prev > 0 && curr !== null) {
      stepRates.push({
        from: stages[i - 1].label,
        to: stages[i].label,
        rate: (curr / prev) * 100,
        benchmark: stages[i].benchmark,
      });
    }
  }

  const overallRate = sessions && sessions > 0 ? (purchases / sessions) * 100 : null;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover chart-animate">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Funnel de Conversión
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>Muestra cómo los visitantes avanzan por cada etapa hasta completar una compra. Compara tus tasas con benchmarks estándar de ecommerce.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          {overallRate !== null && (
            <span className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              overallRate >= 2.5 ? 'bg-emerald-100 text-emerald-700' :
              overallRate >= 1 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            )}>
              {overallRate.toFixed(2)}% conversión total
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Funnel Visual */}
        <div className="space-y-3">
          {stages.map((stage, i) => {
            const StageIcon = stage.icon;
            const barWidth = stage.value !== null && maxValue > 0
              ? Math.max(8, (stage.value / maxValue) * 100)
              : 8;

            return (
              <div
                key={stage.label}
                className="space-y-1"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('p-1.5 rounded-md', stage.bgColor)}>
                      <StageIcon className={cn('w-3.5 h-3.5', stage.color)} />
                    </div>
                    <span className="text-sm font-medium">{stage.label}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>{stage.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {stage.value !== null ? stage.value.toLocaleString('es-CL') : '—'}
                  </span>
                </div>
                {/* Funnel bar */}
                <div className="relative">
                  <div className="h-8 bg-muted/50 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-700"
                      style={{
                        width: `${barWidth}%`,
                        background: `linear-gradient(90deg, ${stage.gradientFrom}, ${stage.gradientTo})`,
                        transitionDelay: `${i * 100}ms`,
                      }}
                    />
                  </div>
                  {/* Percentage on bar */}
                  {i > 0 && stages[i - 1].value && stages[i - 1].value! > 0 && stage.value !== null && (
                    <div className="absolute inset-y-0 left-3 flex items-center">
                      <span className="text-xs font-semibold text-white drop-shadow-sm">
                        {((stage.value / stages[i - 1].value!) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step-by-step conversion rates vs benchmarks */}
        {stepRates.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Tasas de Conversión vs Benchmark Ecommerce
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stepRates.map((step) => {
                const status = getBenchmarkStatus(step.rate, step.benchmark);
                const colors = BENCHMARK_COLORS[status];
                return (
                  <div key={`${step.from}-${step.to}`} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {step.from} → {step.to}
                    </p>
                    <div className="flex items-end gap-2">
                      <span className={cn(
                        'text-lg font-bold',
                        status === 'good' ? 'text-emerald-600' :
                        status === 'ok' ? 'text-amber-600' :
                        'text-red-600'
                      )} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {step.rate.toFixed(1)}%
                      </span>
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-0.5',
                        status === 'good' ? 'bg-emerald-100 text-emerald-700' :
                        status === 'ok' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {status === 'good' ? 'Bien' : status === 'ok' ? 'Normal' : 'Bajo'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden relative">
                        <div
                          className="absolute h-full bg-muted-foreground/20 rounded-full"
                          style={{
                            left: `${Math.min(step.benchmark.low, 100)}%`,
                            width: `${Math.min(step.benchmark.high - step.benchmark.low, 100 - step.benchmark.low)}%`,
                          }}
                        />
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(step.rate, 100)}%`,
                            background: `linear-gradient(90deg, ${colors.bar}, ${colors.barLight})`,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      Benchmark: {step.benchmark.low}%-{step.benchmark.high}% ({step.benchmark.unit})
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Funnel insights */}
        {stepRates.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs font-semibold mb-1">Steve te recomienda:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {stepRates.map((step) => {
                const status = getBenchmarkStatus(step.rate, step.benchmark);
                if (status === 'bad') {
                  if (step.to === 'Agregar al Carrito') {
                    return <li key={step.to}>- Tus visitas no agregan productos al carrito. Revisa tus paginas de producto: fotos, precio visible, boton de compra claro.</li>;
                  }
                  if (step.to === 'Checkout Iniciado') {
                    return <li key={step.to}>- Muchos agregan al carrito pero no inician el pago. Revisa costos de envio, opciones de pago y proceso de checkout.</li>;
                  }
                  if (step.to === 'Compra Completada') {
                    return <li key={step.to}>- Pierdes ventas en el checkout. Simplifica formularios, ofrece mas medios de pago y muestra seguridad.</li>;
                  }
                }
                if (status === 'good') {
                  if (step.to === 'Compra Completada') {
                    return <li key={step.to}>- Tu tasa de cierre es excelente. Enfoca esfuerzos en atraer mas trafico calificado.</li>;
                  }
                }
                return null;
              })}
            </ul>
          </div>
        )}

        {/* Note when session/cart data is missing */}
        {missingAnalytics && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Las etapas de Visitas y Carrito requieren acceso a Shopify Analytics (ShopifyQL). Actualmente mostramos Checkout y Compras basados en datos de pedidos y checkouts abandonados.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
