import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayOfWeekChartProps {
  dailyData: { date: string; revenue: number; orders: number }[];
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const BAR_GRADIENTS = {
  best: { from: '#10B981', to: '#34D399' },
  worst: { from: '#EF4444', to: '#F87171' },
  normal: { from: '#2563EB', to: '#3B82F6' },
} as const;

export function DayOfWeekChart({ dailyData }: DayOfWeekChartProps) {
  const dayStats = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => ({ revenue: 0, orders: 0, count: 0 }));

    for (const d of dailyData) {
      const dayIndex = new Date(d.date + 'T12:00:00').getDay();
      buckets[dayIndex].revenue += d.revenue;
      buckets[dayIndex].orders += d.orders;
      buckets[dayIndex].count += 1;
    }

    return buckets.map((b, i) => ({
      day: DAY_NAMES[i],
      dayShort: DAY_SHORT[i],
      avgRevenue: b.count > 0 ? Math.round(b.revenue / b.count) : 0,
      avgOrders: b.count > 0 ? Math.round((b.orders / b.count) * 10) / 10 : 0,
      totalRevenue: Math.round(b.revenue),
      totalOrders: b.orders,
      weeks: b.count,
    }));
  }, [dailyData]);

  const maxRevenue = Math.max(...dayStats.map(d => d.avgRevenue), 1);
  const bestDay = dayStats.reduce((best, d) => d.avgRevenue > best.avgRevenue ? d : best, dayStats[0]);
  const daysWithRevenue = dayStats.filter(d => d.avgRevenue > 0);
  const worstDay = daysWithRevenue.length > 0
    ? daysWithRevenue.reduce((worst, d) => d.avgRevenue < worst.avgRevenue ? d : worst, daysWithRevenue[0])
    : dayStats[0];

  if (dailyData.length < 7 || dayStats.every(d => d.avgRevenue === 0)) return null;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover chart-animate">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Rendimiento por Día de la Semana
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Promedio diario — <span className="text-emerald-600 font-medium">mejor: {bestDay.day}</span>
          {worstDay.day !== bestDay.day && <> · <span className="text-red-500 font-medium">más bajo: {worstDay.day}</span></>}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {dayStats.map((d) => {
            const pct = maxRevenue > 0 ? (d.avgRevenue / maxRevenue) * 100 : 0;
            const isBest = d.day === bestDay.day && d.avgRevenue > 0;
            const isWorst = d.day === worstDay.day && d.avgRevenue > 0 && worstDay.day !== bestDay.day;
            const gradient = isBest ? BAR_GRADIENTS.best : isWorst ? BAR_GRADIENTS.worst : BAR_GRADIENTS.normal;

            return (
              <div
                key={d.day}
                className="flex items-center gap-3 rounded-lg px-1 py-0.5 transition-all duration-200 hover:bg-muted/30"
              >
                <span className={cn(
                  'text-xs w-8 text-right font-medium shrink-0',
                  isBest ? 'text-emerald-600' : isWorst ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {d.dayShort}
                </span>
                <div className="flex-1 h-7 bg-muted/40 rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-700"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`,
                    }}
                  />
                  {d.avgRevenue > 0 && (
                    <div className="absolute inset-0 flex items-center px-3 justify-between">
                      <span className="text-xs font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${d.avgRevenue.toLocaleString('es-CL')}
                      </span>
                      <span className="text-[10px] text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {d.avgOrders} pedidos/día
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center">
          Usa esta información para programar tus campañas en los días de mayor venta
        </p>
      </CardContent>
    </Card>
  );
}
