import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trophy, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BestTimesHeatmapProps {
  clientId: string;
}

interface PostData {
  published_at: string;
  likes: number;
  comments: number;
  shares: number;
}

interface HeatCell {
  day: number; // 0-6 (Mon-Sun)
  hour: number; // 0-23
  count: number;
  avgEngagement: number;
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7:00 - 22:00

function getColor(value: number, max: number): string {
  if (max === 0) return 'bg-muted/30';
  const pct = value / max;
  if (pct >= 0.8) return 'bg-green-500';
  if (pct >= 0.6) return 'bg-green-400';
  if (pct >= 0.4) return 'bg-yellow-400';
  if (pct >= 0.2) return 'bg-orange-300';
  if (pct > 0) return 'bg-orange-200';
  return 'bg-muted/30';
}

export function BestTimesHeatmap({ clientId }: BestTimesHeatmapProps) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      // Query published instagram posts with engagement data
      const { data, error } = await supabase
        .from('instagram_scheduled_posts')
        .select('published_at, likes, comments, shares')
        .eq('client_id', clientId)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setPosts((data as PostData[]) || []);
    } catch (err: any) {
      toast.error('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [clientId]);

  const { heatmap, maxEng, topSlots } = useMemo(() => {
    const grid: Record<string, { count: number; totalEng: number }> = {};

    for (const p of posts) {
      if (!p.published_at) continue;
      const d = new Date(p.published_at);
      const day = (d.getDay() + 6) % 7; // Mon=0
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      const eng = (p.likes || 0) + (p.comments || 0) * 2 + (p.shares || 0) * 3;
      if (!grid[key]) grid[key] = { count: 0, totalEng: 0 };
      grid[key].count++;
      grid[key].totalEng += eng;
    }

    const cells: HeatCell[] = [];
    let maxEng = 0;

    for (let d = 0; d < 7; d++) {
      for (const h of HOURS) {
        const key = `${d}-${h}`;
        const g = grid[key];
        const avgEng = g ? g.totalEng / g.count : 0;
        cells.push({ day: d, hour: h, count: g?.count || 0, avgEngagement: avgEng });
        if (avgEng > maxEng) maxEng = avgEng;
      }
    }

    const topSlots = [...cells]
      .filter(c => c.count > 0)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    return { heatmap: cells, maxEng, topSlots };
  }, [posts]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Mejor Hora para Publicar</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Mejor Hora para Publicar
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Basado en {posts.length} publicaciones históricas
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchPosts}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Publica contenido en Instagram para ver el análisis de mejor hora.
          </p>
        ) : (
          <>
            {/* Top 3 slots */}
            {topSlots.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {topSlots.map((slot, i) => (
                  <Badge
                    key={i}
                    variant={i === 0 ? 'default' : 'secondary'}
                    className="text-sm py-1.5 px-3 gap-1.5"
                  >
                    {i === 0 && <Trophy className="h-3.5 w-3.5" />}
                    {DAYS[slot.day]} {slot.hour}:00
                    <span className="text-xs opacity-70">
                      ({slot.count} posts, avg {Math.round(slot.avgEngagement)} eng)
                    </span>
                  </Badge>
                ))}
              </div>
            )}

            {/* Heatmap grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Header row: hours */}
                <div className="grid gap-0.5" style={{ gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)` }}>
                  <div />
                  {HOURS.map(h => (
                    <div key={h} className="text-[10px] text-center text-muted-foreground">
                      {h}:00
                    </div>
                  ))}
                </div>

                {/* Day rows */}
                {DAYS.map((dayName, dayIdx) => (
                  <div
                    key={dayIdx}
                    className="grid gap-0.5 mt-0.5"
                    style={{ gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)` }}
                  >
                    <div className="text-xs font-medium flex items-center">{dayName}</div>
                    {HOURS.map(h => {
                      const cell = heatmap.find(c => c.day === dayIdx && c.hour === h);
                      const avg = cell?.avgEngagement || 0;
                      return (
                        <div
                          key={h}
                          className={`h-8 rounded-sm ${getColor(avg, maxEng)} transition-colors cursor-default relative group`}
                          title={`${dayName} ${h}:00 — ${cell?.count || 0} posts, avg engagement: ${Math.round(avg)}`}
                        >
                          <div className="absolute hidden group-hover:block z-10 -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-[10px] whitespace-nowrap shadow-md">
                            {cell?.count || 0} posts · {Math.round(avg)} eng
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Menos engagement</span>
              <div className="flex gap-0.5">
                <div className="w-4 h-4 rounded-sm bg-muted/30" />
                <div className="w-4 h-4 rounded-sm bg-orange-200" />
                <div className="w-4 h-4 rounded-sm bg-orange-300" />
                <div className="w-4 h-4 rounded-sm bg-yellow-400" />
                <div className="w-4 h-4 rounded-sm bg-green-400" />
                <div className="w-4 h-4 rounded-sm bg-green-500" />
              </div>
              <span>Más engagement</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
