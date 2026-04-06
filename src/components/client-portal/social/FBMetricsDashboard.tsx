import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import {
  Users,
  Eye,
  TrendingUp,
  MousePointerClick,
  RefreshCw,
  Loader2,
  Heart,
  MessageCircle,
  ExternalLink,
  Image as ImageIcon,
  Share2,
  ThumbsUp,
} from 'lucide-react';

interface FBPage {
  name: string;
  fan_count: number;
}

interface FBMetrics {
  page_impressions: number;
  page_engaged_users: number;
  page_post_engagements: number;
  page_views_total: number;
  page_fan_adds: number;
}

interface FanPoint {
  date: string;
  value: number;
}

interface FBTopPost {
  id: string;
  message: string;
  reactions: number;
  comments: number;
  shares: number;
  engagement: number;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
}

export function FBMetricsDashboard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<FBPage | null>(null);
  const [metrics, setMetrics] = useState<FBMetrics | null>(null);
  const [fanTrend, setFanTrend] = useState<FanPoint[]>([]);
  const [topPosts, setTopPosts] = useState<FBTopPost[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, postsRes] = await Promise.all([
        callApi<{ page: FBPage; metrics: FBMetrics; fan_trend: FanPoint[] }>('fetch-facebook-insights', {
          body: {
            client_id: clientId,
            action: 'overview',
            date_from: dateFrom,
            date_to: dateTo,
          },
        }),
        callApi<{ top_posts: FBTopPost[] }>('fetch-facebook-insights', {
          body: {
            client_id: clientId,
            action: 'top_posts',
          },
        }),
      ]);

      if (overviewRes.error) {
        setError(overviewRes.error);
        return;
      }
      setPage(overviewRes.data?.page ?? null);
      setMetrics(overviewRes.data?.metrics ?? null);
      setFanTrend(overviewRes.data?.fan_trend || []);
      setTopPosts(postsRes.data?.top_posts || []);
    } catch (err: any) {
      setError(err.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [clientId]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchData} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
        </Button>
      </div>
    );
  }

  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  // Fan change in period
  const fanChange = fanTrend.length >= 2
    ? fanTrend[fanTrend.length - 1].value - fanTrend[0].value
    : 0;

  // Simple bar chart using CSS
  const maxFan = Math.max(...fanTrend.map(f => f.value), 1);
  const minFan = Math.min(...fanTrend.map(f => f.value), 0);
  const range = maxFan - minFan || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {page?.name || 'Facebook'}
              {page?.fan_count != null && (
                <span className="text-muted-foreground font-normal ml-1">
                  {fmtNum(page.fan_count)} fans
                </span>
              )}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-xs" />
          <span className="text-muted-foreground text-xs">a</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 text-xs" />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPICard icon={Users} label="Fans" value={fmtNum(page?.fan_count || 0)}
            subtext={fanChange !== 0 ? `${fanChange > 0 ? '+' : ''}${fmtNum(fanChange)} en periodo` : undefined}
            positive={fanChange > 0} />
          <KPICard icon={Eye} label="Impresiones" value={fmtNum(metrics?.page_impressions || 0)} subtext="en periodo" />
          <KPICard icon={MousePointerClick} label="Usuarios Activos" value={fmtNum(metrics?.page_engaged_users || 0)} subtext="en periodo" />
          <KPICard icon={TrendingUp} label="Engagements" value={fmtNum(metrics?.page_post_engagements || 0)} subtext="en periodo" />
          <KPICard icon={Eye} label="Vistas Pagina" value={fmtNum(metrics?.page_views_total || 0)} subtext="en periodo" />
        </div>
      )}

      {/* Fan Trend */}
      {!loading && fanTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tendencia de fans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-24">
              {fanTrend.map((point, i) => {
                const height = ((point.value - minFan) / range) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${point.date}: ${fmtNum(point.value)} fans`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{fanTrend[0]?.date}</span>
              <span className="text-[10px] text-muted-foreground">{fanTrend[fanTrend.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 5 Posts */}
      {!loading && topPosts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 5 posts por engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                <span className="text-lg font-bold text-muted-foreground w-6 shrink-0 text-center">{i + 1}</span>
                {post.full_picture ? (
                  <img src={post.full_picture} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{post.message || '(sin mensaje)'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmtNum(post.reactions)}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(post.comments)}</span>
                    <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmtNum(post.shares)}</span>
                    <span>{new Date(post.created_time).toLocaleDateString('es-CL')}</span>
                  </div>
                </div>
                {post.permalink_url && (
                  <a href={post.permalink_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, subtext, positive }: {
  icon: any; label: string; value: string; subtext?: string; positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4" style={{ color: '#1877F2' }} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {subtext && (
          <p className={`text-xs mt-0.5 ${positive === true ? 'text-green-600' : positive === false ? 'text-red-500' : 'text-muted-foreground'}`}>
            {subtext}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
