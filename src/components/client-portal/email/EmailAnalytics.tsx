import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { BarChart3, Mail, MousePointerClick, UserX, AlertTriangle, TrendingUp, Loader2, DollarSign, Eye } from 'lucide-react';

interface EmailAnalyticsProps {
  clientId: string;
}

export function EmailAnalytics({ clientId }: EmailAnalyticsProps) {
  const [overview, setOverview] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignStats, setCampaignStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
    const { data, error } = await callApi<any>('email-campaign-analytics', {
      body: { action: 'campaign-stats', client_id: clientId, campaign_id: campaignId },
    });
    if (error) { toast.error(error); return; }
    setCampaignStats(data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No hay datos de analytics todavía. Envía tu primera campaña.</p>
        </CardContent>
      </Card>
    );
  }

  const { aggregate, subscribers, campaigns } = overview;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Email Analytics</h3>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Mail}
          label="Emails enviados"
          value={aggregate.total_sent}
          color="text-blue-600"
        />
        <StatCard
          icon={Eye}
          label="Tasa de apertura"
          value={`${aggregate.open_rate}%`}
          subtitle={`${aggregate.total_opened} abiertos`}
          color="text-green-600"
        />
        <StatCard
          icon={MousePointerClick}
          label="Tasa de click"
          value={`${aggregate.click_rate}%`}
          subtitle={`${aggregate.total_clicked} clicks`}
          color="text-purple-600"
        />
        <StatCard
          icon={AlertTriangle}
          label="Tasa de rebote"
          value={`${aggregate.bounce_rate}%`}
          subtitle={`${aggregate.total_bounced} rebotados`}
          color="text-red-600"
        />
      </div>

      {/* Subscriber summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{subscribers.total}</p>
                <p className="text-xs text-muted-foreground">Total suscriptores activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <UserX className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">+{subscribers.new_in_period}</p>
                <p className="text-xs text-muted-foreground">Nuevos en el período</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign list with stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campañas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay campañas en este período</p>
          ) : (
            <div className="space-y-2">
              {(campaigns || []).map((campaign: any) => (
                <div
                  key={campaign.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedCampaign === campaign.id ? 'border-primary bg-muted/50' : ''
                  }`}
                  onClick={() => loadCampaignStats(campaign.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sent_at
                        ? new Date(campaign.sent_at).toLocaleDateString()
                        : new Date(campaign.created_at).toLocaleDateString()
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {campaign.sent_count || 0} enviados
                    </Badge>
                    <Badge className={
                      campaign.status === 'sent' ? 'bg-green-100 text-green-800' :
                      campaign.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-blue-100 text-blue-800'
                    }>
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign detail stats */}
      {campaignStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalle: {campaignStats.campaign?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{campaignStats.stats.open_rate}%</p>
                <p className="text-xs text-muted-foreground">Open Rate</p>
                <p className="text-xs text-muted-foreground">{campaignStats.stats.unique_opens} únicos</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{campaignStats.stats.click_rate}%</p>
                <p className="text-xs text-muted-foreground">Click Rate</p>
                <p className="text-xs text-muted-foreground">{campaignStats.stats.unique_clicks} únicos</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{campaignStats.stats.click_to_open_rate}%</p>
                <p className="text-xs text-muted-foreground">Click-to-Open</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold">{campaignStats.stats.unsubscribe_rate}%</p>
                <p className="text-xs text-muted-foreground">Unsub Rate</p>
              </div>
            </div>

            {campaignStats.total_revenue > 0 && (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <DollarSign className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-bold text-green-800">${campaignStats.total_revenue.toFixed(2)} revenue</p>
                  <p className="text-xs text-green-600">{campaignStats.total_conversions} conversiones atribuidas</p>
                </div>
              </div>
            )}

            {campaignStats.top_links?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top Links</p>
                <div className="space-y-1">
                  {campaignStats.top_links.map((link: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <span className="truncate text-muted-foreground flex-1 mr-3">{link.url}</span>
                      <Badge variant="outline">{link.clicks} clicks</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color }: {
  icon: any; label: string; value: string | number; subtitle?: string; color: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center`}>
            <Icon className={`w-4.5 h-4.5 ${color}`} />
          </div>
          <div>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
