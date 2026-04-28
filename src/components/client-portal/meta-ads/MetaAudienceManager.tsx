import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Loader2,
  Sparkles,
  Globe,
  Upload,
  Heart,
  Smartphone,
  UserPlus,
  ShoppingCart,
  Eye,
  Video,
  Mail,
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import MetaScopeAlert from './MetaScopeAlert';
import AudienceOverlapViewer from './AudienceOverlapViewer';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AudienceTab = 'custom' | 'lookalike' | 'saved' | 'overlap';
type AudienceStatus = 'READY' | 'POPULATING' | 'ERROR' | 'TOO_SMALL';
type CustomAudienceSource = 'WEBSITE' | 'CUSTOMER_LIST' | 'ENGAGEMENT' | 'APP_ACTIVITY';
type EngagementType = 'PAGE' | 'INSTAGRAM' | 'VIDEO';
type AppActivityType = 'ADD_TO_CART' | 'PURCHASE' | 'VIEW_PRODUCT';
type CustomerListSource = 'CSV' | 'KLAVIYO' | 'SHOPIFY';

// Eventos estándar del Pixel de Meta — son los strings exactos que Meta espera
// en el campo `value` del filter cuando operator='eq' y field='event'.
// `AllVisitors` es un sentinel del frontend: si es seleccionado, no se agrega
// filter de evento (audiencia matchea cualquier visitante del Pixel).
type PixelEvent =
  | 'AllVisitors'
  | 'PageView'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'AddPaymentInfo'
  | 'Purchase'
  | 'Lead'
  | 'Search'
  | 'CompleteRegistration'
  | 'Subscribe'
  | 'AddToWishlist'
  | 'Contact'
  | 'CustomizeProduct';

interface PixelUrlFilter {
  match_type: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH';
  value: string;
}

// Una regla individual del Pixel: un evento + retention + filtro URL opcional.
interface PixelRule {
  id: string; // uuid local para keys de React
  event: PixelEvent;
  retention_days: number;
  url_filter?: PixelUrlFilter;
}

// Grupo de reglas con operador AND/OR. Meta acepta inclusions y exclusions
// como dos grupos independientes, cada uno con su propio operator y array.
interface RuleGroup {
  operator: 'and' | 'or';
  rules: PixelRule[];
}

interface AudienceRow {
  id: string;
  name: string;
  type: AudienceTab;
  size: number;
  status: AudienceStatus;
  created_at: string;
  source: string;
  source_audience_id?: string;
  lookalike_percent?: number;
  country?: string;
  description?: string;
  retention_days?: number;
}

interface CustomAudienceFormData {
  name: string;
  description: string;
  source: CustomAudienceSource;
  // Website (Pixel) — rule builder con eventos
  inclusions: RuleGroup;
  exclusions: RuleGroup;
  // Customer List
  customer_list_source: CustomerListSource;
  // Engagement
  engagement_type: EngagementType;
  engagement_days: number;
  // App Activity
  app_activity_type: AppActivityType;
  app_activity_days: number;
}

interface LookalikeFormData {
  source_audience_id: string;
  country: string;
  lookalike_percent: number;
}

interface AudienceSuggestion {
  id: string;
  title: string;
  description: string;
  source: CustomAudienceSource;
  icon: React.ElementType;
  requires?: string;
  prefill: Partial<CustomAudienceFormData>;
}

interface MetaAudienceManagerProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<AudienceStatus, { label: string; className: string }> = {
  READY: {
    label: 'Lista',
    className: 'bg-green-500/15 text-green-700 border-green-500/30',
  },
  POPULATING: {
    label: 'Creando',
    className: 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#2A4F9E]/30',
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-500/15 text-red-700 border-red-500/30',
  },
  TOO_SMALL: {
    label: 'Muy pequeña',
    className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  },
};

const SOURCE_LABELS: Record<CustomAudienceSource, string> = {
  WEBSITE: 'Sitio Web (Pixel)',
  CUSTOMER_LIST: 'Lista de Clientes',
  ENGAGEMENT: 'Interacción',
  APP_ACTIVITY: 'Actividad en App',
};

const SOURCE_ICONS: Record<CustomAudienceSource, React.ElementType> = {
  WEBSITE: Globe,
  CUSTOMER_LIST: Upload,
  ENGAGEMENT: Heart,
  APP_ACTIVITY: Smartphone,
};

const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  PAGE: 'Interacción con Página de Facebook',
  INSTAGRAM: 'Interacción con perfil de Instagram',
  VIDEO: 'Personas que vieron tus videos',
};

const APP_ACTIVITY_LABELS: Record<AppActivityType, string> = {
  ADD_TO_CART: 'Agregar al carrito',
  PURCHASE: 'Compra completada',
  VIEW_PRODUCT: 'Vista de producto',
};

const CUSTOMER_LIST_SOURCE_LABELS: Record<CustomerListSource, string> = {
  CSV: 'Subir archivo CSV',
  KLAVIYO: 'Sincronizar desde Klaviyo',
  SHOPIFY: 'Sincronizar desde Shopify',
};

const TAB_CONFIG: { key: AudienceTab; label: string }[] = [
  { key: 'custom', label: 'Audiencias Personalizadas' },
  { key: 'lookalike', label: 'Audiencias Similares' },
  { key: 'saved', label: 'Audiencias Guardadas' },
  { key: 'overlap', label: 'Overlap' },
];

// Eventos estándar del Pixel ordenados por frecuencia de uso real en e-commerce.
// El label es lo que ve el usuario; la key es el string exacto que Meta espera
// en filter.value (case-sensitive según docs Meta Marketing API v23).
const PIXEL_EVENT_LABELS: Record<PixelEvent, string> = {
  AllVisitors: 'Cualquier visitante del sitio',
  PageView: 'Visitó una página (PageView)',
  ViewContent: 'Vio un producto (ViewContent)',
  AddToCart: 'Agregó al carrito (AddToCart)',
  InitiateCheckout: 'Inició checkout (InitiateCheckout)',
  AddPaymentInfo: 'Agregó datos de pago (AddPaymentInfo)',
  Purchase: 'Compró (Purchase)',
  Lead: 'Generó un lead (Lead)',
  Search: 'Realizó una búsqueda (Search)',
  CompleteRegistration: 'Completó registro (CompleteRegistration)',
  Subscribe: 'Se suscribió (Subscribe)',
  AddToWishlist: 'Agregó a wishlist (AddToWishlist)',
  Contact: 'Contactó (Contact)',
  CustomizeProduct: 'Personalizó producto (CustomizeProduct)',
};

const COUNTRY_OPTIONS = [
  { value: 'CL', label: 'Chile' },
  { value: 'AR', label: 'Argentina' },
  { value: 'MX', label: 'México' },
  { value: 'CO', label: 'Colombia' },
  { value: 'PE', label: 'Perú' },
  { value: 'BR', label: 'Brasil' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'ES', label: 'España' },
];

// Helper para nuevas reglas del Pixel (uuid local para keys de React).
const makePixelRule = (overrides?: Partial<PixelRule>): PixelRule => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  event: 'AllVisitors',
  retention_days: 30,
  ...overrides,
});

const EMPTY_CUSTOM_FORM: CustomAudienceFormData = {
  name: '',
  description: '',
  source: 'WEBSITE',
  inclusions: { operator: 'or', rules: [makePixelRule()] },
  exclusions: { operator: 'or', rules: [] },
  customer_list_source: 'CSV',
  engagement_type: 'PAGE',
  engagement_days: 30,
  app_activity_type: 'PURCHASE',
  app_activity_days: 30,
};

const EMPTY_LOOKALIKE_FORM: LookalikeFormData = {
  source_audience_id: '',
  country: 'CL',
  lookalike_percent: 1,
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const formatDate = (dateStr: string): string => {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

/** Estimate reach based on country and lookalike percentage. */
const estimateReach = (country: string, percent: number): { min: number; max: number } => {
  const populations: Record<string, number> = {
    CL: 19_500_000,
    AR: 46_000_000,
    MX: 130_000_000,
    CO: 52_000_000,
    PE: 34_000_000,
    BR: 215_000_000,
    US: 335_000_000,
    ES: 47_500_000,
  };
  const pop = populations[country] || 19_500_000;
  // Assume ~60% of population is on Meta platforms
  const metaUsers = pop * 0.6;
  const base = metaUsers * (percent / 100);
  return {
    min: Math.round(base * 0.8),
    max: Math.round(base * 1.2),
  };
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AudienceStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.READY;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: AudienceTab }) {
  const labels: Record<AudienceTab, { label: string; className: string }> = {
    custom: { label: 'Personalizada', className: 'bg-purple-500/15 text-purple-700 border-purple-500/30' },
    lookalike: { label: 'Similar', className: 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#2A4F9E]/30' },
    saved: { label: 'Guardada', className: 'bg-gray-500/15 text-gray-600 border-gray-500/30' },
  };
  const config = labels[type];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Smart Audience Suggestions
// ---------------------------------------------------------------------------

function AudienceSuggestions({
  hasShopify,
  hasKlaviyo,
  onSelect,
}: {
  hasShopify: boolean;
  hasKlaviyo: boolean;
  onSelect: (suggestion: AudienceSuggestion) => void;
}) {
  const suggestions: AudienceSuggestion[] = useMemo(() => {
    const all: AudienceSuggestion[] = [];

    if (hasShopify) {
      all.push({
        id: 'frequent-buyers',
        title: 'Compradores frecuentes (últimos 90 días)',
        description: 'Clientes que han comprado 2+ veces en los últimos 90 días desde Shopify.',
        source: 'CUSTOMER_LIST',
        icon: ShoppingCart,
        requires: 'Shopify',
        prefill: {
          name: 'Compradores frecuentes - 90 días',
          description: 'Clientes con 2+ compras en los últimos 90 días sincronizados desde Shopify.',
          source: 'CUSTOMER_LIST',
          customer_list_source: 'SHOPIFY',
        },
      });
    }

    all.push({
      id: 'visitors-no-purchase',
      title: 'Visitantes que no compraron (180 días)',
      description: 'Personas que visitaron tu sitio pero no completaron una compra en 180 días.',
      source: 'WEBSITE',
      icon: Eye,
      prefill: {
        name: 'Visitantes sin compra - 180 días',
        description: 'Visitantes del sitio web que no completaron una compra en los últimos 180 días.',
        source: 'WEBSITE',
        inclusions: { operator: 'or', rules: [makePixelRule({ event: 'PageView', retention_days: 180 })] },
        exclusions: { operator: 'or', rules: [makePixelRule({ event: 'Purchase', retention_days: 180 })] },
      },
    });

    all.push({
      id: 'lookalike-buyers',
      title: 'Lookalike 1% de compradores',
      description: 'Audiencia similar al 1% más parecido a tus mejores compradores.',
      source: 'CUSTOMER_LIST',
      icon: UserPlus,
      prefill: {
        name: 'Lookalike 1% - Compradores',
        description: 'Audiencia similar basada en el 1% más parecido a los compradores.',
      },
    });

    if (hasKlaviyo) {
      all.push({
        id: 'klaviyo-active',
        title: 'Suscriptores activos de Klaviyo',
        description: 'Suscriptores que abrieron o clickearon emails en los últimos 90 días.',
        source: 'CUSTOMER_LIST',
        icon: Mail,
        requires: 'Klaviyo',
        prefill: {
          name: 'Suscriptores activos Klaviyo - 90 días',
          description: 'Suscriptores activos de Klaviyo que interactuaron con emails en los últimos 90 días.',
          source: 'CUSTOMER_LIST',
          customer_list_source: 'KLAVIYO',
        },
      });
    }

    all.push({
      id: 'retargeting-abandoned-cart',
      title: 'Carrito abandonado (Retargeting)',
      description: 'Personas que agregaron productos al carrito pero NO compraron en los últimos 30 días.',
      source: 'WEBSITE',
      icon: ShoppingCart,
      prefill: {
        name: 'Retargeting - Carrito Abandonado 30d',
        description: 'AddToCart sin Purchase en los últimos 30 días.',
        source: 'WEBSITE',
        inclusions: { operator: 'or', rules: [makePixelRule({ event: 'AddToCart', retention_days: 30 })] },
        exclusions: { operator: 'or', rules: [makePixelRule({ event: 'Purchase', retention_days: 30 })] },
      },
    });

    all.push({
      id: 'retargeting-viewed-not-purchased',
      title: 'Vio productos sin comprar',
      description: 'Personas que vieron productos pero no compraron en los últimos 14 días.',
      source: 'WEBSITE',
      icon: Eye,
      prefill: {
        name: 'Retargeting - Vio Productos 14d',
        description: 'ViewContent sin Purchase en los últimos 14 días.',
        source: 'WEBSITE',
        inclusions: { operator: 'or', rules: [makePixelRule({ event: 'ViewContent', retention_days: 14 })] },
        exclusions: { operator: 'or', rules: [makePixelRule({ event: 'Purchase', retention_days: 14 })] },
      },
    });

    all.push({
      id: 'video-viewers',
      title: 'Viewers de videos (75%+)',
      description: 'Personas que vieron al menos el 75% de tus videos en Facebook e Instagram.',
      source: 'ENGAGEMENT',
      icon: Video,
      prefill: {
        name: 'Video Viewers 75%+ - 30 días',
        description: 'Personas que vieron al menos el 75% de tus videos en los últimos 30 días.',
        source: 'ENGAGEMENT',
        engagement_type: 'VIDEO',
        engagement_days: 30,
      },
    });

    return all;
  }, [hasShopify, hasKlaviyo]);

  if (suggestions.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Audiencias Sugeridas</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Sugerencias inteligentes basadas en tus conexiones y datos del cliente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <div
                key={suggestion.id}
                className="flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-background hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {suggestion.title}
                    </p>
                    {suggestion.requires && (
                      <Badge variant="secondary" className="text-[10px] mt-1 h-4">
                        {suggestion.requires}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {suggestion.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs mt-auto self-start"
                  onClick={() => onSelect(suggestion)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Crear
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pixel Rule Builder — eventos del Pixel + filtros URL + AND/OR + retention
// ---------------------------------------------------------------------------

/**
 * Rule builder visual para audiencias website. Mapea 1:1 al shape que Meta
 * espera en `rule.inclusions` y `rule.exclusions`:
 *
 *   {
 *     operator: 'and' | 'or',           ← entre las reglas del grupo
 *     rules: [
 *       {
 *         event_sources: [{ type: 'pixel', id: <pixel_id> }],
 *         retention_seconds: <retention_days * 86400>,
 *         filter: {                      ← opcional: omitir = AllVisitors
 *           operator: 'and',
 *           filters: [
 *             { field: 'event', operator: 'eq', value: '<PixelEvent>' },
 *             { field: 'url',   operator: 'i_contains', value: '<path>' }, ← opc.
 *           ],
 *         },
 *       },
 *       ...
 *     ]
 *   }
 *
 * En el grupo de exclusions, una sola regla vacía no se manda al backend.
 */
function PixelRuleBuilder({
  title,
  group,
  onChange,
  kind,
}: {
  title: string;
  group: RuleGroup;
  onChange: (next: RuleGroup) => void;
  kind: 'inclusions' | 'exclusions';
}) {
  const updateRule = (idx: number, patch: Partial<PixelRule>) => {
    const nextRules = group.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...group, rules: nextRules });
  };

  const removeRule = (idx: number) => {
    const nextRules = group.rules.filter((_, i) => i !== idx);
    onChange({ ...group, rules: nextRules });
  };

  const addRule = () => {
    onChange({ ...group, rules: [...group.rules, makePixelRule()] });
  };

  const setOperator = (op: 'and' | 'or') => {
    onChange({ ...group, operator: op });
  };

  const isEmpty = group.rules.length === 0;

  return (
    <div
      className={`rounded-lg border p-3 space-y-3 ${
        kind === 'exclusions'
          ? 'border-red-500/20 bg-red-500/[0.02]'
          : 'border-border/60 bg-background'
      }`}
    >
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        {group.rules.length >= 2 && (
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setOperator('or')}
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                group.operator === 'or'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              CUALQUIERA (O)
            </button>
            <button
              type="button"
              onClick={() => setOperator('and')}
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                group.operator === 'and'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              TODAS (Y)
            </button>
          </div>
        )}
      </div>

      {isEmpty && kind === 'exclusions' && (
        <p className="text-xs text-muted-foreground italic">
          Sin exclusiones. Click en "Agregar condición" para excluir un evento.
        </p>
      )}

      {group.rules.map((rule, idx) => {
        const hasUrlFilter = !!rule.url_filter;
        return (
          <div
            key={rule.id}
            className="rounded-md border border-border/60 bg-background/60 p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Evento del Pixel</Label>
                  <Select
                    value={rule.event}
                    onValueChange={(v) => updateRule(idx, { event: v as PixelEvent })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {(Object.entries(PIXEL_EVENT_LABELS) as [PixelEvent, string][]).map(
                        ([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtro URL opcional */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Filtro de URL{' '}
                      <span className="text-muted-foreground/70">(opcional)</span>
                    </Label>
                    {hasUrlFilter && (
                      <button
                        type="button"
                        onClick={() => updateRule(idx, { url_filter: undefined })}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Quitar filtro
                      </button>
                    )}
                  </div>
                  {hasUrlFilter ? (
                    <div className="flex gap-2 mt-1">
                      <Select
                        value={rule.url_filter!.match_type}
                        onValueChange={(v) =>
                          updateRule(idx, {
                            url_filter: {
                              ...rule.url_filter!,
                              match_type: v as 'CONTAINS' | 'EQUALS' | 'STARTS_WITH',
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-[140px] h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          <SelectItem value="CONTAINS">Contiene</SelectItem>
                          <SelectItem value="EQUALS">Es igual a</SelectItem>
                          <SelectItem value="STARTS_WITH">Empieza con</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={rule.url_filter!.value}
                        onChange={(e) =>
                          updateRule(idx, {
                            url_filter: { ...rule.url_filter!, value: e.target.value },
                          })
                        }
                        placeholder="Ej: /checkout, /productos"
                        className="flex-1 h-9 text-sm"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        updateRule(idx, {
                          url_filter: { match_type: 'CONTAINS', value: '' },
                        })
                      }
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      + Agregar filtro de URL
                    </button>
                  )}
                </div>

                {/* Retention días por regla */}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Días desde el evento (1-180)
                  </Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Slider
                      value={[rule.retention_days]}
                      onValueChange={([val]) => updateRule(idx, { retention_days: val })}
                      min={1}
                      max={180}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-xs font-medium w-14 text-right">
                      {rule.retention_days} días
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeRule(idx)}
                className="shrink-0 p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
                aria-label="Eliminar condición"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {idx < group.rules.length - 1 && (
              <div className="flex items-center justify-center pt-1">
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {group.operator === 'and' ? 'Y' : 'O'}
                </span>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRule}
        className="w-full text-xs font-medium text-primary hover:bg-primary/5 border border-dashed border-primary/30 rounded-md py-2 transition-colors"
      >
        + Agregar condición
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Custom Audience Dialog
// ---------------------------------------------------------------------------

function CreateCustomAudienceDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
  submitting,
  pixelId,
  shopDomain,
  pageId,
  pageName,
  igAccountId,
  igAccountName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CustomAudienceFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomAudienceFormData>>;
  onSubmit: () => void;
  submitting: boolean;
  pixelId: string | null;
  shopDomain: string | null;
  pageId: string | null;
  pageName: string | null;
  igAccountId: string | null;
  igAccountName: string | null;
}) {
  const SourceIcon = SOURCE_ICONS[formData.source];

  // CRITICO-2: el backend exige IDs reales de Page/IG para audiencias de
  // engagement. Detectamos si el usuario tiene los assets disponibles según
  // el tipo elegido y preparamos labels readonly + bloqueo del submit.
  const engKind = formData.engagement_type;
  const engagementNeedsPage = engKind === 'PAGE' || engKind === 'VIDEO';
  const engagementNeedsIg = engKind === 'INSTAGRAM';
  const engagementMissingAsset =
    formData.source === 'ENGAGEMENT' &&
    ((engagementNeedsPage && !pageId) || (engagementNeedsIg && !igAccountId));
  const submitDisabled =
    submitting ||
    (formData.source === 'WEBSITE' && !pixelId) ||
    engagementMissingAsset;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto"
        // Fix canónico Radix Dialog + Select: prevenir el auto-focus al abrir
        // el Dialog evita que el focus trap del Dialog robe el focus del
        // Select cuando se abre el dropdown. Combinado con z-[100] en
        // SelectContent, los dropdowns dentro del Dialog funcionan correctamente.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Crear Audiencia Personalizada</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div>
            <Label htmlFor="audience-name">Nombre de la audiencia</Label>
            <Input
              id="audience-name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Ej: Compradores últimos 30 días"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="audience-desc">
              Descripción{' '}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="audience-desc"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Descripción interna de la audiencia"
              className="mt-1"
            />
          </div>

          {/* Source selection */}
          <div>
            <Label>Fuente de datos</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(Object.entries(SOURCE_LABELS) as [CustomAudienceSource, string][]).map(
                ([key, label]) => {
                  const Icon = SOURCE_ICONS[key];
                  const isSelected = formData.source === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, source: key }))
                      }
                      className={`
                        flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all
                        ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border bg-background hover:border-primary/30 hover:bg-muted/30'
                        }
                      `}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Source-specific fields */}
          <div className="rounded-lg border border-border/60 p-4 space-y-4 bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <SourceIcon className="w-4 h-4" />
              Configuración: {SOURCE_LABELS[formData.source]}
            </div>

            {/* WEBSITE (Pixel) */}
            {formData.source === 'WEBSITE' && (
              <>
                {!pixelId ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-700">Conecta tu Pixel primero</p>
                      <p className="text-xs text-yellow-600 mt-1">
                        Para crear audiencias basadas en tráfico web necesitas tener un Meta Pixel conectado.
                        Ve a la sección de Pixel para configurarlo.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {shopDomain && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                        <Info className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-green-700">
                          Pixel conectado con tu tienda <strong>{shopDomain}</strong>. El dominio se usará automáticamente.
                        </p>
                      </div>
                    )}

                    {/* Rule builder: Incluir personas que... */}
                    <PixelRuleBuilder
                      title="Incluir personas que..."
                      group={formData.inclusions}
                      onChange={(next) =>
                        setFormData((prev) => ({ ...prev, inclusions: next }))
                      }
                      kind="inclusions"
                    />

                    {/* Rule builder: Excluir personas que... */}
                    <PixelRuleBuilder
                      title="Excluir personas que..."
                      group={formData.exclusions}
                      onChange={(next) =>
                        setFormData((prev) => ({ ...prev, exclusions: next }))
                      }
                      kind="exclusions"
                    />
                  </>
                )}
              </>
            )}

            {/* CUSTOMER LIST */}
            {formData.source === 'CUSTOMER_LIST' && (
              <div>
                <Label>Fuente de la lista</Label>
                <Select
                  value={formData.customer_list_source}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      customer_list_source: v as CustomerListSource,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {(
                      Object.entries(CUSTOMER_LIST_SOURCE_LABELS) as [
                        CustomerListSource,
                        string,
                      ][]
                    ).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.customer_list_source === 'CSV' && (
                  <div className="mt-3 border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Arrastra un archivo CSV o haz click para seleccionar
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato requerido: email, nombre, teléfono
                    </p>
                    <Button variant="outline" size="sm" className="mt-3">
                      Seleccionar archivo
                    </Button>
                  </div>
                )}
                {formData.customer_list_source === 'KLAVIYO' && (
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-[#1E3A7B]/5 border border-[#2A4F9E]/20">
                    <Info className="w-4 h-4 text-[#2A4F9E] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#162D5F]">
                      Se sincronizarán automáticamente los suscriptores activos de tu
                      cuenta de Klaviyo conectada. La audiencia se actualizará
                      periódicamente.
                    </p>
                  </div>
                )}
                {formData.customer_list_source === 'SHOPIFY' && (
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <Info className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-green-700">
                      Se sincronizarán los clientes de tu tienda Shopify conectada. La
                      audiencia se actualizará automáticamente con nuevos compradores.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ENGAGEMENT */}
            {formData.source === 'ENGAGEMENT' && (
              <>
                <div>
                  <Label>Tipo de interacción</Label>
                  <Select
                    value={formData.engagement_type}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        engagement_type: v as EngagementType,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {(
                        Object.entries(ENGAGEMENT_TYPE_LABELS) as [
                          EngagementType,
                          string,
                        ][]
                      ).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* CRITICO-2: el backend exige page_id real para PAGE/VIDEO e
                    ig_user_id para INSTAGRAM. Mostramos el asset disponible
                    como readonly o un error accionable. */}
                {engagementNeedsPage && (
                  pageId ? (
                    <div>
                      <Label>Página de Facebook</Label>
                      <div className="mt-1 flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                        <Heart className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pageName || 'Página conectada'}</p>
                          <p className="text-xs text-muted-foreground truncate">ID: {pageId}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-700">Conectá tu Facebook Page primero</p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Para crear audiencias de interacción con página o video necesitas tener una Página de Facebook conectada en Conexiones → Meta.
                        </p>
                      </div>
                    </div>
                  )
                )}

                {engagementNeedsIg && (
                  igAccountId ? (
                    <div>
                      <Label>Cuenta de Instagram</Label>
                      <div className="mt-1 flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                        <Heart className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{igAccountName || 'Cuenta IG conectada'}</p>
                          <p className="text-xs text-muted-foreground truncate">ID: {igAccountId}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-700">Conectá tu Instagram Business primero</p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Para crear audiencias de interacción con Instagram necesitas tener una cuenta de Instagram Business conectada en Conexiones → Meta.
                        </p>
                      </div>
                    </div>
                  )
                )}

                <div>
                  <Label>Período (días)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Slider
                      value={[formData.engagement_days]}
                      onValueChange={([val]) =>
                        setFormData((prev) => ({ ...prev, engagement_days: val }))
                      }
                      min={1}
                      max={180}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-16 text-right">
                      {formData.engagement_days} días
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* APP ACTIVITY */}
            {formData.source === 'APP_ACTIVITY' && (
              <>
                <div>
                  <Label>Tipo de actividad</Label>
                  <Select
                    value={formData.app_activity_type}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        app_activity_type: v as AppActivityType,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {(
                        Object.entries(APP_ACTIVITY_LABELS) as [
                          AppActivityType,
                          string,
                        ][]
                      ).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Período (días)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Slider
                      value={[formData.app_activity_days]}
                      onValueChange={([val]) =>
                        setFormData((prev) => ({ ...prev, app_activity_days: val }))
                      }
                      min={1}
                      max={180}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-16 text-right">
                      {formData.app_activity_days} días
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Audiencia'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create Lookalike Dialog
// ---------------------------------------------------------------------------

function CreateLookalikeDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  customAudiences,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: LookalikeFormData;
  setFormData: React.Dispatch<React.SetStateAction<LookalikeFormData>>;
  customAudiences: AudienceRow[];
  onSubmit: () => void;
  submitting: boolean;
}) {
  const reach = estimateReach(formData.country, formData.lookalike_percent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Crear Audiencia Similar (Lookalike)</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Source audience */}
          <div>
            <Label>Audiencia de origen</Label>
            <Select
              value={formData.source_audience_id}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, source_audience_id: v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona una audiencia personalizada" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {customAudiences.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No hay audiencias personalizadas disponibles
                  </div>
                ) : (
                  customAudiences.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span>{a.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({formatNumber(a.size)} personas)
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Country */}
          <div>
            <Label>País de destino</Label>
            <Select
              value={formData.country}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, country: v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lookalike size slider */}
          <div>
            <Label>
              Tamaño de audiencia:{' '}
              <span className="text-primary font-semibold">
                {formData.lookalike_percent}%
              </span>
            </Label>
            <div className="mt-3">
              <Slider
                value={[formData.lookalike_percent]}
                onValueChange={([val]) =>
                  setFormData((prev) => ({ ...prev, lookalike_percent: val }))
                }
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1% - Más similar</span>
                <span>10% - Mayor alcance</span>
              </div>
            </div>
          </div>

          {/* Estimated reach */}
          <div className="rounded-lg bg-muted/50 border border-border/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Alcance estimado</span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {formatNumber(reach.min)} - {formatNumber(reach.max)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              personas en{' '}
              {COUNTRY_OPTIONS.find((c) => c.value === formData.country)?.label || formData.country}
            </p>
          </div>

          {/* M3: warn if origin audience < 100 — Meta minimum to compute LAL */}
          {(() => {
            const origin = customAudiences.find((a) => a.id === formData.source_audience_id);
            const tooSmall = origin && origin.size > 0 && origin.size < 100;
            if (!tooSmall) return null;
            return (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-300">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-semibold">Esta audiencia tiene {formatNumber(origin.size)} personas, mínimo Meta requiere 100.</p>
                  <p className="mt-0.5">El lookalike fallará al crearse. Aumentá el tamaño de la audiencia de origen primero (más datos del pixel, lista de clientes más grande, etc.).</p>
                </div>
              </div>
            );
          })()}

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#1E3A7B]/5 border border-[#2A4F9E]/20">
            <Info className="w-4 h-4 text-[#2A4F9E] shrink-0 mt-0.5" />
            <p className="text-xs text-[#162D5F]">
              Un porcentaje menor (1-3%) genera una audiencia más parecida a tu
              audiencia de origen. Un porcentaje mayor (4-10%) genera un alcance
              más amplio pero con menor similitud.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          {(() => {
            const origin = customAudiences.find((a) => a.id === formData.source_audience_id);
            const tooSmall = origin && origin.size > 0 && origin.size < 100;
            return (
              <Button
                onClick={onSubmit}
                disabled={submitting || !formData.source_audience_id || !!tooSmall}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear Lookalike'
                )}
              </Button>
            );
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetaAudienceManager({ clientId }: MetaAudienceManagerProps) {
  const {
    connectionId: ctxConnectionId,
    lastSyncAt,
    pixelId: ctxPixelId,
    pageId: ctxPageId,
    pageName: ctxPageName,
    igAccountId: ctxIgAccountId,
    igAccountName: ctxIgAccountName,
  } = useMetaBusiness();

  // State
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AudienceTab>('custom');
  const [searchQuery, setSearchQuery] = useState('');
  // Fallback pixel ID from DB if context doesn't have it
  const [dbPixelId, setDbPixelId] = useState<string | null>(null);
  // Last-resort fallback: si ni context ni DB tienen pixel_id (común en
  // conexiones leadsie donde el sync no pobló el campo), llamamos a Meta API
  // directo (action list_pixels) para auto-detectar.
  const [autoFetchedPixelId, setAutoFetchedPixelId] = useState<string | null>(null);
  const pixelId = ctxPixelId || dbPixelId || autoFetchedPixelId;

  // Connection info
  const [hasMetaConnection, setHasMetaConnection] = useState(false);
  const [metaConnectionId, setMetaConnectionId] = useState<string | null>(null);
  const [hasShopify, setHasShopify] = useState(false);
  const [hasKlaviyo, setHasKlaviyo] = useState(false);
  const [klaviyoConnectionId, setKlaviyoConnectionId] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState<string | null>(null);

  // Dialogs
  const [createCustomOpen, setCreateCustomOpen] = useState(false);
  const [createLookalikeOpen, setCreateLookalikeOpen] = useState(false);
  const [customForm, setCustomForm] = useState<CustomAudienceFormData>({ ...EMPTY_CUSTOM_FORM });
  const [lookalikeForm, setLookalikeForm] = useState<LookalikeFormData>({ ...EMPTY_LOOKALIKE_FORM });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AudienceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncingFromMeta, setSyncingFromMeta] = useState(false);

  // ---- Sync audiences from Meta Graph API ----

  const syncAudiencesFromMeta = useCallback(async (connectionId: string, showErrors = false): Promise<AudienceRow[]> => {
    try {
      const { data, error } = await callApi('manage-meta-audiences', {
        body: { action: 'list', connection_id: connectionId },
      });

      // callApi puts the body in `data` even on non-2xx responses.
      // If the edge function returned success with empty audiences, that's valid — not an error.
      if (data?.success && Array.isArray(data.audiences)) {
        // Edge function returned 200 with valid data (possibly empty list) — proceed normally
      } else if (error) {
        // Sync from Meta error handled via toast
        if (showErrors) {
          const errMsg = (data as any)?.error || (error as any)?.message || '';
          if (errMsg.includes('Unauthorized') || errMsg.includes('403')) {
            toast.error('Sin permisos. Tu token de Meta necesita permisos ads_management y ads_read.');
          } else if (errMsg.includes('Missing Meta credentials') || errMsg.includes('account ID')) {
            toast.error('Falta el Ad Account ID en tu conexión de Meta. Reconecta desde Conexiones.');
          } else if (errMsg.includes('decrypt')) {
            toast.error('Error con el token de Meta. Reconecta Meta Ads desde Conexiones.');
          } else if (errMsg.includes('Connection not found') || errMsg.includes('404')) {
            toast.error('Conexión de Meta no encontrada. Verifica en Conexiones.');
          } else if (errMsg.includes('Failed to list')) {
            toast.error('Meta API rechazó la solicitud. Verifica permisos del token (ads_read, ads_management).');
          } else {
            toast.error(`Error al cargar audiencias: ${errMsg || 'Error desconocido'}`);
          }
        }
        return [];
      } else if (!data?.success || !Array.isArray(data.audiences)) {
        // No audiences returned from Meta
        if (showErrors && data?.error) {
          toast.error(`Meta API: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
        }
        return [];
      }

      // Map Meta API fields to component's expected format
      return data.audiences.map((aud: Record<string, unknown>) => {
        const subtype = String(aud.subtype || '').toUpperCase();
        let type: AudienceTab = 'custom';
        if (subtype === 'LOOKALIKE') type = 'lookalike';
        else if (subtype === 'SAVED' || subtype === 'REACH_ESTIMATE') type = 'saved';

        // Map delivery_status to component status
        const deliveryStatus = aud.delivery_status as Record<string, unknown> | undefined;
        let status: AudienceStatus = 'READY';
        if (deliveryStatus) {
          const code = Number(deliveryStatus.code || 0);
          if (code === 200) status = 'READY';
          else if (code === 100) status = 'POPULATING';
          else if (code >= 400) status = 'ERROR';
          else if (code === 300) status = 'TOO_SMALL';
        }

        return {
          id: String(aud.id),
          name: String(aud.name || 'Sin nombre'),
          type,
          size: Number(aud.approximate_count_lower_bound || aud.approximate_count) || 0,
          status,
          created_at: aud.time_created ? String(aud.time_created) : new Date().toISOString(),
          source: 'Meta Ads',
          description: aud.description ? String(aud.description) : undefined,
        } as AudienceRow;
      });
    } catch (err) {
      // Sync exception handled via toast
      return [];
    }
  }, []);

  // Manual sync handler
  const handleSyncFromMeta = useCallback(async () => {
    if (!metaConnectionId) {
      toast.error('No hay conexión de Meta activa');
      return;
    }
    setSyncingFromMeta(true);
    try {
      const metaAudiences = await syncAudiencesFromMeta(metaConnectionId, true);
      if (metaAudiences.length > 0) {
        setAudiences((prev) => {
          // Merge: Meta audiences replace local ones with same ID, add new ones
          const map = new Map<string, AudienceRow>();
          for (const a of prev) map.set(a.id, a);
          for (const a of metaAudiences) map.set(a.id, a);
          return Array.from(map.values());
        });
        toast.success(`${metaAudiences.length} audiencias sincronizadas desde Meta`);
      } else {
        toast.info('No se encontraron audiencias en Meta Ads');
      }
    } catch {
      toast.error('Error al sincronizar audiencias');
    } finally {
      setSyncingFromMeta(false);
    }
  }, [metaConnectionId, syncAudiencesFromMeta]);

  // ---- Data Fetching ----

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Use connectionId from MetaBusinessContext for Meta
      // Still check Shopify/Klaviyo connections from DB
      const [{ data: otherConns }, { data: clientData }, { data: metaConn }] = await Promise.all([
        supabase
          .from('platform_connections')
          .select('id, platform, is_active')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .in('platform', ['shopify', 'klaviyo']),
        supabase
          .from('clients')
          .select('shop_domain')
          .eq('id', clientId)
          .maybeSingle(),
        // Fallback: fetch pixel_id from DB if context doesn't have it
        !ctxPixelId
          ? supabase
              .from('platform_connections')
              .select('pixel_id')
              .eq('client_id', clientId)
              .eq('platform', 'meta')
              .eq('is_active', true)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Set DB pixel fallback
      if (!ctxPixelId && metaConn?.pixel_id) {
        setDbPixelId(metaConn.pixel_id);
      }

      const shopifyConns = (otherConns || []).filter((c) => c.platform === 'shopify');
      const klaviyoConns = (otherConns || []).filter((c) => c.platform === 'klaviyo');

      setHasMetaConnection(!!ctxConnectionId);
      setMetaConnectionId(ctxConnectionId);
      setHasShopify(shopifyConns.length > 0);
      setHasKlaviyo(klaviyoConns.length > 0);
      setKlaviyoConnectionId(klaviyoConns.length > 0 ? klaviyoConns[0].id : null);
      setShopDomain(clientData?.shop_domain || null);

      if (!ctxConnectionId) {
        setAudiences([]);
        setLoading(false);
        return;
      }

      // 2. Fetch audiences directly from Meta Graph API
      const metaAudiences = await syncAudiencesFromMeta(ctxConnectionId, true);

      setAudiences(metaAudiences);
    } catch (err) {
      // Fetch audiences error handled via toast
      toast.error('Error al cargar audiencias');
    } finally {
      setLoading(false);
    }
  }, [clientId, ctxConnectionId, lastSyncAt, syncAudiencesFromMeta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen for sync events
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [fetchData]);

  // Auto-detect pixel cuando ni context ni DB lo tienen. Pasa típicamente con
  // conexiones leadsie/bm_partner donde el sync inicial no pobló pixel_id.
  // Llamamos al action list_pixels y tomamos el primero. Mejora UX inmediata
  // sin requerir resync manual.
  const [pixelDetectError, setPixelDetectError] = useState<string | null>(null);
  const [pixelDetecting, setPixelDetecting] = useState(false);

  const detectPixel = useCallback(async () => {
    if (!ctxConnectionId) {
      setPixelDetectError('Sin conexión Meta activa');
      return;
    }
    setPixelDetecting(true);
    setPixelDetectError(null);
    console.log('[pixel-detect] llamando list_pixels con connection', ctxConnectionId);
    try {
      const { data, error } = await callApi<{ pixels?: Array<{ id: string; name: string }> }>(
        'manage-meta-audiences',
        {
          body: { connection_id: ctxConnectionId, action: 'list_pixels' },
          timeoutMs: 15_000,
        },
      );
      console.log('[pixel-detect] response', { data, error });
      if (error) {
        setPixelDetectError(typeof error === 'string' ? error : 'Error al consultar Meta');
        return;
      }
      const first = data?.pixels?.[0];
      if (first?.id) {
        setAutoFetchedPixelId(first.id);
        toast.success(`Pixel detectado: ${first.name || first.id}`);
      } else {
        setPixelDetectError('No se encontraron pixels en esta cuenta de Meta');
      }
    } catch (err: any) {
      console.error('[pixel-detect] excepción', err);
      setPixelDetectError(err?.message || 'Error desconocido');
    } finally {
      setPixelDetecting(false);
    }
  }, [ctxConnectionId]);

  // Auto-fire una vez al montar si no hay pixel
  useEffect(() => {
    if (ctxPixelId || dbPixelId || autoFetchedPixelId) return;
    if (!ctxConnectionId) return;
    detectPixel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxConnectionId, ctxPixelId, dbPixelId]);

  // ---- Filtering ----

  const filteredAudiences = useMemo(() => {
    let result = audiences.filter((a) => a.type === activeTab);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.source.toLowerCase().includes(query) ||
          (a.description && a.description.toLowerCase().includes(query)),
      );
    }

    return result.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [audiences, activeTab, searchQuery]);

  const customAudiences = useMemo(
    () => audiences.filter((a) => a.type === 'custom' && a.status === 'READY'),
    [audiences],
  );

  const tabCounts = useMemo(() => {
    return {
      custom: audiences.filter((a) => a.type === 'custom').length,
      lookalike: audiences.filter((a) => a.type === 'lookalike').length,
      saved: audiences.filter((a) => a.type === 'saved').length,
      overlap: 0,
    };
  }, [audiences]);

  // ---- Handlers ----

  const handleCreateCustomAudience = async () => {
    if (!customForm.name.trim()) {
      toast.error('Ingresa un nombre para la audiencia');
      return;
    }

    if (customForm.source === 'WEBSITE' && !pixelId) {
      toast.error('Necesitas un Meta Pixel conectado para crear audiencias de sitio web');
      return;
    }

    if (!metaConnectionId) {
      toast.error('No se encontró conexión de Meta Ads activa');
      return;
    }

    setFormSubmitting(true);

    // Special handling for Klaviyo sync — uses dedicated endpoint
    if (customForm.source === 'CUSTOMER_LIST' && customForm.customer_list_source === 'KLAVIYO') {
      try {
        if (!klaviyoConnectionId) {
          toast.error('No se encontró conexión de Klaviyo activa');
          setFormSubmitting(false);
          return;
        }

        const { data: responseData, error } = await callApi('sync-klaviyo-to-meta-audience', {
          body: {
            klaviyo_connection_id: klaviyoConnectionId,
            meta_connection_id: metaConnectionId,
            audience_name: customForm.name.trim(),
          },
        });

        if (error) {
          toast.error(`Error al sincronizar desde Klaviyo: ${typeof error === 'string' ? error : (error as any)?.message || 'Error desconocido'}`);
        } else if (responseData?.success) {
          toast.success(`Audiencia creada con ${responseData.profiles_uploaded} contactos de Klaviyo`);
          if (metaConnectionId) await syncAudiencesFromMeta(metaConnectionId, true);
          setCreateCustomOpen(false);
          setCustomForm({ ...EMPTY_CUSTOM_FORM });
        }
      } catch (err: any) {
        toast.error('Error al sincronizar desde Klaviyo');
      } finally {
        setFormSubmitting(false);
      }
      return;
    }

    try {
      // Build the nested data payload matching the edge function's expected format
      const data: Record<string, unknown> = {
        name: customForm.name.trim(),
        description: customForm.description.trim(),
        source_type: customForm.source.toLowerCase(),
      };

      if (customForm.source === 'WEBSITE') {
        // Mapeo de match_type del UI al operator de Meta API.
        const urlOperatorOf = (mt: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH'): string =>
          mt === 'CONTAINS' ? 'i_contains'
            : mt === 'STARTS_WITH' ? 'i_starts_with'
              : 'eq';

        // Convierte una PixelRule del frontend al shape exacto que Meta espera
        // dentro de rule.inclusions.rules / rule.exclusions.rules.
        const buildMetaRule = (r: typeof customForm.inclusions.rules[number]) => {
          const filters: any[] = [];
          if (r.event !== 'AllVisitors') {
            filters.push({ field: 'event', operator: 'eq', value: r.event });
          }
          if (r.url_filter && r.url_filter.value.trim()) {
            filters.push({
              field: 'url',
              operator: urlOperatorOf(r.url_filter.match_type),
              value: r.url_filter.value.trim(),
            });
          }
          const metaRule: any = {
            event_sources: [{ type: 'pixel', id: pixelId }],
            retention_seconds: r.retention_days * 86400,
          };
          if (filters.length > 0) {
            metaRule.filter = { operator: 'and', filters };
          }
          return metaRule;
        };

        // Validación: al menos una regla en inclusions.
        if (customForm.inclusions.rules.length === 0) {
          toast.error('Agregá al menos una condición en "Incluir personas que..."');
          setFormSubmitting(false);
          return;
        }

        // Validación: si una regla tiene filtro de URL, el value no puede estar vacío.
        const allRules = [...customForm.inclusions.rules, ...customForm.exclusions.rules];
        for (const r of allRules) {
          if (r.url_filter && !r.url_filter.value.trim()) {
            toast.error('Tienes un filtro de URL sin valor. Quitálo o completalo.');
            setFormSubmitting(false);
            return;
          }
        }

        const rule: any = {
          inclusions: {
            operator: customForm.inclusions.operator,
            rules: customForm.inclusions.rules.map(buildMetaRule),
          },
        };
        if (customForm.exclusions.rules.length > 0) {
          rule.exclusions = {
            operator: customForm.exclusions.operator,
            rules: customForm.exclusions.rules.map(buildMetaRule),
          };
        }

        data.rule = rule;
        data.pixel_id = pixelId;
        // El backend exige retention_days top-level — usamos el max entre
        // todas las reglas (Meta usa este valor para subtype display, las
        // retention_seconds individuales por regla son las que mandan).
        const maxRetention = Math.max(
          ...customForm.inclusions.rules.map((r) => r.retention_days),
          ...(customForm.exclusions.rules.length > 0
            ? customForm.exclusions.rules.map((r) => r.retention_days)
            : [1]),
        );
        data.retention_days = maxRetention;
      } else if (customForm.source === 'CUSTOMER_LIST') {
        data.customer_file_source = customForm.customer_list_source === 'CSV'
          ? 'USER_PROVIDED_ONLY'
          : customForm.customer_list_source;
      } else if (customForm.source === 'ENGAGEMENT') {
        // CRITICO-2: el backend (commit be7372eb / C1) exige page_id para
        // PAGE/VIDEO e ig_user_id para INSTAGRAM. Tomamos los IDs reales del
        // MetaBusinessContext (cargados desde platform_connections / Meta API).
        const engKind = customForm.engagement_type;
        if (engKind === 'PAGE' || engKind === 'VIDEO') {
          if (!ctxPageId) {
            toast.error('Conectá tu Facebook Page primero (Conexiones → Meta).');
            setFormSubmitting(false);
            return;
          }
          data.page_id = ctxPageId;
        } else if (engKind === 'INSTAGRAM') {
          if (!ctxIgAccountId) {
            toast.error('Conectá tu Instagram Business primero (Conexiones → Meta).');
            setFormSubmitting(false);
            return;
          }
          data.ig_user_id = ctxIgAccountId;
        }
        data.engagement_type = engKind;
        data.retention_days = customForm.engagement_days;
      } else if (customForm.source === 'APP_ACTIVITY') {
        data.app_activity_type = customForm.app_activity_type;
        data.retention_days = customForm.app_activity_days;
      }

      // Las suggestions de retargeting (carrito abandonado, vio sin comprar)
      // ahora se arman como inclusions+exclusions del rule builder, así que
      // siempre usamos create_custom — el legacy create_retargeting quedó
      // sin uso desde el sprint de eventos del Pixel.
      const { data: responseData, error } = await callApi('manage-meta-audiences', {
        body: {
          action: 'create_custom',
          connection_id: metaConnectionId,
          data,
        },
      });

      if (error) {
        const details = typeof error === 'string' ? error : (error as any)?.message || 'Error desconocido';
        toast.error(`Error al crear audiencia: ${details}`);
        return;
      }

      if (responseData && !responseData.success) {
        const details = responseData.details || responseData.error || 'Error desconocido de Meta';
        toast.error(`Meta rechazó la audiencia: ${details}`);
        return;
      }

      toast.success(`Audiencia "${customForm.name}" creada exitosamente`);

      // Optimistic add — use real ID from Meta if available
      const newAudience: AudienceRow = {
        id: responseData?.audience_id || crypto.randomUUID(),
        name: customForm.name.trim(),
        type: 'custom',
        size: 0,
        status: 'POPULATING',
        created_at: new Date().toISOString(),
        source: SOURCE_LABELS[customForm.source],
        description: customForm.description.trim(),
        retention_days:
          customForm.source === 'WEBSITE'
            ? Math.max(...customForm.inclusions.rules.map((r) => r.retention_days), 1)
            : undefined,
      };
      setAudiences((prev) => [newAudience, ...prev]);

      setCreateCustomOpen(false);
      setCustomForm({ ...EMPTY_CUSTOM_FORM });
    } catch (err: any) {
      // Create custom audience error handled via toast
      const msg = err?.message || err?.toString?.() || 'Error desconocido';
      toast.error(`Error al crear audiencia: ${msg}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCreateLookalike = async () => {
    if (!lookalikeForm.source_audience_id) {
      toast.error('Selecciona una audiencia de origen');
      return;
    }

    if (!metaConnectionId) {
      toast.error('No se encontró conexión de Meta Ads activa');
      return;
    }

    setFormSubmitting(true);
    try {
      const sourceAudience = audiences.find(
        (a) => a.id === lookalikeForm.source_audience_id,
      );
      const countryLabel =
        COUNTRY_OPTIONS.find((c) => c.value === lookalikeForm.country)?.label ||
        lookalikeForm.country;
      const lookName = `Lookalike ${lookalikeForm.lookalike_percent}% - ${sourceAudience?.name || 'Origen'} (${countryLabel})`;

      const { data: responseData, error } = await callApi('manage-meta-audiences', {
        body: {
          action: 'create_lookalike',
          connection_id: metaConnectionId,
          data: {
            name: lookName,
            source_audience_id: lookalikeForm.source_audience_id,
            country: lookalikeForm.country,
            ratio: lookalikeForm.lookalike_percent / 100,
          },
        },
      });

      if (error) {
        const details = typeof error === 'string' ? error : (error as any)?.message || 'Error desconocido';
        toast.error(`Error al crear lookalike: ${details}`);
        return;
      }

      if (responseData && !responseData.success) {
        const details = responseData.details || responseData.error || 'Error desconocido de Meta';
        toast.error(`Meta rechazó la audiencia: ${details}`);
        return;
      }

      toast.success(`Audiencia similar "${lookName}" creada exitosamente`);

      // Optimistic add — use real ID from Meta if available
      const reach = estimateReach(
        lookalikeForm.country,
        lookalikeForm.lookalike_percent,
      );
      const newAudience: AudienceRow = {
        id: responseData?.audience_id || crypto.randomUUID(),
        name: lookName,
        type: 'lookalike',
        size: Math.round((reach.min + reach.max) / 2),
        status: 'POPULATING',
        created_at: new Date().toISOString(),
        source: `Lookalike ${lookalikeForm.lookalike_percent}%`,
        source_audience_id: lookalikeForm.source_audience_id,
        lookalike_percent: lookalikeForm.lookalike_percent,
        country: lookalikeForm.country,
      };
      setAudiences((prev) => [newAudience, ...prev]);

      setCreateLookalikeOpen(false);
      setLookalikeForm({ ...EMPTY_LOOKALIKE_FORM });
      setActiveTab('lookalike');
    } catch (err: any) {
      // Create lookalike error handled via toast
      const msg = err?.message || err?.toString?.() || 'Error desconocido';
      toast.error(`Error al crear audiencia similar: ${msg}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCreateLookalikeFrom = (audience: AudienceRow) => {
    setLookalikeForm({
      source_audience_id: audience.id,
      country: 'CL',
      lookalike_percent: 1,
    });
    setCreateLookalikeOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (!metaConnectionId) {
      toast.error('No se encontró conexión de Meta Ads activa');
      return;
    }

    setDeleting(true);
    try {
      const { error } = await callApi('manage-meta-audiences', {
        body: {
          action: 'delete',
          connection_id: metaConnectionId,
          data: { audience_id: deleteTarget.id },
        },
      });

      if (error) {
        const details = typeof error === 'string' ? error : (error as any)?.message || 'Error desconocido';
        toast.error(`Error al eliminar audiencia: ${details}`);
        return;
      }

      setAudiences((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success(`Audiencia "${deleteTarget.name}" eliminada`);
      setDeleteTarget(null);
    } catch (err: any) {
      // Delete error handled via toast
      const msg = err?.message || err?.toString?.() || 'Error desconocido';
      toast.error(`Error al eliminar audiencia: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleSuggestionSelect = (suggestion: AudienceSuggestion) => {
    // The "lookalike-buyers" suggestion opens the lookalike dialog instead
    if (suggestion.id === 'lookalike-buyers') {
      setLookalikeForm({
        source_audience_id: customAudiences[0]?.id || '',
        country: 'CL',
        lookalike_percent: 1,
      });
      setCreateLookalikeOpen(true);
      return;
    }

    setCustomForm({
      ...EMPTY_CUSTOM_FORM,
      ...suggestion.prefill,
    });
    setCreateCustomOpen(true);
  };

  // ---- Render ----

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // No Meta connection
  if (!hasMetaConnection) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin conexión a Meta Ads</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Conecta tu cuenta de Meta Ads desde la sección de{' '}
            <strong>Conexiones</strong> para gestionar audiencias y segmentos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scope alert */}
      <MetaScopeAlert clientId={clientId} requiredFeature="audiences" compact />

      {/* ----------------------------------------------------------------- */}
      {/* Header */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Audiencias y Segmentos
          </h2>
          <p className="text-muted-foreground text-sm">
            {audiences.length} audiencia{audiences.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncFromMeta}
            disabled={syncingFromMeta}
            title="Sincronizar audiencias desde Meta"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncingFromMeta ? 'animate-spin' : ''}`} />
            {syncingFromMeta ? 'Sincronizando...' : 'Sincronizar Meta'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setLookalikeForm({ ...EMPTY_LOOKALIKE_FORM });
              setCreateLookalikeOpen(true);
            }}
          >
            <Copy className="w-4 h-4 mr-2" />
            Crear Lookalike
          </Button>
          <Button
            onClick={() => {
              setCustomForm({ ...EMPTY_CUSTOM_FORM });
              setCreateCustomOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Audiencia
          </Button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Smart Suggestions */}
      {/* ----------------------------------------------------------------- */}
      <AudienceSuggestions
        hasShopify={hasShopify}
        hasKlaviyo={hasKlaviyo}
        onSelect={handleSuggestionSelect}
      />

      {/* ----------------------------------------------------------------- */}
      {/* Tab Navigation */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                  transition-colors duration-150
                  ${
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                {tab.label}
                {count > 0 && (
                  <Badge
                    variant={isActive ? 'default' : 'secondary'}
                    className="h-5 min-w-[20px] text-[10px] px-1.5"
                  >
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar audiencia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Overlap Tab — dedicated panel */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'overlap' && (
        <AudienceOverlapViewer clientId={clientId} />
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Audience List */}
      {/* ----------------------------------------------------------------- */}
      {activeTab !== 'overlap' && filteredAudiences.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">
              {audiences.filter((a) => a.type === activeTab).length === 0
                ? `Sin ${TAB_CONFIG.find((t) => t.key === activeTab)?.label?.toLowerCase() || 'audiencias'}`
                : 'Sin resultados'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {audiences.filter((a) => a.type === activeTab).length === 0
                ? activeTab === 'custom'
                  ? 'Crea tu primera audiencia personalizada para comenzar.'
                  : activeTab === 'lookalike'
                    ? 'Crea una audiencia similar basada en tus audiencias personalizadas.'
                    : 'Las audiencias guardadas aparecen aquí al asignarlas a campañas.'
                : 'Intenta con un término de búsqueda diferente.'}
            </p>
            {activeTab === 'custom' &&
              audiences.filter((a) => a.type === 'custom').length === 0 && (
                <Button
                  className="mt-4"
                  onClick={() => {
                    setCustomForm({ ...EMPTY_CUSTOM_FORM });
                    setCreateCustomOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Audiencia
                </Button>
              )}
          </CardContent>
        </Card>
      ) : activeTab !== 'overlap' ? (
        <div className="space-y-3">
          {filteredAudiences.map((audience) => (
            <Card
              key={audience.id}
              className="hover:shadow-sm transition-shadow"
            >
              <CardContent className="py-4 px-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-medium text-sm truncate max-w-[300px]">
                        {audience.name}
                      </h4>
                      <StatusBadge status={audience.status} />
                      <TypeBadge type={audience.type} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>
                        Tamaño:{' '}
                        <span className="font-medium text-foreground">
                          {audience.size > 0
                            ? formatNumber(audience.size)
                            : 'Calculando...'}
                        </span>
                      </span>
                      <span>
                        Fuente:{' '}
                        <span className="font-medium text-foreground">
                          {audience.source}
                        </span>
                      </span>
                      <span>Creada: {formatDate(audience.created_at)}</span>
                      {audience.lookalike_percent && (
                        <span>
                          Similitud:{' '}
                          <span className="font-medium text-foreground">
                            {audience.lookalike_percent}%
                          </span>
                        </span>
                      )}
                      {audience.country && (
                        <span>
                          País:{' '}
                          <span className="font-medium text-foreground">
                            {COUNTRY_OPTIONS.find((c) => c.value === audience.country)
                              ?.label || audience.country}
                          </span>
                        </span>
                      )}
                      {audience.retention_days && (
                        <span>
                          Retención:{' '}
                          <span className="font-medium text-foreground">
                            {audience.retention_days} días
                          </span>
                        </span>
                      )}
                    </div>
                    {audience.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {audience.description}
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Edit - only for custom audiences */}
                    {audience.type === 'custom' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Editar audiencia"
                        title="Editar"
                        onClick={() => {
                          const sourceMap: Record<string, CustomAudienceSource> = {
                            'Sitio Web (Pixel)': 'WEBSITE',
                            'Lista de Clientes': 'CUSTOMER_LIST',
                            'Interacción': 'ENGAGEMENT',
                            'Actividad en App': 'APP_ACTIVITY',
                          };
                          const resolvedSource = sourceMap[audience.source] || (audience.source as CustomAudienceSource) || 'WEBSITE';
                          setCustomForm({
                            name: audience.name,
                            description: audience.description || '',
                            source: resolvedSource,
                            inclusions: {
                              operator: 'or',
                              rules: [makePixelRule({ retention_days: audience.retention_days || 30 })],
                            },
                            exclusions: { operator: 'or', rules: [] },
                            customer_list_source: 'CSV',
                            engagement_type: 'PAGE',
                            engagement_days: 30,
                            app_activity_type: 'PURCHASE',
                            app_activity_days: 30,
                          });
                          setCreateCustomOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* Create Lookalike from Custom */}
                    {audience.type === 'custom' && audience.status === 'READY' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Crear Audiencia Similar"
                        title="Crear Audiencia Similar"
                        onClick={() => handleCreateLookalikeFrom(audience)}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label="Eliminar audiencia"
                      title="Eliminar"
                      onClick={() => setDeleteTarget(audience)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* CREATE CUSTOM AUDIENCE DIALOG */}
      {/* ================================================================= */}
      <CreateCustomAudienceDialog
        open={createCustomOpen}
        onOpenChange={setCreateCustomOpen}
        formData={customForm}
        setFormData={setCustomForm}
        onSubmit={handleCreateCustomAudience}
        submitting={formSubmitting}
        pixelId={pixelId}
        shopDomain={shopDomain}
        pageId={ctxPageId}
        pageName={ctxPageName}
        igAccountId={ctxIgAccountId}
        igAccountName={ctxIgAccountName}
      />

      {/* ================================================================= */}
      {/* CREATE LOOKALIKE DIALOG */}
      {/* ================================================================= */}
      <CreateLookalikeDialog
        open={createLookalikeOpen}
        onOpenChange={setCreateLookalikeOpen}
        formData={lookalikeForm}
        setFormData={setLookalikeForm}
        customAudiences={customAudiences}
        onSubmit={handleCreateLookalike}
        submitting={formSubmitting}
      />

      {/* ================================================================= */}
      {/* DELETE CONFIRMATION DIALOG */}
      {/* ================================================================= */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Eliminar Audiencia</DialogTitle>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Esta acción no se puede deshacer
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se eliminará permanentemente la audiencia{' '}
                    <strong>"{deleteTarget.name}"</strong> y ya no estará
                    disponible para tus campañas.
                  </p>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <div className="flex justify-between py-1">
                  <span>Tipo:</span>
                  <TypeBadge type={deleteTarget.type} />
                </div>
                <div className="flex justify-between py-1">
                  <span>Tamaño:</span>
                  <span className="font-medium text-foreground">
                    {deleteTarget.size > 0
                      ? formatNumber(deleteTarget.size)
                      : '--'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Creada:</span>
                  <span className="font-medium text-foreground">
                    {formatDate(deleteTarget.created_at)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar Audiencia'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
