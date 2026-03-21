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
  MousePointerClick,
  UserPlus,
  RefreshCw,
  Loader2,
  Heart,
  MessageCircle,
  TrendingUp,
  ExternalLink,
  Image as ImageIcon,
  Video,
} from 'lucide-react';

interface IGProfile {
  username: string;
  name: string;
  followers_count: number;
  media_count: number;
  profile_picture_url?: string;
}

interface IGMetrics {
  impressions: number;
  reach: number;
  profile_views: number;
  website_clicks: number;
}

interface FollowerPoint {
  date: string;
  value: number;
}

interface TopPost {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  engagement: number;
  timestamp: string;
  media_type: string;
  thumbnail_url?: string;
  permalink?: string;
}

export function IGMetricsDashboard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<IGProfile | null>(null);
  const [metrics, setMetrics] = useState<IGMetrics | null>(null);
  const [followerTrend, setFollowerTrend] = useState<FollowerPoint[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
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
        callApi<{ profile: IGProfile; metrics: IGMetrics; follower_trend: FollowerPoint[] }>('fetch-instagram-insights', {
          body: {
            client_id: clientId,
            action: 'overview',
            date_from: dateFrom,
            date_to: dateTo,
          },
        }),
        callApi<{ top_posts: TopPost[] }>('fetch-instagram-insights', {
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
      setProfile(overviewRes.data?.profile ?? null);
      setMetrics(overviewRes.data?.metrics ?? null);
      setFollowerTrend(overviewRes.data?.follower_trend || []);
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

  // Follower change in period
  const followerChange = followerTrend.length >= 2
    ? followerTrend[followerTrend.length - 1].value - followerTrend[0].value
    : 0;

  // Simple sparkline using CSS
  const maxFollower = Math.max(...followerTrend.map(f => f.value), 1);
  const minFollower = Math.min(...followerTrend.map(f => f.value), 0);
  const range = maxFollower - minFollower || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {profile?.profile_picture_url && (
            <img src={profile.profile_picture_url} alt="" className="w-10 h-10 rounded-full" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              {profile?.name || 'Instagram'}
              {profile?.username && <span className="text-muted-foreground font-normal ml-1">@{profile.username}</span>}
            </h2>
            <p className="text-xs text-muted-foreground">{profile?.media_count || 0} publicaciones</p>
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
          <KPICard icon={Users} label="Seguidores" value={fmtNum(profile?.followers_count || 0)}
            subtext={followerChange !== 0 ? `${followerChange > 0 ? '+' : ''}${fmtNum(followerChange)} en período` : undefined}
            positive={followerChange > 0} />
          <KPICard icon={Eye} label="Alcance" value={fmtNum(metrics?.reach || 0)} subtext="en período" />
          <KPICard icon={TrendingUp} label="Impresiones" value={fmtNum(metrics?.impressions || 0)} subtext="en período" />
          <KPICard icon={UserPlus} label="Visitas perfil" value={fmtNum(metrics?.profile_views || 0)} subtext="en período" />
          <KPICard icon={MousePointerClick} label="Clicks web" value={fmtNum(metrics?.website_clicks || 0)} subtext="en período" />
        </div>
      )}

      {/* Follower Trend */}
      {!loading && followerTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tendencia de seguidores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-24">
              {followerTrend.map((point, i) => {
                const height = ((point.value - minFollower) / range) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-purple-500 to-pink-400 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${point.date}: ${fmtNum(point.value)} seguidores`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{followerTrend[0]?.date}</span>
              <span className="text-[10px] text-muted-foreground">{followerTrend[followerTrend.length - 1]?.date}</span>
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
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                    {post.media_type === 'VIDEO' ? <Video className="w-5 h-5 text-muted-foreground" /> : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{post.caption || '(sin caption)'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmtNum(post.likes)}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(post.comments)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {post.media_type === 'VIDEO' ? 'Video' : post.media_type === 'CAROUSEL_ALBUM' ? 'Carrusel' : 'Imagen'}
                    </Badge>
                    <span>{new Date(post.timestamp).toLocaleDateString('es-CL')}</span>
                  </div>
                </div>
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
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
          <Icon className="w-4 h-4 text-purple-500" />
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
