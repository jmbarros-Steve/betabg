import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  TrendingUp,
  Loader2,
  Zap,
} from 'lucide-react';

/* ---------- types ---------- */

interface SendTimeHeatmapProps {
  clientId: string;
}

interface HeatmapCell {
  count: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgRevenue: number;
  avgConversions: number;
  score: number; // 0-100
}

interface HeatmapInsight {
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

interface HeatmapData {
  heatmap: HeatmapCell[][]; // [7 days][24 hours]
  insights: HeatmapInsight[];
  bestSlots: Array<{ day: number; hour: number; score: number }>;
  worstSlots: Array<{ day: number; hour: number; score: number }>;
  totalCampaignsAnalyzed: number;
  dateRange: { from: string; to: string };
}

/* ---------- constants ---------- */

const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const DAY_LABELS_FULL = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

/** Hours displayed: 6 AM through 11 PM (indices 6..23) */
const VISIBLE_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

/* ---------- helpers ---------- */

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatHourShort(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

function scoreToColor(score: number): string {
  if (score === 0) return '#f3f4f6'; // gray-100
  if (score < 20) return '#dbeafe'; // blue-100
  if (score < 40) return '#bfdbfe'; // blue-200
  if (score < 50) return '#fef3c7'; // amber-100
  if (score < 60) return '#fde68a'; // amber-200
  if (score < 70) return '#fcd34d'; // amber-300
  if (score < 80) return '#fb923c'; // orange-400
  if (score < 90) return '#f87171'; // red-400
  return '#ef4444'; // red-500
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/* ---------- style maps ---------- */

const INSIGHT_BORDER: Record<HeatmapInsight['type'], string> = {
  success: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
};

const INSIGHT_BG: Record<HeatmapInsight['type'], string> = {
  success: 'bg-green-50 dark:bg-green-950/20',
  warning: 'bg-yellow-50 dark:bg-yellow-950/20',
  info: 'bg-blue-50 dark:bg-blue-950/20',
};

const INSIGHT_ICON_COLOR: Record<HeatmapInsight['type'], string> = {
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

const INSIGHT_ICON: Record<HeatmapInsight['type'], React.ElementType> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

/* ---------- sub-components ---------- */

function HeatmapTooltip({
  cell,
  day,
  hour,
  x,
  y,
}: {
  cell: HeatmapCell;
  day: number;
  hour: number;
  x: number;
  y: number;
}) {
  return (
    <div
      className="fixed z-50 pointer-events-none bg-popover text-popover-foreground border border-border rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[180px]"
      style={{
        left: x + 12,
        top: y - 8,
      }}
    >
      <p className="font-semibold text-sm mb-1.5">
        {DAY_LABELS_FULL[day]} {formatHour(hour)}
      </p>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Open Rate:</span>
          <span className="font-medium text-foreground">{formatPercent(cell.avgOpenRate)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Click Rate:</span>
          <span className="font-medium text-foreground">{formatPercent(cell.avgClickRate)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Revenue:</span>
          <span className="font-medium text-foreground">{formatCurrency(cell.avgRevenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Campanas:</span>
          <span className="font-medium text-foreground">{cell.count}</span>
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border/50 flex justify-between">
        <span className="text-muted-foreground">Score:</span>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0"
          style={{ backgroundColor: scoreToColor(cell.score), color: cell.score >= 70 ? '#fff' : '#1a1a2e' }}
        >
          {cell.score}
        </Badge>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: HeatmapInsight }) {
  const Icon = INSIGHT_ICON[insight.type];

  return (
    <Card className={`border-l-4 ${INSIGHT_BORDER[insight.type]} ${INSIGHT_BG[insight.type]} shadow-sm`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${INSIGHT_ICON_COLOR[insight.type]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{insight.title}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{insight.message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- main component ---------- */

export function SendTimeHeatmap({ clientId }: SendTimeHeatmapProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cell: HeatmapCell;
    day: number;
    hour: number;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // Step 1: check Klaviyo connection
  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (conn) {
        setConnectionId(conn.id);
        setHasConnection(true);
      } else {
        setHasConnection(false);
        setLoading(false);
      }
    }

    checkConnection();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Step 2: fetch heatmap data once we have a connection
  const fetchHeatmap = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await callApi(
        'steve-send-time-analysis',
        { body: { connectionId } }
      );

      if (fnError) {
        console.error('Error fetching send time heatmap:', fnError);
        setError(fnError || 'Error al cargar analisis de horarios');
        toast.error('Error al cargar analisis de horarios');
        return;
      }

      if (!result) {
        setError('No se recibieron datos del analisis');
        return;
      }

      // Check minimum data threshold
      if (result.totalCampaignsAnalyzed !== undefined && result.totalCampaignsAnalyzed < 5) {
        setError('NOT_ENOUGH_DATA');
        return;
      }

      setData(result as HeatmapData);
    } catch (err: any) {
      console.error('Error in send time analysis:', err);
      setError(err.message || 'Error inesperado');
      toast.error('Error al analizar horarios de envio');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (connectionId) {
      fetchHeatmap();
    }
  }, [connectionId, fetchHeatmap]);

  const handleRefresh = () => {
    fetchHeatmap();
  };

  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    cell: HeatmapCell,
    day: number,
    hour: number
  ) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      cell,
      day,
      hour,
    });
  };

  const handleCellMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  };

  const handleCellMouseLeave = () => {
    setTooltip(null);
  };

  // --- No connection state ---
  if (hasConnection === false) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8 text-center">
          <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Conecta Klaviyo para analizar tus horarios de envio
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Still checking connection ---
  if (hasConnection === null) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
            <p className="text-xs text-muted-foreground text-center">Verificando conexion...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Loading state ---
  if (loading) {
    return (
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Horarios Optimos de Envio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-muted-foreground">
                Steve esta analizando tus horarios de envio...
              </span>
            </div>
            {/* Skeleton grid */}
            <div className="space-y-2">
              {[...Array(7)].map((_, row) => (
                <div key={row} className="flex gap-1">
                  <Skeleton className="w-10 h-8 rounded shrink-0" />
                  {[...Array(18)].map((_, col) => (
                    <Skeleton key={col} className="w-8 h-8 rounded flex-1" />
                  ))}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Not enough data state ---
  if (error === 'NOT_ENOUGH_DATA') {
    return (
      <Card className="glow-box">
        <CardContent className="py-8 text-center">
          <Info className="w-8 h-8 mx-auto text-blue-500 mb-2" />
          <p className="text-sm font-medium mb-1">Datos insuficientes</p>
          <p className="text-muted-foreground text-sm">
            Se necesitan al menos 5 campanas enviadas para analizar horarios
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-yellow-500" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- No data (shouldn't happen but guard) ---
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Tooltip (portal-free, fixed positioning) */}
      {tooltip && (
        <HeatmapTooltip
          cell={tooltip.cell}
          day={tooltip.day}
          hour={tooltip.hour}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}

      {/* Header + Heatmap Grid */}
      <Card className="glow-box">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Horarios Optimos de Envio
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Basado en {data.totalCampaignsAnalyzed} campanas analizadas
                {data.dateRange && (
                  <span>
                    {' '}
                    &middot; {new Date(data.dateRange.from).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                    {' - '}
                    {new Date(data.dateRange.to).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Actualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto" ref={gridRef}>
            {/* Grid: day labels column + 18 hour columns */}
            <div
              className="inline-grid gap-[3px] min-w-fit"
              style={{
                gridTemplateColumns: `48px repeat(${VISIBLE_HOURS.length}, 1fr)`,
              }}
            >
              {/* Header row: empty corner + hour labels */}
              <div /> {/* empty top-left corner */}
              {VISIBLE_HOURS.map((h) => (
                <div
                  key={`header-${h}`}
                  className="text-[10px] text-muted-foreground text-center font-medium leading-tight pb-1"
                >
                  {formatHourShort(h)}
                </div>
              ))}

              {/* Data rows */}
              {DAY_LABELS.map((dayLabel, dayIdx) => (
                <React.Fragment key={`row-${dayIdx}`}>
                  {/* Day label */}
                  <div className="flex items-center text-xs font-medium text-muted-foreground pr-2">
                    {dayLabel}
                  </div>

                  {/* Cells for each visible hour */}
                  {VISIBLE_HOURS.map((hour) => {
                    const cell = data.heatmap[dayIdx]?.[hour];
                    if (!cell) {
                      return (
                        <div
                          key={`${dayIdx}-${hour}`}
                          className="w-8 h-8 rounded-sm bg-muted/30 border border-dashed border-border/40"
                        />
                      );
                    }

                    const isEmpty = cell.count === 0;

                    return (
                      <div
                        key={`${dayIdx}-${hour}`}
                        className={cn(
                          'w-8 h-8 rounded-sm cursor-pointer transition-all duration-150 hover:scale-110 hover:ring-2 hover:ring-foreground/20 hover:z-10',
                          isEmpty && 'border border-dashed border-border/40'
                        )}
                        style={{
                          backgroundColor: scoreToColor(cell.score),
                        }}
                        onMouseEnter={(e) => handleCellMouseEnter(e, cell, dayIdx, hour)}
                        onMouseMove={handleCellMouseMove}
                        onMouseLeave={handleCellMouseLeave}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground font-medium">Bajo rendimiento</span>
              <div className="flex gap-[2px]">
                {[
                  '#dbeafe',
                  '#bfdbfe',
                  '#fef3c7',
                  '#fde68a',
                  '#fcd34d',
                  '#fb923c',
                  '#f87171',
                  '#ef4444',
                ].map((color) => (
                  <div
                    key={color}
                    className="w-6 h-3 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">Alto rendimiento</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best & Worst Slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Best slots */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Mejores Horarios
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {data.bestSlots.slice(0, 5).map((slot, i) => (
                <div
                  key={`best-${i}`}
                  className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-green-50/50 dark:bg-green-950/10"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  <span className="font-medium">
                    {DAY_LABELS_FULL[slot.day]} {formatHour(slot.hour)}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    Score: {slot.score}
                  </span>
                </div>
              ))}
              {data.bestSlots.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Sin datos suficientes</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Worst slots */}
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Evitar
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {data.worstSlots.slice(0, 5).map((slot, i) => (
                <div
                  key={`worst-${i}`}
                  className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-red-50/50 dark:bg-red-950/10"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span className="font-medium">
                    {DAY_LABELS_FULL[slot.day]} {formatHour(slot.hour)}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    Score: {slot.score}
                  </span>
                </div>
              ))}
              {data.worstSlots.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Sin datos suficientes</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Steve's Insights */}
      {data.insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Insights de Steve
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
