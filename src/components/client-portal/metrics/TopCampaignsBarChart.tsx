import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DONUT_COLORS } from '@/lib/metric-utils';
import { TOOLTIP_STYLE } from '@/lib/chart-theme';

interface CampaignData {
  campaign_name: string;
  total_spend: number;
}

interface TopCampaignsBarChartProps {
  campaigns: CampaignData[];
  formatCurrency: (v: number) => string;
}

export function TopCampaignsBarChart({ campaigns, formatCurrency }: TopCampaignsBarChartProps) {
  const chartData = useMemo(() => {
    return [...campaigns]
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 5)
      .map((c) => ({
        name: c.campaign_name.length > 30 ? c.campaign_name.slice(0, 27) + '...' : c.campaign_name,
        spend: c.total_spend,
      }));
  }, [campaigns]);

  if (chartData.length === 0) return null;

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Top Campañas por Gasto</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="spend" radius={[0, 6, 6, 0]} barSize={28}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
