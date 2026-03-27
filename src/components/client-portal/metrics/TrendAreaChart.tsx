import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/lib/chart-theme';

interface DailyData {
  date: string;
  spend: number;
  revenue?: number;
}

interface TrendAreaChartProps {
  data: DailyData[];
  spendTarget?: number;
  formatCurrency: (v: number) => string;
}

export function TrendAreaChart({ data, spendTarget, formatCurrency }: TrendAreaChartProps) {
  const chartData = useMemo(() => {
    return [...data].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date: d.date,
      spend: d.spend,
      revenue: d.revenue ?? 0,
    }));
  }, [data]);

  // Daily target = monthly target / 30
  const dailyTarget = spendTarget ? spendTarget / 30 : undefined;

  if (chartData.length === 0) return null;

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Tendencia de Gasto</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + 'T12:00:00');
                  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v)}
                width={70}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'spend' ? 'Gasto' : 'Ingresos',
                ]}
                labelFormatter={(label: string) => {
                  const d = new Date(label + 'T12:00:00');
                  return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                }}
                contentStyle={TOOLTIP_STYLE}
              />
              {dailyTarget && (
                <ReferenceLine
                  y={dailyTarget}
                  stroke={CHART_COLORS.danger}
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{ value: `Meta diaria: ${formatCurrency(dailyTarget)}`, position: 'insideTopRight', fontSize: 10, fill: CHART_COLORS.danger }}
                />
              )}
              <Area
                type="monotone"
                dataKey="spend"
                stroke={CHART_COLORS.primary}
                strokeWidth={2.5}
                fill="url(#spendGradient)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
              />
              {chartData.some((d) => d.revenue > 0) && (
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.success}
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
