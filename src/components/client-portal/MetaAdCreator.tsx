import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Sparkles, Image as ImageIcon, Video, ArrowLeft, ArrowRight,
  RotateCcw, CheckCircle, ThumbsDown, RefreshCw, Star, Edit, Package,
  Tag, Globe, Target, Coins, Play, ChevronRight, Pencil, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface MetaAdCreatorProps {
  clientId: string;
  onBack: () => void;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  image: string | null;
  variants: Array<{ price: number; cost: number | null }>;
}

interface Variacion {
  badge: string; titulo: string; texto_principal: string; descripcion: string; cta: string;
}
interface GeneratedVariaciones { explicacion: string; variaciones: Variacion[]; }

type AdStep = 'strategy' | 'product' | 'campaign' | 'angle' | 'instrucciones' | 'variaciones' | 'brief';

const CAMPAIGN_OPTIONS = [
  { id: 'retargeting', label: 'Broad Retargeting', emoji: '🎯', desc: 'Recuperar audiencia que ya te conoce' },
  { id: 'prospecting', label: 'Prospección Fría', emoji: '❄️', desc: 'Audiencias nuevas que no te conocen' },
  { id: 'seasonal', label: 'Black Friday / Temporada', emoji: '🛍️', desc: 'Campaña de fechas especiales' },
  { id: 'cart', label: 'Remarketing Carrito', emoji: '🛒', desc: 'Carritos abandonados' },
];

const ANGLES_BY_PHASE: Record<string, string[]> = {
  'Fase Inicial': ['Reviews + Beneficios', 'Antes y Después', 'Ugly Ads'],
  'Fase Crecimiento': ['Call Out', 'Bold Statement', 'Us vs Them'],
  'Fase Escalado': ['Descuentos/Ofertas', 'Paquetes', 'Credenciales en Medios'],
  'Fase Avanzada': ['Beneficios', 'Bold Statement', 'Us vs Them', 'Call Out', 'Antes y Después', 'Beneficios Principales', 'Pantalla Dividida', 'Nueva Colección', 'Reviews', 'Detalles de Producto', 'Ugly Ads', 'Cyber/Fechas Especiales', 'Ingredientes/Material', 'Credenciales en Medios', 'Reviews + Beneficios', 'Memes', 'Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Mensajes y Comentarios'],
};

const ALL_ANGLES = ['Beneficios', 'Bold Statement', 'Us vs Them', 'Call Out', 'Antes y Después', 'Beneficios Principales', 'Pantalla Dividida', 'Nueva Colección', 'Reviews', 'Detalles de Producto', 'Ugly Ads', 'Cyber/Fechas Especiales', 'Ingredientes/Material', 'Credenciales en Medios', 'Reviews + Beneficios', 'Memes', 'Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Mensajes y Comentarios'];

const BUDGET_RECS: Record<string, string> = {
  'Fase Inicial': 'Enfocado en Broad Retargeting + producto ancla. Sin prospección fría.',
  'Fase Crecimiento': 'Retargeting + prospección fría básica. Estructura simple.',
  'Fase Escalado': 'Campaña maestra + catálogos dinámicos. Estructura avanzada.',
  'Fase Avanzada': 'Framework completo: Advantage+, Partnership Ads, catálogos.',
};

export function MetaAdCreator({ clientId, onBack }: MetaAdCreatorProps) {
  const [step, setStep] = useState<AdStep>('strategy');
  const [briefData, setBriefData] = useState<Record<string, unknown>>({});
  const [faseNegocio, setFaseNegocio] = useState('');
  const [presupuestoAds, setPresupuestoAds] = useState('');
  const [editingPhase, setEditingPhase] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [tempFase, setTempFase] = useState('');
  const [tempPresupuesto, setTempPresupuesto] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Product selection
  const [productMode, setProductMode] = useState<'product' | 'category' | 'generic' | null>(null);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const [customAngle, setCustomAngle] = useState('');
  const [showCustomAngle, setShowCustomAngle] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariaciones, setGeneratedVariaciones] = useState<GeneratedVariaciones | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);

  // Brief / generation
  const [selectedVariacion, setSelectedVariacion] = useState<Variacion | null>(null);
  const [briefVisual, setBriefVisual] = useState<Record<string, unknown> | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [savedCreativeId, setSavedCreativeId] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatedAssetUrl, setGeneratedAssetUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState('');

  useEffect(() => {
    loadBriefData();
  }, [clientId]);

  const loadBriefData = async () => {
    // First try buyer_personas
    const { data } = await supabase
      .from('buyer_personas')
      .select('persona_data')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle();

    if (data?.persona_data) {
      const pd = data.persona_data as Record<string, unknown>;
      setBriefData(pd);
      if (typeof pd.fase_negocio === 'string' && pd.fase_negocio) setFaseNegocio(pd.fase_negocio);
      if (typeof pd.presupuesto_ads === 'string' && pd.presupuesto_ads) setPresupuestoAds(pd.presupuesto_ads);
    }

    // Fallback: try brand_research cost_benchmarks for budget hint
    const { data: benchmarks } = await supabase
      .from('brand_research')
      .select('research_data')
      .eq('client_id', clientId)
      .eq('research_type', 'cost_benchmarks')
      .maybeSingle();

    if (benchmarks?.research_data) {
      const bd = benchmarks.research_data as Record<string, unknown>;
      const meta = bd.meta_benchmarks as Record<string, unknown> | undefined;
      if (meta?.budget_recommendation && !presupuestoAds) {
        setPresupuestoAds(meta.budget_recommendation as string);
      }
    }
  };

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .maybeSingle();

      if (!conn) { setLoadingProducts(false); return; }

      const { data, error } = await supabase.functions.invoke('fetch-shopify-products', {
        body: { clientId, connectionId: conn.id },
      });

      if (!error && data?.products) {
        setProducts(data.products);
        const cats = [...new Set<string>(data.products.map((p: ShopifyProduct) => p.product_type).filter(Boolean))];
        setCategories(cats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const effectiveAngle = showCustomAngle && customAngle.trim() ? customAngle.trim() : selectedAngle;
  const recommendedAngles = ANGLES_BY_PHASE[faseNegocio] || [];
  const otherAngles = ALL_ANGLES.filter(a => !recommendedAngles.includes(a));

  const campaignLabel = CAMPAIGN_OPTIONS.find(c => c.id === selectedCampaign)?.label || selectedCampaign || '';
  const funnel = selectedCampaign === 'cart' ? 'bofu' : selectedCampaign === 'retargeting' ? 'mofu' : selectedCampaign === 'prospecting' ? 'tofu' : 'bofu';

  const generateVariaciones = async (regenerateIdx?: number) => {
    if (!effectiveAngle || !selectedCampaign) return;
    if (regenerateIdx !== undefined) setRegeneratingIdx(regenerateIdx);
    else setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          clientId,
          funnel,
          formato: 'static',
          angulo: effectiveAngle,
          instrucciones: instrucciones.trim() || undefined,
          assetUrls: [],
          fase_negocio: faseNegocio || undefined,
          presupuesto_ads: presupuestoAds || undefined,
          campana_destino: campaignLabel,
          producto_seleccionado: selectedProduct ? {
            title: selectedProduct.title,
            price: selectedProduct.variants[0]?.price,
            description: selectedProduct.product_type,
          } : undefined,
          categoria_seleccionada: selectedCategory || undefined,
          tipo_anuncio: productMode,
        },
      });

      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos disponibles'); return; }

      let parsed: GeneratedVariaciones = data;
      if (typeof data === 'string') { parsed = JSON.parse(data.replace(/```json|```/g, '').trim()); }

      if (regenerateIdx !== undefined && generatedVariaciones) {
        const updated = [...generatedVariaciones.variaciones];
        if (parsed.variaciones?.[0]) updated[regenerateIdx] = { ...parsed.variaciones[0], badge: `Variación ${['A', 'B', 'C'][regenerateIdx]}` };
        setGeneratedVariaciones({ ...generatedVariaciones, variaciones: updated });
      } else {
        setGeneratedVariaciones(parsed);
        setStep('variaciones');
      }
      toast.success('✨ Copies generados');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
      setRegeneratingIdx(null);
    }
  };

  const handleChooseVariacion = async (v: Variacion) => {
    setSelectedVariacion(v);
    setStep('brief');
    setGeneratingBrief(true);
    setBriefVisual(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-brief-visual', {
        body: { clientId, formato: 'static', angulo: effectiveAngle, variacionElegida: v },
      });
      if (error) throw error;
      let parsed = data;
      if (typeof data === 'string') parsed = JSON.parse(data.replace(/```json|```/g, '').trim());
      setBriefVisual(parsed);
    } catch (err) {
      toast.error('Error generando el brief visual');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    if (!briefVisual || !selectedVariacion) return;
    try {
      const { data, error } = await (supabase as any).from('ad_creatives').insert({
        client_id: clientId, funnel, formato: 'static', angulo: effectiveAngle,
        titulo: selectedVariacion.titulo, texto_principal: selectedVariacion.texto_principal,
        descripcion: selectedVariacion.descripcion, cta: selectedVariacion.cta,
        brief_visual: briefVisual, prompt_generacion: (briefVisual.prompt_generacion as string) || null,
        estado: 'aprobado', custom_instructions: instrucciones.trim() || null,
      }).select('id').single();
      if (error) throw error;
      setSavedCreativeId(data?.id || null);
      toast.success('✅ Creativo guardado en la Biblioteca');
    } catch { toast.error('Error al guardar'); }
  };

  const handleGenerateImage = async () => {
    if (!savedCreativeId || !briefVisual) return;
    setGeneratingImage(true);
    setGeneratedAssetUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { clientId, creativeId: savedCreativeId, promptGeneracion: briefVisual.prompt_generacion as string },
      });
      if (error) throw error;
      if (data?.asset_url) { setGeneratedAssetUrl(data.asset_url); toast.success('🖼 Imagen generada'); }
    } catch { toast.error('Error generando imagen'); }
    finally { setGeneratingImage(false); }
  };

  const startVideoPolling = useCallback(async (predictionId: string) => {
    const msgs = ['Procesando escenas...', 'Generando movimiento...', 'Aplicando efectos...', 'Finalizando video...'];
    let idx = 0;
    const interval = setInterval(async () => {
      setVideoProgress(msgs[idx % msgs.length]); idx++;
      try {
        const { data } = await supabase.functions.invoke('check-video-status', {
          body: { predictionId, creativeId: savedCreativeId, clientId },
        });
        if (data?.status === 'succeeded' && data?.asset_url) {
          clearInterval(interval); setGeneratedAssetUrl(data.asset_url); setGeneratingVideo(false);
          toast.success('🎬 Video generado');
        } else if (data?.status === 'failed') {
          clearInterval(interval); setGeneratingVideo(false); toast.error('Error en generación de video');
        }
      } catch { /* keep polling */ }
    }, 5000);
  }, [savedCreativeId, clientId]);

  const handleGenerateVideo = async () => {
    if (!savedCreativeId || !briefVisual) return;
    setGeneratingVideo(true); setVideoProgress('Iniciando...'); setGeneratedAssetUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: { clientId, creativeId: savedCreativeId, promptGeneracion: briefVisual.prompt_generacion as string },
      });
      if (error) throw error;
      if (data?.prediction_id) { startVideoPolling(data.prediction_id); }
    } catch { toast.error('Error iniciando video'); setGeneratingVideo(false); }
  };

  const reset = () => {
    setStep('strategy'); setProductMode(null); setSelectedProduct(null);
    setSelectedCategory(null); setSelectedCampaign(null); setSelectedAngle(null);
    setCustomAngle(''); setShowCustomAngle(false); setInstrucciones('');
    setGeneratedVariaciones(null); setSelectedVariacion(null); setBriefVisual(null);
    setSavedCreativeId(null); setGeneratedAssetUrl(null); setVideoProgress('');
  };

  const saveManualConfig = async () => {
    setSavingConfig(true);
    try {
      const { data: existing } = await supabase
        .from('buyer_personas')
        .select('id, persona_data')
        .eq('client_id', clientId)
        .maybeSingle();

      const updatedData = {
        ...(existing?.persona_data as Record<string, unknown> || {}),
        fase_negocio: tempFase || faseNegocio,
        presupuesto_ads: tempPresupuesto || presupuestoAds,
      };

      if (existing?.id) {
        await supabase.from('buyer_personas').update({ persona_data: updatedData }).eq('id', existing.id);
      } else {
        await supabase.from('buyer_personas').insert({ client_id: clientId, persona_data: updatedData, is_complete: false });
      }

      if (tempFase) setFaseNegocio(tempFase);
      if (tempPresupuesto) setPresupuestoAds(tempPresupuesto);
      setEditingPhase(false);
      setEditingBudget(false);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="p-2 rounded-lg bg-primary/10"><Target className="w-6 h-6 text-primary" /></div>
        <div>
          <h2 className="text-xl font-bold">Crear Anuncio Meta</h2>
          <p className="text-sm text-muted-foreground">Flujo guiado por fase del negocio</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
          <RotateCcw className="w-4 h-4 mr-1" />Reiniciar
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1: STRATEGY */}
        {step === 'strategy' && (
          <motion.div key="strategy" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-semibold">🎯 Estrategia Recomendada para tu Negocio</h3>

            {/* Info banner when not configured */}
            {(!faseNegocio || !presupuestoAds) && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>Completa el brief con Steve para detectar tu fase automáticamente, o configúralo manualmente aquí para continuar.</span>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* Fase de negocio */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">Fase detectada</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setTempFase(faseNegocio); setEditingPhase(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                  {editingPhase ? (
                    <div className="space-y-2">
                      <select
                        className="w-full text-sm border border-border rounded-md p-2 bg-background text-foreground"
                        value={tempFase}
                        onChange={e => setTempFase(e.target.value)}
                      >
                        <option value="">Selecciona tu fase...</option>
                        <option value="Fase Inicial">Fase Inicial (0-3k USD/mes)</option>
                        <option value="Fase Crecimiento">Fase Crecimiento (3k-10k USD/mes)</option>
                        <option value="Fase Escalado">Fase Escalado (10k-30k USD/mes)</option>
                        <option value="Fase Avanzada">Fase Avanzada (+30k USD/mes)</option>
                      </select>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={saveManualConfig} disabled={savingConfig}>
                          {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPhase(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl font-bold">{faseNegocio || <span className="text-muted-foreground text-lg">No configurada</span>}</p>
                      {!faseNegocio && (
                        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setTempFase(''); setEditingPhase(true); }}>
                          + Configurar manualmente
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Presupuesto */}
              <Card className="border-secondary/20 bg-secondary/10">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-foreground" />
                      <span className="text-sm font-semibold text-foreground">Presupuesto mensual de ads</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setTempPresupuesto(presupuestoAds); setEditingBudget(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                  {editingBudget ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Ej: $600 USD/mes"
                        className="w-full text-sm border border-border rounded-md p-2 bg-background text-foreground"
                        value={tempPresupuesto}
                        onChange={e => setTempPresupuesto(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={saveManualConfig} disabled={savingConfig}>
                          {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingBudget(false)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xl font-bold">{presupuestoAds || <span className="text-muted-foreground">No configurado</span>}</p>
                      {!presupuestoAds && (
                        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setTempPresupuesto(''); setEditingBudget(true); }}>
                          + Configurar manualmente
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {faseNegocio && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-semibold">📋 Campaña recomendada para {faseNegocio}:</p>
                  <p className="text-sm text-muted-foreground">{BUDGET_RECS[faseNegocio]}</p>
                  {faseNegocio === 'Fase Inicial' && (
                    <div className="mt-2 p-3 bg-accent border border-border rounded-lg">
                      <p className="text-xs font-semibold text-accent-foreground">⭐ Recuerda: Siempre pauta con tu producto ancla en Fase Inicial</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button className="w-full" onClick={() => { setStep('product'); loadProducts(); }}>
              Continuar — Elegir Producto <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        )}

        {/* STEP 2: PRODUCT */}
        {step === 'product' && (
          <motion.div key="product" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('strategy')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            <h3 className="text-lg font-semibold">¿Para qué producto es el anuncio?</h3>

            <div className="grid gap-3">
              <Card
                className={`cursor-pointer border-2 transition-all ${productMode === 'product' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                onClick={() => setProductMode('product')}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Producto específico de Shopify</p>
                    <p className="text-xs text-muted-foreground">Elige un producto de tu catálogo</p>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 transition-all ${productMode === 'category' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                onClick={() => setProductMode('category')}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Tag className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Categoría de producto</p>
                    <p className="text-xs text-muted-foreground">Anuncia toda una categoría del catálogo</p>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer border-2 transition-all ${productMode === 'generic' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                onClick={() => { setProductMode('generic'); setSelectedProduct(null); setSelectedCategory(null); }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Globe className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Anuncio genérico de marca</p>
                    <p className="text-xs text-muted-foreground">Sin producto específico — Awareness o branding</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Product grid */}
            {productMode === 'product' && (
              <div className="space-y-3">
                {loadingProducts ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay productos de Shopify conectados</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
                    {products.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className={`cursor-pointer rounded-lg border-2 p-2 transition-all ${selectedProduct?.id === p.id ? 'border-primary bg-primary/5' : 'hover:border-primary/30'}`}
                      >
                        {p.image ? (
                          <img src={p.image} alt={p.title} className="w-full h-24 object-cover rounded mb-2" />
                        ) : (
                          <div className="w-full h-24 bg-muted rounded mb-2 flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-xs font-semibold line-clamp-2">{p.title}</p>
                        {p.variants[0]?.price && <p className="text-xs text-muted-foreground">${p.variants[0].price}</p>}
                        {selectedProduct?.id === p.id && <Badge className="mt-1 text-[10px]">✓ Seleccionado</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category list */}
            {productMode === 'category' && (
              <div className="space-y-2">
                {categories.length === 0 && !loadingProducts ? (
                  <p className="text-sm text-muted-foreground">No se encontraron categorías</p>
                ) : (
                  categories.map(cat => (
                    <div
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`cursor-pointer p-3 rounded-lg border-2 transition-all text-sm ${selectedCategory === cat ? 'border-primary bg-primary/5 font-semibold' : 'hover:border-primary/30'}`}
                    >
                      {cat}
                    </div>
                  ))
                )}
              </div>
            )}

            <Button
              className="w-full"
              disabled={
                !productMode ||
                (productMode === 'product' && !selectedProduct) ||
                (productMode === 'category' && !selectedCategory)
              }
              onClick={() => setStep('campaign')}
            >
              Continuar — Campaña Destino <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        )}

        {/* STEP 3: CAMPAIGN */}
        {step === 'campaign' && (
          <motion.div key="campaign" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('product')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            <h3 className="text-lg font-semibold">¿Para qué campaña es este anuncio?</h3>
            <div className="grid gap-3">
              {CAMPAIGN_OPTIONS.map(c => {
                const isBlocked = faseNegocio === 'Fase Inicial' && c.id === 'prospecting';
                return (
                  <Card
                    key={c.id}
                    className={`border-2 transition-all ${isBlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${selectedCampaign === c.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                    onClick={() => !isBlocked && setSelectedCampaign(c.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <span className="text-2xl">{c.emoji}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.desc}</p>
                      </div>
                      {isBlocked && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">No apto Fase Inicial</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Button className="w-full" disabled={!selectedCampaign} onClick={() => setStep('angle')}>
              Continuar — Ángulo Creativo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        )}

        {/* STEP 4: ANGLE */}
        {step === 'angle' && (
          <motion.div key="angle" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('campaign')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            <h3 className="text-lg font-semibold">Ángulo Creativo</h3>

            {recommendedAngles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">⭐ Recomendados para {faseNegocio}</p>
                <div className="grid gap-2">
                  {recommendedAngles.map(a => (
                    <div
                      key={a}
                      onClick={() => { setSelectedAngle(a); setShowCustomAngle(false); }}
                      className={`cursor-pointer p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${selectedAngle === a && !showCustomAngle ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                    >
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-semibold">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherAngles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Otros ángulos</p>
                <div className="grid grid-cols-2 gap-2">
                  {otherAngles.map(a => (
                    <div
                      key={a}
                      onClick={() => { setSelectedAngle(a); setShowCustomAngle(false); }}
                      className={`cursor-pointer p-2 rounded-lg border transition-all text-sm ${selectedAngle === a && !showCustomAngle ? 'border-primary bg-primary/5 font-semibold' : 'hover:border-primary/30'}`}
                    >
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              onClick={() => { setShowCustomAngle(true); setSelectedAngle(null); }}
              className={`cursor-pointer p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${showCustomAngle ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
            >
              <Edit className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">✏️ Escribir mi propio ángulo</span>
            </div>
            {showCustomAngle && (
              <Textarea
                value={customAngle}
                onChange={e => setCustomAngle(e.target.value)}
                placeholder="Ej: Testimonial de cliente real de 30 segundos"
                className="text-sm"
              />
            )}

            <Button
              className="w-full"
              disabled={!effectiveAngle}
              onClick={() => setStep('instrucciones')}
            >
              Continuar — Instrucciones <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        )}

        {/* STEP 5: INSTRUCCIONES */}
        {step === 'instrucciones' && (
          <motion.div key="instrucciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('angle')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            <h3 className="text-lg font-semibold">Instrucciones adicionales (opcional)</h3>
            <Textarea
              value={instrucciones}
              onChange={e => setInstrucciones(e.target.value)}
              placeholder="Ej: Menciona que el envío es gratis. El tono debe ser muy cercano y casual..."
              className="min-h-[120px]"
            />
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
              <p><strong>Resumen del anuncio:</strong></p>
              <p>• Campaña: {CAMPAIGN_OPTIONS.find(c => c.id === selectedCampaign)?.label}</p>
              <p>• Ángulo: {effectiveAngle}</p>
              <p>• Producto: {selectedProduct?.title || selectedCategory || 'Genérico de marca'}</p>
              {faseNegocio && <p>• Fase: {faseNegocio}</p>}
            </div>
            <Button
              className="w-full"
              disabled={isGenerating}
              onClick={() => generateVariaciones()}
            >
              {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando copies...</> : <><Sparkles className="w-4 h-4 mr-2" />Generar 3 Variaciones de Copy</>}
            </Button>
          </motion.div>
        )}

        {/* STEP 6: VARIACIONES */}
        {step === 'variaciones' && generatedVariaciones && (
          <motion.div key="variaciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">3 Variaciones Generadas</h3>
              <Button variant="ghost" size="sm" onClick={() => generateVariaciones()}>
                <RefreshCw className="w-4 h-4 mr-1" />Regenerar las 3
              </Button>
            </div>

            {generatedVariaciones.explicacion && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                💡 {generatedVariaciones.explicacion}
              </div>
            )}

            <div className="space-y-4">
              {generatedVariaciones.variaciones.map((v, i) => (
                <Card key={i} className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{v.badge}</Badge>
                      <Button
                        variant="ghost" size="sm"
                        disabled={regeneratingIdx === i}
                        onClick={() => generateVariaciones(i)}
                      >
                        {regeneratingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                        <span className="ml-1 text-xs">👎 Regenerar esta</span>
                      </Button>
                    </div>
                    {v.titulo && <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Título</p><p className="font-semibold text-sm">{v.titulo}</p></div>}
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Texto principal</p><p className="text-sm whitespace-pre-wrap">{v.texto_principal}</p></div>
                    {v.descripcion && <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Descripción</p><p className="text-sm">{v.descripcion}</p></div>}
                    {v.cta && <div><p className="text-xs text-muted-foreground uppercase tracking-wider">CTA</p><Badge>{v.cta}</Badge></div>}
                    <Button className="w-full" onClick={() => handleChooseVariacion(v)}>
                      <CheckCircle className="w-4 h-4 mr-2" />✅ Elegir esta variación
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* STEP 7: BRIEF VISUAL */}
        {step === 'brief' && (
          <motion.div key="brief" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-semibold">Brief Visual</h3>
            {generatingBrief ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generando brief visual...</p>
              </div>
            ) : briefVisual ? (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4 space-y-3 text-sm">
                    {selectedVariacion && (
                      <>
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Copy elegido</p><p className="font-medium">{selectedVariacion.titulo}</p><p className="mt-1 text-muted-foreground">{selectedVariacion.texto_principal}</p></div>
                      </>
                    )}
                    {Object.entries(briefVisual).filter(([k]) => k !== 'prompt_generacion').map(([k, v]) => (
                      <div key={k}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, ' ')}</p>
                        <p>{String(v)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {!savedCreativeId ? (
                  <Button className="w-full" onClick={handleApproveBrief}>
                    <CheckCircle className="w-4 h-4 mr-2" />Aprobar Brief y Guardar en Biblioteca
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                      ✅ Creativo guardado. Ahora genera el visual.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Button onClick={handleGenerateImage} disabled={generatingImage || generatingVideo}>
                        {generatingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                        Generar Imagen
                      </Button>
                      <Button variant="outline" onClick={handleGenerateVideo} disabled={generatingImage || generatingVideo}>
                        {generatingVideo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
                        {generatingVideo ? videoProgress : 'Generar Video'}
                      </Button>
                    </div>
                    {generatedAssetUrl && (
                      <div className="rounded-lg overflow-hidden border">
                        {generatedAssetUrl.includes('.mp4') ? (
                          <video src={generatedAssetUrl} controls className="w-full" />
                        ) : (
                          <img src={generatedAssetUrl} alt="Generated" className="w-full" />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
