import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Instagram, Search, Loader2, Trophy, Clock, Eye,
  Megaphone, ShoppingCart, ArrowRight, ExternalLink,
  Plus, X, RefreshCw, TrendingUp, AlertCircle
} from 'lucide-react';

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

export function CompetitorAdsPanel({ clientId }: CompetitorAdsPanelProps) {
  const [handles, setHandles] = useState<string[]>(['', '', '', '', '']);
  const [tracking, setTracking] = useState<CompetitorTracking[]>([]);
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'winners' | 'active'>('all');

  useEffect(() => {
    fetchData();
  }, [clientId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch tracking records
      const { data: trackingData } = await supabase
        .from('competitor_tracking')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at');

      if (trackingData && trackingData.length > 0) {
        setTracking(trackingData as CompetitorTracking[]);
        // Pre-fill handles
        const existing = trackingData.map(t => t.ig_handle);
        const filled = [...existing, ...Array(5 - existing.length).fill('')].slice(0, 5);
        setHandles(filled);

        // Fetch ads
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
