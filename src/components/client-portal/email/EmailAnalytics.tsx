import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, MousePointerClick, AlertTriangle, Loader2, DollarSign, Eye, ArrowLeft, Users, TrendingUp, Link2, BarChart3, ShieldCheck, Target } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// Fallback si la tabla email_industry_benchmarks no responde o no tiene 'default'.
// Debe quedar en sync con el row 'default' de la migration 20260408140200.
const FALLBACK_BENCHMARKS = {
  open_rate: 20.0,
  click_rate: 2.5,
  bounce_rate: 0.4,
  unsubscribe_rate: 0.2,
};

interface EmailAnalyticsProps {
  clientId: string;
}

export function EmailAnalytics({ clientId }: EmailAnalyticsProps) {
  const [overview, setOverview] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignStats, setCampaignStats] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [days, setDays] = useState('30');
  const [BENCHMARKS, setBENCHMARKS] = useState(FALLBACK_BENCHMARKS);

  // Load benchmarks from DB once on mount, fallback to constants if not available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('email_industry_benchmarks')
          .select('open_rate, click_rate, bounce_rate, unsubscribe_rate')
          .eq('industry', 'default')
          .maybeSingle();
        if (!cancelled && !error && data) {
          setBENCHMARKS({
            open_rate: Number(data.open_rate),
            click_rate: Number(data.click_rate),
            bounce_rate: Number(data.bounce_rate),
            unsubscribe_rate: Number(data.unsubscribe_rate),
          });
        }
      } catch (err) {
        // Silent fallback — los FALLBACK_BENCHMARKS ya son razonables.
        console.warn('[EmailAnalytics] benchmarks fallback:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, timelineRes] = await Promise.all([
        callApi<any>('email-campaign-analytics', {
          body: { action: 'overview', client_id: clientId, days: Number(days) },
        }),
        callApi<any>('email-campaign-analytics', {
          body: { action: 'timeline', client_id: clientId, days: Number(days) },
        }),
      ]);
      if (overviewRes.error) { toast.error(overviewRes.error); return; }
      setOverview(overviewRes.data);
      setTimeline(timelineRes.data?.timeline || []);
    } finally {
      setLoading(false);
    }
  }, [clientId, days]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadCampaignStats = async (campaignId: string) => {
    setSelectedCampaign(campaignId);
    setLoadingDetail(true);
    try {
      const { data, error } = await callApi<any>('email-campaign-analytics', {
        body: { action: 'campaign-stats', client_id: clientId, campaign_id: campaignId },
      });
      if (error) { toast.error(error); return; }
      setCampaignStats(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const goBackToOverview = () => {
    setSelectedCampaign(null);
    setCampaignStats(null);
  };

  // Deliverability health score (0-100)
  const healthScore = useMemo(() => {
    if (!overview?.aggregate) return null;
    const { open_rate, bounce_rate, total_sent } = overview.aggregate;
    if (!total_sent || total_sent === 0) return null;
    const openScore = Math.min(parseFloat(open_rate) / 25, 1) * 40; // 25%+ open = perfect
    const bounceScore = Math.max(0, 1 - parseFloat(bounce_rate) / 5) * 30; // <5% bounce = perfect
    const unsubRate = parseFloat(overview.aggregate.total_unsubscribed || 0) / total_sent * 100;
    const unsubScore = Math.max(0, 1 - unsubRate / 2) * 30; // <2% unsub = perfect
    return Math.round(openScore + bounceScore + unsubScore);
  }, [overview]);

  // Campaign comparison data for bar chart
  const campaignComparison = useMemo(() => {
    if (!overview?.campaigns) return [];
    return overview.campaigns
      .filter((c: any) => c.sent_count > 0)
      .slice(0, 8)
      .map((c: any) => ({
        name: c.name?.length > 20 ? c.name.substring(0, 20) + '...' : c.name,
        fullName: c.name,
        open_rate: parseFloat(c.open_rate || 0),
        click_rate: parseFloat(c.click_rate || 0),
      }));
  }, [overview]);

  const benchmarkComparison = useMemo(() => {
    if (!overview?.aggregate) return null;
    const agg = overview.aggregate;
    const sent = agg.total_sent || 0;
    if (sent === 0) return null;
    const unsubRate = sent > 0 ? ((agg.total_unsubscribed || 0) / sent) * 100 : 0;
    const metrics = [
      { label: 'Tasa de apertura', client: parseFloat(agg.open_rate), benchmark: BENCHMARKS.open_rate, unit: '%', higherBetter: true },
      { label: 'Tasa de clicks', client: parseFloat(agg.click_rate), benchmark: BENCHMARKS.click_rate, unit: '%', higherBetter: true },
      { label: 'Tasa de rebote', client: parseFloat(agg.bounce_rate), benchmark: BENCHMARKS.bounce_rate, unit: '%', higherBetter: false },
      { label: 'Tasa de baja', client: parseFloat(unsubRate.toFixed(2)), benchmark: BENCHMARKS.unsubscribe_rate, unit: '%', higherBetter: false },
    ];
    return metrics;
  }, [overview, BENCHMARKS]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview || (!overview.aggregate?.total_sent && (!overview.campaigns || overview.campaigns.length === 0))) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Mail className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-sm max-w-xs">
            Aún no has enviado campañas. Los resultados aparecerán aquí después de tu primer envío.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { aggregate, subscribers, campaigns } = overview;

  // Campaign detail view
  if (selectedCampaign && campaignStats) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBackToOverview} className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{campaignStats.campaign?.name || 'Campaña'}</CardTitle>
            <CardDescription>
              {campaignStats.stats.sent ? `${campaignStats.stats.sent} enviados` : ''}
              {campaignStats.campaign?.sent_at ? ` · ${new Date(campaignStats.campaign.sent_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Open rate */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">Aperturas</span>
                  <span className="text-xl font-bold text-green-600">{campaignStats.stats.open_rate}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(campaignStats.stats.open_rate, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{campaignStats.stats.unique_opens} únicas</p>
              </div>

              {/* Click rate */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">Clicks</span>
                  <span className="text-xl font-bold text-purple-600">{campaignStats.stats.click_rate}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.min(campaignStats.stats.click_rate, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{campaignStats.stats.unique_clicks} únicos</p>
              </div>
            </div>

            {/* Click-to-open rate */}
            <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Click-to-Open Rate (CTOR)</span>
              <span className="text-sm font-bold">{campaignStats.stats.click_to_open_rate}%</span>
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-semibold">{campaignStats.stats.bounced || 0}</p>
                <p className="text-xs text-muted-foreground">Rebotes</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-semibold">{campaignStats.stats.unsubscribed || 0}</p>
                <p className="text-xs text-muted-foreground">Bajas</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-semibold">{campaignStats.stats.complained || 0}</p>
                <p className="text-xs text-muted-foreground">Quejas</p>
              </div>
            </div>

            {/* Revenue */}
            {campaignStats.total_revenue > 0 && (
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <DollarSign className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-bold text-green-800 dark:text-green-400">${campaignStats.total_revenue.toFixed(2)}</p>
                  <p className="text-xs text-green-600 dark:text-green-500">{campaignStats.total_conversions} conversiones atribuidas</p>
                </div>
              </div>
            )}

            {/* Top clicked links */}
            {campaignStats.top_links && campaignStats.top_links.length > 0 && (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Links más clickeados</span>
                </div>
                <div className="space-y-2">
                  {campaignStats.top_links.slice(0, 5).map((link: any, i: number) => {
                    const maxClicks = campaignStats.top_links[0].clicks;
                    const pct = maxClicks > 0 ? (link.clicks / maxClicks) * 100 : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[70%]" title={link.url}>
                            {link.url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 50)}
                          </span>
                          <span className="font-medium ml-2">{link.clicks} clicks</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading detail spinner
  if (selectedCampaign && loadingDetail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBackToOverview} className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Determine metric health colors
  const bounceColor = aggregate.bounce_rate > 5 ? 'text-red-600' : aggregate.bounce_rate > 2 ? 'text-orange-500' : 'text-green-600';
  const bounceBg = aggregate.bounce_rate > 5 ? 'bg-red-50' : aggregate.bounce_rate > 2 ? 'bg-orange-50' : 'bg-green-50';
  const openColor = aggregate.open_rate >= 20 ? 'text-green-600' : aggregate.open_rate >= 10 ? 'text-orange-500' : 'text-red-600';

  const healthColor = healthScore !== null
    ? healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
    : 'text-muted-foreground';
  const healthBg = healthScore !== null
    ? healthScore >= 80 ? 'bg-green-50' : healthScore >= 60 ? 'bg-yellow-50' : 'bg-red-50'
    : 'bg-muted/50';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Rendimiento</h3>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#F0F4FA] flex items-center justify-center mx-auto mb-2">
              <Mail className="w-5 h-5 text-[#1E3A7B]" />
            </div>
            <p className="text-2xl font-bold">{aggregate.total_sent?.toLocaleString() ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enviados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <p className={`text-2xl font-bold ${openColor}`}>{aggregate.open_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aperturas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-2">
              <MousePointerClick className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-600">{aggregate.click_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clicks</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className={`w-10 h-10 rounded-full ${bounceBg} flex items-center justify-center mx-auto mb-2`}>
              <AlertTriangle className={`w-5 h-5 ${bounceColor}`} />
            </div>
            <p className={`text-2xl font-bold ${bounceColor}`}>{aggregate.bounce_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rebotes</p>
          </CardContent>
        </Card>

        {/* Deliverability health score */}
        {healthScore !== null && (
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <div className={`w-10 h-10 rounded-full ${healthBg} flex items-center justify-center mx-auto mb-2`}>
                <ShieldCheck className={`w-5 h-5 ${healthColor}`} />
              </div>
              <p className={`text-2xl font-bold ${healthColor}`}>{healthScore}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Salud</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Subscriber summary */}
      {subscribers && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 rounded-lg text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Contactos activos:</span>
          <span className="font-semibold">{subscribers.total?.toLocaleString() ?? 0}</span>
          <span className="text-muted-foreground mx-1">&middot;</span>
          <span className="text-muted-foreground">Nuevos:</span>
          <span className="font-semibold text-green-600">+{subscribers.new_in_period ?? 0}</span>
        </div>
      )}

      {/* Industry Benchmarks Comparison */}
      {benchmarkComparison && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Comparativo con industria</CardTitle>
            </div>
            <CardDescription>Tu rendimiento vs promedio ecommerce</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {benchmarkComparison.map((m) => {
                const maxVal = Math.max(m.client, m.benchmark) * 1.3 || 1;
                const clientPct = (m.client / maxVal) * 100;
                const benchPct = (m.benchmark / maxVal) * 100;
                const isGood = m.higherBetter ? m.client >= m.benchmark : m.client <= m.benchmark;
                const diff = m.higherBetter ? m.client - m.benchmark : m.benchmark - m.client;
                const diffPct = m.benchmark > 0 ? ((diff / m.benchmark) * 100).toFixed(0) : '0';
                return (
                  <div key={m.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isGood ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
                          {isGood ? '+' : ''}{diffPct}%
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">T{'\u00FA'}</span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isGood ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(clientPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold w-14 text-right">{m.client}{m.unit}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">Industria</span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all bg-slate-400"
                            style={{ width: `${Math.min(benchPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground w-14 text-right">{m.benchmark}{m.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-2 border-t">
              Benchmarks basados en promedios de ecommerce (industria 2025)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Engagement Timeline Chart */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Actividad en el tiempo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + 'T12:00:00');
                    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} />
                <RechartsTooltip
                  labelFormatter={(v: string) => {
                    const d = new Date(v + 'T12:00:00');
                    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
                  }}
                />
                <Line type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} dot={false} name="Enviados" />
                <Line type="monotone" dataKey="opened" stroke="#22c55e" strokeWidth={2} dot={false} name="Abiertos" />
                <Line type="monotone" dataKey="clicked" stroke="#a855f7" strokeWidth={2} dot={false} name="Clicks" />
                <Line type="monotone" dataKey="bounced" stroke="#ef4444" strokeWidth={1} dot={false} name="Rebotes" strokeDasharray="4 4" />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Campaign Comparison Bar Chart */}
      {campaignComparison.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Comparativa de campañas</CardTitle>
            </div>
            <CardDescription>Tasa de apertura y clicks por campaña</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={campaignComparison} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} width={35} tickFormatter={(v: number) => `${v}%`} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                  labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar dataKey="open_rate" fill="#22c55e" radius={[3, 3, 0, 0]} name="Aperturas %" />
                <Bar dataKey="click_rate" fill="#a855f7" radius={[3, 3, 0, 0]} name="Clicks %" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Campaign performance table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Campañas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {!campaigns || campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay campañas en este período
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Campaña</th>
                    <th className="pb-2 font-medium text-right">Enviados</th>
                    <th className="pb-2 font-medium text-right">Aperturas</th>
                    <th className="pb-2 font-medium text-right">Clicks</th>
                    <th className="pb-2 font-medium text-right">Estado</th>
                    <th className="pb-2 font-medium text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign: any) => {
                    const openRate = parseFloat(campaign.open_rate || 0);
                    const openBadge = openRate >= 25 ? 'bg-green-100 text-green-700' : openRate >= 15 ? 'bg-yellow-100 text-yellow-700' : openRate > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground';
                    return (
                      <tr
                        key={campaign.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => loadCampaignStats(campaign.id)}
                      >
                        <td className="py-2.5 pr-4 max-w-[200px]">
                          <span className="font-medium text-primary hover:underline truncate block">
                            {campaign.name}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{campaign.sent_count ?? 0}</td>
                        <td className="py-2.5 text-right">
                          {campaign.open_rate != null ? (
                            <Badge variant="outline" className={`text-xs font-medium ${openBadge}`}>
                              {campaign.open_rate}%
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {campaign.click_rate != null ? `${campaign.click_rate}%` : '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge variant="outline" className="text-xs capitalize">
                            {campaign.status === 'sent' ? 'Enviada' : campaign.status === 'draft' ? 'Borrador' : campaign.status === 'scheduled' ? 'Programada' : campaign.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground whitespace-nowrap">
                          {campaign.sent_at
                            ? new Date(campaign.sent_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
                            : campaign.created_at
                              ? new Date(campaign.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
                              : '—'
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
