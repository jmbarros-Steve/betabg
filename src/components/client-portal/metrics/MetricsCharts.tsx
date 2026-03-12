import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from 'recharts';

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
    tick: { fontSize: tickFontSize },
    className: "text-muted-foreground",
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

  // Merge previous period revenue into current data by index (aligned by position, not date)
  const mergedData = useMemo(() => {
    if (!previousRevenueData || previousRevenueData.length === 0) return revenueData;
    return revenueData.map((item, i) => ({
      ...item,
      prevRevenue: previousRevenueData[i]?.revenue ?? null,
    }));
  }, [revenueData, previousRevenueData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue vs Spend Chart */}
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700">
            {hasSpendData ? 'Ingresos vs Inversión por Día' : 'Ingresos por Día'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            {hasSpendData ? (
              <ComposedChart data={mergedData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis {...xAxisProps} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: tickFontSize }}
                  className="text-muted-foreground"
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: tickFontSize }}
                  className="text-muted-foreground"
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    `$${value.toLocaleString('es-CL')} CLP`,
                    name === 'prevRevenue' ? 'Período anterior' : name === 'revenue' ? 'Ingresos' : 'Inversión'
                  ]}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  name="revenue"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="spend"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="spend"
                />
                {hasPreviousData && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke="#94a3b8"
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
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis {...xAxisProps} />
                <YAxis
                  tick={{ fontSize: tickFontSize }}
                  className="text-muted-foreground"
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    `$${value.toLocaleString('es-CL')} ${currency}`,
                    name === 'prevRevenue' ? 'Período anterior' : 'Ingresos'
                  ]}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenueSingle)"
                />
                {hasPreviousData && (
                  <Line
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke="#94a3b8"
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
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">Ingresos</span>
              </div>
              {hasSpendData && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0" style={{ borderTop: '2px dashed hsl(var(--destructive))' }} />
                  <span className="text-muted-foreground">Inversión Publicitaria</span>
                </div>
              )}
              {hasPreviousData && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5" style={{ borderTop: '2px dashed #94a3b8' }} />
                  <span className="text-muted-foreground">Período anterior</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Chart */}
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700">
            Órdenes por Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis {...xAxisProps} />
              <YAxis tick={{ fontSize: tickFontSize }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [value.toLocaleString('es-CL'), 'Órdenes']}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Bar
                dataKey="orders"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                opacity={0.8}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
