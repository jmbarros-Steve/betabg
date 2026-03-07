import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from 'recharts';

interface MetricsChartsProps {
  revenueData: { date: string; revenue: number; orders: number; spend?: number }[];
  currency?: string;
}

export function MetricsCharts({ revenueData, currency = 'CLP' }: MetricsChartsProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const hasSpendData = revenueData.some(d => (d.spend ?? 0) > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue vs Spend Chart */}
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {hasSpendData ? 'Ingresos vs Inversión por Día' : 'Ingresos por Día'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {hasSpendData ? (
                <ComposedChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                    tickFormatter={(val) => val.slice(5)}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                    tickFormatter={formatCurrency}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString('es-CL')} ${name === 'revenue' ? 'CLP' : 'USD'}`,
                      name === 'revenue' ? 'Ingresos' : 'Inversión'
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
                </ComposedChart>
              ) : (
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenueSingle" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                    tickFormatter={(val) => val.slice(5)}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString('es-CL')} ${currency}`, 'Ingresos']}
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
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          {hasSpendData && (
            <div className="flex items-center justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">Ingresos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-destructive" style={{ borderStyle: 'dashed' }} />
                <span className="text-muted-foreground">Inversión Publicitaria</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Chart */}
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Órdenes por Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }} 
                  className="text-muted-foreground"
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
