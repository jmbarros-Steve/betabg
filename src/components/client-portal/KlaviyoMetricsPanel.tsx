import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  RefreshCw, Mail, Users, DollarSign,
  Eye, ChevronDown, ChevronRight, Zap, Megaphone, BarChart3, ShoppingCart,
  TrendingUp, MousePointerClick, Search, List, Target, Palette
} from 'lucide-react';
import { KlaviyoListsContent, type KlaviyoListItem } from './klaviyo/KlaviyoListsSegmentsTabs';
import EmailTemplateBuilder from './EmailTemplateBuilder';

interface KlaviyoMetricsPanelProps {
  clientId: string;
}

interface FlowMetrics {
  delivered: number;
  opens: number;
  clicks: number;
  revenue: number;
  unsubscribes: number;
  recipients: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
  conversions: number;
}

interface CampaignMetrics extends FlowMetrics {
  bounce_rate: number;
}

interface KlaviyoFlow {
  id: string;
  name: string;
  status: string;
  created: string;
  updated: string;
  trigger_type: string | null;
  metrics: FlowMetrics | null;
}

interface KlaviyoCampaign {
  id: string;
  name: string;
  status: string;
  send_time: string | null;
  created_at: string;
  updated_at: string;
  metrics: CampaignMetrics | null;
}

interface GlobalStats {
  totalProfiles: number | string;
  newProfiles: number;
  totalFlows: number;
  activeFlows: number;
  totalCampaigns: number;
  sentCampaigns: number;
  totalRevenue: number;
  totalFlowRevenue: number;
  totalCampaignRevenue: number;
  totalConversions: number;
  avgOpenRate: number;
  avgClickRate: number;
}

const TIMEFRAME_OPTIONS = [
  { value: 'last_24_hours', label: 'Hoy' },
  { value: 'last_7_days', label: '7 días' },
  { value: 'last_30_days', label: '30 días' },
  { value: 'last_60_days', label: '60 días' },
  { value: 'last_90_days', label: '90 días' },
  { value: 'last_365_days', label: '12 meses' },
];

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

function formatProfileCount(n: number): string {
  if (n >= 100000) return '100,000+';
  if (n >= 50000) return '50,000+';
  if (n >= 25000) return '25,000+';
  if (n >= 10000) return '10,000+';
  return Math.round(n).toLocaleString('es-CL');
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

function KpiCard({ label, value, subtitle, icon: Icon }: { label: string; value: string; subtitle?: string; icon: any }) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-xl border border-border/50">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <span className="text-xl font-bold">{value}</span>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground leading-tight">{subtitle}</span>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: KlaviyoFlow }) {
  const [open, setOpen] = useState(false);
  const m = flow.metrics;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left cursor-pointer">
          <div className="flex items-center gap-3 min-w-0">
            {open ? <ChevronDown className="w-4 h-4 shrink-0 text-primary" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
            <Zap className="w-4 h-4 shrink-0 text-primary" />
            <span className="text-sm font-medium truncate">{flow.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={flow.status === 'live' ? 'default' : 'secondary'} className="text-xs">
              {flow.status === 'live' ? 'Activo' : flow.status === 'draft' ? 'Borrador' : flow.status}
            </Badge>
            {m && m.revenue > 0 && (
              <span className="text-xs font-mono text-primary">{formatCurrency(m.revenue)}</span>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {m ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 px-10 pb-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Enviados</p>
              <p className="font-semibold text-sm">{formatNumber(m.delivered)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Open Rate</p>
              <p className="font-semibold text-sm">{(m.open_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Click Rate</p>
              <p className="font-semibold text-sm">{(m.click_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Conversiones</p>
              <p className="font-semibold text-sm">{formatNumber(m.conversions)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="font-semibold text-sm text-primary">{formatCurrency(m.revenue)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground px-10 pb-3">Sin métricas disponibles</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CampaignRow({ campaign }: { campaign: KlaviyoCampaign }) {
  const [open, setOpen] = useState(false);
  const m = campaign.metrics;

  const sendDate = campaign.send_time
    ? new Date(campaign.send_time).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left cursor-pointer">
          <div className="flex items-center gap-3 min-w-0">
            {open ? <ChevronDown className="w-4 h-4 shrink-0 text-primary" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
            <Megaphone className="w-4 h-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <span className="text-sm font-medium truncate block">{campaign.name}</span>
              {sendDate && <span className="text-[10px] text-muted-foreground">{sendDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={campaign.send_time ? 'default' : 'secondary'} className="text-xs">
              {campaign.send_time ? 'Enviada' : campaign.status}
            </Badge>
            {m && m.revenue > 0 && (
              <span className="text-xs font-mono text-primary">{formatCurrency(m.revenue)}</span>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {m ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-10 pb-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Enviados</p>
              <p className="font-semibold text-sm">{formatNumber(m.delivered)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Open Rate</p>
              <p className="font-semibold text-sm">{(m.open_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Click Rate</p>
              <p className="font-semibold text-sm">{(m.click_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="font-semibold text-sm text-primary">{formatCurrency(m.revenue)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Bounce Rate</p>
              <p className="font-semibold text-sm">{(m.bounce_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Unsubs</p>
              <p className="font-semibold text-sm">{formatNumber(m.unsubscribes)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground px-10 pb-3">Sin métricas disponibles</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KlaviyoMetricsPanel({ clientId }: KlaviyoMetricsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [flows, setFlows] = useState<KlaviyoFlow[]>([]);
  const [campaigns, setCampaigns] = useState<KlaviyoCampaign[]>([]);
  const [lists, setLists] = useState<KlaviyoListItem[]>([]);
  const [segments, setSegments] = useState<KlaviyoListItem[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);
  const [timeframe, setTimeframe] = useState('last_90_days');
  const [debugResult, setDebugResult] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
  }, [clientId]);

  const checkConnection = async () => {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'klaviyo')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data) {
      setConnectionId(data.id);
      setHasConnection(true);
    }
  };

  const fetchMetrics = async (tf?: string) => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-klaviyo-metrics', {
        body: { connectionId, timeframe: tf || timeframe },
      });

      if (error) {
        toast.error('Error al cargar métricas de Klaviyo: ' + (error?.message || error));
        return;
      }

      if (data?.flows) setFlows(data.flows);
      if (data?.campaigns) setCampaigns(data.campaigns);
      if (data?.lists) setLists(data.lists);
      if (data?.segments) setSegments(data.segments);
      if (data?.globalStats) setGlobalStats(data.globalStats);
      toast.success('Métricas de Klaviyo actualizadas');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeframeChange = (value: string) => {
    setTimeframe(value);
    if (globalStats) {
      fetchMetrics(value);
    }
  };

  if (!hasConnection) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8 text-center">
          <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Conecta Klaviyo en la pestaña "Conexiones" para ver tus métricas de email
          </p>
        </CardContent>
      </Card>
    );
  }

  const timeframeLabel = TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label || '90 días';

  return (
    <Card className="glow-box">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Rendimiento de Klaviyo
            </CardTitle>
            <CardDescription>Métricas de los últimos {timeframeLabel}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeframe} onValueChange={handleTimeframeChange}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAME_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => fetchMetrics()} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {globalStats ? 'Actualizar' : 'Cargar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => {
              if (!connectionId) return;
              setDebugResult('Cargando...');
              try {
                const startTime = Date.now();
                const { data, error } = await supabase.functions.invoke('sync-klaviyo-metrics', {
                  body: { connectionId, timeframe },
                });
                const elapsed = Date.now() - startTime;
                if (error) {
                  setDebugResult(JSON.stringify({ error, elapsed_ms: elapsed }, null, 2));
                } else {
                  setDebugResult(JSON.stringify({
                    elapsed_ms: elapsed,
                    globalStats: data?.globalStats,
                    _debug: data?._debug,
                    flows_count: data?.flows?.length,
                    campaigns_count: data?.campaigns?.length,
                  }, null, 2));
                }
              } catch (e: any) {
                setDebugResult(`Error: ${e.message}`);
              }
            }} className="text-xs">
              <Search className="w-3 h-3 mr-1" />
              Debug
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {debugResult && (
          <div className="mb-4 p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-mono font-bold">🔍 Debug Output</span>
              <Button variant="ghost" size="sm" onClick={() => setDebugResult(null)} className="text-xs h-6">✕</Button>
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap overflow-auto max-h-[400px]">{debugResult}</pre>
          </div>
        )}
        {!globalStats && !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Haz clic en "Cargar" para importar tus datos de Klaviyo</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
            <p className="text-xs text-muted-foreground text-center">Cargando métricas (puede tomar unos segundos por rate limits)...</p>
          </div>
        ) : globalStats ? (
          <div className="space-y-6">
            {/* Global KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label="Perfiles"
                value={typeof globalStats.totalProfiles === 'string' ? globalStats.totalProfiles : formatProfileCount(globalStats.totalProfiles)}
                subtitle={globalStats.newProfiles > 0 ? `+${formatNumber(globalStats.newProfiles)} nuevos (${timeframeLabel})` : undefined}
                icon={Users}
              />
              <KpiCard
                label="Revenue Total"
                value={formatCurrency(globalStats.totalRevenue)}
                subtitle={`Flows: ${formatCurrency(globalStats.totalFlowRevenue)} | Camp: ${formatCurrency(globalStats.totalCampaignRevenue)}`}
                icon={DollarSign}
              />
              <KpiCard
                label="Open Rate"
                value={`${(globalStats.avgOpenRate * 100).toFixed(1)}%`}
                icon={Eye}
              />
              <KpiCard
                label="Click Rate"
                value={`${(globalStats.avgClickRate * 100).toFixed(1)}%`}
                icon={MousePointerClick}
              />
              <KpiCard
                label="Conversiones"
                value={formatNumber(globalStats.totalConversions)}
                icon={ShoppingCart}
              />
              <KpiCard
                label="Flows Activos"
                value={`${globalStats.activeFlows}/${globalStats.totalFlows}`}
                subtitle={`${globalStats.sentCampaigns} campañas enviadas`}
                icon={Zap}
              />
            </div>

            {/* Flows & Campaigns Tabs */}
            <Tabs defaultValue="flows">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="flows" className="text-sm">
                  <Zap className="w-4 h-4 mr-1.5" />
                  Flows ({flows.length})
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="text-sm">
                  <Megaphone className="w-4 h-4 mr-1.5" />
                  Campañas ({campaigns.filter(c => c.send_time).length})
                </TabsTrigger>
                <TabsTrigger value="lists" className="text-sm">
                  <List className="w-4 h-4 mr-1.5" />
                  Listas ({lists.length})
                </TabsTrigger>
                <TabsTrigger value="segments" className="text-sm">
                  <Target className="w-4 h-4 mr-1.5" />
                  Segmentos ({segments.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="flows" className="mt-4">
                {flows.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No hay flows configurados</p>
                ) : (
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {flows
                      .sort((a, b) => (b.metrics?.revenue || 0) - (a.metrics?.revenue || 0))
                      .map(flow => (
                        <FlowRow key={flow.id} flow={flow} />
                      ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="campaigns" className="mt-4">
                {campaigns.filter(c => c.send_time).length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No hay campañas enviadas</p>
                ) : (
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {campaigns
                      .filter(c => c.send_time)
                      .sort((a, b) => new Date(b.send_time!).getTime() - new Date(a.send_time!).getTime())
                      .map(campaign => (
                        <CampaignRow key={campaign.id} campaign={campaign} />
                      ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="lists" className="mt-4">
                <KlaviyoListsContent items={lists} type="list" connectionId={connectionId!} />
              </TabsContent>

              <TabsContent value="segments" className="mt-4">
                <KlaviyoListsContent items={segments} type="segment" connectionId={connectionId!} />
              </TabsContent>
            </Tabs>

            {/* Steve tip about approximate counts */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
              <span className="text-lg shrink-0 mt-0.5">💡</span>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                <span className="font-semibold">Steve tip:</span> Los conteos que ves aquí son aproximados (máximo 100 por lista/segmento y hasta 1,000 perfiles totales).
                Para ver los números exactos de cada lista y segmento, revísalos directo en tu cuenta de Klaviyo → Audience → Lists &amp; Segments. ¡Ahí están todos los detalles! 🎯
              </p>
            </div>
          </div>
        ) : null}

        {/* Templates section — always visible */}
        <div className="mt-6 pt-6 border-t">
          <EmailTemplateBuilder clientId={clientId} />
        </div>
      </CardContent>
    </Card>
  );
}
