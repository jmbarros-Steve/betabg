import { useState, useEffect, useMemo, useRef } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Eye, ShoppingCart, Sparkles, AlertTriangle, Rocket, X, Target,
  BarChart3, AlertCircle, Link2, ChevronDown, ChevronRight, Layers,
  Clock, CheckCircle, PauseCircle, Calendar, Download, MousePointerClick, Bell, LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
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


// Animated count-up hook
function useCountUp(end: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prevEnd = useRef(0);
  useEffect(() => {
    if (end === prevEnd.current) return;
    const start = prevEnd.current;
    prevEnd.current = end;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration]);
  return value;
}

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
  const [viewMode, setViewMode] = useState<'full' | 'executive'>('full');
  const [marginRate, setMarginRate] = useState<number>(40); // default 40% margin
  const [metaAccountCurrency, setMetaAccountCurrency] = useState<string>('USD');
  const [dynamicClpRate, setDynamicClpRate] = useState<number>(950); // fetched from API

  // Rules from Meta Wizard (meta_automated_rules)
  const [automatedRules, setAutomatedRules] = useState<any[]>([]);
  const [clientName, setClientName] = useState<string>('');

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

  // Fetch client name for PDF branding
  useEffect(() => {
    supabase.from('clients').select('name, company').eq('id', clientId).maybeSingle()
      .then(({ data }) => { if (data) setClientName(data.name || data.company || ''); });
  }, [clientId]);

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

      const minDate = new Date(Date.now() - daysFromRange(dateRange) * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('campaign_recommendations')
        .select('*')
        .in('connection_id', connectionIds)
        .eq('is_dismissed', false)
        .gte('created_at', minDate)
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

  // Contribution margin metrics
  const marginMetrics = useMemo(() => {
    const grossProfit = totals.revenue * (marginRate / 100);
    const netProfit = grossProfit - totals.spend;
    const poas = totals.spend > 0 ? grossProfit / totals.spend : 0;
    const breakEvenRoas = marginRate > 0 ? 100 / marginRate : 3.33;
    const marginPerConversion = totals.conversions > 0 ? netProfit / totals.conversions : 0;
    return { grossProfit, netProfit, poas, breakEvenRoas, marginPerConversion };
  }, [totals, marginRate]);

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
        return `Este Ad Set gasta ${formatCurrency(cpaClp || spendClp, 'CLP')} por venta, muy por encima de tu máximo de ${formatCurrency(maxCpaClp, 'CLP')}. Pausarlo ahorra presupuesto para los Ad Sets que sí funcionan.`;
      case 'learning':
        return `Meta está optimizando este Ad Set. Espera al menos 7 días antes de tomar decisiones — pausar antes destruye el aprendizaje del algoritmo.`;
      case 'good':
        return `Este Ad Set está funcionando bien. ROAS ${adSet.roas > 0 ? adSet.roas.toFixed(2) : '—'}x, gastando ${cpaClp ? formatCurrency(cpaClp, 'CLP') : '—'} por venta (dentro de tu objetivo). Se puede escalar +${scalePercent}%.`;
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

  // Relative time for last sync
  const lastSyncText = useMemo(() => {
    const syncTimes = connections
      .map(c => c.last_sync_at)
      .filter(Boolean)
      .map(t => new Date(t!).getTime());
    if (syncTimes.length === 0) return null;
    const latest = Math.max(...syncTimes);
    const diffMs = Date.now() - latest;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace menos de 1 min';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    return `hace ${diffDays}d`;
  }, [connections]);

  // CSV Export
  function exportCSV() {
    const headers = ['Campaña', 'Plataforma', 'Gasto CLP', 'Ingresos CLP', 'ROAS', 'Conversiones', 'CPC CLP', 'CPM CLP', 'CTR %'];
    const rows = aggregatedCampaigns.map(c => [
      c.campaign_name,
      c.platform,
      Math.round(c.total_spend),
      Math.round(c.total_revenue),
      c.avg_roas.toFixed(2),
      c.total_conversions,
      Math.round(c.avg_cpc),
      Math.round(c.avg_cpm),
      c.avg_ctr.toFixed(2),
    ]);
    // Totals row
    rows.push([
      'TOTAL',
      '',
      Math.round(totals.spend),
      Math.round(totals.revenue),
      overallRoas.toFixed(2),
      totals.conversions,
      totals.clicks > 0 ? Math.round(totals.spend / totals.clicks) : 0,
      totals.impressions > 0 ? Math.round((totals.spend / totals.impressions) * 1000) : 0,
      overallCtr.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campañas-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasData = metrics.length > 0;

  // Animated KPI values
  const animSpend = useCountUp(totals.spend);
  const animRevenue = useCountUp(totals.revenue);
  const animRoas = useCountUp(overallRoas, 600);
  const animConversions = useCountUp(totals.conversions, 600);

  // Daily trend data for sparklines (must be declared before memos that depend on it)
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }>();
    for (const m of metrics) {
      const d = m.metric_date;
      const existing = map.get(d) || { date: d, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
      existing.spend += Number(m.spend) || 0;
      existing.revenue += Number(m.conversion_value) || 0;
      existing.impressions += Number(m.impressions) || 0;
      existing.clicks += Number(m.clicks) || 0;
      existing.conversions += Number(m.conversions) || 0;
      map.set(d, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  // Budget pacing
  const budgetPacing = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const monthPct = (dayOfMonth / daysInMonth) * 100;
    const avgDailySpend = dailyTrend.length > 0 ? dailyTrend.slice(-30).reduce((s, d) => s + d.spend, 0) / Math.min(dailyTrend.length, 30) : 0;
    const projectedMonthlySpend = avgDailySpend * daysInMonth;
    const currentMonthSpend = dailyTrend
      .filter(d => { const dt = new Date(d.date + 'T12:00:00'); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); })
      .reduce((s, d) => s + d.spend, 0);
    const spendPct = projectedMonthlySpend > 0 ? (currentMonthSpend / projectedMonthlySpend) * 100 : 0;
    return { monthPct, spendPct, currentMonthSpend, projectedMonthlySpend, avgDailySpend, daysInMonth, dayOfMonth };
  }, [dailyTrend]);

  // Platform comparison
  const platformComparison = useMemo(() => {
    const platforms: Record<string, { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }> = {};
    for (const m of metrics) {
      const p = m.platform || 'unknown';
      if (!platforms[p]) platforms[p] = { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
      platforms[p].spend += Number(m.spend) || 0;
      platforms[p].revenue += Number(m.conversion_value) || 0;
      platforms[p].clicks += Number(m.clicks) || 0;
      platforms[p].impressions += Number(m.impressions) || 0;
      platforms[p].conversions += Number(m.conversions) || 0;
    }
    return Object.entries(platforms).map(([platform, data]) => ({
      platform, ...data,
      roas: data.spend > 0 ? data.revenue / data.spend : 0,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
      cpa: data.conversions > 0 ? data.spend / data.conversions : 0,
      cpc: data.clicks > 0 ? data.spend / data.clicks : 0,
    }));
  }, [metrics]);

  // Trend projection (7 days)
  const trendWithProjection = useMemo(() => {
    if (dailyTrend.length < 7) return [];
    const recent = dailyTrend.slice(-7);
    const avgSpend = recent.reduce((s, d) => s + d.spend, 0) / 7;
    const avgRev = recent.reduce((s, d) => s + d.revenue, 0) / 7;
    const spendSlope = (recent[recent.length - 1].spend - recent[0].spend) / 6;
    const revSlope = (recent[recent.length - 1].revenue - recent[0].revenue) / 6;
    const projected = [];
    const lastDate = new Date(dailyTrend[dailyTrend.length - 1].date + 'T12:00:00');
    for (let i = 1; i <= 7; i++) {
      const d = new Date(lastDate); d.setDate(d.getDate() + i);
      projected.push({ date: d.toISOString().split('T')[0], spend: 0, revenue: 0, projectedSpend: Math.max(0, avgSpend + spendSlope * i), projectedRevenue: Math.max(0, avgRev + revSlope * i) });
    }
    return [...dailyTrend.map(d => ({ ...d, projectedSpend: 0, projectedRevenue: 0 })), ...projected];
  }, [dailyTrend]);

  // Funnel data: impressions -> clicks -> conversions with drop-off %
  const funnelSteps = useMemo(() => {
    const imp = totals.impressions;
    const cli = totals.clicks;
    const conv = totals.conversions;
    return [
      { label: 'Impresiones', value: imp, pct: 100, icon: Eye, color: 'bg-blue-500' },
      { label: 'Clicks', value: cli, pct: imp > 0 ? (cli / imp) * 100 : 0, icon: MousePointerClick, color: 'bg-cyan-500' },
      { label: 'Conversiones', value: conv, pct: cli > 0 ? (conv / cli) * 100 : 0, icon: ShoppingCart, color: 'bg-green-500' },
    ];
  }, [totals]);

  // Smart alerts
  const smartAlerts = useMemo(() => {
    const alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string }> = [];
    const prevDays = dailyTrend.slice(0, Math.floor(dailyTrend.length / 2));
    const recentDays = dailyTrend.slice(Math.floor(dailyTrend.length / 2));

    const prevSpend = prevDays.reduce((s, d) => s + d.spend, 0);
    const prevConv = prevDays.reduce((s, d) => s + d.conversions, 0);
    const recentSpend = recentDays.reduce((s, d) => s + d.spend, 0);
    const recentConv = recentDays.reduce((s, d) => s + d.conversions, 0);

    const prevCpa = prevConv > 0 ? prevSpend / prevConv : 0;
    const recentCpa = recentConv > 0 ? recentSpend / recentConv : 0;

    // CPA spike > 20%
    if (prevCpa > 0 && recentCpa > prevCpa * 1.2) {
      const pctIncrease = Math.round(((recentCpa - prevCpa) / prevCpa) * 100);
      alerts.push({ type: 'critical', message: `CPA subió ${pctIncrease}% (${formatCurrency(prevCpa, 'CLP')} → ${formatCurrency(recentCpa, 'CLP')})` });
    }

    // ROAS below break-even (< 1x)
    if (overallRoas > 0 && overallRoas < 1) {
      alerts.push({ type: 'critical', message: `ROAS ${overallRoas.toFixed(2)}x — por debajo del break-even. Estás perdiendo dinero.` });
    } else if (overallRoas > 0 && overallRoas < 2) {
      alerts.push({ type: 'warning', message: `ROAS ${overallRoas.toFixed(2)}x — cerca del break-even. Margen ajustado.` });
    }

    // CTR too low (< 1%)
    if (overallCtr > 0 && overallCtr < 1 && totals.impressions > 1000) {
      alerts.push({ type: 'warning', message: `CTR ${overallCtr.toFixed(2)}% — debajo del 1%. Revisa creativos y segmentación.` });
    }

    // Spend without conversions
    if (totals.spend > 50000 && totals.conversions === 0) {
      alerts.push({ type: 'critical', message: `${formatCurrency(totals.spend, 'CLP')} gastados sin conversiones. Revisa pixel y tracking.` });
    }

    // Anomaly detection: z-score on daily spend
    if (dailyTrend.length >= 7) {
      const spends = dailyTrend.map(d => d.spend);
      const mean = spends.reduce((s, v) => s + v, 0) / spends.length;
      const stdDev = Math.sqrt(spends.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / spends.length);
      if (stdDev > 0) {
        const last3 = dailyTrend.slice(-3);
        for (const day of last3) {
          const zScore = (day.spend - mean) / stdDev;
          if (zScore > 2) {
            const date = new Date(day.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
            alerts.push({ type: 'warning', message: `Anomal\u00eda: gasto del ${date} (${formatCurrency(day.spend, 'CLP')}) es ${zScore.toFixed(1)}\u03c3 sobre el promedio.` });
          }
        }
        // Revenue anomaly (drop)
        const revenues = dailyTrend.map(d => d.revenue);
        const revMean = revenues.reduce((s, v) => s + v, 0) / revenues.length;
        const revStd = Math.sqrt(revenues.reduce((s, v) => s + Math.pow(v - revMean, 2), 0) / revenues.length);
        if (revStd > 0 && revMean > 0) {
          const lastDay = dailyTrend[dailyTrend.length - 1];
          const revZ = (lastDay.revenue - revMean) / revStd;
          if (revZ < -2) {
            const date = new Date(lastDay.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
            alerts.push({ type: 'critical', message: `Ca\u00edda de ingresos: ${date} (${formatCurrency(lastDay.revenue, 'CLP')}) es ${Math.abs(revZ).toFixed(1)}\u03c3 bajo el promedio.` });
          }
        }
      }

      // CTR anomaly per campaign
      for (const campaign of aggregatedCampaigns.slice(0, 10)) {
        if (campaign.total_impressions > 5000 && campaign.avg_ctr < 0.5) {
          alerts.push({ type: 'info', message: `"${campaign.campaign_name.slice(0, 40)}" tiene CTR ${campaign.avg_ctr.toFixed(2)}% con ${formatNumber(campaign.total_impressions)} impresiones. Considerar pausar.` });
        }
      }
    }

    return alerts;
  }, [totals, dailyTrend, overallRoas, overallCtr]);

  // Weekly cohort analysis: ROAS and CPA per week
  const weeklyCohorts = useMemo(() => {
    if (dailyTrend.length < 7) return [];
    const weeks: Array<{ week: string; spend: number; revenue: number; conversions: number; roas: number; cpa: number }> = [];
    let weekStart = 0;
    while (weekStart < dailyTrend.length) {
      const weekSlice = dailyTrend.slice(weekStart, weekStart + 7);
      const spend = weekSlice.reduce((s, d) => s + d.spend, 0);
      const revenue = weekSlice.reduce((s, d) => s + d.revenue, 0);
      const conversions = weekSlice.reduce((s, d) => s + d.conversions, 0);
      const startDate = weekSlice[0].date;
      const endDate = weekSlice[weekSlice.length - 1].date;
      weeks.push({
        week: `${startDate.slice(5)} \u2192 ${endDate.slice(5)}`,
        spend, revenue, conversions,
        roas: spend > 0 ? revenue / spend : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
      });
      weekStart += 7;
    }
    return weeks;
  }, [dailyTrend]);

  // Monthly cohort: spend, revenue, ROAS, CPA by month
  const monthlyCohorts = useMemo(() => {
    const months = new Map<string, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>();
    for (const d of dailyTrend) {
      const month = d.date.slice(0, 7); // YYYY-MM
      const existing = months.get(month) || { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
      existing.spend += d.spend;
      existing.revenue += d.revenue;
      existing.conversions += d.conversions;
      existing.clicks += d.clicks;
      existing.impressions += d.impressions;
      months.set(month, existing);
    }
    const sorted = Array.from(months.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([month, data], i) => {
      const roas = data.spend > 0 ? data.revenue / data.spend : 0;
      const cpa = data.conversions > 0 ? data.spend / data.conversions : 0;
      const ltv = data.conversions > 0 ? data.revenue / data.conversions : 0;
      const prevData = i > 0 ? sorted[i - 1][1] : null;
      const prevConv = prevData ? prevData.conversions : 0;
      const retention = prevConv > 0 && data.conversions > 0 ? Math.min((data.conversions / prevConv) * 100, 200) : null;
      return { month, ...data, roas, cpa, ltv, retention };
    });
  }, [dailyTrend]);

  // PDF export with client branding
  function exportPDF() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Habilita popups para exportar PDF'); return; }
    const brandName = clientName || 'Cliente';
    const campaignRows = aggregatedCampaigns.map(c =>
      `<tr><td>${c.campaign_name}</td><td>${c.platform}</td><td>${formatCurrency(c.total_spend, 'CLP')}</td><td>${formatCurrency(c.total_revenue, 'CLP')}</td><td style="color:${c.avg_roas >= 2 ? '#16a34a' : c.avg_roas >= 1 ? '#ca8a04' : '#dc2626'};font-weight:700">${c.avg_roas.toFixed(2)}x</td><td>${c.total_conversions}</td><td>${formatCurrency(c.avg_cpc, 'CLP')}</td><td>${c.avg_ctr.toFixed(2)}%</td></tr>`
    ).join('');
    const cohortRows = weeklyCohorts.map(w =>
      `<tr><td>${w.week}</td><td>${formatCurrency(w.spend, 'CLP')}</td><td>${formatCurrency(w.revenue, 'CLP')}</td><td style="color:${w.roas >= 2 ? '#16a34a' : w.roas >= 1 ? '#ca8a04' : '#dc2626'};font-weight:700">${w.roas.toFixed(2)}x</td><td>${w.conversions}</td><td>${w.cpa > 0 ? formatCurrency(w.cpa, 'CLP') : '\u2014'}</td></tr>`
    ).join('');
    const monthlyCohortRows = monthlyCohorts.map(c =>
      `<tr><td>${new Date(c.month + '-15').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</td><td>${formatCurrency(c.spend, 'CLP')}</td><td>${formatCurrency(c.revenue, 'CLP')}</td><td style="color:${c.roas >= 2 ? '#16a34a' : c.roas >= 1 ? '#ca8a04' : '#dc2626'};font-weight:700">${c.roas.toFixed(2)}x</td><td>${c.conversions}</td><td>${c.cpa > 0 ? formatCurrency(c.cpa, 'CLP') : '\u2014'}</td><td>${c.ltv > 0 ? formatCurrency(c.ltv, 'CLP') : '\u2014'}</td><td>${c.retention !== null ? c.retention.toFixed(0) + '%' : '\u2014'}</td></tr>`
    ).join('');
    const alertsHtml = smartAlerts.length > 0 ? `<h2>\u26a0\ufe0f Alertas</h2><ul style="list-style:none;padding:0">${smartAlerts.map(a => `<li style="padding:6px 12px;margin:4px 0;border-radius:6px;font-size:13px;background:${a.type === 'critical' ? '#fef2f2' : a.type === 'warning' ? '#fefce8' : '#eff6ff'};border:1px solid ${a.type === 'critical' ? '#fecaca' : a.type === 'warning' ? '#fde68a' : '#bfdbfe'}">${a.message}</li>`).join('')}</ul>` : '';
    const platformRows = platformComparison.map(p =>
      `<tr><td style="text-transform:capitalize;font-weight:500">${p.platform}</td><td>${formatCurrency(p.spend, 'CLP')}</td><td>${formatCurrency(p.revenue, 'CLP')}</td><td style="color:${p.roas >= 2 ? '#16a34a' : p.roas >= 1 ? '#ca8a04' : '#dc2626'};font-weight:700">${p.roas.toFixed(2)}x</td><td>${p.conversions}</td><td>${p.cpa > 0 ? formatCurrency(p.cpa, 'CLP') : '\u2014'}</td></tr>`
    ).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${brandName} \u2014 Reporte de Performance</title>
      <style>
        *{box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;color:#1a1a1a;max-width:1100px;margin:0 auto}
        .header{border-bottom:3px solid #6366f1;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
        .header h1{font-size:24px;margin:0;color:#1e1b4b}.header .meta{text-align:right;color:#64748b;font-size:12px}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}
        .kpi-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center}
        .kpi-card .label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
        .kpi-card .value{font-size:28px;font-weight:700}.kpi-card .sub{font-size:11px;color:#94a3b8;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
        th{background:#f1f5f9;padding:10px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0}
        td{padding:8px 12px;border-bottom:1px solid #f1f5f9}tr:hover td{background:#fafafa}
        h2{font-size:16px;color:#1e1b4b;margin:32px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px}.header{border-color:#1e1b4b}}
      </style></head><body>
      <div class="header">
        <div><h1>${brandName}</h1><p style="margin:4px 0 0;color:#6366f1;font-size:14px;font-weight:500">Reporte de Performance</p></div>
        <div class="meta"><div>\u00daltimos ${daysFromRange(dateRange)} d\u00edas</div><div>${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      </div>
      <div class="kpis">
        <div class="kpi-card"><div class="label">Gasto Total</div><div class="value">${formatCurrency(totals.spend, 'CLP')}</div></div>
        <div class="kpi-card"><div class="label">Ingresos</div><div class="value" style="color:#16a34a">${formatCurrency(totals.revenue, 'CLP')}</div></div>
        <div class="kpi-card"><div class="label">ROAS</div><div class="value" style="color:${overallRoas >= 3 ? '#16a34a' : overallRoas >= 2 ? '#ca8a04' : '#dc2626'}">${overallRoas.toFixed(2)}x</div></div>
        <div class="kpi-card"><div class="label">Conversiones</div><div class="value">${formatNumber(totals.conversions)}</div><div class="sub">CPA: ${totals.conversions > 0 ? formatCurrency(totals.spend / totals.conversions, 'CLP') : '\u2014'} \u00b7 CTR: ${overallCtr.toFixed(2)}%</div></div>
      </div>
      ${alertsHtml}
      ${platformComparison.length > 1 ? `<h2>Comparativo por Plataforma</h2><table><thead><tr><th>Plataforma</th><th>Gasto</th><th>Ingresos</th><th>ROAS</th><th>Conv.</th><th>CPA</th></tr></thead><tbody>${platformRows}</tbody></table>` : ''}
      <h2>Campa\u00f1as</h2>
      <table><thead><tr><th>Campa\u00f1a</th><th>Plataforma</th><th>Gasto</th><th>Ingresos</th><th>ROAS</th><th>Conv.</th><th>CPC</th><th>CTR</th></tr></thead>
      <tbody>${campaignRows}
      <tr style="font-weight:bold;background:#f1f5f9"><td>TOTAL</td><td></td><td>${formatCurrency(totals.spend, 'CLP')}</td><td>${formatCurrency(totals.revenue, 'CLP')}</td><td>${overallRoas.toFixed(2)}x</td><td>${totals.conversions}</td><td>${totals.clicks > 0 ? formatCurrency(totals.spend / totals.clicks, 'CLP') : '-'}</td><td>${overallCtr.toFixed(2)}%</td></tr></tbody></table>
      ${weeklyCohorts.length > 0 ? `<h2>An\u00e1lisis Semanal</h2><table><thead><tr><th>Semana</th><th>Gasto</th><th>Ingresos</th><th>ROAS</th><th>Conv.</th><th>CPA</th></tr></thead><tbody>${cohortRows}</tbody></table>` : ''}
      ${monthlyCohorts.length > 1 ? `<h2>Cohort Mensual \u2014 Retenci\u00f3n y LTV</h2><table><thead><tr><th>Mes</th><th>Gasto</th><th>Ingresos</th><th>ROAS</th><th>Conv.</th><th>CPA</th><th>LTV/Conv</th><th>Ret.</th></tr></thead><tbody>${monthlyCohortRows}</tbody></table>` : ''}
      <div class="footer">Generado por Steve \u00b7 ${new Date().toLocaleString('es-CL')} \u00b7 Datos de Meta Ads y Google Ads</div>
      </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-32 mb-3" />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-16 rounded-md" />)}
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-48 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border">
              <CardContent className="pt-6 pb-3 px-6">
                <div className="flex justify-between mb-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
                <Skeleton className="h-9 w-36 mb-2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Secondary KPIs skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="py-4 px-5">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-7 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Chart skeleton */}
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </CardContent>
        </Card>
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
      {/* Header — sticky on scroll */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 -mx-1 px-1 pt-1 border-b border-transparent [&:not(:first-child)]:border-border/50">
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
          {hasData && (<>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button
              variant={viewMode === 'executive' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode(v => v === 'full' ? 'executive' : 'full')}
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {viewMode === 'executive' ? 'Vista Completa' : 'Resumen'}
            </Button>
          </>)}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {lastSyncText && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Última actualización: {lastSyncText}
            </span>
          )}
          {metaAccountCurrency && metaAccountCurrency !== 'CLP' && (
            <span>Cuenta en {metaAccountCurrency} · Convertido a CLP</span>
          )}
        </div>
      </div>
      </div>{/* end sticky */}

      {!hasData && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">Sin datos para este período</p>
            <p className="text-xs text-muted-foreground mt-1">
              Prueba otro rango de fechas o sincroniza las campañas.
            </p>
          </CardContent>
        </Card>
      )}

      {hasData && <>

      {/* Executive Summary View */}
      {viewMode === 'executive' && (
        <Card className="border-2 border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5" />
              Resumen Ejecutivo
            </CardTitle>
            <CardDescription>\u00daltimos {daysFromRange(dateRange)} d\u00edas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Gasto Total', value: formatCurrency(totals.spend, 'CLP'), className: '' },
                { label: 'Ingresos', value: formatCurrency(totals.revenue, 'CLP'), className: 'text-green-600' },
                { label: 'ROAS', value: `${overallRoas.toFixed(2)}x`, className: overallRoas >= 3 ? 'text-green-600' : overallRoas >= 2 ? 'text-yellow-600' : 'text-red-500' },
                { label: 'Conversiones', value: formatNumber(totals.conversions), className: '' },
                { label: 'CPA', value: totals.conversions > 0 ? formatCurrency(totals.spend / totals.conversions, 'CLP') : '\u2014', className: '' },
                { label: 'CTR', value: formatPercent(overallCtr), className: '' },
              ].map(kpi => (
                <div key={kpi.label} className="text-center p-4 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.className}`}>{kpi.value}</p>
                </div>
              ))}
            </div>
            {dailyTrend.length > 1 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Gasto vs Ingresos</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={dailyTrend}>
                      <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Conversiones diarias</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={dailyTrend}>
                      <Line type="monotone" dataKey="conversions" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {smartAlerts.length > 0 && (
              <div className="mt-4 space-y-1">
                {smartAlerts.slice(0, 3).map((alert, i) => (
                  <p key={i} className={`text-xs px-2 py-1 rounded ${alert.type === 'critical' ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                    {alert.type === 'critical' ? '\u26a0\ufe0f' : '\u2139\ufe0f'} {alert.message}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === 'full' && <>
      {/* Primary KPIs - large cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border bg-gradient-to-br from-red-500/8 to-transparent border-red-500/15">
          <CardContent className="pt-6 pb-3 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Gasto Total</span>
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <DollarSign className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(animSpend, 'CLP')}</p>
            {dailyTrend.length > 1 && (
              <ResponsiveContainer width="100%" height={32}>
                <LineChart data={dailyTrend}><Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={1.5} dot={false} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-green-500/8 to-transparent border-green-500/15">
          <CardContent className="pt-6 pb-3 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Ingresos Totales</span>
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(animRevenue, 'CLP')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.revenue > 0 ? `ROAS: ${overallRoas.toFixed(2)}x` : 'Sin datos de conversión'}
            </p>
            {dailyTrend.length > 1 && (
              <ResponsiveContainer width="100%" height={32}>
                <LineChart data={dailyTrend}><Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={1.5} dot={false} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-cyan-500/8 to-transparent border-cyan-500/15">
          <CardContent className="pt-6 pb-3 px-6">
            <div className="flex items-start justify-between mb-3">
              <JargonTooltip term="ROAS" className="text-sm font-medium text-muted-foreground" />
              <div className="p-2.5 rounded-xl bg-cyan-500/10">
                <TrendingUp className="w-5 h-5 text-cyan-500" />
              </div>
            </div>
            <p className={`text-3xl font-bold tracking-tight ${overallRoas >= 3 ? 'text-green-600' : overallRoas >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
              {animRoas.toFixed(2)}x
            </p>
            {dailyTrend.length > 1 && (
              <ResponsiveContainer width="100%" height={32}>
                <LineChart data={dailyTrend.map(d => ({ ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 }))}><Line type="monotone" dataKey="roas" stroke="#06b6d4" strokeWidth={1.5} dot={false} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-amber-500/8 to-transparent border-amber-500/15">
          <CardContent className="pt-6 pb-3 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Conversiones</span>
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{formatNumber(Math.round(animConversions))}</p>
            {dailyTrend.length > 1 && (
              <ResponsiveContainer width="100%" height={32}>
                <LineChart data={dailyTrend}><Line type="monotone" dataKey="conversions" stroke="#f59e0b" strokeWidth={1.5} dot={false} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs - compact row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <span className="text-xs font-medium text-muted-foreground">Costo/Conv</span>
            <p className="text-xl font-bold mt-1">
              {totals.conversions > 0 ? formatCurrency(totals.spend / totals.conversions, 'CLP') : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <JargonTooltip term="CPC" className="text-xs font-medium text-muted-foreground" />
            <p className="text-xl font-bold mt-1">
              {totals.clicks > 0 ? formatCurrency(totals.spend / totals.clicks, 'CLP') : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-4 px-5">
            <JargonTooltip term="CPM" className="text-xs font-medium text-muted-foreground" />
            <p className="text-xl font-bold mt-1">
              {totals.impressions > 0 ? formatCurrency((totals.spend / totals.impressions) * 1000, 'CLP') : '-'}
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

      {/* Contribution Margin */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Margen de Contribuci\u00f3n</CardTitle>
              <CardDescription>Rentabilidad real descontando costos de ads</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Margen bruto:</span>
              <Input
                type="number"
                value={marginRate}
                onChange={(e) => setMarginRate(Math.max(1, Math.min(99, Number(e.target.value) || 40)))}
                className="w-16 h-8 text-xs text-center"
                min={1} max={99}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Beneficio Bruto</p>
              <p className="text-lg font-bold">{formatCurrency(marginMetrics.grossProfit, 'CLP')}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Beneficio Neto</p>
              <p className={`text-lg font-bold ${marginMetrics.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {formatCurrency(marginMetrics.netProfit, 'CLP')}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">POAS</p>
              <p className={`text-lg font-bold ${marginMetrics.poas >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                {marginMetrics.poas.toFixed(2)}x
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Break-Even ROAS</p>
              <p className="text-lg font-bold">{marginMetrics.breakEvenRoas.toFixed(2)}x</p>
              <p className="text-[10px] text-muted-foreground">Actual: {overallRoas.toFixed(2)}x {overallRoas >= marginMetrics.breakEvenRoas ? '\u2705' : '\u274c'}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Margen/Conv</p>
              <p className={`text-lg font-bold ${marginMetrics.marginPerConversion >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {totals.conversions > 0 ? formatCurrency(marginMetrics.marginPerConversion, 'CLP') : '\u2014'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Alerts */}
      {smartAlerts.length > 0 && (
        <div className="space-y-2">
          {smartAlerts.map((alert, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
                alert.type === 'critical' ? 'bg-red-500/8 border-red-500/20 text-red-700 dark:text-red-400' :
                alert.type === 'warning' ? 'bg-yellow-500/8 border-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
                'bg-blue-500/8 border-blue-500/20 text-blue-700 dark:text-blue-400'
              }`}
            >
              {alert.type === 'critical' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Bell className="w-4 h-4 shrink-0" />}
              {alert.message}
            </motion.div>
          ))}
        </div>
      )}

      {/* Conversion Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Embudo de Conversión</CardTitle>
          <CardDescription>Caída por etapa del funnel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            {funnelSteps.map((step, i) => {
              const Icon = step.icon;
              const widthPct = Math.max(20, step.value > 0 ? (step.value / (funnelSteps[0].value || 1)) * 100 : 0);
              return (
                <div key={step.label} className="flex-1 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{step.label}</span>
                  </div>
                  <div className="w-full bg-muted/30 rounded-full h-8 overflow-hidden">
                    <div
                      className={`${step.color} h-full rounded-full flex items-center justify-center transition-all duration-700`}
                      style={{ width: `${widthPct}%`, minWidth: '40px' }}
                    >
                      <span className="text-white text-xs font-bold drop-shadow">{formatNumber(step.value)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">
                    {i === 0 ? '100%' : `${step.pct.toFixed(2)}%`}
                    {i > 0 && <span className="text-red-400 ml-1">(-{(100 - step.pct).toFixed(1)}%)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top/Bottom 5 Campaigns by ROAS */}
      {aggregatedCampaigns.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-green-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Top 5 Campañas (ROAS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {aggregatedCampaigns
                .filter(c => c.avg_roas > 0)
                .sort((a, b) => b.avg_roas - a.avg_roas)
                .slice(0, 5)
                .map((c, i) => (
                  <div key={c.campaign_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 truncate flex-1">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <img src={c.platform === 'meta' ? logoMeta : logoGoogle} alt="" className="w-3.5 h-3.5" />
                      <span className="truncate">{c.campaign_name}</span>
                    </div>
                    <span className="font-bold text-green-600 ml-2">{c.avg_roas.toFixed(2)}x</span>
                  </div>
                ))}
              {aggregatedCampaigns.filter(c => c.avg_roas > 0).length === 0 && (
                <p className="text-xs text-muted-foreground">Sin datos de ROAS</p>
              )}
            </CardContent>
          </Card>
          <Card className="border-red-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                Bottom 5 Campañas (ROAS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {aggregatedCampaigns
                .filter(c => c.total_spend > 0)
                .sort((a, b) => a.avg_roas - b.avg_roas)
                .slice(0, 5)
                .map((c, i) => (
                  <div key={c.campaign_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 truncate flex-1">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <img src={c.platform === 'meta' ? logoMeta : logoGoogle} alt="" className="w-3.5 h-3.5" />
                      <span className="truncate">{c.campaign_name}</span>
                    </div>
                    <span className={`font-bold ml-2 ${c.avg_roas < 1 ? 'text-red-500' : 'text-yellow-600'}`}>{c.avg_roas.toFixed(2)}x</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Heatmap by Day of Week */}
      {dailyTrend.length > 6 && (() => {
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dayData = dayNames.map((name, dayIdx) => {
          const daysOfWeek = dailyTrend.filter(d => new Date(d.date + 'T12:00:00').getDay() === dayIdx);
          const avgSpend = daysOfWeek.length > 0 ? daysOfWeek.reduce((s, d) => s + d.spend, 0) / daysOfWeek.length : 0;
          const avgConv = daysOfWeek.length > 0 ? daysOfWeek.reduce((s, d) => s + d.conversions, 0) / daysOfWeek.length : 0;
          const avgRoas = avgSpend > 0 ? daysOfWeek.reduce((s, d) => s + d.revenue, 0) / daysOfWeek.reduce((s, d) => s + d.spend, 0) : 0;
          return { name, spend: avgSpend, conversions: avgConv, roas: avgRoas, count: daysOfWeek.length };
        });
        const maxRoas = Math.max(...dayData.map(d => d.roas), 0.01);
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Performance por Día de la Semana</CardTitle>
              <CardDescription>Promedio de ROAS, gasto y conversiones por día</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {dayData.map(d => {
                  const intensity = d.roas / maxRoas;
                  const bg = intensity > 0.7 ? 'bg-green-500/20 border-green-500/30'
                    : intensity > 0.4 ? 'bg-yellow-500/15 border-yellow-500/25'
                    : d.count > 0 ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-muted/20 border-border';
                  return (
                    <div key={d.name} className={`rounded-lg border p-3 text-center ${bg}`}>
                      <p className="text-xs font-medium text-muted-foreground">{d.name}</p>
                      <p className={`text-lg font-bold mt-1 ${d.roas >= 2 ? 'text-green-600' : d.roas >= 1 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {d.roas.toFixed(1)}x
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(d.spend, 'CLP')}</p>
                      <p className="text-[10px] text-muted-foreground">{d.conversions.toFixed(1)} conv</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Weekly Cohort Analysis */}
      {weeklyCohorts.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evoluci\u00f3n Semanal</CardTitle>
            <CardDescription>ROAS y CPA por semana \u2014 detecta tendencias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Semana</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Gasto</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Ingresos</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">ROAS</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Conv.</th>
                    <th className="pb-2 text-muted-foreground font-medium">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyCohorts.map((w, i) => {
                    const prevRoas = i > 0 ? weeklyCohorts[i - 1].roas : null;
                    const roasDelta = prevRoas !== null && prevRoas > 0 ? ((w.roas - prevRoas) / prevRoas) * 100 : null;
                    return (
                      <tr key={w.week} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-medium">{w.week}</td>
                        <td className="py-2 pr-4">{formatCurrency(w.spend, 'CLP')}</td>
                        <td className="py-2 pr-4">{formatCurrency(w.revenue, 'CLP')}</td>
                        <td className="py-2 pr-4">
                          <span className={w.roas >= 2 ? 'text-green-600 font-bold' : w.roas >= 1 ? 'text-yellow-600 font-bold' : 'text-red-500 font-bold'}>
                            {w.roas.toFixed(2)}x
                          </span>
                          {roasDelta !== null && (
                            <span className={`ml-1 text-xs ${roasDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {roasDelta >= 0 ? '\u25b2' : '\u25bc'}{Math.abs(roasDelta).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{w.conversions}</td>
                        <td className="py-2">{w.cpa > 0 ? formatCurrency(w.cpa, 'CLP') : '\u2014'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Cohort Analysis */}
      {monthlyCohorts.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cohort Mensual — Retenci\u00f3n y LTV</CardTitle>
            <CardDescription>M\u00e9tricas por mes de adquisici\u00f3n</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">Mes</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">Gasto</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">Ingresos</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">ROAS</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">Conv.</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">CPA</th>
                    <th className="pb-2 pr-3 text-muted-foreground font-medium">LTV/Conv</th>
                    <th className="pb-2 text-muted-foreground font-medium">Ret. %</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCohorts.map((c, i) => (
                    <tr key={c.month} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium">{new Date(c.month + '-15').toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })}</td>
                      <td className="py-2 pr-3">{formatCurrency(c.spend, 'CLP')}</td>
                      <td className="py-2 pr-3">{formatCurrency(c.revenue, 'CLP')}</td>
                      <td className="py-2 pr-3"><span className={c.roas >= 2 ? 'text-green-600 font-bold' : c.roas >= 1 ? 'text-yellow-600 font-bold' : 'text-red-500 font-bold'}>{c.roas.toFixed(2)}x</span></td>
                      <td className="py-2 pr-3">{c.conversions}</td>
                      <td className="py-2 pr-3">{c.cpa > 0 ? formatCurrency(c.cpa, 'CLP') : '\u2014'}</td>
                      <td className="py-2 pr-3">{c.ltv > 0 ? formatCurrency(c.ltv, 'CLP') : '\u2014'}</td>
                      <td className="py-2">
                        {c.retention !== null ? (
                          <span className={c.retention >= 100 ? 'text-green-600 font-medium' : c.retention >= 70 ? 'text-yellow-600' : 'text-red-500'}>
                            {c.retention.toFixed(0)}%
                          </span>
                        ) : i === 0 ? '\u2014' : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Pacing */}
      {budgetPacing.avgDailySpend > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budget Pacing</CardTitle>
            <CardDescription>D\u00eda {budgetPacing.dayOfMonth}/{budgetPacing.daysInMonth} del mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Mes transcurrido</span>
                  <span className="font-medium">{budgetPacing.monthPct.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(budgetPacing.monthPct, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Budget gastado (vs proyectado)</span>
                  <span className={`font-medium ${budgetPacing.spendPct > budgetPacing.monthPct * 1.15 ? 'text-red-500' : budgetPacing.spendPct < budgetPacing.monthPct * 0.85 ? 'text-yellow-500' : 'text-green-500'}`}>
                    {budgetPacing.spendPct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${budgetPacing.spendPct > budgetPacing.monthPct * 1.15 ? 'bg-red-500' : budgetPacing.spendPct < budgetPacing.monthPct * 0.85 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(budgetPacing.spendPct, 100)}%` }} />
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Gastado: {formatCurrency(budgetPacing.currentMonthSpend, 'CLP')}</span>
                <span>Proyecci\u00f3n mes: {formatCurrency(budgetPacing.projectedMonthlySpend, 'CLP')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Comparison */}
      {platformComparison.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Meta vs Google</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Plataforma</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Gasto</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Ingresos</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">ROAS</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Conv.</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">CPA</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">CTR</th>
                    <th className="pb-2 text-muted-foreground font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {platformComparison.map(p => (
                    <tr key={p.platform} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <img src={p.platform === 'meta' ? logoMeta : logoGoogle} alt="" className="w-4 h-4" />
                          <span className="font-medium capitalize">{p.platform}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(p.spend, 'CLP')}</td>
                      <td className="py-2 pr-4">{formatCurrency(p.revenue, 'CLP')}</td>
                      <td className="py-2 pr-4"><span className={p.roas >= 2 ? 'text-green-600 font-bold' : p.roas >= 1 ? 'text-yellow-600 font-bold' : 'text-red-500 font-bold'}>{p.roas.toFixed(2)}x</span></td>
                      <td className="py-2 pr-4">{p.conversions}</td>
                      <td className="py-2 pr-4">{p.cpa > 0 ? formatCurrency(p.cpa, 'CLP') : '\u2014'}</td>
                      <td className="py-2 pr-4">{p.ctr.toFixed(2)}%</td>
                      <td className="py-2">{formatCurrency(p.cpc, 'CLP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend with 7-day Projection */}
      {trendWithProjection.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendencia + Proyecci\u00f3n 7 d\u00edas</CardTitle>
            <CardDescription>L\u00ednea punteada = proyecci\u00f3n lineal</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trendWithProjection} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => new Date(v + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} />
                <YAxis tick={{ fontSize: 10 }} width={70} allowDecimals={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <RechartsTooltip formatter={(value: number) => formatCurrency(value, 'CLP')} />
                <Area type="monotone" dataKey="spend" stroke="#ef4444" fill="#ef444420" strokeWidth={1.5} name="Gasto" />
                <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="#22c55e20" strokeWidth={1.5} name="Ingresos" />
                <Area type="monotone" dataKey="projectedSpend" stroke="#ef4444" fill="#ef444410" strokeWidth={1.5} strokeDasharray="5 5" name="Gasto (proy.)" />
                <Area type="monotone" dataKey="projectedRevenue" stroke="#22c55e" fill="#22c55e10" strokeWidth={1.5} strokeDasharray="5 5" name="Ingresos (proy.)" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
              : metrics.filter(m => (m as any).connection_id === selectedConnection);
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
                    tickFormatter={(v: number) => formatCurrency(v, 'CLP')}
                    allowDecimals={false}
                    width={80}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value, 'CLP'),
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
                              <p className="font-medium">{formatCurrency(campaign.total_spend, 'CLP')}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Ingresos (Atrib.)</p>
                              <p className="font-medium">{formatCurrency(campaign.total_revenue, 'CLP')}</p>
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
                                {campaign.total_conversions > 0 ? formatCurrency(campaign.total_spend / campaign.total_conversions, 'CLP') : '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="CPC" /></p>
                              <p className="font-medium">{formatCurrency(campaign.avg_cpc, 'CLP')}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs"><JargonTooltip term="CPM" /></p>
                              <p className="font-medium">{formatCurrency(campaign.avg_cpm, 'CLP')}</p>
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
                                          <p className="font-medium">{formatCurrency(spendClp, 'CLP')}</p>
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
                                          <p className="font-medium">{formatCurrency(parseFloat(adSet.cpm) * CLP_RATE, 'CLP')}</p>
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
      </>}{/* end viewMode full */}
      </>}

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

