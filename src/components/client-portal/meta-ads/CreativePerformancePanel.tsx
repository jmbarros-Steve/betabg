import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Trophy, TrendingDown, Sparkles, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreativeRow {
  id: string;
  angle: string | null;
  theme: string | null;
  copy_text: string | null;
  cqs_score: number | null;
  meta_roas: number | null;
  meta_spend: number | null;
  meta_conversions: number | null;
  meta_ctr: number | null;
  meta_cpa: number | null;
  performance_score: number | null;
  performance_verdict: string | null;
  type: string;
  created_at: string;
}

interface AngleStats {
  angle: string;
  avgCqs: number;
  avgRoas: number;
  totalSpend: number;
  totalConversions: number;
  count: number;
}

interface FormatStats {
  format: string;
  avgCqs: number;
  avgRoas: number;
  count: number;
}

interface CreativePerformancePanelProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCLP = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const VERDICT_COLORS: Record<string, string> = {
  winner: 'bg-green-500/15 text-green-700 border-green-500/30',
  good: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  average: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  poor: 'bg-red-500/15 text-red-600 border-red-500/30',
};

const CHART_COLORS = ['#2A4F9E', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreativePerformancePanel({ clientId }: CreativePerformancePanelProps) {
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('creative_history')
        .select('id, angle, theme, copy_text, cqs_score, meta_roas, meta_spend, meta_conversions, meta_ctr, meta_cpa, performance_score, performance_verdict, type, created_at')
        .eq('client_id', clientId)
        .eq('channel', 'meta')
        .not('performance_score', 'is', null)
        .order('performance_score', { ascending: false })
        .limit(200);

      setCreatives(data || []);
      setLoading(false);
    })();
  }, [clientId]);

  // ---- Aggregations ----

  const angleStats = useMemo(() => {
    const map = new Map<string, { totalCqs: number; totalRoas: number; totalSpend: number; totalConv: number; count: number }>();
    for (const c of creatives) {
      const angle = c.angle || 'Sin ángulo';
      const prev = map.get(angle) || { totalCqs: 0, totalRoas: 0, totalSpend: 0, totalConv: 0, count: 0 };
      prev.totalCqs += c.cqs_score || 0;
      prev.totalRoas += c.meta_roas || 0;
      prev.totalSpend += c.meta_spend || 0;
      prev.totalConv += c.meta_conversions || 0;
      prev.count += 1;
      map.set(angle, prev);
    }
    return Array.from(map, ([angle, v]): AngleStats => ({
      angle,
      avgCqs: v.count > 0 ? v.totalCqs / v.count : 0,
      avgRoas: v.count > 0 ? v.totalRoas / v.count : 0,
      totalSpend: v.totalSpend,
      totalConversions: v.totalConv,
      count: v.count,
    })).sort((a, b) => b.avgCqs - a.avgCqs);
  }, [creatives]);

  const formatStats = useMemo(() => {
    const map = new Map<string, { totalCqs: number; totalRoas: number; count: number }>();
    for (const c of creatives) {
      const fmt = c.type || 'Desconocido';
      const prev = map.get(fmt) || { totalCqs: 0, totalRoas: 0, count: 0 };
      prev.totalCqs += c.cqs_score || 0;
      prev.totalRoas += c.meta_roas || 0;
      prev.count += 1;
      map.set(fmt, prev);
    }
    return Array.from(map, ([format, v]): FormatStats => ({
      format,
      avgCqs: v.count > 0 ? v.totalCqs / v.count : 0,
      avgRoas: v.count > 0 ? v.totalRoas / v.count : 0,
      count: v.count,
    })).sort((a, b) => b.avgRoas - a.avgRoas);
  }, [creatives]);

  const top5 = useMemo(() => creatives.slice(0, 5), [creatives]);
  const bottom5 = useMemo(
    () => creatives.length > 5 ? [...creatives].sort((a, b) => (a.performance_score || 0) - (b.performance_score || 0)).slice(0, 5) : [],
    [creatives],
  );

  // ---- Render ----

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (creatives.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin datos de performance</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Los datos aparecerán automáticamente cuando tus creativos lleven 48+ horas activos en Meta.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance por Creatividad</h2>
        <p className="text-muted-foreground text-sm">
          {creatives.length} creativo{creatives.length !== 1 ? 's' : ''} con métricas de performance
        </p>
      </div>

      {/* ---- Ranking by Angle ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ranking por Ángulo</CardTitle>
        </CardHeader>
        <CardContent>
          {angleStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin datos de ángulos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-3">Ángulo</th>
                    <th className="text-right py-2 px-3">CQS Prom.</th>
                    <th className="text-right py-2 px-3">ROAS Prom.</th>
                    <th className="text-right py-2 px-3">Gasto Total</th>
                    <th className="text-right py-2 px-3">Conversiones</th>
                    <th className="text-right py-2 px-3"># Creativos</th>
                  </tr>
                </thead>
                <tbody>
                  {angleStats.map((a, i) => (
                    <tr key={a.angle} className={`border-b border-border/30 ${i % 2 === 0 ? '' : 'bg-muted/15'}`}>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-xs">{a.angle}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {a.avgCqs > 0 ? Math.round(a.avgCqs) : '--'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-medium ${a.avgRoas >= 3 ? 'text-green-600' : a.avgRoas >= 2 ? 'text-yellow-600' : a.avgRoas > 0 ? 'text-red-500' : ''}`}>
                        {a.avgRoas > 0 ? `${a.avgRoas.toFixed(2)}x` : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatCLP(a.totalSpend)}</td>
                      <td className="py-2.5 px-3 text-right">{formatNumber(a.totalConversions)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Top 5 vs Bottom 5 ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-green-600" />
              Top 5 Creativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {top5.map((c) => (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  {c.angle && <Badge variant="outline" className="text-[10px]">{c.angle}</Badge>}
                  {c.performance_verdict && (
                    <Badge variant="outline" className={`text-[10px] ${VERDICT_COLORS[c.performance_verdict] || ''}`}>
                      {c.performance_verdict}
                    </Badge>
                  )}
                  {c.cqs_score != null && (
                    <span className="text-[10px] font-medium text-muted-foreground">CQS: {c.cqs_score}</span>
                  )}
                </div>
                {c.copy_text && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{c.copy_text}</p>
                )}
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  {c.meta_roas != null && <span>ROAS: <strong className="text-foreground">{c.meta_roas.toFixed(2)}x</strong></span>}
                  {c.meta_spend != null && <span>Gasto: <strong className="text-foreground">{formatCLP(c.meta_spend)}</strong></span>}
                  {c.meta_ctr != null && <span>CTR: <strong className="text-foreground">{c.meta_ctr.toFixed(2)}%</strong></span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Bottom 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Bottom 5 Creativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bottom5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Se necesitan 6+ creativos para mostrar bottom 5</p>
            ) : (
              bottom5.map((c) => (
                <div key={c.id} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    {c.angle && <Badge variant="outline" className="text-[10px]">{c.angle}</Badge>}
                    {c.performance_verdict && (
                      <Badge variant="outline" className={`text-[10px] ${VERDICT_COLORS[c.performance_verdict] || ''}`}>
                        {c.performance_verdict}
                      </Badge>
                    )}
                    {c.cqs_score != null && (
                      <span className="text-[10px] font-medium text-muted-foreground">CQS: {c.cqs_score}</span>
                    )}
                  </div>
                  {c.copy_text && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{c.copy_text}</p>
                  )}
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    {c.meta_roas != null && <span>ROAS: <strong className="text-foreground">{c.meta_roas.toFixed(2)}x</strong></span>}
                    {c.meta_spend != null && <span>Gasto: <strong className="text-foreground">{formatCLP(c.meta_spend)}</strong></span>}
                    {c.meta_ctr != null && <span>CTR: <strong className="text-foreground">{c.meta_ctr.toFixed(2)}%</strong></span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Performance by Format (chart) ---- */}
      {formatStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Performance por Formato</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={formatStats} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="format" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'avgRoas' ? [`${value.toFixed(2)}x`, 'ROAS Prom.'] : [Math.round(value), 'CQS Prom.']
                  }
                />
                <Bar dataKey="avgRoas" name="ROAS Prom." radius={[4, 4, 0, 0]}>
                  {formatStats.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {formatStats.map((f, i) => (
                <div key={f.format} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-muted-foreground">{f.format}</span>
                  <span className="font-medium">({f.count})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
