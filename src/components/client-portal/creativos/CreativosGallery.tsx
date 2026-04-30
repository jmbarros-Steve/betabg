// CreativosGallery — Camila W4 (2026-04-29)
// Galería unificada de creativos del cliente. Lee de 4 fuentes en paralelo:
//   1. ad_assets       — assets generados por Steve (legacy, mayormente vacío)
//   2. client_assets   — uploads del cliente (wizard/brief/strategy chat) +
//                        creativos importados de Meta + sync de Shopify (la
//                        columna `source` distingue cada origen)
//   3. ad_creatives    — todo lo que pasó por el pipeline DCT (asset_url
//                        principal + dct_imagenes array + foto_base_url)
//   4. shopify_products — catálogo Shopify (product photos)
//
// Modos de uso:
//   - 'picker'     → grid compacto, click → onSelectAsset(url, type)
//   - 'standalone' → vista de página completa, click → modal detalle +
//                    botón "Usar en chat Estrategia"
//
// Ambos modos comparten:
//   - Filtros por origen (chips): Todas | Reales | IA | Shopify | Meta
//   - Filtro por tipo: photo | video
//   - Búsqueda por nombre
//   - Skeleton loading + empty state amigable
//
// Coordina con:
//   - Felipe W2: endpoint `meta/import-existing-creatives` (botón "Importar de Meta")
//   - Wizard Meta (CampaignCreateWizard.tsx): se monta en mediaTab='gallery'
//
// NOTA: el wizard sigue dueño de upload/AI image/AI video/products tabs
// (esos NO son galería). Acá solo extraemos la galería en sí.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Image as ImageIcon,
  Video as VideoIcon,
  Sparkles,
  ShoppingBag,
  RefreshCw,
  Loader2,
  Check,
  Calendar,
  ExternalLink,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type CreativoOrigin =
  | 'real'      // upload del cliente (wizard_upload | brief_upload | strategy_chat_upload)
  | 'ia'        // generado por Steve (steve_generated o tabla ad_assets)
  | 'shopify'   // foto de producto sincronizada
  | 'meta'      // importado desde Meta Ads
  | 'unknown';

export type CreativoType = 'photo' | 'video';

export interface CreativoItem {
  id: string;
  url: string;
  type: CreativoType;
  origin: CreativoOrigin;
  name: string;
  createdAt: string | null;
  /** Tabla de origen (debug + decisión "Usar en chat Estrategia") */
  sourceTable: 'ad_assets' | 'client_assets' | 'ad_creatives' | 'shopify_products';
  /** Datos extra del producto Shopify (sólo cuando origin='shopify') */
  shopify?: { handle: string | null; productId: string };
}

interface CreativosGalleryProps {
  clientId: string;
  /** Picker mode = grid compacto + onSelectAsset. Standalone = página entera con detail dialog. */
  mode?: 'picker' | 'standalone';
  /** Click handler en mode='picker'. */
  onSelectAsset?: (assetUrl: string, assetType: CreativoType) => void;
  /** URL actualmente seleccionada (mode='picker') — destaca la card. */
  selectedUrl?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

function detectType(url: string, hint?: string | null): CreativoType {
  if (hint === 'video') return 'video';
  if (hint === 'photo' || hint === 'imagen') return 'photo';
  return VIDEO_EXT_RE.test(url) ? 'video' : 'photo';
}

function originFromClientAssetSource(source: string | null | undefined): CreativoOrigin {
  if (!source) return 'real';
  if (source === 'meta_imported') return 'meta';
  if (source === 'shopify_synced') return 'shopify';
  if (source === 'steve_generated') return 'ia';
  // wizard_upload | brief_upload | strategy_chat_upload → upload manual
  return 'real';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

const ORIGIN_META: Record<CreativoOrigin, { label: string; classes: string; icon: React.ElementType }> = {
  real:    { label: 'Real',    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: Upload },
  ia:      { label: 'IA',      classes: 'bg-purple-50 text-purple-700 border-purple-200',     icon: Sparkles },
  shopify: { label: 'Shopify', classes: 'bg-amber-50 text-amber-800 border-amber-200',        icon: ShoppingBag },
  meta:    { label: 'Meta',    classes: 'bg-[#E7F0FF] text-[#1E3A8A] border-[#BFD3F2]',       icon: ExternalLink },
  unknown: { label: 'Otro',    classes: 'bg-slate-100 text-slate-600 border-slate-200',       icon: ImageIcon },
};

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export function CreativosGallery({
  clientId,
  mode = 'standalone',
  onSelectAsset,
  selectedUrl,
}: CreativosGalleryProps) {
  const [items, setItems] = useState<CreativoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [originFilter, setOriginFilter] = useState<'all' | CreativoOrigin>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CreativoType>('all');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState<CreativoItem | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [adAssetsRes, clientAssetsRes, creativesRes, shopifyRes] = await Promise.all([
        supabase
          .from('ad_assets')
          .select('id, asset_url, tipo, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(100),
        // client_assets.source es columna nueva (migración 20260429000000_creatives_unified.sql)
        // Los types auto-generados pueden no haberla recogido aún → cast.
        (supabase as any)
          .from('client_assets')
          .select('id, url, tipo, source, nombre, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('ad_creatives')
          .select('id, asset_url, dct_imagenes, foto_base_url, titulo, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(100),
        // shopify_products: usamos id (UUID), title, image_url, handle, shopify_product_id
        (supabase as any)
          .from('shopify_products')
          .select('id, title, image_url, handle, shopify_product_id, status, updated_at')
          .eq('client_id', clientId)
          .eq('status', 'active')
          .not('image_url', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);

      const out: CreativoItem[] = [];
      const seen = new Set<string>();

      const push = (item: CreativoItem) => {
        if (!item.url || seen.has(item.url)) return;
        seen.add(item.url);
        out.push(item);
      };

      // 1. ad_assets — todos cuentan como "IA" (Steve generated, tabla legacy)
      for (const a of adAssetsRes.data || []) {
        const url = (a as any).asset_url as string;
        if (!url) continue;
        push({
          id: `aa-${(a as any).id}`,
          url,
          type: detectType(url, (a as any).tipo),
          origin: 'ia',
          name: 'Asset IA',
          createdAt: (a as any).created_at || null,
          sourceTable: 'ad_assets',
        });
      }

      // 2. client_assets — origin depende de `source`
      for (const a of clientAssetsRes.data || []) {
        const url = (a as any).url as string;
        if (!url) continue;
        const src = (a as any).source as string | undefined;
        push({
          id: `ca-${(a as any).id}`,
          url,
          type: detectType(url, (a as any).tipo),
          origin: originFromClientAssetSource(src),
          name: (a as any).nombre || src || 'Upload',
          createdAt: (a as any).created_at || null,
          sourceTable: 'client_assets',
        });
      }

      // 3. ad_creatives — todo lo del pipeline DCT cuenta como "IA"
      for (const c of creativesRes.data || []) {
        const main = (c as any).asset_url as string | null;
        const base = (c as any).foto_base_url as string | null;
        const dct = (c as any).dct_imagenes as any;
        const title = (c as any).titulo || 'Creativo DCT';
        const ts = (c as any).created_at || null;
        if (main) push({
          id: `cr-${(c as any).id}-main`,
          url: main, type: detectType(main),
          origin: 'ia', name: title, createdAt: ts, sourceTable: 'ad_creatives',
        });
        if (base) push({
          id: `cr-${(c as any).id}-base`,
          url: base, type: detectType(base),
          origin: 'ia', name: `${title} (base)`, createdAt: ts, sourceTable: 'ad_creatives',
        });
        if (Array.isArray(dct)) {
          dct.forEach((img: any, i: number) => {
            const url = typeof img === 'string' ? img : img?.url;
            if (!url) return;
            push({
              id: `cr-${(c as any).id}-dct-${i}`,
              url, type: detectType(url),
              origin: 'ia', name: `${title} · DCT ${i + 1}`, createdAt: ts, sourceTable: 'ad_creatives',
            });
          });
        }
      }

      // 4. shopify_products — fotos de producto activos
      for (const p of shopifyRes.data || []) {
        const url = (p as any).image_url as string;
        if (!url) continue;
        push({
          id: `sp-${(p as any).id}`,
          url,
          type: 'photo', // image_url siempre es foto
          origin: 'shopify',
          name: (p as any).title || 'Producto',
          createdAt: (p as any).updated_at || null,
          sourceTable: 'shopify_products',
          shopify: {
            handle: (p as any).handle || null,
            productId: (p as any).shopify_product_id || (p as any).id,
          },
        });
      }

      setItems(out);
    } catch (err) {
      // Errores de RLS o permisos no deben crashear la galería — mostramos vacío.
      console.error('[CreativosGallery] load error', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (originFilter !== 'all' && it.origin !== originFilter) return false;
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, originFilter, typeFilter, search]);

  // ── Counts por origen para chips (always sobre el set tipo-filtrado) ─────
  const counts = useMemo(() => {
    const base = items.filter((it) => typeFilter === 'all' || it.type === typeFilter);
    return {
      all: base.length,
      real: base.filter((it) => it.origin === 'real').length,
      ia: base.filter((it) => it.origin === 'ia').length,
      shopify: base.filter((it) => it.origin === 'shopify').length,
      meta: base.filter((it) => it.origin === 'meta').length,
    };
  }, [items, typeFilter]);

  // ── Importar de Meta (mode standalone) ───────────────────────────────────
  const handleImportFromMeta = useCallback(async () => {
    setImporting(true);
    try {
      const { data, error } = await callApi<{ images?: number; videos?: number; creatives?: number }>(
        'meta/import-existing-creatives',
        { body: { client_id: clientId } },
      );
      if (error) {
        toast.error(`No se pudo importar: ${error}`);
        return;
      }
      const images = data?.images ?? 0;
      const videos = data?.videos ?? 0;
      const creatives = data?.creatives ?? 0;
      toast.success(`Importadas ${images} imágenes, ${videos} videos, ${creatives} creativos`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Error al importar de Meta');
    } finally {
      setImporting(false);
    }
  }, [clientId, loadAll]);

  // ── Render ───────────────────────────────────────────────────────────────
  const isPicker = mode === 'picker';
  const gridCols = isPicker ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

  return (
    <div className={isPicker ? 'space-y-3' : 'space-y-5'}>
      {/* Header (sólo standalone) */}
      {!isPicker && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              Creativos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Galería unificada: uploads, IA, productos Shopify y creativos importados de Meta.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportFromMeta}
              disabled={importing}
              className="text-xs"
            >
              {importing
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Importando…</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Importar de Meta Ads</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={loadAll} disabled={loading} className="text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refrescar
            </Button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-2">
        {/* Chips por origen */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: 'all',     label: 'Todas',   count: counts.all },
            { key: 'real',    label: 'Reales',  count: counts.real },
            { key: 'ia',      label: 'IA',      count: counts.ia },
            { key: 'shopify', label: 'Shopify', count: counts.shopify },
            { key: 'meta',    label: 'Meta',    count: counts.meta },
          ] as const).map((chip) => {
            const active = originFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setOriginFilter(chip.key as any)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-slate-600 border-border hover:bg-slate-50'
                }`}
              >
                {chip.label}
                <span className={`ml-1.5 ${active ? 'text-primary-foreground/80' : 'text-slate-400'}`}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tipo + búsqueda */}
        <div className="flex items-center gap-2">
          <div className="flex bg-muted/40 rounded-md p-0.5 border border-border/50">
            {(['all', 'photo', 'video'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-[11px] px-2 py-1 rounded-sm font-medium flex items-center gap-1 transition-colors ${
                  typeFilter === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'photo' && <ImageIcon className="w-3 h-3" />}
                {t === 'video' && <VideoIcon className="w-3 h-3" />}
                {t === 'all' ? 'Todo' : t === 'photo' ? 'Fotos' : 'Videos'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className={`grid gap-2 ${gridCols}`}>
          {Array.from({ length: isPicker ? 8 : 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasAny={items.length > 0}
          isPicker={isPicker}
          onImport={!isPicker ? handleImportFromMeta : undefined}
          importing={importing}
        />
      ) : (
        <div className={`grid gap-2 ${gridCols} ${isPicker ? 'max-h-[320px] overflow-y-auto pr-1' : ''}`}>
          {filtered.map((item) => (
            <CreativoCard
              key={item.id}
              item={item}
              isSelected={!!selectedUrl && selectedUrl === item.url}
              onClick={() => {
                if (isPicker) {
                  onSelectAsset?.(item.url, item.type);
                  toast.success(`${item.type === 'video' ? 'Video' : 'Imagen'} seleccionado`);
                } else {
                  setDetailItem(item);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Detail dialog (standalone) */}
      {!isPicker && (
        <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
          <DialogContent className="max-w-2xl">
            {detailItem && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <span className="truncate">{detailItem.name}</span>
                    <OriginBadge origin={detailItem.origin} small />
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center max-h-[60vh]">
                    {detailItem.type === 'video' ? (
                      <video src={detailItem.url} controls className="max-w-full max-h-[60vh]" />
                    ) : (
                      <img src={detailItem.url} alt={detailItem.name} className="max-w-full max-h-[60vh] object-contain" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400">Tipo:</span>{' '}
                      <span className="font-medium capitalize">{detailItem.type === 'photo' ? 'Foto' : 'Video'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Origen:</span>{' '}
                      <span className="font-medium">{ORIGIN_META[detailItem.origin].label}</span>
                    </div>
                    {detailItem.createdAt && (
                      <div className="col-span-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{fmtDate(detailItem.createdAt)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 border-t">
                    <Button
                      size="sm"
                      onClick={() => {
                        // Dispatch evento global para que SteveEstrategia (tab Estrategia)
                        // lo capte y precargue el asset en el chat.
                        window.dispatchEvent(new CustomEvent('use-asset-in-strategy', {
                          detail: { url: detailItem.url, type: detailItem.type, name: detailItem.name },
                        }));
                        toast.success('Asset listo para usar en chat Estrategia');
                        setDetailItem(null);
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Usar en chat Estrategia
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={detailItem.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Abrir original
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function CreativoCard({
  item,
  isSelected,
  onClick,
}: {
  item: CreativoItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={onClick}
      className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all bg-slate-50 ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-transparent hover:border-primary/40'
      }`}
      title={item.name}
    >
      {imgError ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1 p-2">
          <ImageIcon className="w-5 h-5" />
          <span className="text-[10px] text-center">Vista no disponible</span>
        </div>
      ) : item.type === 'video' ? (
        <video
          src={item.url}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <img
          src={item.url}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      )}

      {/* Type badge top-right */}
      {item.type === 'video' && (
        <span className="absolute top-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
          <VideoIcon className="w-2.5 h-2.5" /> VIDEO
        </span>
      )}

      {/* Origin badge top-left */}
      <span className="absolute top-1 left-1">
        <OriginBadge origin={item.origin} small />
      </span>

      {/* Name strip bottom */}
      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-2 py-1.5 text-left truncate">
        {item.name}
      </span>

      {/* Selected check */}
      {isSelected && (
        <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center shadow-md">
            <Check className="w-4 h-4" />
          </span>
        </span>
      )}
    </button>
  );
}

function OriginBadge({ origin, small = false }: { origin: CreativoOrigin; small?: boolean }) {
  const meta = ORIGIN_META[origin];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`${meta.classes} ${small ? 'text-[9px] px-1.5 py-0 h-4' : 'text-[10px]'} font-medium border`}
    >
      <Icon className={small ? 'w-2.5 h-2.5 mr-0.5' : 'w-3 h-3 mr-1'} />
      {meta.label}
    </Badge>
  );
}

function EmptyState({
  hasAny,
  isPicker,
  onImport,
  importing,
}: {
  hasAny: boolean;
  isPicker: boolean;
  onImport?: () => void;
  importing?: boolean;
}) {
  if (hasAny) {
    // Hay items pero los filtros los esconden
    return (
      <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <X className="w-6 h-6 mx-auto mb-2 text-muted-foreground/60" />
        <p>Sin resultados con los filtros actuales.</p>
        <p className="text-xs mt-1">Probá cambiar el tipo, origen o limpiar la búsqueda.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-lg bg-slate-50/50">
      <ImageIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
      <p className="text-sm font-medium text-slate-700">No hay creativos todavía</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        {isPicker
          ? 'Subí imágenes o videos en el wizard, o generalos con Steve y aparecerán acá.'
          : 'Cuando subas imágenes/videos en el wizard, generes contenido con Steve, conectes Shopify o importes creativos de Meta, todo aparecerá centralizado en esta galería.'}
      </p>
      {!isPicker && onImport && (
        <Button
          variant="outline"
          size="sm"
          onClick={onImport}
          disabled={importing}
          className="mt-4 text-xs"
        >
          {importing
            ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Importando…</>
            : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Importar de Meta Ads</>}
        </Button>
      )}
    </div>
  );
}

export default CreativosGallery;
