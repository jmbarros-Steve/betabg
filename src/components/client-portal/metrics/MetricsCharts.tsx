import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/lib/chart-theme';

interface MetricsChartsProps {
  revenueData: { date: string; revenue: number; orders: number; spend?: number }[];
  previousRevenueData?: { date: string; revenue: number; orders: number; spend?: number }[];
  currency?: string;
}

export function MetricsCharts({ revenueData, previousRevenueData, currency = 'CLP' }: MetricsChartsProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const chartHeight = isMobile ? 250 : 350;
  const tickFontSize = isMobile ? 10 : 12;
  const xAxisProps = {
    dataKey: "date" as const,
    tick: { fontSize: tickFontSize, fill: CHART_COLORS.muted },
    tickFormatter: (val: string) => val.slice(5),
    interval: isMobile ? ('preserveStartEnd' as const) : (0 as const),
    angle: isMobile ? -45 : 0,
    textAnchor: (isMobile ? 'end' : 'middle') as string,
    height: isMobile ? 60 : 30,
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const hasSpendData = revenueData.some(d => (d.spend ?? 0) > 0);
  const hasPreviousData = previousRevenueData && previousRevenueData.length > 0;

  const mergedData = useMemo(() => {
    if (!previousRevenueData || previousRevenueData.length === 0) return revenueData;
    return revenueData.map((item, i) => ({
      ...item,
      prevRevenue: previousRevenueData[i]?.revenue ?? null,
    }));
  }, [revenueData, previousRevenueData]);

  const activeDot = {
    r: 5,
    strokeWidth: 2,
    stroke: '#fff',
    fill: CHART_COLORS.primary,
    filter: 'drop-shadow(0 0 6px rgba(37,99,235,0.5))',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue vs Spend Chart */}
      <Card className="bg-card border border-border rounded-xl card-hover chart-animate">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            {hasSpendData ? 'Ingresos vs Inversión por Día' : 'Ingresos por Día'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            {hasSpendData ? (
              <ComposedChart data={mergedData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={CHART_COLORS.primaryLight} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.danger} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.dangerLight} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="" />
                <XAxis {...xAxisProps} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: tickFontSize, fill: CHART_COLORS.muted }}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: tickFontSize, fill: CHART_COLORS.muted }}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    `$${value.toLocaleString('es-CL')} ${currency}`,
                    name === 'prevRevenue' ? 'Período anterior' : name === 'revenue' ? 'Ingresos' : 'Inversión'
                  ]}
                  labelFormatter={(label: string) => {
                    const d = new Date(label + 'T12:00:00');
                    return isNaN(d.getTime()) ? label : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  name="revenue"
                  activeDot={activeDot}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="spend"
                  stroke={CHART_COLORS.danger}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="spend"
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                {hasPreviousData && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke={CHART_COLORS.muted}
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                    name="prevRevenue"
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            ) : (
              <ComposedChart data={mergedData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
                <defs>
                  <linearGradient id="colorRevenueSingle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={CHART_COLORS.primaryLight} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="" />
                <XAxis {...xAxisProps} />
                <YAxis
                  tick={{ fontSize: tickFontSize, fill: CHART_COLORS.muted }}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    `$${value.toLocaleString('es-CL')} ${currency}`,
                    name === 'prevRevenue' ? 'Período anterior' : 'Ingresos'
                  ]}
                  labelFormatter={(label: string) => {
                    const d = new Date(label + 'T12:00:00');
                    return isNaN(d.getTime()) ? label : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fillOpacity={1}
                  fill="url(#colorRevenueSingle)"
                  activeDot={activeDot}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                {hasPreviousData && (
                  <Line
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke={CHART_COLORS.muted}
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                    name="prevRevenue"
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
          {(hasSpendData || hasPreviousData) && (
            <div className={`flex items-center justify-center ${isMobile ? 'gap-4' : 'gap-6'} mt-4 text-xs flex-wrap`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.primary }} />
                <span className="text-muted-foreground font-medium">Ingresos</span>
              </div>
              {hasSpendData && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0" style={{ borderTop: `2px dashed ${CHART_COLORS.danger}` }} />
                  <span className="text-muted-foreground font-medium">Inversión Publicitaria</span>
                </div>
              )}
              {hasPreviousData && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5" style={{ borderTop: `2px dashed ${CHART_COLORS.muted}` }} />
                  <span className="text-muted-foreground font-medium">Período anterior</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Chart */}
      <Card className="bg-card border border-border rounded-xl card-hover chart-animate" style={{ animationDelay: '0.1s' }}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Órdenes por Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
              <defs>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={1} />
                  <stop offset="100%" stopColor={CHART_COLORS.primaryDark} stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="" />
              <XAxis {...xAxisProps} />
              <YAxis tick={{ fontSize: tickFontSize, fill: CHART_COLORS.muted }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [value.toLocaleString('es-CL'), 'Órdenes']}
                labelFormatter={(label: string) => {
                    const d = new Date(label + 'T12:00:00');
                    return isNaN(d.getTime()) ? label : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                  }}
              />
              <Bar
                dataKey="orders"
                fill="url(#colorOrders)"
                radius={[6, 6, 0, 0]}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
