import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Mail, MousePointerClick, AlertTriangle, Loader2, DollarSign, Eye, ArrowLeft, Users } from 'lucide-react';

interface EmailAnalyticsProps {
  clientId: string;
}

export function EmailAnalytics({ clientId }: EmailAnalyticsProps) {
  const [overview, setOverview] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignStats, setCampaignStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [days, setDays] = useState('30');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('email-campaign-analytics', {
        body: { action: 'overview', client_id: clientId, days: Number(days) },
      });
      if (error) { toast.error(error); return; }
      setOverview(data);
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
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Open rate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-muted-foreground">Tasa de apertura</span>
                <span className="text-2xl font-bold text-green-600">{campaignStats.stats.open_rate}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${Math.min(campaignStats.stats.open_rate, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{campaignStats.stats.unique_opens} aperturas únicas</p>
            </div>

            {/* Click rate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-muted-foreground">Tasa de clicks</span>
                <span className="text-2xl font-bold text-purple-600">{campaignStats.stats.click_rate}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.min(campaignStats.stats.click_rate, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{campaignStats.stats.unique_clicks} clicks únicos</p>
            </div>

            {/* Unsubscribes */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Desuscripciones</span>
              <span className="text-sm font-medium">{campaignStats.stats.unsubscribe_rate}%</span>
            </div>

            {/* Revenue */}
            {campaignStats.total_revenue > 0 && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <DollarSign className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-bold text-green-800">${campaignStats.total_revenue.toFixed(2)}</p>
                  <p className="text-xs text-green-600">{campaignStats.total_conversions} conversiones atribuidas</p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold">{aggregate.total_sent?.toLocaleString() ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Emails enviados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-2">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <p className={`text-2xl font-bold ${openColor}`}>{aggregate.open_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tasa de apertura</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-2">
              <MousePointerClick className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-600">{aggregate.click_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tasa de clicks</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <div className={`w-10 h-10 rounded-full ${bounceBg} flex items-center justify-center mx-auto mb-2`}>
              <AlertTriangle className={`w-5 h-5 ${bounceColor}`} />
            </div>
            <p className={`text-2xl font-bold ${bounceColor}`}>{aggregate.bounce_rate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tasa de rebote</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriber summary — compact info line */}
      {subscribers && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 rounded-lg text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Total contactos activos:</span>
          <span className="font-semibold">{subscribers.total?.toLocaleString() ?? 0}</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-muted-foreground">Nuevos este periodo:</span>
          <span className="font-semibold text-green-600">+{subscribers.new_in_period ?? 0}</span>
        </div>
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
                    <th className="pb-2 font-medium text-right">Aperturas %</th>
                    <th className="pb-2 font-medium text-right">Clicks %</th>
                    <th className="pb-2 font-medium text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign: any) => (
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
                      <td className="py-2.5 text-right tabular-nums">
                        {campaign.open_rate != null ? `${campaign.open_rate}%` : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {campaign.click_rate != null ? `${campaign.click_rate}%` : '—'}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground whitespace-nowrap">
                        {campaign.sent_at
                          ? new Date(campaign.sent_at).toLocaleDateString()
                          : campaign.created_at
                            ? new Date(campaign.created_at).toLocaleDateString()
                            : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
