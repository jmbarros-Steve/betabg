import { useState, useEffect, useMemo } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Eye, ShoppingCart, Sparkles, AlertTriangle, Rocket, X, Target,
  BarChart3, AlertCircle, Link2, ChevronDown, ChevronRight, Layers,
  Clock, CheckCircle, PauseCircle, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
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

const formatCurrency = (value: number, currency: string = 'CLP') => {
  const cur = currency.toUpperCase();
  // For CLP: no decimals (whole pesos)
  // For USD/EUR/etc: 2 decimals
  const isWholeCurrency = cur === 'CLP' || cur === 'COP' || cur === 'JPY' || cur === 'KRW';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: isWholeCurrency ? 0 : 2,
    maximumFractionDigits: isWholeCurrency ? 0 : 2
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
  const [activeTab, setActiveTab] = useState<'campaigns' | 'recommendations' | 'charlie'>('campaigns');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [adSetsByCampaign, setAdSetsByCampaign] = useState<Record<string, AdSet[]>>({});
  const [loadingAdSets, setLoadingAdSets] = useState<Set<string>>(new Set());
  const [charlieModal, setCharlieModal] = useState<{
    type: 'scale' | 'pause';
    adSetName: string;
    adSetId: string;
    spend: number;
    daysActive: number;
    currentBudget?: number;
  } | null>(null);
  const [charlieActionLoading, setCharlieActionLoading] = useState(false);
  const [charlieActionSuccess, setCharlieActionSuccess] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '14d' | '30d' | '60d' | '90d'>('30d');
  const [metaAccountCurrency, setMetaAccountCurrency] = useState<string>('USD');
  const [dynamicClpRate, setDynamicClpRate] = useState<number>(950); // fetched from API

  // Rules from Meta Wizard (meta_automated_rules)
  const [automatedRules, setAutomatedRules] = useState<any[]>([]);

  const daysFromRange = (range: string): number => {
    const map: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90 };
    return map[range] || 30;
  };

  useEffect(() => {
    fetchConnections();
    fetchAutomatedRules();
    // Fetch live exchange rate for CLP conversion
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then(r => r.json())
      .then((d: any) => { if (d.rates?.CLP) setDynamicClpRate(d.rates.CLP); })
      .catch(() => { /* keep fallback 950 */ });
  }, [clientId]);

  useEffect(() => {
    if (connections.length > 0) {
      fetchMetrics();
      fetchRecommendations();
    }
  }, [connections, selectedConnection, dateRange]);

  async function fetchAutomatedRules() {
    try {
      const { data } = await supabase
        .from('meta_automated_rules')
        .select('name, condition, action, is_active')
        .eq('client_id', clientId)
        .eq('is_active', true);
      setAutomatedRules(data || []);
    } catch {
      // Rules unavailable — use defaults
    }
  }

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
    } catch {
      // Error handled silently
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
        .gte('metric_date', new Date(Date.now() - daysFromRange(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('metric_date', { ascending: false });

      if (error) throw error;
      setMetrics(data || []);
    } catch {
      // Error handled silently
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
    } catch {
      // Error handled silently
    }
  }

  async function syncCampaigns() {
    setSyncing(true);
    try {
      const connectionsToSync = selectedConnection === 'all' 
        ? connections 
        : connections.filter(c => c.id === selectedConnection);

      for (const conn of connectionsToSync) {
        const { error } = await callApi('sync-campaign-metrics', {
          body: { connection_id: conn.id, platform: conn.platform }
        });

        if (error) {
          // Error handled by toast
          toast.error(`Error sincronizando ${conn.platform}`);
        }
      }

      toast.success('Campañas sincronizadas');
      await fetchMetrics();
      // Notify other views (e.g., Metrics dashboard) to refresh instantly
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
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
      const { data, error } = await callApi('fetch-campaign-adsets', {
        body: { connection_id: connection.id, campaign_id: campaignId, platform }
      });

      if (error) throw error;

      if (data.account_currency) {
        setMetaAccountCurrency(data.account_currency);
      }
      setAdSetsByCampaign(prev => ({
        ...prev,
        [campaignId]: data.ad_sets || []
      }));
    } catch {
      // Error handled by toast
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

  // Extract scale % and CPA max from automated rules (Wizard config)
  const scalePercent = useMemo(() => {
    const scaleRule = automatedRules.find(r =>
      r.action?.type === 'INCREASE_BUDGET' && r.action?.percentage
    );
    return scaleRule?.action?.percentage || 20; // fallback 20% if no rule configured
  }, [automatedRules]);

  const maxCpaFromRules = useMemo(() => {
    const cpaRule = automatedRules.find(r =>
      r.condition?.metric === 'CPA' && r.condition?.operator === 'GREATER_THAN' && r.condition?.value
    );
    if (!cpaRule) return null;
    // Rules store CPA in CLP. Semaphore compares against spend in account currency.
    // If account is CLP, use CLP value directly. If USD, convert CLP rule to USD.
    return metaAccountCurrency === 'CLP'
      ? cpaRule.condition.value
      : cpaRule.condition.value / dynamicClpRate;
  }, [automatedRules, metaAccountCurrency, dynamicClpRate]);

  // Charlie semaphore for ad sets
  // If account is already in CLP, no conversion needed (rate = 1)
  const CLP_RATE = metaAccountCurrency === 'CLP' ? 1 : dynamicClpRate;
  const getAdSetSemaphore = (adSet: AdSet) => {
    const spend = parseFloat(adSet.spend) || 0;
    const conversions = adSet.conversions || 0;
    const cpa = conversions > 0 ? spend / conversions : null;
    const maxCpa = maxCpaFromRules || (metaAccountCurrency === 'CLP' ? 47500 : 50); // from Wizard rules
    const isPaused = adSet.status?.toUpperCase() === 'PAUSED';

    // If no data at all, show nodata regardless of status
    if (spend === 0 && conversions === 0) return 'nodata';
    // Evaluate performance based on actual metrics (even if paused, we show the performance state)
    if (cpa !== null && cpa > maxCpa * 2) return 'danger';
    if (cpa !== null && cpa <= maxCpa) return 'good';
    // Only show "learning" if the adset is actually active — PAUSED adsets aren't learning
    if (isPaused) return 'nodata';
    return 'learning'; // no CPA data or < 7 days
  };

  const semaphoreConfig = {
    good: { emoji: '🟢', label: 'Funcionando', color: 'text-green-600', bg: 'bg-green-500/10 border-green-500/20', action: 'scale' as const },
    learning: { emoji: '🟡', label: 'En aprendizaje', color: 'text-yellow-600', bg: 'bg-yellow-500/10 border-yellow-500/20', action: 'wait' as const },
    danger: { emoji: '🔴', label: 'Revisar', color: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20', action: 'pause' as const },
    nodata: { emoji: '⚫', label: 'Sin datos', color: 'text-muted-foreground', bg: 'bg-muted/30 border-border', action: 'review' as const },
  };

  // Build human-readable explanation for each semaphore state
  const getAdSetExplanation = (adSet: AdSet, semKey: keyof typeof semaphoreConfig): string => {
    const maxCpaAcc = maxCpaFromRules || (metaAccountCurrency === 'CLP' ? 47500 : 50);
    const spend = parseFloat(adSet.spend) || 0;
    const conversions = adSet.conversions || 0;
    const cpaPerConv = conversions > 0 ? spend / conversions : null;
    const spendClp = spend * CLP_RATE;
    const cpaClp = cpaPerConv !== null ? cpaPerConv * CLP_RATE : null;
    const maxCpaClp = maxCpaAcc * CLP_RATE;
    const isPaused = adSet.status?.toUpperCase() === 'PAUSED';

    if (isPaused) {
      return `Este Ad Set está pausado en Meta. No está gastando presupuesto actualmente.`;
    }

    switch (semKey) {
      case 'danger':
        return `Este Ad Set gasta ${formatCurrency(cpaClp || spendClp)} por venta, muy por encima de tu máximo de ${formatCurrency(maxCpaClp)}. Pausarlo ahorra presupuesto para los Ad Sets que sí funcionan.`;
      case 'learning':
        return `Meta está optimizando este Ad Set. Espera al menos 7 días antes de tomar decisiones — pausar antes destruye el aprendizaje del algoritmo.`;
      case 'good':
        return `Este Ad Set está funcionando bien. ROAS ${adSet.roas > 0 ? adSet.roas.toFixed(2) : '—'}x, gastando ${cpaClp ? formatCurrency(cpaClp) : '—'} por venta (dentro de tu objetivo). Se puede escalar +${scalePercent}%.`;
      case 'nodata':
        return `Sin datos suficientes para evaluar. Verifica que esté activo en Meta Ads Manager y que tenga presupuesto asignado.`;
      default:
        return '';
    }
  };

  // Actually pause an adset via the API
  async function executeCharlieAction(type: 'pause' | 'scale', adSetId: string, adSetName: string) {
    setCharlieActionLoading(true);
    setCharlieActionSuccess(null);
    try {
      const connection = connections.find(c => c.platform === 'meta');
      if (!connection) {
        toast.error('No se encontró conexión Meta activa');
        return;
      }

      if (type === 'pause') {
        const { error } = await callApi('meta-adset-action', {
          body: { connection_id: connection.id, adset_id: adSetId, action: 'pause' }
        });
        if (error) throw new Error(error);
        toast.success(`Ad Set "${adSetName}" pausado exitosamente en Meta`);
        setCharlieActionSuccess(`Ad Set "${adSetName}" pausado en Meta.`);
        // Update local state to reflect the pause
        setAdSetsByCampaign(prev => {
          const updated = { ...prev };
          for (const [campaignId, adSets] of Object.entries(updated)) {
            updated[campaignId] = adSets.map(as =>
              as.id === adSetId ? { ...as, status: 'PAUSED' } : as
            );
          }
          return updated;
        });
      } else {
        // Scale: increase budget by configured percentage from Wizard rules
        const { error } = await callApi('meta-adset-action', {
          body: { connection_id: connection.id, adset_id: adSetId, action: 'scale', scale_percent: scalePercent }
        });
        if (error) throw new Error(error);
        toast.success(`Ad Set "${adSetName}" escalado +${scalePercent}% en Meta`);
        setCharlieActionSuccess(`Presupuesto de "${adSetName}" aumentado ${scalePercent}% en Meta.`);
      }
    } catch (err: any) {
      toast.error(`Error al ejecutar acción: ${err?.message || 'Error desconocido'}`);
    } finally {
      setCharlieActionLoading(false);
    }
  }

  // Collect all ad sets across campaigns for Charlie review tab
  const allAdSetsForCharlie = useMemo(() => {
    const result: Array<{adSet: AdSet; campaignName: string; semaphore: keyof typeof semaphoreConfig}> = [];
    for (const [campaignId, adSets] of Object.entries(adSetsByCampaign)) {
      const campaign = aggregatedCampaigns.find(c => c.campaign_id === campaignId);
      for (const adSet of adSets) {
        const s = getAdSetSemaphore(adSet) as keyof typeof semaphoreConfig;
        result.push({ adSet, campaignName: campaign?.campaign_name || campaignId, semaphore: s });
      }
    }
    // Sort: danger first, then nodata, then learning, then good
    const order = { danger: 0, nodata: 1, learning: 2, good: 3 };
    return result.sort((a, b) => order[a.semaphore] - order[b.semaphore]);
  }, [adSetsByCampaign, aggregatedCampaigns]);

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
          <p className="text-muted-foreground text-sm">
            Últimos {daysFromRange(dateRange)} días
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {(['7d', '14d', '30d', '60d', '90d'] as const).map((range) => (
              <Button
                key={range}
                variant={dateRange === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateRange(range)}
                className="text-xs"
              >
                {range === '7d' ? '7 días' : range === '14d' ? '14 días' : range === '30d' ? '30 días' : range === '60d' ? '60 días' : '90 días'}
              </Button>
            ))}
          </div>
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
          {metaAccountCurrency && metaAccountCurrency !== 'CLP' && (
            <span className="text-xs text-muted-foreground ml-2">
              Cuenta en {metaAccountCurrency} · Convertido a CLP
            </span>
          )}
        </div>
      </div>

      {/* Primary KPIs - large cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border bg-gradient-to-br from-red-500/8 to-transparent border-red-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Gasto Total</span>
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <DollarSign className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(totals.spend)}</p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-green-500/8 to-transparent border-green-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Ingresos Totales</span>
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(totals.revenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.revenue > 0 ? `ROAS: ${overallRoas.toFixed(2)}x` : 'Sin datos de conversión'}
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-cyan-500/8 to-transparent border-cyan-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <JargonTooltip term="ROAS" className="text-sm font-medium text-muted-foreground" />
              <div className="p-2.5 rounded-xl bg-cyan-500/10">
                <TrendingUp className="w-5 h-5 text-cyan-500" />
              </div>
            </div>
            <p className={`text-3xl font-bold tracking-tight ${overallRoas >= 3 ? 'text-green-600' : overallRoas >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
              {overallRoas.toFixed(2)}x
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-amber-500/8 to-transparent border-amber-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Conversiones</span>
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Eye className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatNumber(totals.conversions)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs - compact row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <span className="text-xs font-medium text-muted-foreground">Costo/Conv</span>
            <p className="text-xl font-bold mt-1">
              {totals.conversions > 0 ? formatCurrency(totals.spend / totals.conversions) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <JargonTooltip term="CPC" className="text-xs font-medium text-muted-foreground" />
            <p className="text-xl font-bold mt-1">
              {totals.clicks > 0 ? formatCurrency(totals.spend / totals.clicks) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <JargonTooltip term="CPM" className="text-xs font-medium text-muted-foreground" />
            <p className="text-xl font-bold mt-1">
              {totals.impressions > 0 ? formatCurrency((totals.spend / totals.impressions) * 1000) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <JargonTooltip term="CTR" className="text-xs font-medium text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{formatPercent(overallCtr)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend vs Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto vs Ingresos por Día</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Build daily data from metrics
            const dailyMap = new Map<string, { date: string; spend: number; revenue: number; conversions: number }>();
            const filteredMetrics = selectedConnection === 'all'
              ? metrics
              : metrics.filter(m => {
                  const conn = connections.find(c => c.id === selectedConnection);
                  return conn && m.platform === conn.platform;
                });
            filteredMetrics.forEach(m => {
              const existing = dailyMap.get(m.metric_date) || { date: m.metric_date, spend: 0, revenue: 0, conversions: 0 };
              existing.spend += m.spend || 0;
              existing.revenue += m.conversion_value || 0;
              existing.conversions += m.conversions || 0;
              dailyMap.set(m.metric_date, existing);
            });
            const chartData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

            if (chartData.length === 0) {
              return (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Sin datos para el periodo seleccionado
                </div>
              );
            }

            return (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v + 'T12:00:00');
                      return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'revenue' ? 'Ingresos' : name === 'spend' ? 'Gasto' : 'Conversiones',
                    ]}
                    labelFormatter={(label: string) => {
                      const d = new Date(label + 'T12:00:00');
                      return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend formatter={(value: string) => (value === 'revenue' ? 'Ingresos' : 'Gasto')} />
                  <Bar dataKey="spend" fill="#EF4444" name="spend" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenue" fill="#22C55E" name="revenue" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </CardContent>
      </Card>

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
            <TabsTrigger value="charlie">
              📅 Revisión Charlie
              {allAdSetsForCharlie.filter(a => a.semaphore === 'danger' || a.semaphore === 'good').length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {allAdSetsForCharlie.filter(a => a.semaphore === 'danger' || a.semaphore === 'good').length}
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
                                <span className="text-[10px] text-muted-foreground">
                                  {(() => {
                                    const campaignMetrics = metrics.filter(m => m.campaign_id === campaign.campaign_id);
                                    if (campaignMetrics.length === 0) return '';
                                    const dates = campaignMetrics.map(m => m.metric_date).sort();
                                    const first = new Date(dates[0] + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                                    const last = new Date(dates[dates.length - 1] + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                                    return `${first} — ${last}`;
                                  })()}
                                </span>
                              </div>
                            </div>
                            
                            {campaignRecs.length > 0 && (
                              <Badge variant="outline" className={priorityConfig[campaignRecs[0].priority].color}>
                                {campaignRecs.length} recomendación{campaignRecs.length > 1 ? 'es' : ''}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Gasto</p>
                              <p className="font-medium">{formatCurrency(campaign.total_spend)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Ingresos (Atrib.)</p>
                              <p className="font-medium">{formatCurrency(campaign.total_revenue)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="ROAS" /></p>
                              <p className={`font-medium ${campaign.avg_roas >= 3 ? 'text-green-500' : campaign.avg_roas >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {campaign.avg_roas.toFixed(2)}x
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Costo/Conv</p>
                              <p className="font-medium">
                                {campaign.total_conversions > 0 ? formatCurrency(campaign.total_spend / campaign.total_conversions) : '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="CPC" /></p>
                              <p className="font-medium">{formatCurrency(campaign.avg_cpc)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="CPM" /></p>
                              <p className="font-medium">{formatCurrency(campaign.avg_cpm)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="CTR" /></p>
                              <p className="font-medium">{formatPercent(campaign.avg_ctr)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Conversiones</p>
                              <p className="font-medium">{formatNumber(campaign.total_conversions)}</p>
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
                              <div className="space-y-3 pt-2 border-t border-dashed">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium text-muted-foreground">
                                    Ad Sets ({adSets.length})
                                  </span>
                                </div>
                                {adSets.map((adSet) => {
                                  const semKey = getAdSetSemaphore(adSet) as keyof typeof semaphoreConfig;
                                  const sem = semaphoreConfig[semKey];
                                  const spendClp = (parseFloat(adSet.spend) || 0) * CLP_RATE;
                                  return (
                                    <div 
                                      key={adSet.id} 
                                      className={`rounded-lg p-3 border ${sem.bg}`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-base">{sem.emoji}</span>
                                          <span className="font-medium text-sm">{adSet.name}</span>
                                          <Badge variant="outline" className={`text-xs ${sem.color}`}>
                                            {sem.label}
                                          </Badge>
                                          <Badge variant="outline" className="text-xs capitalize">
                                            {adSet.status.toLowerCase()}
                                          </Badge>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs mb-3">
                                        <div>
                                          <p className="text-muted-foreground">Gasto CLP</p>
                                          <p className="font-medium">{formatCurrency(spendClp)}</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground">CPA real</p>
                                          <p className="font-medium">
                                            {adSet.conversions > 0 
                                              ? `$${((parseFloat(adSet.spend) / adSet.conversions) * CLP_RATE).toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP`
                                              : '—'}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground">Conversiones</p>
                                          <p className="font-medium">{adSet.conversions || 0}</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground"><JargonTooltip term="ROAS" /></p>
                                          <p className={`font-medium ${adSet.roas >= 3 ? 'text-green-600' : adSet.roas >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
                                            {adSet.roas > 0 ? `${adSet.roas.toFixed(2)}x` : '—'}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground"><JargonTooltip term="CTR" /></p>
                                          <p className="font-medium">{parseFloat(adSet.ctr).toFixed(2)}%</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground"><JargonTooltip term="CPM" label="CPM CLP" /></p>
                                          <p className="font-medium">{formatCurrency(parseFloat(adSet.cpm) * CLP_RATE)}</p>
                                        </div>
                                      </div>

                                      {/* Explanation text */}
                                      <div className="mt-2 px-2 py-1.5 rounded bg-muted/40 text-xs text-muted-foreground leading-relaxed">
                                        {getAdSetExplanation(adSet, semKey)}
                                      </div>

                                      {/* Charlie action button */}
                                      <div className="pt-2 border-t border-border/30">
                                        {semKey === 'good' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                                          <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300 hover:bg-green-50"
                                            onClick={() => setCharlieModal({
                                              type: 'scale', adSetName: adSet.name, adSetId: adSet.id,
                                              spend: parseFloat(adSet.spend) || 0, daysActive: 8
                                            })}>
                                            📈 Aprobar escalado +{scalePercent}%
                                          </Button>
                                        )}
                                        {semKey === 'good' && adSet.status?.toUpperCase() === 'PAUSED' && (
                                          <span className="text-xs text-muted-foreground">Pausado — reactívalo en Meta para poder escalar</span>
                                        )}
                                        {semKey === 'danger' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                                          <Button size="sm" variant="outline" className="text-xs text-red-700 border-red-300 hover:bg-red-50"
                                            onClick={() => setCharlieModal({
                                              type: 'pause', adSetName: adSet.name, adSetId: adSet.id,
                                              spend: parseFloat(adSet.spend) || 0, daysActive: 3
                                            })}>
                                            ⏸ Aprobar pausa de Ad Set
                                          </Button>
                                        )}
                                        {semKey === 'danger' && adSet.status?.toUpperCase() === 'PAUSED' && (
                                          <span className="text-xs text-muted-foreground">Ya está pausado</span>
                                        )}
                                        {semKey === 'learning' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                                          <span className="text-xs text-yellow-600">⏳ En aprendizaje — no tocar por 7 días para que Meta optimice</span>
                                        )}
                                        {semKey === 'learning' && adSet.status?.toUpperCase() === 'PAUSED' && (
                                          <span className="text-xs text-muted-foreground">Pausado — reactívalo si quieres retomar el test</span>
                                        )}
                                        {semKey === 'nodata' && (
                                          <span className="text-xs text-muted-foreground">🔄 Sin datos — activa o elimina este Ad Set</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
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

        {/* Charlie Review Tab */}
        <TabsContent value="charlie" className="mt-4">
          {allAdSetsForCharlie.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Calendar className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-2">No hay Ad Sets cargados.</p>
                <p className="text-xs text-muted-foreground">Expande una campaña Meta para cargar Ad Sets.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {allAdSetsForCharlie.map(({ adSet, campaignName, semaphore }) => {
                const sem = semaphoreConfig[semaphore];
                const spendClp = (parseFloat(adSet.spend) || 0) * CLP_RATE;
                return (
                  <Card key={adSet.id} className={`border ${sem.bg}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{sem.emoji}</span>
                            <span className={`text-xs font-bold uppercase ${sem.color}`}>
                              {semaphore === 'good' ? 'ESCALAR' : semaphore === 'danger' ? 'URGENTE' : semaphore === 'learning' ? 'EN APRENDIZAJE' : 'SIN DATOS'}
                            </span>
                          </div>
                          <p className="text-sm font-medium">Ad Set "{adSet.name}"</p>
                          <p className="text-xs text-muted-foreground">{campaignName}</p>
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                            <span>Gasto: ${spendClp.toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP</span>
                            <span>Conv: {adSet.conversions || 0}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {semaphore === 'good' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                            <Button size="sm" className="text-xs"
                              onClick={() => setCharlieModal({ type: 'scale', adSetName: adSet.name, adSetId: adSet.id, spend: parseFloat(adSet.spend) || 0, daysActive: 8 })}>
                              📈 Aprobar escalado +{scalePercent}%
                            </Button>
                          )}
                          {semaphore === 'good' && adSet.status?.toUpperCase() === 'PAUSED' && (
                            <span className="text-xs text-muted-foreground">Pausado — reactívalo para escalar</span>
                          )}
                          {semaphore === 'danger' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                            <Button size="sm" variant="destructive" className="text-xs"
                              onClick={() => setCharlieModal({ type: 'pause', adSetName: adSet.name, adSetId: adSet.id, spend: parseFloat(adSet.spend) || 0, daysActive: 3 })}>
                              ⏸ Aprobar pausa Ad Set
                            </Button>
                          )}
                          {semaphore === 'danger' && adSet.status?.toUpperCase() === 'PAUSED' && (
                            <span className="text-xs text-muted-foreground">Ya está pausado</span>
                          )}
                          {semaphore === 'learning' && adSet.status?.toUpperCase() !== 'PAUSED' && (
                            <span className="text-xs text-yellow-600">⏳ En aprendizaje — no tocar por 7 días</span>
                          )}
                          {semaphore === 'learning' && adSet.status?.toUpperCase() === 'PAUSED' && (
                            <span className="text-xs text-muted-foreground">Pausado</span>
                          )}
                          {semaphore === 'nodata' && <span className="text-xs text-muted-foreground">🔄 Revisar</span>}
                        </div>
                      </div>
                      {/* Explanation text */}
                      <div className="mt-2 px-2 py-1.5 rounded bg-muted/40 text-xs text-muted-foreground leading-relaxed">
                        {getAdSetExplanation(adSet, semaphore)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Charlie Scale Dialog */}
      <Dialog open={charlieModal?.type === 'scale'} onOpenChange={() => { setCharlieModal(null); setCharlieActionSuccess(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📈 ESCALAR AD SET — MÉTODO CHARLIE</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <p><strong>Ad Set:</strong> {charlieModal?.adSetName}</p>
                <p><strong>Presupuesto actual estimado:</strong> ${((charlieModal?.spend || 0) * CLP_RATE / 30).toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP/día</p>
                <p><strong>Nuevo presupuesto (+{scalePercent}%):</strong> ${((charlieModal?.spend || 0) * CLP_RATE / 30 * (1 + scalePercent / 100)).toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP/día</p>
                <div className="bg-green-500/10 rounded-lg p-3 text-xs space-y-1 mt-2">
                  <p className="font-semibold text-green-700">¿Qué va a pasar?</p>
                  <p>Se enviará una solicitud a Meta para aumentar el presupuesto diario de este Ad Set en un {scalePercent}%. El cambio se aplica inmediatamente en Meta Ads.</p>
                  {automatedRules.length > 0 && (
                    <p className="text-muted-foreground mt-1">Configurado en tus reglas automatizadas del Wizard Meta.</p>
                  )}
                </div>
                {charlieActionSuccess && (
                  <div className="bg-green-500/10 rounded-lg p-3 text-xs mt-2">
                    <p className="font-semibold text-green-700">{charlieActionSuccess}</p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCharlieModal(null); setCharlieActionSuccess(null); }}>
              Cancelar
            </Button>
            <Button
              disabled={charlieActionLoading || !!charlieActionSuccess}
              onClick={() => {
                if (charlieModal) {
                  executeCharlieAction('scale', charlieModal.adSetId, charlieModal.adSetName);
                }
              }}
            >
              {charlieActionLoading ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Escalando...</>
              ) : charlieActionSuccess ? (
                <><CheckCircle className="w-4 h-4 mr-2" /> Listo</>
              ) : (
                `Confirmar escalado +${scalePercent}%`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Charlie Pause Dialog */}
      <Dialog open={charlieModal?.type === 'pause'} onOpenChange={() => { setCharlieModal(null); setCharlieActionSuccess(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">PAUSAR AD SET — MÉTODO CHARLIE</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <p>¿Seguro que quieres pausar el Ad Set <strong>"{charlieModal?.adSetName}"</strong>?</p>
                <p>Lleva <strong>{charlieModal?.daysActive} días activo</strong> con <strong>${((charlieModal?.spend || 0) * CLP_RATE).toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP</strong> gastados.</p>
                <div className="bg-destructive/10 rounded-lg p-3 text-xs space-y-1 mt-2">
                  <p className="font-semibold text-destructive">¿Por qué pausar?</p>
                  <p>Este Ad Set tiene un costo por adquisición (CPA) demasiado alto — está gastando más de lo que debería para conseguir cada venta. Pausarlo redirige el presupuesto a los Ad Sets que sí están funcionando.</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-xs space-y-1 mt-2">
                  <p>Se pausará el <strong>Ad Set</strong> directamente en Meta, no la campaña.</p>
                  <p>La campaña principal sigue activa con los demás Ad Sets.</p>
                  <p className="text-destructive font-medium">Pausar antes de 7 días puede destruir el aprendizaje del algoritmo.</p>
                </div>
                {charlieActionSuccess && (
                  <div className="bg-green-500/10 rounded-lg p-3 text-xs mt-2">
                    <p className="font-semibold text-green-700">{charlieActionSuccess}</p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCharlieModal(null); setCharlieActionSuccess(null); }}>
              No pausar
            </Button>
            <Button
              variant="destructive"
              disabled={charlieActionLoading || !!charlieActionSuccess}
              onClick={() => {
                if (charlieModal) {
                  executeCharlieAction('pause', charlieModal.adSetId, charlieModal.adSetName);
                }
              }}
            >
              {charlieActionLoading ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Pausando en Meta...</>
              ) : charlieActionSuccess ? (
                <><CheckCircle className="w-4 h-4 mr-2" /> Pausado</>
              ) : (
                'Pausar Ad Set en Meta'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

