import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Palette, Type, Image, ImagePlus, MousePointerClick, Share2, Heart,
  Save, Loader2, CheckCircle2, Wand2, Package, Plus, X,
} from 'lucide-react';
import type { BrandIdentity, ProductItem } from '../templates/BrandHtmlGenerator';
import { ColorPalette } from './ColorPalette';
import { FontSelector } from './FontSelector';
import { TemplatePreview } from './TemplatePreview';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface TemplateBuilderProps {
  clientId: string;
  onBrandUpdate: (brand: BrandIdentity) => void;
}

const DEFAULT_COLORS = {
  primary: '#1a1a2e',
  accent: '#e94560',
  secondaryBg: '#fef2f4',
  footerBg: '#f4f4f8',
  border: '#e5e7eb',
  text: '#1a1a2e',
  textLight: '#6b7280',
};

const COLOR_LABELS: Record<string, string> = {
  primary: 'Color principal',
  accent: 'Color acento (botones)',
  secondaryBg: 'Fondo secundario',
  footerBg: 'Fondo footer',
  border: 'Bordes',
  text: 'Texto principal',
  textLight: 'Texto secundario',
};

const BUTTON_STYLES = [
  { value: 'pill', label: 'Pill', radius: 24 },
  { value: 'rounded', label: 'Redondeado', radius: 8 },
  { value: 'square', label: 'Cuadrado', radius: 0 },
] as const;

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/tu-marca' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/tu-marca' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@tu-marca' },
  { key: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/tu-marca' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@tu-marca' },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/tu-marca' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/56912345678' },
];

const ALL_CONTENT_SECTIONS = ['hero', 'textos', 'productos', 'cta', 'despedida', 'social'];
const ALL_BRAND_SECTIONS = ['colores', 'tipografia', 'logo', 'botones'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TemplateBuilder({ clientId, onBrandUpdate }: TemplateBuilderProps) {
  /* ---------- Brand state (persisted) ---------- */
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [headingFont, setHeadingFont] = useState('Inter');
  const [headingType, setHeadingType] = useState('sans-serif');
  const [bodyFont, setBodyFont] = useState('Inter');
  const [bodyType, setBodyType] = useState('sans-serif');
  const [logoUrl, setLogoUrl] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [buttonStyle, setButtonStyle] = useState('rounded');
  const [buttonRadius, setButtonRadius] = useState(8);
  const [socialLinks, setSocialLinks] = useState({
    instagram: '', facebook: '', tiktok: '', twitter: '',
    youtube: '', pinterest: '', whatsapp: '',
  });
  const [farewellMessage, setFarewellMessage] = useState('');
  const [senderName, setSenderName] = useState('');

  /* ---------- UI / persistence state ---------- */
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  /* ---------- Sample / content state (preview-only) ---------- */
  const [sampleTitle, setSampleTitle] = useState('');
  const [sampleIntro, setSampleIntro] = useState('');
  const [sampleHeroUrl, setSampleHeroUrl] = useState('');
  const [sampleCtaText, setSampleCtaText] = useState('');
  const [sampleCtaUrl, setSampleCtaUrl] = useState('');
  const [sampleProducts, setSampleProducts] = useState<ProductItem[]>([]);
  const [shopifyConnectionId, setShopifyConnectionId] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Load template + Shopify connection on mount                      */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    async function loadTemplate() {
      setLoading(true);

      // Load from email_templates (is_default)
      const { data: tmpl } = await supabase
        .from('email_templates')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_default', true)
        .maybeSingle();

      // Also load brand_identity from clients
      const { data: client } = await supabase
        .from('clients')
        .select('brand_identity, logo_url, shop_domain, website_url')
        .eq('id', clientId)
        .maybeSingle();

      if (tmpl) {
        setTemplateId(tmpl.id);
        if (tmpl.primary_color) setColors(prev => ({ ...prev, primary: tmpl.primary_color! }));
        if (tmpl.secondary_color) setColors(prev => ({ ...prev, secondaryBg: tmpl.secondary_color! }));
        if (tmpl.accent_color) setColors(prev => ({ ...prev, accent: tmpl.accent_color! }));
        if (tmpl.logo_url) setLogoUrl(tmpl.logo_url);

        // Parse font_family JSON
        if (tmpl.font_family) {
          try {
            const fonts = JSON.parse(tmpl.font_family);
            if (fonts.heading) { setHeadingFont(fonts.heading); setHeadingType(fonts.headingType || 'sans-serif'); }
            if (fonts.body) { setBodyFont(fonts.body); setBodyType(fonts.bodyType || 'sans-serif'); }
          } catch { /* ignore */ }
        }

        // Parse content_blocks JSON for social, farewell, button
        if (tmpl.content_blocks) {
          try {
            const blocks = typeof tmpl.content_blocks === 'string'
              ? JSON.parse(tmpl.content_blocks)
              : tmpl.content_blocks;
            if (blocks.socialLinks) setSocialLinks(prev => ({ ...prev, ...blocks.socialLinks }));
            if (blocks.farewellMessage) setFarewellMessage(blocks.farewellMessage);
            if (blocks.senderName) setSenderName(blocks.senderName);
            if (blocks.buttonStyle) setButtonStyle(blocks.buttonStyle);
            if (blocks.buttonRadius !== undefined) setButtonRadius(blocks.buttonRadius);
            if (blocks.colors) setColors(prev => ({ ...prev, ...blocks.colors }));
          } catch { /* ignore */ }
        }
      } else if (client?.brand_identity) {
        // Fallback: load from brand_identity
        const bi = client.brand_identity as any;
        if (bi.colors) setColors(prev => ({ ...prev, ...bi.colors }));
        if (bi.fonts) {
          if (bi.fonts.heading) { setHeadingFont(bi.fonts.heading); setHeadingType(bi.fonts.headingType || 'sans-serif'); }
          if (bi.fonts.body) { setBodyFont(bi.fonts.body); setBodyType(bi.fonts.bodyType || 'sans-serif'); }
        }
        if (bi.logoUrl) setLogoUrl(bi.logoUrl);
        if (bi.shopUrl) setShopUrl(bi.shopUrl);
        if (bi.socialLinks) setSocialLinks(prev => ({ ...prev, ...bi.socialLinks }));
        if (bi.farewellMessage) setFarewellMessage(bi.farewellMessage);
        if (bi.senderName) setSenderName(bi.senderName);
        if (bi.buttons) {
          setButtonStyle(bi.buttons.style || 'rounded');
          setButtonRadius(bi.buttons.borderRadius ?? 8);
        }
      }

      // Set shop URL from client data
      if (client?.shop_domain && !shopUrl) {
        setShopUrl(`https://${client.shop_domain}`);
      } else if (client?.website_url && !shopUrl) {
        setShopUrl(client.website_url);
      }
      if (client?.logo_url && !logoUrl) {
        setLogoUrl(client.logo_url);
      }

      // Check for Shopify connection
      const { data: shopifyConn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (shopifyConn) setShopifyConnectionId(shopifyConn.id);

      setLoading(false);
    }
    loadTemplate();
  }, [clientId]);

  /* ---------------------------------------------------------------- */
  /*  Derived brand object                                             */
  /* ---------------------------------------------------------------- */
  const currentBrand: BrandIdentity = {
    colors,
    fonts: { heading: headingFont, headingType, body: bodyFont, bodyType },
    buttons: { borderRadius: buttonRadius, height: 44, style: buttonStyle },
    aesthetic: '',
    logoUrl,
    shopUrl,
    socialLinks,
    farewellMessage,
    senderName,
  };

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */
  const handleColorChange = useCallback((key: string, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSocialChange = useCallback((platform: string, url: string) => {
    setSocialLinks(prev => ({ ...prev, [platform]: url }));
    setSaved(false);
  }, []);

  const loadProducts = async () => {
    if (!shopifyConnectionId) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await callApi('fetch-shopify-products', {
        body: { connectionId: shopifyConnectionId },
      });
      if (error) throw new Error(error);
      const rawProducts = data?.products || [];
      const shopDomain = shopUrl ? shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
      const mapped = rawProducts.slice(0, 6).map((p: any) => ({
        title: p.title || 'Producto',
        image_url: p.image?.src || p.images?.[0]?.src || '',
        price: p.variants?.[0]?.price ? `$${parseFloat(p.variants[0].price).toLocaleString('es-CL')}` : '',
        handle: p.handle || '',
        url: shopDomain ? `https://${shopDomain}/products/${p.handle}` : '#',
      }));
      setSampleProducts(mapped);
    } catch (err) {
      console.error('Error loading products:', err);
      toast.error('Error al cargar productos');
    } finally {
      setLoadingProducts(false);
    }
  };

  const removeProduct = (index: number) => {
    setSampleProducts(prev => prev.filter((_, i) => i !== index));
  };

  /* ---------------------------------------------------------------- */
  /*  Save                                                             */
  /* ---------------------------------------------------------------- */
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const templateData = {
        client_id: clientId,
        name: 'Template Principal',
        primary_color: colors.primary,
        secondary_color: colors.secondaryBg,
        accent_color: colors.accent,
        button_color: colors.accent,
        button_text_color: '#ffffff',
        logo_url: logoUrl,
        font_family: JSON.stringify({ heading: headingFont, headingType, body: bodyFont, bodyType }),
        content_blocks: JSON.stringify({
          colors,
          socialLinks,
          farewellMessage,
          senderName,
          buttonStyle,
          buttonRadius,
        }),
        is_default: true,
        updated_at: new Date().toISOString(),
      };

      if (templateId) {
        const { error } = await supabase
          .from('email_templates')
          .update(templateData)
          .eq('id', templateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('email_templates')
          .insert(templateData)
          .select('id')
          .single();
        if (error) throw error;
        setTemplateId(data.id);
      }

      // Also update clients.brand_identity
      const brandIdentity = {
        colors,
        fonts: { heading: headingFont, headingType, body: bodyFont, bodyType },
        buttons: { borderRadius: buttonRadius, height: 44, style: buttonStyle },
        logoUrl,
        shopUrl,
        socialLinks,
        farewellMessage,
        senderName,
      };

      await supabase
        .from('clients')
        .update({ brand_identity: brandIdentity as any })
        .eq('id', clientId);

      onBrandUpdate(currentBrand);
      setSaved(true);
      toast.success('Template guardado');
    } catch (err: any) {
      console.error('Error saving template:', err);
      toast.error('Error al guardar el template');
    } finally {
      setSaving(false);
    }
  }, [clientId, templateId, colors, headingFont, headingType, bodyFont, bodyType, logoUrl, shopUrl, buttonStyle, buttonRadius, socialLinks, farewellMessage, senderName, currentBrand, onBrandUpdate]);

  /* ---------------------------------------------------------------- */
  /*  Load from brief                                                  */
  /* ---------------------------------------------------------------- */
  const loadFromBrief = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('brand_identity')
      .eq('id', clientId)
      .maybeSingle();

    if (data?.brand_identity) {
      const bi = data.brand_identity as any;
      if (bi.colors) setColors(prev => ({ ...prev, ...bi.colors }));
      if (bi.fonts) {
        if (bi.fonts.heading) { setHeadingFont(bi.fonts.heading); setHeadingType(bi.fonts.headingType || 'sans-serif'); }
        if (bi.fonts.body) { setBodyFont(bi.fonts.body); setBodyType(bi.fonts.bodyType || 'sans-serif'); }
      }
      if (bi.logoUrl) setLogoUrl(bi.logoUrl);
      if (bi.shopUrl) setShopUrl(bi.shopUrl);
      toast.success('Colores y fuentes cargados desde el brief');
      setSaved(false);
    } else {
      toast.info('No hay datos de brief disponibles');
    }
  }, [clientId]);

  /* ---------------------------------------------------------------- */
  /*  Loading state                                                    */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando template...</p>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */
  const colorFields = Object.entries(colors).map(([key, value]) => ({
    key,
    label: COLOR_LABELS[key] || key,
    value,
  }));

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="flex gap-8 min-h-[80vh]">

      {/* ============================================================ */}
      {/*  LEFT PANEL - Editor                                         */}
      {/* ============================================================ */}
      <div className="w-[440px] shrink-0 flex flex-col">
        <Tabs defaultValue="contenido" className="flex-1 flex flex-col">

          {/* --- Tab triggers --- */}
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="contenido" className="text-sm font-medium">
              Contenido
            </TabsTrigger>
            <TabsTrigger value="marca" className="text-sm font-medium">
              Marca
            </TabsTrigger>
          </TabsList>

          {/* ====================================================== */}
          {/*  TAB: Contenido                                        */}
          {/* ====================================================== */}
          <TabsContent value="contenido" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(80vh-160px)] pr-4">
              <Accordion
                type="multiple"
                defaultValue={ALL_CONTENT_SECTIONS}
                className="space-y-3"
              >

                {/* ---------- 1. Imagen principal ---------- */}
                <AccordionItem value="hero" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <ImagePlus className="w-4 h-4 text-muted-foreground" />
                      Imagen principal
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">URL de la imagen hero</Label>
                      <Input
                        value={sampleHeroUrl}
                        onChange={(e) => setSampleHeroUrl(e.target.value)}
                        placeholder="https://tu-tienda.com/banner.jpg"
                        className="text-sm"
                      />
                    </div>
                    {sampleHeroUrl && (
                      <div className="rounded-lg overflow-hidden border bg-muted/20">
                        <img
                          src={sampleHeroUrl}
                          alt="Hero preview"
                          className="w-full max-h-40 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 2. Titulo y texto ---------- */}
                <AccordionItem value="textos" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Type className="w-4 h-4 text-muted-foreground" />
                      Titulo y texto
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Titulo</Label>
                      <Input
                        value={sampleTitle}
                        onChange={(e) => setSampleTitle(e.target.value)}
                        placeholder="Titulo principal del email"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Texto introductorio</Label>
                      <Textarea
                        value={sampleIntro}
                        onChange={(e) => setSampleIntro(e.target.value)}
                        placeholder="Escribe un texto para tu audiencia..."
                        rows={3}
                        className="text-sm resize-none"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 3. Productos ---------- */}
                <AccordionItem value="productos" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      Productos
                      {sampleProducts.length > 0 && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                          {sampleProducts.length}
                        </Badge>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    {shopifyConnectionId ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 text-xs"
                          onClick={loadProducts}
                          disabled={loadingProducts}
                        >
                          {loadingProducts ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          {loadingProducts ? 'Cargando...' : 'Cargar productos de Shopify'}
                        </Button>

                        {sampleProducts.length > 0 && (
                          <div className="grid grid-cols-3 gap-2.5">
                            {sampleProducts.map((product, idx) => (
                              <Card
                                key={idx}
                                className="group relative overflow-hidden transition-shadow hover:shadow-md"
                              >
                                <button
                                  onClick={() => removeProduct(idx)}
                                  className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt={product.title}
                                    className="w-full h-20 object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-muted flex items-center justify-center">
                                    <Package className="w-5 h-5 text-muted-foreground/40" />
                                  </div>
                                )}
                                <CardContent className="p-2">
                                  <p className="text-[10px] font-medium leading-tight line-clamp-2">
                                    {product.title}
                                  </p>
                                  {product.price && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {product.price}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <Package className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Conecta Shopify para cargar productos
                        </p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 4. Boton de accion ---------- */}
                <AccordionItem value="cta" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                      Boton de accion
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Texto del boton</Label>
                      <Input
                        value={sampleCtaText}
                        onChange={(e) => setSampleCtaText(e.target.value)}
                        placeholder="ej: Ver productos, Comprar ahora"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">URL del boton</Label>
                      <Input
                        value={sampleCtaUrl}
                        onChange={(e) => setSampleCtaUrl(e.target.value)}
                        placeholder={shopUrl || 'https://tu-tienda.com'}
                        className="text-sm"
                      />
                    </div>
                    {/* Button preview */}
                    <div className="pt-2 flex justify-center">
                      <div
                        className="px-8 py-2.5 text-sm font-medium text-white text-center transition-all"
                        style={{
                          backgroundColor: colors.accent,
                          borderRadius: buttonRadius,
                        }}
                      >
                        {sampleCtaText || 'Boton de ejemplo'}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 5. Despedida ---------- */}
                <AccordionItem value="despedida" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Heart className="w-4 h-4 text-muted-foreground" />
                      Despedida
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Mensaje de despedida</Label>
                      <Textarea
                        value={farewellMessage}
                        onChange={(e) => { setFarewellMessage(e.target.value); setSaved(false); }}
                        placeholder="ej: Gracias por ser parte de nuestra comunidad..."
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Nombre del remitente</Label>
                      <Input
                        value={senderName}
                        onChange={(e) => { setSenderName(e.target.value); setSaved(false); }}
                        placeholder="ej: El equipo de Tu Marca"
                        className="text-sm"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 6. Redes sociales ---------- */}
                <AccordionItem value="social" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Share2 className="w-4 h-4 text-muted-foreground" />
                      Redes sociales
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-3">
                    {SOCIAL_PLATFORMS.map((p) => (
                      <div key={p.key} className="space-y-1">
                        <Label className="text-sm font-medium text-muted-foreground">
                          {p.label}
                        </Label>
                        <Input
                          value={(socialLinks as any)[p.key] || ''}
                          onChange={(e) => handleSocialChange(p.key, e.target.value)}
                          placeholder={p.placeholder}
                          className="text-xs h-8"
                        />
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </ScrollArea>
          </TabsContent>

          {/* ====================================================== */}
          {/*  TAB: Marca                                            */}
          {/* ====================================================== */}
          <TabsContent value="marca" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(80vh-160px)] pr-4">
              <Accordion
                type="multiple"
                defaultValue={ALL_BRAND_SECTIONS}
                className="space-y-3"
              >

                {/* ---------- 1. Colores ---------- */}
                <AccordionItem value="colores" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Palette className="w-4 h-4 text-muted-foreground" />
                      Colores
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <ColorPalette colors={colorFields} onChange={handleColorChange} />
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 2. Tipografia ---------- */}
                <AccordionItem value="tipografia" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Type className="w-4 h-4 text-muted-foreground" />
                      Tipografia
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <div className="grid grid-cols-2 gap-4">
                      <FontSelector
                        label="Titulos"
                        value={headingFont}
                        fontType={headingType}
                        onChange={(f, t) => { setHeadingFont(f); setHeadingType(t); setSaved(false); }}
                      />
                      <FontSelector
                        label="Texto"
                        value={bodyFont}
                        fontType={bodyType}
                        onChange={(f, t) => { setBodyFont(f); setBodyType(t); setSaved(false); }}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 3. Logo y tienda ---------- */}
                <AccordionItem value="logo" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <Image className="w-4 h-4 text-muted-foreground" />
                      Logo y tienda
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">URL del logo</Label>
                      <Input
                        value={logoUrl}
                        onChange={(e) => { setLogoUrl(e.target.value); setSaved(false); }}
                        placeholder="https://tu-tienda.com/logo.png"
                        className="text-sm"
                      />
                      {logoUrl && (
                        <div className="p-4 bg-muted/30 rounded-lg flex items-center justify-center">
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className="max-h-14 max-w-[200px] object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">URL de tu tienda</Label>
                      <Input
                        value={shopUrl}
                        onChange={(e) => { setShopUrl(e.target.value); setSaved(false); }}
                        placeholder="https://tu-tienda.com"
                        className="text-sm"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* ---------- 4. Estilo de botones ---------- */}
                <AccordionItem value="botones" className="border rounded-xl px-5 shadow-sm bg-card">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                    <span className="flex items-center gap-2.5">
                      <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                      Estilo de botones
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <div className="flex gap-3">
                      {BUTTON_STYLES.map((s) => (
                        <button
                          key={s.value}
                          className={`flex-1 py-3 px-4 text-xs font-medium transition-all duration-200 ${
                            buttonStyle === s.value
                              ? 'ring-2 ring-offset-2 ring-primary/40 shadow-sm'
                              : 'border border-border hover:border-primary/30'
                          }`}
                          style={{
                            borderRadius: s.radius,
                            backgroundColor: buttonStyle === s.value ? colors.accent : 'transparent',
                            color: buttonStyle === s.value ? '#fff' : undefined,
                          }}
                          onClick={() => { setButtonStyle(s.value); setButtonRadius(s.radius); setSaved(false); }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* --- Bottom actions (always visible) --- */}
        <div className="pt-5 mt-auto border-t space-y-3">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 gap-2 h-10"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? 'Guardado' : 'Guardar template'}
            </Button>
            {saved && (
              <Badge variant="secondary" className="text-xs shrink-0">
                Cambios guardados
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs gap-1.5 text-muted-foreground"
            onClick={loadFromBrief}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Usar datos del brief
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  RIGHT PANEL - Live Preview                                  */}
      {/* ============================================================ */}
      <div className="flex-1 sticky top-6 self-start">
        <TemplatePreview
          brand={currentBrand}
          title={sampleTitle}
          introText={sampleIntro}
          heroImageUrl={sampleHeroUrl}
          ctaText={sampleCtaText}
          ctaUrl={sampleCtaUrl}
          products={sampleProducts}
        />
      </div>
    </div>
  );
}
