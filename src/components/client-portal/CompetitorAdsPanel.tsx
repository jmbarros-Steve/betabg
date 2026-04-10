import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Instagram, Search, Loader2, Trophy, Clock, Eye,
  Megaphone, ShoppingCart, ArrowRight, ExternalLink,
  Plus, X, RefreshCw, TrendingUp, AlertCircle, Link2,
  Sparkles, Lightbulb, BarChart3, Target, Zap, Copy,
  DollarSign, Users, Image,
} from 'lucide-react';
import MetaScopeAlert from './meta-ads/MetaScopeAlert';

interface CompetitorAdsPanelProps {
  clientId: string;
}

interface CompetitorTracking {
  id: string;
  ig_handle: string;
  fb_page_url: string | null;
  display_name: string | null;
  meta_page_id: string | null;
  last_sync_at: string | null;
  is_active: boolean;
}

interface CompetitorAd {
  id: string;
  tracking_id: string;
  ad_library_id: string;
  ad_text: string | null;
  ad_headline: string | null;
  ad_description: string | null;
  image_url: string | null;
  ad_type: string | null;
  cta_type: string | null;
  started_at: string | null;
  is_active: boolean;
  days_running: number | null;
  impressions_lower: number | null;
  impressions_upper: number | null;
  spend_lower: number | null;
  spend_upper: number | null;
  reach_lower: number | null;
  reach_upper: number | null;
  platforms: string[] | null;
  image_urls: string[] | null;
  landing_url: string | null;
  screenshot_url: string | null;
}

const CTA_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  SHOP_NOW: { label: 'Comprar', icon: <ShoppingCart className="h-3 w-3" /> },
  LEARN_MORE: { label: 'Mas Info', icon: <ArrowRight className="h-3 w-3" /> },
  SIGN_UP: { label: 'Registrarse', icon: <Plus className="h-3 w-3" /> },
  DOWNLOAD: { label: 'Descargar', icon: <ArrowRight className="h-3 w-3" /> },
  OTHER: { label: 'CTA', icon: <Megaphone className="h-3 w-3" /> },
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'FB',
  instagram: 'IG',
  messenger: 'MSG',
  whatsapp: 'WA',
  audience_network: 'AN',
};

interface SteveAnalysis {
  patrones: string[];
  angulos_frecuentes: string[];
  formatos_usados: string[];
  ctas_populares: string[];
  estimacion_gasto: string;
  recomendaciones: string[];
  ganadores_insight: string[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

interface CompetitorInput {
  query: string;
}

export function CompetitorAdsPanel({ clientId }: CompetitorAdsPanelProps) {
  const [competitors, setCompetitors] = useState<CompetitorInput[]>(
    Array(5).fill(null).map(() => ({ query: '' }))
  );
  const [tracking, setTracking] = useState<CompetitorTracking[]>([]);
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'winners' | 'active'>('all');
  const [hasMetaConnection, setHasMetaConnection] = useState<boolean | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SteveAnalysis | null>(null);
  const [adLibraryPermissionError, setAdLibraryPermissionError] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clientId]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: metaConn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      setHasMetaConnection(!!metaConn);

      const { data: trackingData } = await supabase
        .from('competitor_tracking')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at');

      if (trackingData && trackingData.length > 0) {
        setTracking(trackingData as CompetitorTracking[]);
        // Populate inputs from existing tracking records
        const existing = trackingData.map(t => ({
          query: (t as any).fb_page_url || t.ig_handle || '',
        }));
        const padCount = Math.max(0, 5 - existing.length);
        const filled = [...existing, ...Array(padCount).fill(null).map(() => ({ query: '' }))].slice(0, 5);
        setCompetitors(filled);

        const trackingIds = trackingData.map(t => t.id).filter(Boolean);
        if (trackingIds.length > 0) {
          const { data: adsData } = await supabase
            .from('competitor_ads')
            .select('*')
            .in('tracking_id', trackingIds)
            .order('started_at', { ascending: false, nullsFirst: false })
            .limit(30);

          if (Array.isArray(adsData)) {
            setAds(adsData as CompetitorAd[]);
          } else {
            setAds([]);
          }
        }
      } else {
        setTracking([]);
        setAds([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    if (syncing) return; // prevent double-click
    // Need at least one competitor
    const validCompetitors = competitors.filter(c => c.query.trim());
    if (validCompetitors.length === 0) {
      toast.error('Ingresa al menos un competidor');
      return;
    }

    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error('Sesion expirada');
        return;
      }

      const queries = validCompetitors.map(c => c.query.trim());

      const response = await callApi('sync-competitor-ads', {
        body: { client_id: clientId, queries },
        timeoutMs: 360_000, // 6min max for Apify resolution
      });

      if (response.error) {
        if (response.error === 'meta_not_connected') {
          toast.error('Conecta Meta Ads o configura Apify para rastrear competidores');
          setHasMetaConnection(false);
          return;
        }
        throw new Error(response.error);
      }

      const rawResults = response.data?.results;
      const results = Array.isArray(rawResults) ? rawResults : [];
      const totalAds = results.reduce((sum: number, r: any) => sum + (Number(r.ads_found) || 0), 0);
      const permissionErrors = results.filter((r: any) => r.status?.startsWith?.('permission_denied'));
      const tokenErrors = results.filter((r: any) => r.status?.startsWith?.('token_expired'));
      const otherErrors = results.filter((r: any) =>
        r.status?.startsWith?.('error') || r.status?.startsWith?.('api_error') || r.status?.startsWith?.('upsert_error')
      );
      const allErrors = [...permissionErrors, ...tokenErrors, ...otherErrors];
      const apifySynced = results.filter((r: any) => r.status === 'synced_apify');

      if (permissionErrors.length > 0) {
        setAdLibraryPermissionError(true);
        toast.error('Sin acceso a Meta Ad Library, contacta al administrador');
      } else if (tokenErrors.length > 0) {
        toast.error('Token de Meta expirado, reconecta en Conexiones');
      } else if (allErrors.length > 0 && allErrors.length === results.length) {
        toast.error('Error al sincronizar competidores');
      } else if (allErrors.length > 0) {
        toast.warning(`${totalAds} anuncios encontrados, ${allErrors.length} handles con errores`);
      } else {
        setAdLibraryPermissionError(false);
        const source = apifySynced.length > 0 ? ' (via Apify)' : '';
        toast.success(`${totalAds} anuncios sincronizados de ${results.length} competidores${source}`);
      }

      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  // AI Analysis via Claude Haiku
  async function handleAnalyze() {
    if (ads.length === 0) return;
    setAnalyzing(true);
    try {
      const response = await callApi('analyze-competitor-ads', {
        body: {
          ads: ads.map(a => ({
            ad_text: a.ad_text,
            ad_headline: a.ad_headline,
            ad_type: a.ad_type,
            cta_type: a.cta_type,
            days_running: a.days_running,
            is_active: a.is_active,
            impressions_lower: a.impressions_lower,
            impressions_upper: a.impressions_upper,
            spend_lower: a.spend_lower,
            spend_upper: a.spend_upper,
            reach_lower: a.reach_lower,
            reach_upper: a.reach_upper,
            platforms: a.platforms,
            landing_url: a.landing_url,
          })),
          competitor_count: tracking.length,
        },
        timeoutMs: 30_000,
      });

      if (response.error) throw new Error(response.error);

      const ai = response.data?.analysis;
      if (!ai) throw new Error('No analysis returned');

      setAnalysis({
        patrones: ai.patrones || [],
        angulos_frecuentes: ai.angulos_frecuentes || [],
        formatos_usados: ai.formatos_usados || [],
        ctas_populares: ai.ctas_populares || [],
        estimacion_gasto: ai.estimacion_gasto || '',
        recomendaciones: ai.recomendaciones || [],
        ganadores_insight: ai.ganadores_insight || [],
      });
    } catch {
      toast.error('Error al analizar competidores');
    } finally {
      setAnalyzing(false);
    }
  }

  function openAdLibrary(query: string, pageId?: string | null) {
    let url: string;
    if (pageId) {
      url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&view_all_page_id=${pageId}`;
    } else {
      url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&q=${encodeURIComponent(query)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleUseWinningPatterns() {
    if (!analysis) return;
    const context = [
      '--- INTELIGENCIA COMPETITIVA ---',
      '',
      'PATRONES DETECTADOS:',
      ...analysis.patrones.map(p => `- ${p}`),
      '',
      'ANGULOS FRECUENTES:',
      ...analysis.angulos_frecuentes.map(a => `- ${a}`),
      '',
      'CTAs POPULARES:',
      ...analysis.ctas_populares.map(c => `- ${c}`),
      '',
      'FORMATOS:',
      ...analysis.formatos_usados.map(f => `- ${f}`),
      '',
      'ESTIMACION DE GASTO:',
      analysis.estimacion_gasto,
      '',
      'TOP ADS GANADORES:',
      ...analysis.ganadores_insight.map(g => `- ${g}`),
      '',
      'RECOMENDACIONES:',
      ...analysis.recomendaciones.map(r => `- ${r}`),
    ].join('\n');

    sessionStorage.setItem('competitor_context', context);
    toast.success('Patrones copiados. Ve a Generar Copies para usarlos como contexto.');
    navigator.clipboard?.writeText(context).catch(() => {});
  }

  // Ads already limited to 30 newest from DB query
  const filteredAds = ads.filter(ad => {
    if (filter === 'winners') return (ad.days_running || 0) >= 30;
    if (filter === 'active') return ad.is_active;
    return true;
  });

  const getTrackingHandle = (trackingId: string) => {
    return tracking.find(t => t.id === trackingId)?.ig_handle || '?';
  };

  const hasAnyCompetitor = competitors.some(c => c.query.trim());

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <MetaScopeAlert clientId={clientId} requiredFeature="pages" compact />

      {hasMetaConnection === false && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <Link2 className="h-4 w-4" />
          <AlertTitle>Conecta Meta Ads primero</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>
              Para rastrear los anuncios de tus competidores necesitas conectar tu cuenta de Meta Ads.
              Esto le permite a Steve acceder a la <strong>Meta Ad Library</strong> y buscar los anuncios activos.
            </p>
            <p className="text-xs text-muted-foreground">
              Ve a la pestana <strong>"Conexiones"</strong> &rarr; conecta <strong>Meta Ads</strong> con tu cuenta de Facebook/Instagram.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {adLibraryPermissionError && (
        <Alert variant="destructive" className="border-orange-500/50 bg-orange-500/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acceso a Meta Ad Library requerido</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>
              La aplicacion de Meta no tiene permisos para acceder a la <strong>Ad Library API</strong>.
              Este es un requisito de Meta que debe configurarse a nivel de aplicacion.
            </p>
            <p className="text-xs text-muted-foreground">
              El administrador debe registrar la app en{' '}
              <a
                href="https://www.facebook.com/ads/library/api/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                facebook.com/ads/library/api
              </a>{' '}
              y solicitar acceso a la Ad Library API.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Competidores a Rastrear
          </CardTitle>
          <CardDescription>
            Escribe el nombre de tu competidor, su @Instagram, o su pagina de Facebook. Steve resuelve el resto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3">
            {competitors.map((comp, i) => (
              <div key={i} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={comp.query}
                  onChange={(e) => {
                    const updated = [...competitors];
                    updated[i] = { query: e.target.value };
                    setCompetitors(updated);
                  }}
                  placeholder={i === 0 ? 'Nike, @nike, o facebook.com/nike' : 'Otro competidor...'}
                  className="pl-9 pr-8"
                  disabled={syncing}
                />
                {comp.query && (
                  <button
                    onClick={() => {
                      const updated = [...competitors];
                      updated[i] = { query: '' };
                      setCompetitors(updated);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpiar competidor"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {competitors.filter(c => c.query.trim()).length}/5 competidores configurados
              {tracking.length > 0 && tracking[0].last_sync_at && (
                <span> &bull; Ultima sync: {new Date(tracking[0].last_sync_at).toLocaleDateString('es-CL')}</span>
              )}
            </p>
            <Button onClick={handleSync} disabled={syncing || !hasAnyCompetitor}>
              {syncing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Buscar Anuncios</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {ads.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{ads.length}</p>
              <p className="text-xs text-muted-foreground">Anuncios Totales</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{ads.filter(a => a.is_active).length}</p>
              <p className="text-xs text-muted-foreground">Activos Ahora</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{ads.filter(a => (a.days_running || 0) >= 30).length}</p>
              <p className="text-xs text-muted-foreground">Ganadores (30d+)</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{tracking.length}</p>
              <p className="text-xs text-muted-foreground">Competidores</p>
            </Card>
          </div>

          {/* Steve AI Analysis */}
          {!analysis && (
            <div className="flex justify-center">
              <Button onClick={handleAnalyze} disabled={analyzing} variant="outline" className="gap-2">
                {analyzing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Steve: Analizar Patrones de Competidores</>
                )}
              </Button>
            </div>
          )}

          {analysis && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Analisis de Steve — Inteligencia Competitiva
                </CardTitle>
                <CardDescription className="text-xs">
                  Patrones detectados en {ads.length} anuncios de {tracking.length} competidores
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Patrones Detectados
                    </h4>
                    <ul className="space-y-1">
                      {analysis.patrones.map((p, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <span className="text-primary mt-0.5 shrink-0">&bull;</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" /> Angulos y Formatos
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.angulos_frecuentes.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                      ))}
                      {analysis.formatos_usados.map((f, i) => (
                        <Badge key={`f-${i}`} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                    <div className="mt-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                        <Zap className="h-3.5 w-3.5" /> CTAs Populares
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.ctas_populares.map((c, i) => (
                          <Badge key={i} className="text-xs bg-primary/10 text-primary border-primary/20">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background border border-border/50">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <DollarSign className="h-3.5 w-3.5" /> Estimacion de Gasto
                  </h4>
                  <p className="text-sm font-medium">{analysis.estimacion_gasto}</p>
                </div>

                {analysis.ganadores_insight.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                      <Trophy className="h-3.5 w-3.5" /> Top Ads Ganadores
                    </h4>
                    <div className="space-y-2">
                      {analysis.ganadores_insight.map((g, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-background border border-border/50 text-xs">
                          {g}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="text-sm font-medium text-primary flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-3.5 w-3.5" /> Recomendaciones de Steve
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.recomendaciones.map((r, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="text-primary mt-0.5 shrink-0 font-bold">{i + 1}.</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={analyzing} className="flex-1 text-xs">
                    {analyzing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Re-analizar
                  </Button>
                  <Button size="sm" onClick={handleUseWinningPatterns} className="flex-1 text-xs gap-1">
                    <Copy className="h-3 w-3" />
                    Usar Patrones Ganadores
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            {([
              { key: 'all', label: 'Todos', icon: Megaphone },
              { key: 'winners', label: 'Ganadores (30d+)', icon: Trophy },
              { key: 'active', label: 'Activos', icon: TrendingUp },
            ] as const).map(f => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f.key)}
                className="text-xs"
              >
                {f.label}
              </Button>
            ))}
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
            </div>
          </div>

          {/* Ads grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAds.map(ad => (
              <Card key={ad.id} className="overflow-hidden">
                {/* Ad preview — show real image if available */}
                {ad.image_urls && ad.image_urls.length > 0 ? (
                  <div className="h-40 bg-muted/30 relative">
                    <img
                      src={ad.image_urls[0]}
                      alt="Ad creative"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        // Fallback to placeholder on image load error
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.classList.add('flex', 'flex-col', 'items-center', 'justify-center');
                          const span = document.createElement('span');
                          span.className = 'text-xs text-muted-foreground';
                          span.textContent = 'Imagen no disponible';
                          parent.appendChild(span);
                        }
                      }}
                    />
                    {ad.image_urls.length > 1 && (
                      <Badge className="absolute top-2 right-2 text-[10px] bg-black/60 text-white border-0">
                        <Image className="h-2.5 w-2.5 mr-0.5" />
                        +{ad.image_urls.length - 1}
                      </Badge>
                    )}
                  </div>
                ) : ad.ad_library_id ? (
                  <a
                    href={`https://www.facebook.com/ads/library/?id=${ad.ad_library_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-32 bg-gradient-to-br from-[#2A4F9E]/10 to-purple-500/10 hover:from-[#F0F4FA]0/20 hover:to-purple-500/20 transition-colors flex flex-col items-center justify-center text-muted-foreground hover:text-foreground group"
                  >
                    <ExternalLink className="h-6 w-6 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium">Ver en Ad Library</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">ID: {ad.ad_library_id}</span>
                  </a>
                ) : (
                  <div className="h-32 bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                    <Megaphone className="h-6 w-6 mb-1" />
                    <span className="text-xs">Sin preview</span>
                  </div>
                )}
                <CardContent className="p-4 space-y-2">
                  {/* Header: handle + badges */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      <Instagram className="h-3 w-3 mr-1" />
                      @{getTrackingHandle(ad.tracking_id)}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {(ad.days_running || 0) >= 30 && (
                        <Badge variant="default" className="text-xs">Ganador</Badge>
                      )}
                      {ad.is_active && (
                        <Badge variant="secondary" className="text-xs">Activo</Badge>
                      )}
                    </div>
                  </div>

                  {/* Metrics badges — from Apify data */}
                  {(ad.impressions_lower || ad.spend_lower || (ad.platforms && ad.platforms.length > 0)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {ad.impressions_lower != null && ad.impressions_upper != null && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                          <Eye className="h-2.5 w-2.5" />
                          {formatNumber(ad.impressions_lower)}-{formatNumber(ad.impressions_upper)}
                        </Badge>
                      )}
                      {ad.spend_lower != null && ad.spend_upper != null && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal text-green-600 border-green-200">
                          <DollarSign className="h-2.5 w-2.5" />
                          ${Number(ad.spend_lower).toLocaleString()}-${Number(ad.spend_upper).toLocaleString()}
                        </Badge>
                      )}
                      {ad.reach_lower != null && ad.reach_upper != null && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal text-[#1E3A7B] border-[#B5C8E0]">
                          <Users className="h-2.5 w-2.5" />
                          {formatNumber(ad.reach_lower)}-{formatNumber(ad.reach_upper)}
                        </Badge>
                      )}
                      {ad.platforms && ad.platforms.length > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                          {ad.platforms.map(p => PLATFORM_ICONS[p] || p).join(', ')}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Ad text */}
                  {ad.ad_text && (
                    <p className="text-sm line-clamp-3">{ad.ad_text}</p>
                  )}

                  {/* Headline */}
                  {ad.ad_headline && (
                    <p className="text-xs font-semibold text-primary">{ad.ad_headline}</p>
                  )}

                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    {ad.days_running !== null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {ad.days_running}d activo
                      </span>
                    )}
                    {ad.ad_type && (
                      <Badge variant="outline" className="text-xs">{ad.ad_type}</Badge>
                    )}
                    {ad.cta_type && (
                      <span className="flex items-center gap-1">
                        {CTA_LABELS[ad.cta_type]?.icon || <Megaphone className="h-3 w-3" />}
                        {CTA_LABELS[ad.cta_type]?.label || ad.cta_type}
                      </span>
                    )}
                  </div>

                  {/* Links */}
                  <div className="flex items-center gap-3 pt-1">
                    {ad.ad_library_id && (
                      <a
                        href={`https://www.facebook.com/ads/library/?id=${ad.ad_library_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver en Ad Library
                      </a>
                    )}
                    <button
                      onClick={() => {
                        const t = tracking.find(tr => tr.id === ad.tracking_id);
                        if (t) openAdLibrary(t.ig_handle, t.meta_page_id);
                      }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Search className="h-3 w-3" />
                      Ver todos sus anuncios
                    </button>
                  </div>

                  {/* Landing page */}
                  {ad.landing_url && (
                    <div className="border-t pt-2 space-y-1.5">
                      <a
                        href={ad.landing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                      >
                        <Link2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{(() => { try { const u = new URL(ad.landing_url!); return u.hostname + u.pathname; } catch { return ad.landing_url; } })()}</span>
                      </a>
                      {ad.screenshot_url && (
                        <a href={ad.landing_url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={ad.screenshot_url}
                            alt="Landing page"
                            className="w-full h-24 object-cover object-top rounded border hover:opacity-80 transition-opacity"
                            loading="lazy"
                          />
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredAds.length === 0 && (
            <Card className="text-center py-8">
              <CardContent>
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No hay anuncios con este filtro</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty state - no tracking yet */}
      {ads.length === 0 && tracking.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Rastreo de Competidores</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Escribe el nombre de tus competidores arriba y Steve buscara sus anuncios
              activos con metricas reales (impresiones, gasto, reach). Los anuncios de mas de 30 dias son los <strong>ganadores</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Synced but no ads found */}
      {ads.length === 0 && tracking.length > 0 && (
        <Card className="text-center py-8">
          <CardContent className="space-y-4">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
            <h3 className="text-base font-semibold">No se encontraron anuncios</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No se encontraron anuncios para estos competidores. Puedes buscar directamente en Meta Ad Library:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {tracking.map(t => (
                <Button
                  key={t.id}
                  variant="outline"
                  size="sm"
                  onClick={() => openAdLibrary(t.ig_handle, t.meta_page_id)}
                  className="text-xs gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  @{t.ig_handle}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Puedes escribir solo el nombre de la marca y Steve lo resuelve automaticamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
