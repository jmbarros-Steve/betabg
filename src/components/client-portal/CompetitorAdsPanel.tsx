import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Instagram, Search, Loader2, Trophy, Clock, Eye,
  Megaphone, ShoppingCart, ArrowRight, ExternalLink,
  Plus, X, RefreshCw, TrendingUp, AlertCircle, Link2,
  Sparkles, Lightbulb, BarChart3, Target, Zap,
} from 'lucide-react';
import MetaScopeAlert from './meta-ads/MetaScopeAlert';

interface CompetitorAdsPanelProps {
  clientId: string;
}

interface CompetitorTracking {
  id: string;
  ig_handle: string;
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
}

const CTA_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  SHOP_NOW: { label: 'Comprar', icon: <ShoppingCart className="h-3 w-3" /> },
  LEARN_MORE: { label: 'Más Info', icon: <ArrowRight className="h-3 w-3" /> },
  SIGN_UP: { label: 'Registrarse', icon: <Plus className="h-3 w-3" /> },
  DOWNLOAD: { label: 'Descargar', icon: <ArrowRight className="h-3 w-3" /> },
  OTHER: { label: 'CTA', icon: <Megaphone className="h-3 w-3" /> },
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

export function CompetitorAdsPanel({ clientId }: CompetitorAdsPanelProps) {
  const [handles, setHandles] = useState<string[]>(['', '', '', '', '']);
  const [tracking, setTracking] = useState<CompetitorTracking[]>([]);
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'winners' | 'active'>('all');
  const [hasMetaConnection, setHasMetaConnection] = useState<boolean | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SteveAnalysis | null>(null);

  useEffect(() => {
    fetchData();
  }, [clientId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Check if Meta is connected
      const { data: metaConn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      setHasMetaConnection(!!metaConn);

      // Fetch tracking records
      const { data: trackingData } = await supabase
        .from('competitor_tracking')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at');

      if (trackingData && trackingData.length > 0) {
        setTracking(trackingData as CompetitorTracking[]);
        const existing = trackingData.map(t => t.ig_handle);
        const filled = [...existing, ...Array(5 - existing.length).fill('')].slice(0, 5);
        setHandles(filled);

        const trackingIds = trackingData.map(t => t.id);
        const { data: adsData } = await supabase
          .from('competitor_ads')
          .select('*')
          .in('tracking_id', trackingIds)
          .order('days_running', { ascending: false, nullsFirst: false });

        if (adsData) setAds(adsData as CompetitorAd[]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    const validHandles = handles.filter(h => h.trim().length > 0);
    if (validHandles.length === 0) {
      toast.error('Ingresa al menos un handle de Instagram');
      return;
    }

    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error('Sesión expirada');
        return;
      }

      const response = await supabase.functions.invoke('sync-competitor-ads', {
        body: { client_id: clientId, ig_handles: validHandles },
      });

      if (response.error) {
        const errData = response.data;
        if (errData?.error === 'meta_not_connected') {
          toast.error('Conecta Meta Ads primero en la pestaña Conexiones');
          setHasMetaConnection(false);
          return;
        }
        throw new Error(response.error.message);
      }

      const results = response.data?.results || [];
      const totalAds = results.reduce((sum: number, r: any) => sum + r.ads_found, 0);
      const errors = results.filter((r: any) => r.status.startsWith('error') || r.status.startsWith('api_error'));

      if (errors.length > 0 && errors.length === results.length) {
        toast.error('No se pudieron sincronizar los competidores. Verifica los handles.');
      } else if (errors.length > 0) {
        toast.warning(`${totalAds} anuncios encontrados. ${errors.length} handles con errores.`);
      } else {
        toast.success(`${totalAds} anuncios sincronizados de ${results.length} competidores`);
      }

      await fetchData();
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error(err.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  // AI Analysis of competitor patterns
  async function handleAnalyze() {
    if (ads.length === 0) return;
    setAnalyzing(true);
    try {
      // Build analysis locally from ad data
      const winners = ads.filter(a => (a.days_running || 0) >= 30);
      const activeAds = ads.filter(a => a.is_active);

      // Count CTAs
      const ctaCounts: Record<string, number> = {};
      for (const ad of ads) {
        const cta = ad.cta_type || 'OTHER';
        ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
      }
      const topCtas = Object.entries(ctaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => `${CTA_LABELS[key]?.label || key} (${count} ads)`);

      // Count ad types
      const typeCounts: Record<string, number> = {};
      for (const ad of ads) {
        const t = ad.ad_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      const topFormats = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `${key} (${count})`);

      // Analyze text patterns from winners
      const winnerTexts = winners.filter(w => w.ad_text).map(w => w.ad_text!);
      const hasQuestions = winnerTexts.filter(t => t.includes('?')).length;
      const hasEmojis = winnerTexts.filter(t => /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(t)).length;
      const hasNumbers = winnerTexts.filter(t => /\d+%|\d+x|\$\d+/i.test(t)).length;

      const patrones: string[] = [];
      if (hasQuestions > winnerTexts.length * 0.3) patrones.push('Usan preguntas en el copy para generar curiosidad');
      if (hasEmojis > winnerTexts.length * 0.4) patrones.push('Uso frecuente de emojis para llamar la atencion');
      if (hasNumbers > winnerTexts.length * 0.2) patrones.push('Incluyen numeros y estadisticas en sus ads ganadores');
      if (winners.length > 3) patrones.push(`${winners.length} ads llevan mas de 30 dias - estan escalando agresivamente`);
      if (patrones.length === 0) patrones.push('Patron mixto - necesitan mas data para identificar tendencias claras');

      // Analyze copy angles from winner ads
      const angulos: string[] = [];
      for (const w of winnerTexts) {
        const lower = w.toLowerCase();
        if (lower.includes('descuento') || lower.includes('%') || lower.includes('off')) angulos.push('Descuentos/Ofertas');
        else if (lower.includes('antes') || lower.includes('resultado')) angulos.push('Antes y Despues');
        else if (lower.includes('mejor') || lower.includes('unico') || lower.includes('solo')) angulos.push('Bold Statement');
        else if (lower.includes('?') || lower.includes('cansad') || lower.includes('busc')) angulos.push('Call Out');
        else if (lower.includes('testimonio') || lower.includes('opinion') || lower.includes('review')) angulos.push('Reviews');
        else angulos.push('Beneficios');
      }
      const uniqueAngulos = [...new Set(angulos)].slice(0, 4);

      // Estimate spend per competitor
      const avgDays = ads.reduce((s, a) => s + (a.days_running || 0), 0) / Math.max(ads.length, 1);
      const estMinDaily = activeAds.length * 15; // conservative: $15/day per ad
      const estMaxDaily = activeAds.length * 50; // aggressive: $50/day per ad
      const estimacion = `Estimacion: $${estMinDaily}-$${estMaxDaily} USD/dia (${activeAds.length} ads activos, promedio ${Math.round(avgDays)} dias)`;

      // Winner insights
      const ganadorInsights: string[] = [];
      for (const w of winners.slice(0, 3)) {
        const handle = tracking.find(t => t.id === w.tracking_id)?.ig_handle || '?';
        ganadorInsights.push(
          `@${handle}: "${(w.ad_headline || w.ad_text || '').slice(0, 60)}..." — ${w.days_running}d activo. ${w.cta_type ? `CTA: ${CTA_LABELS[w.cta_type]?.label || w.cta_type}` : ''}`
        );
      }

      // Recommendations
      const recomendaciones: string[] = [];
      if (winners.length > 0) {
        recomendaciones.push(`Hay ${winners.length} ads ganadores (30d+). Analiza sus copies y crea versiones mejoradas.`);
      }
      if (topCtas[0]) {
        recomendaciones.push(`CTA mas popular: ${topCtas[0]}. Considera usar el mismo para competir.`);
      }
      if (uniqueAngulos[0]) {
        recomendaciones.push(`Angulo dominante: ${uniqueAngulos[0]}. Prueba un angulo diferente para diferenciarte.`);
      }
      if (activeAds.length > 10) {
        recomendaciones.push(`Competidores tienen ${activeAds.length} ads activos. Necesitas al menos ${Math.ceil(activeAds.length * 0.5)} para competir.`);
      }
      recomendaciones.push('Usa la metodologia 3:2:2 para testear variaciones inspiradas en los ganadores.');

      setAnalysis({
        patrones,
        angulos_frecuentes: uniqueAngulos,
        formatos_usados: topFormats,
        ctas_populares: topCtas,
        estimacion_gasto: estimacion,
        recomendaciones,
        ganadores_insight: ganadorInsights,
      });
    } catch (err) {
      console.error('Analysis error:', err);
      toast.error('Error al analizar competidores');
    } finally {
      setAnalyzing(false);
    }
  }

  const filteredAds = ads.filter(ad => {
    if (filter === 'winners') return (ad.days_running || 0) >= 30;
    if (filter === 'active') return ad.is_active;
    return true;
  });

  const getTrackingHandle = (trackingId: string) => {
    return tracking.find(t => t.id === trackingId)?.ig_handle || '?';
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Scope alert for pages permission */}
      <MetaScopeAlert clientId={clientId} requiredFeature="pages" compact />

      {/* Meta Connection Warning */}
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
              Ve a la pestaña <strong>"Conexiones"</strong> → conecta <strong>Meta Ads</strong> con tu cuenta de Facebook/Instagram.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Instagram className="h-5 w-5 text-primary" />
            Competidores a Rastrear
          </CardTitle>
          <CardDescription>
            Ingresa hasta 5 handles de Instagram de tus competidores. Steve buscará sus anuncios activos en Meta Ad Library.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {handles.map((handle, i) => (
              <div key={i} className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  value={handle}
                  onChange={(e) => {
                    const updated = [...handles];
                    updated[i] = e.target.value.replace(/^@/, '');
                    setHandles(updated);
                  }}
                  placeholder={`competidor_${i + 1}`}
                  className="pl-7"
                  disabled={syncing}
                />
                {handle && (
                  <button
                    onClick={() => {
                      const updated = [...handles];
                      updated[i] = '';
                      setHandles(updated);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {handles.filter(h => h.trim()).length}/5 competidores configurados
              {tracking.length > 0 && tracking[0].last_sync_at && (
                <span> • Última sync: {new Date(tracking[0].last_sync_at).toLocaleDateString('es-CL')}</span>
              )}
            </p>
            <Button onClick={handleSync} disabled={syncing || handles.every(h => !h.trim())}>
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
              <p className="text-xs text-muted-foreground">🏆 Ganadores (30d+)</p>
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
                  {/* Patterns */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Patrones Detectados
                    </h4>
                    <ul className="space-y-1">
                      {analysis.patrones.map((p, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Angles & Formats */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
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

                {/* Spend Estimation */}
                <div className="p-3 rounded-lg bg-background border border-border/50">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                    <BarChart3 className="h-3.5 w-3.5" /> Estimacion de Gasto
                  </h4>
                  <p className="text-sm font-medium">{analysis.estimacion_gasto}</p>
                </div>

                {/* Winner Insights */}
                {analysis.ganadores_insight.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
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

                {/* Recommendations */}
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-2">
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

                <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={analyzing} className="w-full text-xs">
                  {analyzing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Re-analizar
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            {([
              { key: 'all', label: 'Todos', icon: Megaphone },
              { key: 'winners', label: '🏆 Ganadores (30d+)', icon: Trophy },
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
                Re-sync
              </Button>
            </div>
          </div>

          {/* Ads grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAds.map(ad => (
              <Card key={ad.id} className="overflow-hidden">
                {/* Snapshot link */}
                {ad.image_url && (
                  <a href={ad.image_url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="h-48 bg-muted flex items-center justify-center text-muted-foreground relative group">
                      <Eye className="h-8 w-8" />
                      <span className="text-xs mt-1 absolute bottom-2">Ver en Ad Library</span>
                      <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </a>
                )}
                <CardContent className="p-4 space-y-2">
                  {/* Header: handle + days */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      <Instagram className="h-3 w-3 mr-1" />
                      @{getTrackingHandle(ad.tracking_id)}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {(ad.days_running || 0) >= 30 && (
                        <Badge variant="default" className="text-xs">🏆 Ganador</Badge>
                      )}
                      {ad.is_active && (
                        <Badge variant="secondary" className="text-xs">Activo</Badge>
                      )}
                    </div>
                  </div>

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
                    {ad.cta_type && CTA_LABELS[ad.cta_type] && (
                      <span className="flex items-center gap-1">
                        {CTA_LABELS[ad.cta_type].icon}
                        {CTA_LABELS[ad.cta_type].label}
                      </span>
                    )}
                  </div>

                  {/* View in Ad Library */}
                  {ad.image_url && (
                    <a
                      href={ad.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 pt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver en Meta Ad Library
                    </a>
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

      {/* Empty state */}
      {ads.length === 0 && tracking.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Instagram className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Rastreo de Competidores</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Ingresa los handles de Instagram de tus competidores arriba y Steve buscará sus anuncios
              activos en Meta Ad Library. Los anuncios que llevan más de 30 días son los <strong>ganadores</strong>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
