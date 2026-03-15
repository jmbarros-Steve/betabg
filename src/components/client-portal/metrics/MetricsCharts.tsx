import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from 'recharts';

interface MetricsChartsProps {
  revenueData: { date: string; revenue: number; orders: number; spend?: number }[];
  previousRevenueData?: { date: string; revenue: number; orders: number; spend?: number }[];
  currency?: string;
}

const darkTooltipStyle = {
  background: 'rgba(10,10,15,0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  color: '#f0f0f5',
  fontSize: '12px',
  padding: '12px 16px',
};

const darkTooltipLabelStyle = { color: 'rgba(255,255,255,0.5)', marginBottom: '4px' };

const darkAxisTick = (fontSize: number) => ({ fill: 'rgba(255,255,255,0.4)', fontSize });
const darkAxisLine = { stroke: 'rgba(255,255,255,0.06)' };
const darkGridStroke = 'rgba(255,255,255,0.04)';

const cardClass = 'bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-sm';

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
    tick: darkAxisTick(tickFontSize),
    axisLine: darkAxisLine,
    tickLine: darkAxisLine,
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

  const gradientDefs = (
    <>
      <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue vs Spend Chart */}
      <Card className={cardClass}>
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
                  {gradientDefs}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={darkGridStroke} />
                <XAxis {...xAxisProps} />
                <YAxis
                  yAxisId="left"
                  tick={darkAxisTick(tickFontSize)}
                  axisLine={darkAxisLine}
                  tickLine={darkAxisLine}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={darkAxisTick(tickFontSize)}
                  axisLine={darkAxisLine}
                  tickLine={darkAxisLine}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={darkTooltipLabelStyle}
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
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradRevenue)"
                  name="revenue"
                  filter="url(#glow)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="spend"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeOpacity={0.7}
                  dot={false}
                  name="spend"
                />
                {hasPreviousData && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke="rgba(255,255,255,0.15)"
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
                  {gradientDefs}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={darkGridStroke} />
                <XAxis {...xAxisProps} />
                <YAxis
                  tick={darkAxisTick(tickFontSize)}
                  axisLine={darkAxisLine}
                  tickLine={darkAxisLine}
                  tickFormatter={formatCurrency}
                  width={isMobile ? 45 : 60}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={darkTooltipLabelStyle}
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
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradRevenue)"
                  filter="url(#glow)"
                />
                {hasPreviousData && (
                  <Line
                    type="monotone"
                    dataKey="prevRevenue"
                    stroke="rgba(255,255,255,0.15)"
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
                <div className="w-3 h-3 rounded-full" style={{ background: '#6366f1' }} />
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Ingresos</span>
              </div>
              {hasSpendData && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0" style={{ borderTop: '2px dashed #f59e0b' }} />
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Inversión Publicitaria</span>
                </div>
              )}
              {hasPreviousData && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5" style={{ borderTop: '2px dashed rgba(255,255,255,0.15)' }} />
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Período anterior</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Chart */}
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Órdenes por Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={darkGridStroke} />
              <XAxis {...xAxisProps} />
              <YAxis
                tick={darkAxisTick(tickFontSize)}
                axisLine={darkAxisLine}
                tickLine={darkAxisLine}
              />
              <Tooltip
                contentStyle={darkTooltipStyle}
                labelStyle={darkTooltipLabelStyle}
                formatter={(value: number) => [value.toLocaleString('es-CL'), 'Órdenes']}
                labelFormatter={(label: string) => {
                    const d = new Date(label + 'T12:00:00');
                    return isNaN(d.getTime()) ? label : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                  }}
              />
              <Bar
                dataKey="orders"
                fill="rgba(59,130,246,0.5)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
