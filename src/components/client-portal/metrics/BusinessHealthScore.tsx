import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BusinessHealthScoreProps {
  roas: number;
  breakEvenRoas: number;
  netProfitMargin: number;
  conversionRate?: number;
  repeatCustomerRate?: number;
  aov: number;
}

interface HealthFactor {
  label: string;
  score: number; // 0-100
  weight: number;
  status: 'good' | 'ok' | 'bad';
  detail: string;
}

const STATUS_COLORS = {
  good: { bar: '#10B981', barLight: '#34D399' },
  ok: { bar: '#F59E0B', barLight: '#FBBF24' },
  bad: { bar: '#EF4444', barLight: '#F87171' },
} as const;

export function BusinessHealthScore({
  roas,
  breakEvenRoas,
  netProfitMargin,
  conversionRate,
  repeatCustomerRate,
  aov,
}: BusinessHealthScoreProps) {
  const { score, factors, label, color, strokeColor } = useMemo(() => {
    const factors: HealthFactor[] = [];

    // ROAS vs breakeven (weight: 30%)
    if (breakEvenRoas > 0 && roas > 0) {
      const roasRatio = roas / breakEvenRoas;
      const roasScore = Math.min(100, Math.max(0, roasRatio * 60));
      factors.push({
        label: 'Rentabilidad publicitaria',
        score: roasScore,
        weight: 30,
        status: roasRatio >= 1.2 ? 'good' : roasRatio >= 0.8 ? 'ok' : 'bad',
        detail: `ROAS ${roas.toFixed(1)}x vs ${breakEvenRoas.toFixed(1)}x necesario`,
      });
    }

    // Net profit margin (weight: 25%)
    if (netProfitMargin !== 0) {
      const marginScore = netProfitMargin > 0
        ? Math.min(100, netProfitMargin * 5) // 20% margin = 100
        : Math.max(0, 50 + netProfitMargin * 2);
      factors.push({
        label: 'Margen de ganancia',
        score: marginScore,
        weight: 25,
        status: netProfitMargin >= 15 ? 'good' : netProfitMargin >= 5 ? 'ok' : 'bad',
        detail: `${netProfitMargin.toFixed(1)}% margen neto`,
      });
    }

    // Conversion rate (weight: 20%)
    if (conversionRate !== undefined && conversionRate > 0) {
      const convScore = Math.min(100, conversionRate * 25); // 4% = 100
      factors.push({
        label: 'Conversión',
        score: convScore,
        weight: 20,
        status: conversionRate >= 3 ? 'good' : conversionRate >= 1.5 ? 'ok' : 'bad',
        detail: `${conversionRate.toFixed(1)}% de checkouts terminan en compra`,
      });
    }

    // Repeat customers (weight: 15%)
    if (repeatCustomerRate !== undefined && repeatCustomerRate >= 0) {
      const repeatScore = Math.min(100, repeatCustomerRate * 3.3); // 30% = ~100
      factors.push({
        label: 'Retención de clientes',
        score: repeatScore,
        weight: 15,
        status: repeatCustomerRate >= 25 ? 'good' : repeatCustomerRate >= 15 ? 'ok' : 'bad',
        detail: `${repeatCustomerRate.toFixed(0)}% vuelven a comprar`,
      });
    }

    // AOV health (weight: 10%)
    if (aov > 0) {
      const aovScore = Math.min(100, Math.max(0, (aov / 50000) * 100));
      factors.push({
        label: 'Ticket promedio',
        score: aovScore,
        weight: 10,
        status: aov >= 40000 ? 'good' : aov >= 20000 ? 'ok' : 'bad',
        detail: `$${Math.round(aov).toLocaleString('es-CL')} por pedido`,
      });
    }

    // Calculate weighted score
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedScore = totalWeight > 0
      ? Math.round(factors.reduce((s, f) => s + (f.score * f.weight), 0) / totalWeight)
      : 0;

    const label = weightedScore >= 75 ? 'Excelente' : weightedScore >= 55 ? 'Bueno' : weightedScore >= 35 ? 'Regular' : 'Necesita atención';
    const color = weightedScore >= 75 ? 'text-emerald-600' : weightedScore >= 55 ? 'text-[#1E3A7B]' : weightedScore >= 35 ? 'text-amber-600' : 'text-red-600';
    const strokeColor = weightedScore >= 75 ? '#10B981' : weightedScore >= 55 ? '#2563EB' : weightedScore >= 35 ? '#F59E0B' : '#EF4444';

    return { score: weightedScore, factors, label, color, strokeColor };
  }, [roas, breakEvenRoas, netProfitMargin, conversionRate, repeatCustomerRate, aov]);

  if (factors.length === 0) return null;

  return (
    <Card className="bg-card border border-border rounded-xl chart-animate">
      <CardContent className="py-5">
        <div className="flex items-center gap-6">
          {/* Score circle with glow */}
          <div className="relative shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <defs>
                <filter id="gauge-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={strokeColor} strokeWidth="6"
                opacity={0.1}
              />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={strokeColor} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 213.6} 213.6`}
                filter="url(#gauge-glow)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-xl font-bold', color)} style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</span>
              <span className="text-[9px] text-muted-foreground">/ 100</span>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-lg">Salud del Negocio</h3>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', color,
                score >= 75 ? 'bg-emerald-100' : score >= 55 ? 'bg-[#D6E0F0]' : score >= 35 ? 'bg-amber-100' : 'bg-red-100'
              )}>
                {label}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>Score calculado en base a rentabilidad, márgenes, conversión, retención y ticket promedio de tu negocio.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2">
              {factors.map((f) => {
                const colors = STATUS_COLORS[f.status];
                return (
                  <div key={f.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground truncate">{f.label}</span>
                      <span className={cn('w-2 h-2 rounded-full shrink-0 ml-1',
                        f.status === 'good' ? 'bg-emerald-500' : f.status === 'ok' ? 'bg-amber-500' : 'bg-red-500'
                      )} />
                    </div>
                    <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${f.score}%`,
                          background: `linear-gradient(90deg, ${colors.bar}, ${colors.barLight})`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{f.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
