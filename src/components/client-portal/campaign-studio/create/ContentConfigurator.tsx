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
import { Loader2, Package, Plus, X, ImagePlus } from 'lucide-react';
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
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Check for Shopify connection on mount
  useEffect(() => {
    async function checkConnection() {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (data) {
        setConnectionId(data.id);
      }
    }
    checkConnection();
  }, [clientId]);

  // Auto-load products for certain campaign types
  useEffect(() => {
    if (!connectionId) return;
    if (campaignData.products.length > 0) return;

    if (campaignType === 'best_sellers' || campaignType === 'most_viewed' || campaignType === 'new_arrivals') {
      loadProducts();
    }
    if (campaignType === 'collection') {
      loadCollections();
    }
  }, [connectionId, campaignType]);

  const loadProducts = useCallback(async () => {
    if (!connectionId) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-products', {
        body: { connectionId },
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
  }, [connectionId, brand.shopUrl, template.defaultProductCount, onUpdate]);

  const loadCollections = useCallback(async () => {
    if (!connectionId) return;
    setLoadingCollections(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-collections', {
        body: { connectionId },
      });
      if (error) throw error;
      setCollections(data?.collections || []);
    } catch (err: any) {
      console.error('Error loading collections:', err);
      toast.error('Error al cargar colecciones de Shopify');
    } finally {
      setLoadingCollections(false);
    }
  }, [connectionId]);

  const loadCollectionProducts = useCallback(async (collectionId: string, collectionTitle: string) => {
    if (!connectionId) return;
    setLoadingProducts(true);
    onUpdate({ collectionId, collectionName: collectionTitle });
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-collections', {
        body: { connectionId, collectionId },
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
  }, [connectionId, brand.shopUrl, template.defaultProductCount, onUpdate]);

  const removeProduct = useCallback((index: number) => {
    onUpdate({ products: campaignData.products.filter((_, i) => i !== index) });
  }, [campaignData.products, onUpdate]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Contenido de la Campana</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configura el asunto, textos y productos para tu email de tipo "{template.label}".
        </p>
      </div>

      {/* Subject and Preview Text */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject">Asunto del email</Label>
          <Input
            id="subject"
            value={campaignData.subject}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder={template.defaultSubject}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="previewText">Texto de vista previa</Label>
          <Input
            id="previewText"
            value={campaignData.previewText}
            onChange={(e) => onUpdate({ previewText: e.target.value })}
            placeholder="Texto que aparece junto al asunto en la bandeja de entrada"
          />
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
            placeholder={template.defaultTitle}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="introText">Texto introductorio</Label>
          <Textarea
            id="introText"
            value={campaignData.introText}
            onChange={(e) => onUpdate({ introText: e.target.value })}
            placeholder={template.defaultIntro}
            rows={3}
          />
        </div>
      </div>

      {/* Collection selector (only for 'collection' type) */}
      {campaignType === 'collection' && (
        <div className="space-y-2">
          <Label>Coleccion de Shopify</Label>
          {loadingCollections ? (
            <Skeleton className="h-10 w-full" />
          ) : collections.length === 0 ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">No se encontraron colecciones.</p>
              <Button variant="outline" size="sm" onClick={loadCollections} disabled={!connectionId}>
                Reintentar
              </Button>
            </div>
          ) : (
            <Select
              value={campaignData.collectionId}
              onValueChange={(val) => {
                const col = collections.find(c => String(c.id) === val);
                if (col) {
                  loadCollectionProducts(val, col.title);
                }
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

      {/* Coupon fields (only for 'promotional' type) */}
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

      {/* Custom content (only for 'custom' type) */}
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

      {/* Hero Image URL */}
      {(campaignType === 'collection' || campaignType === 'new_arrivals') && (
        <div className="space-y-2">
          <Label htmlFor="heroImage">
            <ImagePlus className="w-4 h-4 inline mr-1" />
            Imagen hero (URL)
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
              disabled={loadingProducts || !connectionId}
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
              {connectionId
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
            placeholder={template.defaultCtaText}
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
    </div>
  );
}
