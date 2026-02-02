import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, TrendingUp, TrendingDown, DollarSign, MousePointerClick, 
  Eye, ShoppingCart, Sparkles, AlertTriangle, Rocket, X, Target,
  BarChart3, AlertCircle, Link2, ChevronDown, ChevronRight, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';

interface CampaignAnalyticsPanelProps {
  clientId: string;
}

interface Connection {
  id: string;
  platform: 'meta' | 'google';
  account_id: string | null;
  store_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
}

interface CampaignMetric {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
}

interface CampaignAggregate {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_revenue: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpm: number;
  avg_roas: number;
  aov: number;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  spend: string;
  impressions: string;
  clicks: string;
  cpm: string;
  cpc: string;
  ctr: string;
  conversions: number;
  conversion_value: number;
  roas: number;
}

interface Recommendation {
  id: string;
  campaign_id: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  is_dismissed: boolean;
}

const priorityConfig = {
  critical: { color: 'bg-red-500/10 text-red-500 border-red-500/30', icon: AlertTriangle },
  high: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/30', icon: TrendingDown },
  medium: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30', icon: Target },
  low: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', icon: Sparkles },
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CL', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('es-CL').format(Math.round(value));
};

const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

export function CampaignAnalyticsPanel({ clientId }: CampaignAnalyticsPanelProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [metrics, setMetrics] = useState<CampaignMetric[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generatingRecs, setGeneratingRecs] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'recommendations'>('campaigns');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [adSetsByCampaign, setAdSetsByCampaign] = useState<Record<string, AdSet[]>>({});
  const [loadingAdSets, setLoadingAdSets] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetchConnections();
  }, [clientId]);

  useEffect(() => {
    if (connections.length > 0) {
      fetchMetrics();
      fetchRecommendations();
    }
  }, [connections, selectedConnection]);

  async function fetchConnections() {
    try {
      const { data, error } = await supabase
        .from('platform_connections')
        .select('id, platform, account_id, store_name, is_active, last_sync_at')
        .eq('client_id', clientId)
        .in('platform', ['meta', 'google'])
        .eq('is_active', true);

      if (error) throw error;
      // Filter to only meta and google platforms
      const filteredData = (data || []).filter(
        (c): c is typeof c & { platform: 'meta' | 'google' } => 
          c.platform === 'meta' || c.platform === 'google'
      );
      setConnections(filteredData);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMetrics() {
    try {
      const connectionIds = selectedConnection === 'all' 
        ? connections.map(c => c.id) 
        : [selectedConnection];

      const { data, error } = await supabase
        .from('campaign_metrics')
        .select('*')
        .in('connection_id', connectionIds)
        .gte('metric_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('metric_date', { ascending: false });

      if (error) throw error;
      setMetrics(data || []);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  }

  async function fetchRecommendations() {
    try {
      const connectionIds = selectedConnection === 'all' 
        ? connections.map(c => c.id) 
        : [selectedConnection];

      const { data, error } = await supabase
        .from('campaign_recommendations')
        .select('*')
        .in('connection_id', connectionIds)
        .eq('is_dismissed', false)
        .order('priority', { ascending: true });

      if (error) throw error;
      // Cast priority to correct type
      const typedData = (data || []).map(r => ({
        ...r,
        priority: r.priority as 'low' | 'medium' | 'high' | 'critical'
      }));
      setRecommendations(typedData);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    }
  }

  async function syncCampaigns() {
    setSyncing(true);
    try {
      const connectionsToSync = selectedConnection === 'all' 
        ? connections 
        : connections.filter(c => c.id === selectedConnection);

      for (const conn of connectionsToSync) {
        const { error } = await supabase.functions.invoke('sync-campaign-metrics', {
          body: { connection_id: conn.id, platform: conn.platform }
        });

        if (error) {
          console.error(`Sync error for ${conn.platform}:`, error);
          toast.error(`Error sincronizando ${conn.platform}`);
        }
      }

      toast.success('Campañas sincronizadas');
      await fetchMetrics();
    } catch (error) {
      toast.error('Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  async function generateRecommendations() {
    setGeneratingRecs(true);
    try {
      const connectionsToAnalyze = selectedConnection === 'all' 
        ? connections 
        : connections.filter(c => c.id === selectedConnection);

      for (const conn of connectionsToAnalyze) {
        await supabase.functions.invoke('generate-campaign-recommendations', {
          body: { connection_id: conn.id }
        });
      }

      toast.success('Recomendaciones generadas');
      await fetchRecommendations();
    } catch (error) {
      toast.error('Error generando recomendaciones');
    } finally {
      setGeneratingRecs(false);
    }
  }

  async function dismissRecommendation(id: string) {
    try {
      await supabase
        .from('campaign_recommendations')
        .update({ is_dismissed: true })
        .eq('id', id);

      setRecommendations(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      toast.error('Error al descartar');
    }
  }

  async function toggleCampaignExpansion(campaignId: string, platform: string) {
    const isExpanded = expandedCampaigns.has(campaignId);
    
    if (isExpanded) {
      // Collapse
      setExpandedCampaigns(prev => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    } else {
      // Expand and fetch ad sets if not already loaded
      setExpandedCampaigns(prev => new Set(prev).add(campaignId));
      
      if (!adSetsByCampaign[campaignId] && platform === 'meta') {
        await fetchAdSets(campaignId, platform);
      }
    }
  }

  async function fetchAdSets(campaignId: string, platform: string) {
    // Find the connection for this campaign
    const connection = connections.find(c => c.platform === platform);
    if (!connection) return;

    setLoadingAdSets(prev => new Set(prev).add(campaignId));
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-campaign-adsets', {
        body: { connection_id: connection.id, campaign_id: campaignId, platform }
      });

      if (error) throw error;

      setAdSetsByCampaign(prev => ({
        ...prev,
        [campaignId]: data.ad_sets || []
      }));
    } catch (error) {
      console.error('Error fetching ad sets:', error);
      toast.error('Error al cargar Ad Sets');
    } finally {
      setLoadingAdSets(prev => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  }

  const aggregatedCampaigns = useMemo((): CampaignAggregate[] => {
    const campaignMap = new Map<string, CampaignAggregate>();

    for (const m of metrics) {
      const key = m.campaign_id;
      const existing = campaignMap.get(key) || {
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        platform: m.platform,
        total_spend: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_conversions: 0,
        total_revenue: 0,
        avg_ctr: 0,
        avg_cpc: 0,
        avg_cpm: 0,
        avg_roas: 0,
        aov: 0,
      };

      existing.total_spend += Number(m.spend) || 0;
      existing.total_impressions += Number(m.impressions) || 0;
      existing.total_clicks += Number(m.clicks) || 0;
      existing.total_conversions += Number(m.conversions) || 0;
      existing.total_revenue += Number(m.conversion_value) || 0;

      campaignMap.set(key, existing);
    }

    // Calculate averages
    for (const [, campaign] of campaignMap) {
      campaign.avg_ctr = campaign.total_impressions > 0 
        ? (campaign.total_clicks / campaign.total_impressions) * 100 
        : 0;
      campaign.avg_cpc = campaign.total_clicks > 0 
        ? campaign.total_spend / campaign.total_clicks 
        : 0;
      campaign.avg_cpm = campaign.total_impressions > 0 
        ? (campaign.total_spend / campaign.total_impressions) * 1000 
        : 0;
      campaign.avg_roas = campaign.total_spend > 0 
        ? campaign.total_revenue / campaign.total_spend 
        : 0;
      campaign.aov = campaign.total_conversions > 0
        ? campaign.total_revenue / campaign.total_conversions
        : 0;
    }

    return Array.from(campaignMap.values()).sort((a, b) => b.total_spend - a.total_spend);
  }, [metrics]);

  const totals = useMemo(() => {
    return aggregatedCampaigns.reduce((acc, c) => ({
      spend: acc.spend + c.total_spend,
      revenue: acc.revenue + c.total_revenue,
      conversions: acc.conversions + c.total_conversions,
      impressions: acc.impressions + c.total_impressions,
      clicks: acc.clicks + c.total_clicks,
    }), { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 });
  }, [aggregatedCampaigns]);

  const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const overallCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Sin conexiones de Ads</h3>
          <p className="text-muted-foreground text-sm">
            Conecta Meta Ads o Google Ads para ver el análisis de campañas.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if Meta connection exists without account_id selected
  const metaConnectionWithoutAccount = connections.find(
    c => c.platform === 'meta' && !c.account_id
  );
  const hasOnlyMetaWithoutAccount = connections.length === 1 && metaConnectionWithoutAccount;

  if (hasOnlyMetaWithoutAccount) {
    return (
      <Card className="border-primary/30">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-primary mb-4" />
          <h3 className="text-lg font-medium mb-2">Selecciona una cuenta publicitaria</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Para ver las métricas de tus campañas, primero debes seleccionar una cuenta publicitaria 
            en la pestaña de <strong>Conexiones</strong>.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-primary">
            <Link2 className="w-4 h-4" />
            <span>Ve a Conexiones → Meta Ads → Selecciona una cuenta</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Analytics por Campaña</h2>
          <p className="text-muted-foreground text-sm">Últimos 30 días</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedConnection} onValueChange={setSelectedConnection}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas las plataformas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las plataformas</SelectItem>
              {connections.map(conn => (
                <SelectItem key={conn.id} value={conn.id}>
                  <div className="flex items-center gap-2">
                    <img 
                      src={conn.platform === 'meta' ? logoMeta : logoGoogle} 
                      alt={conn.platform}
                      className="w-4 h-4"
                    />
                    {conn.store_name || conn.account_id || conn.platform}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={syncCampaigns}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="w-3 h-3" />
              Gasto Total
            </div>
            <p className="text-xl font-bold">{formatCurrency(totals.spend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ShoppingCart className="w-3 h-3" />
              Revenue
            </div>
            <p className="text-xl font-bold">{formatCurrency(totals.revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              ROAS
            </div>
            <p className={`text-xl font-bold ${overallRoas >= 3 ? 'text-green-500' : overallRoas >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>
              {overallRoas.toFixed(2)}x
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Eye className="w-3 h-3" />
              Conversiones
            </div>
            <p className="text-xl font-bold">{formatNumber(totals.conversions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MousePointerClick className="w-3 h-3" />
              CTR
            </div>
            <p className="text-xl font-bold">{formatPercent(overallCtr)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="campaigns">
              Campañas ({aggregatedCampaigns.length})
            </TabsTrigger>
            <TabsTrigger value="recommendations">
              Recomendaciones
              {recommendations.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {recommendations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {activeTab === 'recommendations' && (
            <Button 
              size="sm"
              onClick={generateRecommendations}
              disabled={generatingRecs}
            >
              <Sparkles className={`w-4 h-4 mr-2 ${generatingRecs ? 'animate-pulse' : ''}`} />
              {generatingRecs ? 'Analizando...' : 'Generar con IA'}
            </Button>
          )}
        </div>

        <TabsContent value="campaigns" className="mt-4">
          {aggregatedCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  No hay datos de campañas. Haz clic en "Sincronizar" para obtener las métricas.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {aggregatedCampaigns.map((campaign, idx) => {
                const campaignRecs = recommendations.filter(r => r.campaign_id === campaign.campaign_id);
                const isExpanded = expandedCampaigns.has(campaign.campaign_id);
                const adSets = adSetsByCampaign[campaign.campaign_id] || [];
                const isLoadingAdSets = loadingAdSets.has(campaign.campaign_id);
                const canExpand = campaign.platform === 'meta'; // Only Meta supports ad set expansion for now
                
                return (
                  <motion.div
                    key={campaign.campaign_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Collapsible open={isExpanded} onOpenChange={() => canExpand && toggleCampaignExpansion(campaign.campaign_id, campaign.platform)}>
                      <Card className="hover:border-primary/30 transition-colors">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {canExpand && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                              <img 
                                src={campaign.platform === 'meta' ? logoMeta : logoGoogle}
                                alt={campaign.platform}
                                className="w-6 h-6"
                              />
                              <div>
                                <h4 className="font-medium text-sm">{campaign.campaign_name}</h4>
                                <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                  {campaign.platform}
                                  {canExpand && (
                                    <span className="text-muted-foreground/60">• Click para ver Ad Sets</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            {campaignRecs.length > 0 && (
                              <Badge variant="outline" className={priorityConfig[campaignRecs[0].priority].color}>
                                {campaignRecs.length} recomendación{campaignRecs.length > 1 ? 'es' : ''}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Gasto</p>
                              <p className="font-medium">{formatCurrency(campaign.total_spend)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Revenue</p>
                              <p className="font-medium">{formatCurrency(campaign.total_revenue)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">ROAS</p>
                              <p className={`font-medium ${campaign.avg_roas >= 3 ? 'text-green-500' : campaign.avg_roas >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {campaign.avg_roas.toFixed(2)}x
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">CPC</p>
                              <p className="font-medium">${campaign.avg_cpc.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">CTR</p>
                              <p className="font-medium">{formatPercent(campaign.avg_ctr)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">CPM</p>
                              <p className="font-medium">${campaign.avg_cpm.toFixed(2)}</p>
                            </div>
                          </div>

                          {/* Inline recommendation preview */}
                          {campaignRecs.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                              <p className="text-xs text-muted-foreground mb-1">💡 Recomendación:</p>
                              <p className="text-xs">{campaignRecs[0].recommendation_text}</p>
                            </div>
                          )}

                          {/* Ad Sets expansion */}
                          <CollapsibleContent className="mt-4">
                            {isLoadingAdSets ? (
                              <div className="flex items-center justify-center py-6">
                                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Cargando Ad Sets...</span>
                              </div>
                            ) : adSets.length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                                <Layers className="w-5 h-5 mx-auto mb-2 opacity-50" />
                                No hay Ad Sets disponibles para esta campaña
                              </div>
                            ) : (
                              <div className="space-y-2 pt-2 border-t border-dashed">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Ad Sets ({adSets.length})
                                  </span>
                                </div>
                                {adSets.map((adSet) => (
                                  <div 
                                    key={adSet.id} 
                                    className="bg-muted/30 rounded-lg p-3 border border-border/50"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{adSet.name}</span>
                                        <Badge variant="outline" className="text-xs capitalize">
                                          {adSet.status.toLowerCase()}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                                      <div>
                                        <p className="text-muted-foreground">Gasto</p>
                                        <p className="font-medium">{formatCurrency(parseFloat(adSet.spend))}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Revenue</p>
                                        <p className="font-medium">{formatCurrency(adSet.conversion_value)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">ROAS</p>
                                        <p className={`font-medium ${adSet.roas >= 3 ? 'text-green-500' : adSet.roas >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                          {adSet.roas.toFixed(2)}x
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">CPC</p>
                                        <p className="font-medium">${parseFloat(adSet.cpc).toFixed(2)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">CTR</p>
                                        <p className="font-medium">{parseFloat(adSet.ctr).toFixed(2)}%</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Conversiones</p>
                                        <p className="font-medium">{formatNumber(adSet.conversions)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </CardContent>
                      </Card>
                    </Collapsible>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <AnimatePresence>
            {recommendations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-4">
                    No hay recomendaciones pendientes. Genera análisis con IA.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec, idx) => {
                  const config = priorityConfig[rec.priority];
                  const Icon = config.icon;
                  const campaign = aggregatedCampaigns.find(c => c.campaign_id === rec.campaign_id);

                  return (
                    <motion.div
                      key={rec.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card className={`border ${config.color.split(' ')[2]}`}>
                        <CardContent className="py-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${config.color.split(' ').slice(0, 2).join(' ')}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {rec.priority}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {campaign?.campaign_name || rec.campaign_id}
                                </span>
                              </div>
                              <p className="text-sm">{rec.recommendation_text}</p>
                            </div>

                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="shrink-0"
                              onClick={() => dismissRecommendation(rec.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}