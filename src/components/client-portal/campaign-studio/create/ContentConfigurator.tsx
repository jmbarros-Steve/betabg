import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Package, Plus, X, ImagePlus, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { CampaignType } from '../templates/TemplatePresets';
import { CAMPAIGN_TEMPLATES } from '../templates/TemplatePresets';
import type { BrandIdentity, ProductItem } from '../templates/BrandHtmlGenerator';
import type { CampaignData } from './CampaignCreationWizard';

interface ContentConfiguratorProps {
  clientId: string;
  brand: BrandIdentity;
  campaignType: CampaignType;
  campaignData: CampaignData;
  onUpdate: (data: Partial<CampaignData>) => void;
}

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  image: string;
  products_count: number;
  type: string;
}

export function ContentConfigurator({
  clientId,
  brand,
  campaignType,
  campaignData,
  onUpdate,
}: ContentConfiguratorProps) {
  const template = CAMPAIGN_TEMPLATES[campaignType];
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [shopifyConnectionId, setShopifyConnectionId] = useState<string | null>(null);
  const [klaviyoConnectionId, setKlaviyoConnectionId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);
  const [aiFeedback, setAiFeedback] = useState<{ type: string; message: string }[]>([]);

  // Check for connections on mount
  useEffect(() => {
    async function checkConnections() {
      const [shopify, klaviyo] = await Promise.all([
        supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'klaviyo')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
      ]);
      if (shopify.data) setShopifyConnectionId(shopify.data.id);
      if (klaviyo.data) setKlaviyoConnectionId(klaviyo.data.id);
    }
    checkConnections();
  }, [clientId]);

  // Auto-load products for certain campaign types
  useEffect(() => {
    if (!shopifyConnectionId) return;
    if (campaignData.products.length > 0) return;

    if (campaignType === 'best_sellers' || campaignType === 'most_viewed' || campaignType === 'new_arrivals') {
      loadProducts();
    }
    if (campaignType === 'collection') {
      loadCollections();
    }
  }, [shopifyConnectionId, campaignType]);

  const loadProducts = useCallback(async () => {
    if (!shopifyConnectionId) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-products', {
        body: { connectionId: shopifyConnectionId },
      });
      if (error) throw error;

      const rawProducts = data?.products || [];
      const shopDomain = brand.shopUrl
        ? brand.shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : '';

      const mapped: ProductItem[] = rawProducts
        .slice(0, template.defaultProductCount)
        .map((p: any) => ({
          title: p.title || 'Producto',
          image_url: p.image?.src || p.images?.[0]?.src || '',
          price: p.variants?.[0]?.price
            ? `$${parseFloat(p.variants[0].price).toLocaleString('es-CL')}`
            : '',
          handle: p.handle || '',
          url: shopDomain ? `https://${shopDomain}/products/${p.handle}` : '#',
        }));

      onUpdate({ products: mapped });
    } catch (err: any) {
      console.error('Error loading products:', err);
      toast.error('Error al cargar productos de Shopify');
    } finally {
      setLoadingProducts(false);
    }
  }, [shopifyConnectionId, brand.shopUrl, template.defaultProductCount, onUpdate]);

  const loadCollections = useCallback(async () => {
    if (!shopifyConnectionId) return;
    setLoadingCollections(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-collections', {
        body: { connectionId: shopifyConnectionId },
      });
      if (error) throw error;
      setCollections(data?.collections || []);
    } catch (err: any) {
      console.error('Error loading collections:', err);
      toast.error('Error al cargar colecciones de Shopify');
    } finally {
      setLoadingCollections(false);
    }
  }, [shopifyConnectionId]);

  const loadCollectionProducts = useCallback(async (collectionId: string, collectionTitle: string) => {
    if (!shopifyConnectionId) return;
    setLoadingProducts(true);
    onUpdate({ collectionId, collectionName: collectionTitle });
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-collections', {
        body: { connectionId: shopifyConnectionId, collectionId },
      });
      if (error) throw error;

      const shopDomain = brand.shopUrl
        ? brand.shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : '';

      const mapped: ProductItem[] = (data?.products || [])
        .slice(0, template.defaultProductCount)
        .map((p: any) => ({
          title: p.title || 'Producto',
          image_url: p.image_url || '',
          price: p.price ? `$${parseFloat(p.price).toLocaleString('es-CL')}` : '',
          handle: p.handle || '',
          url: p.url || (shopDomain ? `https://${shopDomain}/products/${p.handle}` : '#'),
        }));

      onUpdate({ products: mapped });
    } catch (err: any) {
      console.error('Error loading collection products:', err);
      toast.error('Error al cargar productos de la coleccion');
    } finally {
      setLoadingProducts(false);
    }
  }, [shopifyConnectionId, brand.shopUrl, template.defaultProductCount, onUpdate]);

  const removeProduct = useCallback((index: number) => {
    onUpdate({ products: campaignData.products.filter((_, i) => i !== index) });
  }, [campaignData.products, onUpdate]);

  // AI: Generate subject lines
  const generateSubjects = useCallback(async () => {
    if (!klaviyoConnectionId) {
      toast.error('Conecta Klaviyo para usar la IA de Steve');
      return;
    }
    setAiLoading('subjects');
    try {
      const { data, error } = await supabase.functions.invoke('steve-email-content', {
        body: {
          connectionId: klaviyoConnectionId,
          action: 'generate_subject',
          campaignType,
          brandName: brand.aesthetic || 'tu marca',
          productNames: campaignData.products.map(p => p.title).slice(0, 5),
        },
      });
      if (error) throw error;
      setAiSubjects(data?.subjects || []);
      if (data?.previewTexts?.[0] && !campaignData.previewText) {
        onUpdate({ previewText: data.previewTexts[0] });
      }
    } catch (err: any) {
      console.error('Error generating subjects:', err);
      toast.error('Error al generar subjects con Steve');
    } finally {
      setAiLoading(null);
    }
  }, [klaviyoConnectionId, campaignType, brand, campaignData.products, campaignData.previewText, onUpdate]);

  // AI: Analyze content
  const analyzeContent = useCallback(async () => {
    if (!klaviyoConnectionId) return;
    setAiLoading('analyze');
    try {
      const { data, error } = await supabase.functions.invoke('steve-email-content', {
        body: {
          connectionId: klaviyoConnectionId,
          action: 'analyze_content',
          subject: campaignData.subject,
          previewText: campaignData.previewText,
        },
      });
      if (error) throw error;
      setAiFeedback(data?.feedback || []);
    } catch (err: any) {
      console.error('Error analyzing:', err);
      toast.error('Error al analizar contenido');
    } finally {
      setAiLoading(null);
    }
  }, [klaviyoConnectionId, campaignData.subject, campaignData.previewText]);

  // Subject length indicator
  const subjectLength = campaignData.subject.length;
  const subjectStatus = subjectLength === 0 ? 'empty' : subjectLength <= 50 ? 'good' : subjectLength <= 70 ? 'warning' : 'error';

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Contenido de la Campana</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configura el asunto, textos y productos. Steve te ayuda a optimizar todo.
        </p>
      </div>

      {/* Subject and Preview Text */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="subject">Asunto del email</Label>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium ${
                subjectStatus === 'good' ? 'text-green-600' :
                subjectStatus === 'warning' ? 'text-yellow-600' :
                subjectStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'
              }`}>
                {subjectLength}/50 chars
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={generateSubjects}
                disabled={aiLoading === 'subjects'}
              >
                {aiLoading === 'subjects' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Steve sugiere
              </Button>
            </div>
          </div>
          <Input
            id="subject"
            value={campaignData.subject}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder="ej: Nuevos productos esta semana"
            className={subjectStatus === 'error' ? 'border-red-300' : ''}
          />
          {/* AI Subject suggestions */}
          {aiSubjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {aiSubjects.map((s, i) => (
                <button
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-full border hover:bg-primary hover:text-white transition-colors cursor-pointer"
                  onClick={() => {
                    onUpdate({ subject: s });
                    setAiSubjects([]);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="previewText">Texto de vista previa</Label>
            <span className={`text-[10px] font-medium ${
              (campaignData.previewText?.length || 0) <= 90 ? 'text-green-600' : 'text-yellow-600'
            }`}>
              {campaignData.previewText?.length || 0}/90 chars
            </span>
          </div>
          <Input
            id="previewText"
            value={campaignData.previewText}
            onChange={(e) => onUpdate({ previewText: e.target.value })}
            placeholder="Texto que aparece junto al asunto en la bandeja de entrada"
          />
          {!campaignData.previewText && campaignData.subject && (
            <p className="text-[10px] text-yellow-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              No dejes el preview text vacio — mejora tu open rate
            </p>
          )}
        </div>
      </div>

      {/* Title and Intro */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titulo del email</Label>
          <Input
            id="title"
            value={campaignData.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Titulo principal del email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="introText">Texto introductorio</Label>
          <Textarea
            id="introText"
            value={campaignData.introText}
            onChange={(e) => onUpdate({ introText: e.target.value })}
            placeholder="Texto introductorio para tu audiencia..."
            rows={3}
          />
        </div>
      </div>

      {/* Hero Image URL — available for ALL template types */}
      <div className="space-y-2">
        <Label htmlFor="heroImage">
          <ImagePlus className="w-4 h-4 inline mr-1" />
          Imagen banner (URL)
        </Label>
        <Input
          id="heroImage"
          value={campaignData.heroImageUrl}
          onChange={(e) => onUpdate({ heroImageUrl: e.target.value })}
          placeholder="https://..."
        />
        {campaignData.heroImageUrl && (
          <img
            src={campaignData.heroImageUrl}
            alt="Hero preview"
            className="w-full max-h-40 object-cover rounded-lg border mt-2"
          />
        )}
      </div>

      {/* Collection selector */}
      {campaignType === 'collection' && (
        <div className="space-y-2">
          <Label>Coleccion de Shopify</Label>
          {loadingCollections ? (
            <Skeleton className="h-10 w-full" />
          ) : collections.length === 0 ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">No se encontraron colecciones.</p>
              <Button variant="outline" size="sm" onClick={loadCollections} disabled={!shopifyConnectionId}>
                Reintentar
              </Button>
            </div>
          ) : (
            <Select
              value={campaignData.collectionId}
              onValueChange={(val) => {
                const col = collections.find(c => String(c.id) === val);
                if (col) loadCollectionProducts(val, col.title);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una coleccion" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((col) => (
                  <SelectItem key={col.id} value={String(col.id)}>
                    {col.title} ({col.products_count} productos)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Coupon fields */}
      {campaignType === 'promotional' && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Badge variant="secondary">Cupon</Badge>
            Configuracion del descuento
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="couponCode">Codigo del cupon</Label>
              <Input
                id="couponCode"
                value={campaignData.couponCode}
                onChange={(e) => onUpdate({ couponCode: e.target.value.toUpperCase() })}
                placeholder="DESCUENTO20"
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="couponExpiry">Fecha de expiracion</Label>
              <Input
                id="couponExpiry"
                type="date"
                value={campaignData.couponExpiry}
                onChange={(e) => onUpdate({ couponExpiry: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="couponDescription">Descripcion del descuento</Label>
            <Input
              id="couponDescription"
              value={campaignData.couponDescription}
              onChange={(e) => onUpdate({ couponDescription: e.target.value })}
              placeholder="20% de descuento en toda la tienda"
            />
          </div>
        </div>
      )}

      {/* Custom content */}
      {campaignType === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor="customContent">Contenido libre</Label>
          <Textarea
            id="customContent"
            value={campaignData.introText}
            onChange={(e) => onUpdate({ introText: e.target.value })}
            placeholder="Escribe el contenido de tu email. Puedes agregar un bloque de productos abajo."
            rows={6}
          />
        </div>
      )}

      {/* Products section */}
      {campaignType !== 'custom' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Productos ({campaignData.products.length})
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={loadProducts}
              disabled={loadingProducts || !shopifyConnectionId}
            >
              {loadingProducts ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              {campaignData.products.length > 0 ? 'Recargar' : 'Cargar productos'}
            </Button>
          </div>

          {loadingProducts ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: template.defaultProductCount }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : campaignData.products.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg border-dashed">
              {shopifyConnectionId
                ? 'Haz clic en "Cargar productos" para importar desde Shopify'
                : 'Conecta Shopify para cargar productos automaticamente'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {campaignData.products.map((product, idx) => (
                <Card key={`${product.handle}-${idx}`} className="relative group overflow-hidden">
                  <button
                    className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeProduct(idx)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <CardContent className="p-2">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-16 object-cover rounded mb-1"
                      />
                    ) : (
                      <div className="w-full h-16 bg-muted rounded mb-1 flex items-center justify-center">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-[11px] font-medium truncate">{product.title}</p>
                    {product.price && (
                      <p className="text-[10px] text-muted-foreground">{product.price}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ctaText">Texto del boton CTA</Label>
          <Input
            id="ctaText"
            value={campaignData.ctaText}
            onChange={(e) => onUpdate({ ctaText: e.target.value })}
            placeholder="ej: Ver productos, Comprar ahora"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ctaUrl">URL del boton CTA</Label>
          <Input
            id="ctaUrl"
            value={campaignData.ctaUrl}
            onChange={(e) => onUpdate({ ctaUrl: e.target.value })}
            placeholder={brand.shopUrl || 'https://tu-tienda.com'}
          />
        </div>
      </div>

      {/* AI Content Analysis */}
      {campaignData.subject && (
        <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Analisis de Steve
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={analyzeContent}
              disabled={aiLoading === 'analyze'}
            >
              {aiLoading === 'analyze' ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Analizar
            </Button>
          </div>
          {aiFeedback.length > 0 ? (
            <div className="space-y-1.5">
              {aiFeedback.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {f.type === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                  ) : f.type === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                  )}
                  <span className="text-muted-foreground">{f.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Haz clic en "Analizar" para que Steve revise tu contenido y te de recomendaciones.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
