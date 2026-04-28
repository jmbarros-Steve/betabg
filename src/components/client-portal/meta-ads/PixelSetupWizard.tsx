import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Copy,
  ExternalLink,
  Activity,
  ShoppingCart,
  Eye,
  MousePointerClick,
  CreditCard,
  Search,
  AlertTriangle,
} from 'lucide-react';
import MetaScopeAlert from './MetaScopeAlert';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PixelSetupWizardProps {
  clientId: string;
}

interface PixelInfo {
  id: string;
  name: string;
  created: string | null;
  last_fired: string | null;
  is_unavailable: boolean;
  code: string | null;
}

interface PixelEvent {
  event: string;
  count: number;
  last_received: string | null;
}

interface CapiStatus {
  enabled: boolean;
  server_events: number;
  browser_events: number;
}

// ---------------------------------------------------------------------------
// Event config
// ---------------------------------------------------------------------------

const STANDARD_EVENTS = [
  {
    name: 'PageView',
    icon: Eye,
    description: 'Cada vez que se carga una página',
    example: 'Ej: alguien abre tu home o cualquier página de tu sitio.',
    priority: 'basico',
  },
  {
    name: 'ViewContent',
    icon: Search,
    description: 'Cuando un usuario ve un producto',
    example: 'Ej: alguien hace click en "Zapatilla Roja Talla 42" y ve la ficha del producto.',
    priority: 'basico',
  },
  {
    name: 'AddToCart',
    icon: ShoppingCart,
    description: 'Cuando se agrega al carrito',
    example: 'Ej: alguien aprieta el botón "Agregar al carrito" en una ficha de producto.',
    priority: 'critico',
  },
  {
    name: 'InitiateCheckout',
    icon: CreditCard,
    description: 'Cuando se inicia el checkout',
    example: 'Ej: alguien aprieta "Comprar ahora" o "Ir al checkout" desde el carrito.',
    priority: 'critico',
  },
  {
    name: 'Purchase',
    icon: CreditCard,
    description: 'Cuando se completa una compra',
    example: 'Ej: alguien paga con éxito y le llega el mail de confirmación de pedido.',
    priority: 'critico',
  },
  {
    name: 'Lead',
    icon: MousePointerClick,
    description: 'Cuando se captura un lead',
    example: 'Ej: alguien deja su email en un pop-up "Recibe 10% de descuento" sin comprar.',
    priority: 'importante',
  },
  {
    name: 'CompleteRegistration',
    icon: CheckCircle,
    description: 'Cuando se registra un usuario',
    example: 'Ej: alguien crea una cuenta con email + contraseña en tu tienda.',
    priority: 'importante',
  },
  {
    name: 'Search',
    icon: Search,
    description: 'Cuando se busca en el sitio',
    example: 'Ej: alguien escribe "zapatilla negra" en el buscador de tu tienda.',
    priority: 'opcional',
  },
];

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  critico: { label: 'Crítico', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  basico: { label: 'Básico', color: 'bg-[#1E3A7B]/10 text-[#1E3A7B] border-[#2A4F9E]/20' },
  importante: { label: 'Importante', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  opcional: { label: 'Opcional', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PixelSetupWizard({ clientId }: PixelSetupWizardProps) {
  const { connectionId: ctxConnectionId, pixelId: ctxPixelId } = useMetaBusiness();

  const [loading, setLoading] = useState(true);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [pixels, setPixels] = useState<PixelInfo[]>([]);
  const [selectedPixel, setSelectedPixel] = useState<PixelInfo | null>(null);
  const [events, setEvents] = useState<PixelEvent[]>([]);
  const [capi, setCapi] = useState<CapiStatus | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [noConnection, setNoConnection] = useState(false);

  // Fetch connection and detect pixels
  const detectPixels = useCallback(async () => {
    setLoading(true);
    setDetecting(true);
    try {
      // Use connectionId from MetaBusinessContext
      if (!ctxConnectionId) {
        setNoConnection(true);
        return;
      }

      setConnectionId(ctxConnectionId);
      setNoConnection(false);

      // Call API to list pixels using context connectionId
      const { data, error } = await callApi('manage-meta-pixel', {
        body: { action: 'list', connection_id: ctxConnectionId },
      });

      if (error) throw error;

      const pixelList = data?.pixels || [];
      setPixels(pixelList);

      // Auto-select pixel from context (selected portfolio), fallback to first pixel
      if (pixelList.length > 0) {
        const contextMatch = ctxPixelId ? pixelList.find((p: PixelInfo) => p.id === ctxPixelId) : null;
        setSelectedPixel(contextMatch || pixelList[0]);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error detectando pixels');
    } finally {
      setLoading(false);
      setDetecting(false);
    }
  }, [ctxConnectionId, ctxPixelId]);

  // Fetch pixel events/stats
  const fetchEvents = useCallback(async (pixelId: string) => {
    if (!connectionId) return;
    setLoadingEvents(true);
    try {
      const { data, error } = await callApi('manage-meta-pixel', {
        body: { action: 'stats', connection_id: connectionId, pixel_id: pixelId },
      });

      if (error) throw error;
      setEvents(data?.events || []);
      setCapi(data?.capi || null);
    } catch {
      // Stats may fail if pixel hasn't fired - not critical
      setEvents([]);
      setCapi(null);
    } finally {
      setLoadingEvents(false);
    }
  }, [connectionId]);

  useEffect(() => {
    detectPixels();
  }, [detectPixels]);

  // Load events when pixel is selected
  useEffect(() => {
    if (selectedPixel) {
      fetchEvents(selectedPixel.id);
    } else {
      setEvents([]);
    }
  }, [selectedPixel, fetchEvents]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Nunca';

  // Active events set for quick lookup. Solo contamos como "activo" si el
  // count es > 0 — Meta a veces devuelve eventos en la lista con count 0
  // que son falsos positivos (eventos definidos pero sin tráfico real).
  const activeEventNames = new Set(events.filter((e) => e.count > 0).map((e) => e.event));
  const eventByName = new Map(events.map((e) => [e.event, e]));
  const totalServerEvents = capi?.server_events ?? 0;
  const totalBrowserEvents = capi?.browser_events ?? 0;
  const totalEvents = totalServerEvents + totalBrowserEvents;
  const formatCount = (n: number) =>
    new Intl.NumberFormat('es-CL', { notation: n >= 10_000 ? 'compact' : 'standard' }).format(n);

  // Loading
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // No connection
  if (noConnection) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold mb-1">Sin conexión Meta Ads</h3>
          <p className="text-muted-foreground text-sm">
            Conecta tu cuenta de Meta Ads desde la pestaña de <strong>Conexiones</strong> para detectar y configurar tu Pixel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scope alert */}
      <MetaScopeAlert clientId={clientId} requiredFeature="pixel" compact />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meta Pixel</h2>
          <p className="text-muted-foreground text-sm">
            Detecta, configura y verifica tu pixel de conversión
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={detectPixels} disabled={detecting}>
          <RefreshCw className={`w-4 h-4 mr-2 ${detecting ? 'animate-spin' : ''}`} />
          {detecting ? 'Detectando...' : 'Re-detectar'}
        </Button>
      </div>

      {/* Pixel Detection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Estado del Pixel
          </CardTitle>
          <CardDescription className="text-xs">
            Pixels detectados en tu cuenta de Meta Ads
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pixels.length === 0 ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-700">No se detectó ningún pixel</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Necesitas crear un pixel en tu cuenta de Meta Ads. Sigue la guía de configuración abajo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => window.open('https://business.facebook.com/events_manager2/list/pixel/', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ir a Events Manager
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pixels.map((pixel) => {
                const isSelected = selectedPixel?.id === pixel.id;
                const isActive = !!pixel.last_fired;

                return (
                  <div
                    key={pixel.id}
                    onClick={() => setSelectedPixel(pixel)}
                    className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {/* Status icon */}
                    <div className={`p-2 rounded-full ${isActive ? 'bg-green-500/10' : 'bg-red-500/10'}`} aria-hidden="true">
                      {isActive ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{pixel.name}</span>
                        <Badge variant={isActive ? 'default' : 'destructive'} className="text-[10px]">
                          {isActive ? 'Activo' : 'Sin actividad'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>ID: {pixel.id}</span>
                        <span>Último evento: {formatDate(pixel.last_fired)}</span>
                      </div>
                    </div>

                    {/* Copy ID */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Copiar ID del píxel" onClick={(e) => { e.stopPropagation(); copyToClipboard(pixel.id); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CAPI (Conversions API) Status */}
      {selectedPixel && !loadingEvents && capi && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              API de Conversiones (CAPI)
              {capi.enabled ? (
                <Badge className="bg-green-500/10 text-green-700 border-green-500/30 text-[10px]">
                  Conectada
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  No detectada
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              {capi.enabled ? (
                <>
                  <strong>Tu servidor le está reportando ventas a Meta directamente</strong>, sin pasar
                  por el navegador del cliente. Esto te protege cuando la persona usa AdBlock, navega en
                  modo incógnito o tiene cookies bloqueadas — Meta igual recibe el evento y lo atribuye a
                  tu campaña. Resultado: menos ventas "perdidas" por privacidad y mejor optimización del
                  algoritmo.
                </>
              ) : (
                <>
                  <strong>Solo el navegador del cliente le reporta a Meta</strong> (Pixel browser-side).
                  Si la persona tiene AdBlock, iOS 14+, modo incógnito o cookies bloqueadas, Meta no recibe
                  el evento y la venta no se atribuye a tu campaña. Activá la API de Conversiones desde
                  Shopify (Settings → Customer events) para que tu servidor también le reporte
                  directamente — recuperás ~20-40% de eventos perdidos.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">Servidor (CAPI)</div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCount(totalServerEvents)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">últimas 48h</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">Browser (Pixel)</div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCount(totalBrowserEvents)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">últimas 48h</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">% server-side</div>
                <div className="text-2xl font-bold tabular-nums">
                  {totalEvents > 0
                    ? `${Math.round((totalServerEvents / totalEvents) * 100)}%`
                    : '—'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {totalServerEvents > totalBrowserEvents ? 'CAPI dominante ✓' : 'meta recomienda 50%+'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Tracking Status */}
      {selectedPixel && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Eventos de Conversión</CardTitle>
            <CardDescription className="text-xs">
              Estado de los eventos estándar para ecommerce — verde = activo en últimas 48h con conteo real desde Meta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STANDARD_EVENTS.map((evt) => {
                  const isActive = activeEventNames.has(evt.name);
                  const liveEvent = eventByName.get(evt.name);
                  const Icon = evt.icon;
                  const priorityConf = PRIORITY_BADGE[evt.priority];

                  return (
                    <div
                      key={evt.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isActive ? 'border-green-500/30 bg-green-500/[0.06]' : 'border-border bg-muted/20'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isActive ? 'bg-green-500/15' : 'bg-muted'}`}>
                        <Icon className={`w-4 h-4 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{evt.name}</span>
                          <Badge className={`text-[9px] ${priorityConf.color}`}>{priorityConf.label}</Badge>
                          {isActive && liveEvent && (
                            <Badge className="text-[9px] bg-green-500/10 text-green-700 border-green-500/30">
                              {formatCount(liveEvent.count)} eventos
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{evt.description}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic leading-snug">
                          {evt.example}
                        </p>
                        {!isActive && (
                          <p className="text-[11px] text-yellow-600 mt-1">
                            Sin actividad en las últimas 48h — revisá si está instalado correctamente.
                          </p>
                        )}
                      </div>
                      {isActive ? (
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  );
                })}

                {/* Custom events recibidos pero no estándar */}
                {events
                  .filter((e) => e.count > 0 && !STANDARD_EVENTS.some((s) => s.name === e.event))
                  .map((e) => (
                    <div
                      key={e.event}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[#1E3A7B]/20 bg-[#1E3A7B]/[0.04] transition-colors"
                    >
                      <div className="p-1.5 rounded-md bg-[#1E3A7B]/10">
                        <Activity className="w-4 h-4 text-[#1E3A7B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{e.event}</span>
                          <Badge className="text-[9px] bg-[#1E3A7B]/10 text-[#1E3A7B] border-[#2A4F9E]/20">
                            Custom
                          </Badge>
                          <Badge className="text-[9px] bg-green-500/10 text-green-700 border-green-500/30">
                            {formatCount(e.count)} eventos
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Evento personalizado recibido por el Pixel
                        </p>
                      </div>
                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Setup Guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Guía de Configuración</CardTitle>
          <CardDescription className="text-xs">
            Pasos para instalar el pixel en tu tienda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                1
              </div>
              <div>
                <h4 className="text-sm font-medium">Crea o selecciona tu pixel</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ve a{' '}
                  <button
                    className="text-primary underline"
                    onClick={() => window.open('https://business.facebook.com/events_manager2/list/pixel/', '_blank')}
                  >
                    Meta Events Manager
                  </button>{' '}
                  y crea un nuevo pixel o selecciona uno existente.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                2
              </div>
              <div>
                <h4 className="text-sm font-medium">Instala en Shopify</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  En Shopify, ve a <strong>Settings &gt; Customer events</strong> y agrega el pixel de Meta.
                  Shopify tiene integración nativa que configura automáticamente PageView, ViewContent, AddToCart, InitiateCheckout y Purchase.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                3
              </div>
              <div>
                <h4 className="text-sm font-medium">Configura la Conversions API (CAPI)</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para mejorar la precisión, activa la Conversions API desde Shopify. Esto envía eventos del servidor directamente a Meta,
                  evitando problemas con bloqueadores de anuncios y cookies.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                4
              </div>
              <div>
                <h4 className="text-sm font-medium">Verifica los eventos</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Usa la herramienta{' '}
                  <button
                    className="text-primary underline"
                    onClick={() => window.open('https://business.facebook.com/events_manager2/list/pixel/test_events', '_blank')}
                  >
                    Test Events
                  </button>{' '}
                  de Meta para verificar que los eventos se están enviando correctamente. Luego vuelve aquí y presiona "Re-detectar".
                </p>
              </div>
            </div>
          </div>

          {/* Pixel code snippet */}
          {selectedPixel?.code && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Código del Pixel (base code)</h4>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedPixel.code!)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-muted text-xs overflow-x-auto max-h-48 border">
                <code>{selectedPixel.code}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
