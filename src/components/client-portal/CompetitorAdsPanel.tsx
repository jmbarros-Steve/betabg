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
  Facebook, DollarSign, Users, Image,
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
  fbUrl: string;
  igHandle: string;
}

export function CompetitorAdsPanel({ clientId }: CompetitorAdsPanelProps) {
  const [competitors, setCompetitors] = useState<CompetitorInput[]>(
    Array(5).fill(null).map(() => ({ fbUrl: '', igHandle: '' }))
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
          fbUrl: (t as any).fb_page_url || '',
          igHandle: t.ig_handle || '',
        }));
        const padCount = Math.max(0, 5 - existing.length);
        const filled = [...existing, ...Array(padCount).fill(null).map(() => ({ fbUrl: '', igHandle: '' }))].slice(0, 5);
        setCompetitors(filled);

        const trackingIds = trackingData.map(t => t.id).filter(Boolean);
        if (trackingIds.length > 0) {
          const { data: adsData } = await supabase
            .from('competitor_ads')
            .select('*')
            .in('tracking_id', trackingIds)
            .order('days_running', { ascending: false, nullsFirst: false });

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
    // Need at least one competitor with FB URL or IG handle
    const validCompetitors = competitors.filter(c => c.fbUrl.trim() || c.igHandle.trim());
    if (validCompetitors.length === 0) {
      toast.error('Ingresa al menos una URL de Facebook o handle de Instagram');
      return;
    }

    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error('Sesion expirada');
        return;
      }

      // Build parallel arrays: ig_handles (required key) and fb_urls
      const igHandles = competitors
        .filter(c => c.fbUrl.trim() || c.igHandle.trim())
        .map(c => {
          // If only FB URL, use slug as handle
          if (!c.igHandle.trim() && c.fbUrl.trim()) {
            const slug = c.fbUrl.trim().replace(/^https?:\/\/(www\.)?facebook\.com\/?/, '').replace(/\/+$/, '').split('/')[0];
            return slug || 'unknown';
          }
          return c.igHandle.trim().replace(/^@/, '').toLowerCase();
        });

      const fbUrls = competitors
        .filter(c => c.fbUrl.trim() || c.igHandle.trim())
        .map(c => c.fbUrl.trim() || null);

      const response = await callApi('sync-competitor-ads', {
        body: { client_id: clientId, ig_handles: igHandles, fb_urls: fbUrls },
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

  // AI Analysis
  async function handleAnalyze() {
    if (ads.length === 0) return;
    setAnalyzing(true);
    try {
      const winners = ads.filter(a => (a.days_running || 0) >= 30);
      const activeAds = ads.filter(a => a.is_active);

      const ctaCounts: Record<string, number> = {};
      for (const ad of ads) {
        const cta = ad.cta_type || 'OTHER';
        ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
      }
      const topCtas = Object.entries(ctaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => `${CTA_LABELS[key]?.label || key} (${count} ads)`);

      const typeCounts: Record<string, number> = {};
      for (const ad of ads) {
        const t = ad.ad_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      const topFormats = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `${key} (${count})`);

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

      // Use real spend data if available
      const adsWithSpend = ads.filter(a => a.spend_lower && a.spend_upper);
      let estimacion: string;
      if (adsWithSpend.length > 0) {
        const totalSpendLower = adsWithSpend.reduce((s, a) => s + (a.spend_lower || 0), 0);
        const totalSpendUpper = adsWithSpend.reduce((s, a) => s + (a.spend_upper || 0), 0);
        estimacion = `Gasto real reportado: $${formatNumber(totalSpendLower)}-$${formatNumber(totalSpendUpper)} USD total (${adsWithSpend.length} ads con datos)`;
      } else {
        const avgDays = ads.reduce((s, a) => s + (a.days_running || 0), 0) / Math.max(ads.length, 1);
        const estMinDaily = activeAds.length * 15;
        const estMaxDaily = activeAds.length * 50;
        estimacion = `Estimacion: $${estMinDaily}-$${estMaxDaily} USD/dia (${activeAds.length} ads activos, promedio ${Math.round(avgDays)} dias)`;
      }

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

      const ganadorInsights: string[] = [];
      for (const w of winners.slice(0, 3)) {
        const handle = tracking.find(t => t.id === w.tracking_id)?.ig_handle || '?';
        const spendInfo = w.spend_lower && w.spend_upper ? ` | Gasto: $${w.spend_lower}-$${w.spend_upper}` : '';
        const impInfo = w.impressions_lower && w.impressions_upper ? ` | ${formatNumber(w.impressions_lower)}-${formatNumber(w.impressions_upper)} imp.` : '';
        ganadorInsights.push(
          `@${handle}: "${(w.ad_headline || w.ad_text || '').slice(0, 60)}..." — ${w.days_running}d activo${spendInfo}${impInfo}. ${w.cta_type ? `CTA: ${CTA_LABELS[w.cta_type]?.label || w.cta_type}` : ''}`
        );
      }

      const recomendaciones: string[] = [];
      if (winners.length > 0) recomendaciones.push(`Hay ${winners.length} ads ganadores (30d+). Analiza sus copies y crea versiones mejoradas.`);
      if (topCtas[0]) recomendaciones.push(`CTA mas popular: ${topCtas[0]}. Considera usar el mismo para competir.`);
      if (uniqueAngulos[0]) recomendaciones.push(`Angulo dominante: ${uniqueAngulos[0]}. Prueba un angulo diferente para diferenciarte.`);
      if (activeAds.length > 10) recomendaciones.push(`Competidores tienen ${activeAds.length} ads activos. Necesitas al menos ${Math.ceil(activeAds.length * 0.5)} para competir.`);
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

  const filteredAds = ads.filter(ad => {
    if (filter === 'winners') return (ad.days_running || 0) >= 30;
    if (filter === 'active') return ad.is_active;
    return true;
  });

  const getTrackingHandle = (trackingId: string) => {
    return tracking.find(t => t.id === trackingId)?.ig_handle || '?';
  };

  const hasAnyCompetitor = competitors.some(c => c.fbUrl.trim() || c.igHandle.trim());

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
            Ingresa la URL de Facebook de tus competidores (recomendado) o su handle de Instagram. Steve buscara sus anuncios activos con metricas reales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-4">
            {competitors.map((comp, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2 items-start">
                {/* FB URL - Primary */}
                <div className="space-y-1">
                  <div className="relative">
                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                    <Input
                      value={comp.fbUrl}
                      onChange={(e) => {
                        const updated = [...competitors];
                        updated[i] = { ...updated[i], fbUrl: e.target.value };
                        setCompetitors(updated);
                      }}
                      placeholder="facebook.com/SHEINOFFICIAL"
                      className="pl-9"
                      disabled={syncing}
                    />
                    {(comp.fbUrl || comp.igHandle) && (
                      <button
                        onClick={() => {
                          const updated = [...competitors];
                          updated[i] = { fbUrl: '', igHandle: '' };
                          setCompetitors(updated);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {i === 0 && (
                    <p className="text-[10px] text-muted-foreground">URL de Facebook (con metricas via Apify)</p>
                  )}
                </div>

                {/* IG Handle - Secondary */}
                <div className="space-y-1">
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-500" />
                    <Input
                      value={comp.igHandle}
                      onChange={(e) => {
                        const updated = [...competitors];
                        updated[i] = { ...updated[i], igHandle: e.target.value.replace(/^@/, '') };
                        setCompetitors(updated);
                      }}
                      placeholder="@shein_official"
                      className="pl-9"
                      disabled={syncing}
                    />
                  </div>
                  {i === 0 && (
                    <p className="text-[10px] text-muted-foreground">Handle IG (opcional, fallback Meta API)</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {competitors.filter(c => c.fbUrl.trim() || c.igHandle.trim()).length}/5 competidores configurados
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
                        // Fallback to Ad Library link on image load error
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.classList.add('flex', 'flex-col', 'items-center', 'justify-center');
                          parent.innerHTML = `<span class="text-xs text-muted-foreground">Imagen no disponible</span>`;
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
                    className="block h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 transition-colors flex flex-col items-center justify-center text-muted-foreground hover:text-foreground group"
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
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal text-blue-600 border-blue-200">
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
                    {ad.cta_type && CTA_LABELS[ad.cta_type] && (
                      <span className="flex items-center gap-1">
                        {CTA_LABELS[ad.cta_type].icon}
                        {CTA_LABELS[ad.cta_type].label}
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
                        openAdLibrary(t?.ig_handle || '', t?.meta_page_id);
                      }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Search className="h-3 w-3" />
                      Ver todos sus anuncios
                    </button>
                  </div>
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
              Ingresa la URL de Facebook de tus competidores arriba y Steve buscara sus anuncios
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
              Tip: Usa la URL de Facebook del competidor para mejores resultados con Apify.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
