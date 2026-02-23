import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Sparkles, Image as ImageIcon, Video, ArrowLeft, ArrowRight,
  RotateCcw, CheckCircle, ThumbsDown, RefreshCw, Star, Edit, Package,
  Tag, Globe, Target, Coins, Rocket, Calendar, Bell, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBriefContext } from '@/hooks/useBriefContext';

interface MetaAdCreatorProps {
  clientId: string;
  onBack: () => void;
  onGoToLibrary?: () => void;
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

type AdStep = 'strategy' | 'product' | 'campaign' | 'angle' | 'instrucciones' | 'variaciones' | 'brief' | 'publish' | 'charlie' | 'completed';

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

const ANGLE_EXPLANATIONS: Record<string, Record<string, string>> = {
  retargeting: {
    'Call Out': 'Esta audiencia ya te conoce. El llamado directo reactiva su interés y los hace sentir identificados.',
    'Bold Statement': 'Una afirmación fuerte recuerda tu propuesta de valor a quienes ya interactuaron contigo.',
    'Us vs Them': 'Compara tu producto vs alternativas para audiencias que están evaluando opciones.',
    'Reviews': 'Testimonios reales refuerzan la decisión de compra en personas que ya consideraron tu marca.',
    'Descuentos/Ofertas': 'Oferta directa para convertir a quienes ya mostraron interés pero no compraron.',
  },
  prospecting: {
    'Bold Statement': 'Necesitas interrumpir el scroll. Una afirmación impactante genera curiosidad inmediata.',
    'Call Out': 'Identifica a tu audiencia directamente para que sientan que el anuncio les habla a ellos.',
    'Antes y Después': 'Muestra la transformación que logra tu producto para generar deseo desde cero.',
    'Ugly Ads': 'Contenido orgánico genera más confianza en audiencias frías que no conocen tu marca.',
    'Beneficios': 'Presenta el beneficio principal de forma clara para captar atención de nuevas audiencias.',
  },
  seasonal: {
    'Descuentos/Ofertas': 'En fechas especiales la audiencia busca activamente ofertas. Sé directo con el descuento.',
    'Urgencia': 'Contador de tiempo o stock limitado acelera la decisión en temporada de compras.',
    'Paquetes': 'Bundles con descuento aumentan el ticket promedio en temporadas de alto tráfico.',
  },
  cart: {
    'Descuentos/Ofertas': 'Un incentivo extra puede ser lo que falta para cerrar la venta abandonada.',
    'Reviews': 'Testimonios eliminan la última duda de quienes ya agregaron al carrito.',
    'Urgencia': 'Recuerda que el producto sigue disponible pero por tiempo limitado.',
  },
};

const getAngleExplanation = (campaign: string | null, angle: string): string | null => {
  if (!campaign) return null;
  return ANGLE_EXPLANATIONS[campaign]?.[angle] || null;
};

const BUDGET_RECS: Record<string, string> = {
  'Fase Inicial': 'Enfocado en Broad Retargeting + producto ancla. Sin prospección fría.',
  'Fase Crecimiento': 'Retargeting + prospección fría básica. Estructura simple.',
  'Fase Escalado': 'Campaña maestra + catálogos dinámicos. Estructura avanzada.',
  'Fase Avanzada': 'Framework completo: Advantage+, Partnership Ads, catálogos.',
};

export function MetaAdCreator({ clientId, onBack, onGoToLibrary }: MetaAdCreatorProps) {
  const [step, setStep] = useState<AdStep>('strategy');
  const [faseNegocio, setFaseNegocio] = useState('');
  const [presupuestoAds, setPresupuestoAds] = useState('');
  const [manualFase, setManualFase] = useState('');
  const [manualPresupuesto, setManualPresupuesto] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishedAdSet, setPublishedAdSet] = useState<{name: string; id: string; budget: string; reviewDate: string} | null>(null);
  const [charlieRevisionDate, setCharlieRevisionDate] = useState('');

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
  const { chips: briefChips, activeChips, toggleChip, getActiveChipsText } = useBriefContext(clientId);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariaciones, setGeneratedVariaciones] = useState<GeneratedVariaciones | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);

  // 3-2-2 selection — copies start empty (user picks 3 of 10), titles/descriptions pre-selected
  const [selectedCopies, setSelectedCopies] = useState<number[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<number[]>([0, 1]);
  const [selectedDescriptions, setSelectedDescriptions] = useState<number[]>([0, 1]);

  // Brief / generation — 6 briefs generated, user picks 3
  const [selectedVariacion, setSelectedVariacion] = useState<Variacion | null>(null);
  const [briefsVisuales, setBriefsVisuales] = useState<Array<Record<string, unknown>>>([]);
  const [selectedBriefs, setSelectedBriefs] = useState<number[]>([]);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [savedCreativeId, setSavedCreativeId] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatedAssetUrls, setGeneratedAssetUrls] = useState<string[]>([]);
  const [videoProgress, setVideoProgress] = useState('');

  useEffect(() => {
    loadBriefData();
  }, [clientId]);

  const loadBriefData = async () => {
    // Read fase_negocio and presupuesto_ads directly from clients table
    const { data: clientData } = await supabase
      .from('clients')
      .select('fase_negocio, presupuesto_ads')
      .eq('id', clientId)
      .maybeSingle();

    if (clientData?.fase_negocio) setFaseNegocio(clientData.fase_negocio);
    if (clientData?.presupuesto_ads) setPresupuestoAds(String(clientData.presupuesto_ads));
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
      const chipsText = getActiveChipsText();
      const fullInstrucciones = [instrucciones.trim(), chipsText].filter(Boolean).join('. ') || undefined;
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          clientId,
          funnel,
          formato: 'static',
          angulo: effectiveAngle,
          instrucciones: fullInstrucciones,
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
        setSelectedCopies([]);
        setSelectedTitles([0, 1]);
        setSelectedDescriptions([0, 1]);
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

  const toggleCopy = (index: number) => {
    setSelectedCopies(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else if (prev.length < 3) {
        return [...prev, index];
      }
      return prev;
    });
  };
  const toggleTitle = (idx: number) => setSelectedTitles(prev =>
    prev.includes(idx) ? prev.filter(i => i !== idx) : prev.length < 2 ? [...prev, idx] : prev
  );
  const toggleDescription = (idx: number) => setSelectedDescriptions(prev =>
    prev.includes(idx) ? prev.filter(i => i !== idx) : prev.length < 2 ? [...prev, idx] : prev
  );

  const canProceed =
    selectedCopies.length === 3 &&
    selectedTitles.length === 2 &&
    selectedDescriptions.length === 2;

  const toggleBrief = (index: number) => {
    setSelectedBriefs(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      else if (prev.length < 3) return [...prev, index];
      return prev;
    });
  };

  const handleApproveVariaciones = async () => {
    if (!generatedVariaciones) return;
    const firstV = generatedVariaciones.variaciones[selectedCopies[0]];
    setSelectedVariacion(firstV);
    setStep('brief');
    setGeneratingBrief(true);
    setBriefsVisuales([]);
    setSelectedBriefs([]);
    try {
      // Generate 6 briefs in parallel — cycling through the 3 selected copies: [0,1,2,0,1,2]
      const copyPattern = [0, 1, 2, 0, 1, 2];
      const results = await Promise.allSettled(
        copyPattern.map(async (patternIdx) => {
          const copyIndex = selectedCopies[patternIdx];
          const variacion = generatedVariaciones.variaciones[copyIndex];
          const { data, error } = await supabase.functions.invoke('generate-brief-visual', {
            body: { clientId, formato: 'static', angulo: effectiveAngle, variacionElegida: variacion },
          });
          if (error) throw error;
          let parsed = data;
          if (typeof data === 'string') parsed = JSON.parse(data.replace(/```json|```/g, '').trim());
          return parsed as Record<string, unknown>;
        })
      );

      const successful = results
        .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === 'fulfilled')
        .map(r => r.value);

      if (successful.length === 0) {
        toast.error('Error generando los briefs visuales');
        return;
      }

      setBriefsVisuales(successful);
    } catch (err) {
      toast.error('Error generando los briefs visuales');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    const briefIdx = selectedBriefs.length > 0 ? selectedBriefs[0] : 0;
    const primaryBrief = briefsVisuales[briefIdx];
    if (!primaryBrief || !selectedVariacion) return;
    // Build DCT data
    const dctCopies = selectedCopies.map(i => generatedVariaciones?.variaciones[i]);
    const dctTitulos = selectedTitles.map(i => generatedVariaciones?.variaciones[i]?.titulo).filter(Boolean);
    const dctDescripciones = selectedDescriptions.map(i => generatedVariaciones?.variaciones[i]?.descripcion).filter(Boolean);
    const dctBriefs = selectedBriefs.map(i => briefsVisuales[i]);
    try {
      const { data, error } = await (supabase as any).from('ad_creatives').insert({
        client_id: clientId, funnel, formato: 'static', angulo: effectiveAngle,
        titulo: selectedVariacion.titulo, texto_principal: selectedVariacion.texto_principal,
        descripcion: selectedVariacion.descripcion, cta: selectedVariacion.cta,
        brief_visual: primaryBrief, prompt_generacion: (primaryBrief.prompt_generacion as string) || null,
        estado: 'aprobado', custom_instructions: instrucciones.trim() || null,
        dct_copies: dctCopies, dct_titulos: dctTitulos, dct_descripciones: dctDescripciones,
        dct_briefs: dctBriefs, dct_imagenes: [],
      }).select('id').single();
      if (error) throw error;
      setSavedCreativeId(data?.id || null);
      toast.success('✅ Creativo guardado en la Biblioteca');
    } catch { toast.error('Error al guardar'); }
  };

  const handleGenerateImage = async () => {
    if (!savedCreativeId || selectedBriefs.length === 0) return;
    setGeneratingImage(true);
    setGeneratedAssetUrls([]);
    try {
      const results = await Promise.allSettled(
        selectedBriefs.map(async (briefIdx) => {
          const brief = briefsVisuales[briefIdx];
          const { data, error } = await supabase.functions.invoke('generate-image', {
            body: { clientId, creativeId: savedCreativeId, promptGeneracion: brief.prompt_generacion as string },
          });
          if (error) throw error;
          return data?.asset_url as string;
        })
      );
      console.log('Promise.allSettled results:', results);
      const urls = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value);
      console.log('URLs generadas:', urls);
      console.log('Total:', urls.length);
      if (urls.length === 0) throw new Error('No se generaron imágenes');
      setGeneratedAssetUrls(urls);
      // Update dct_imagenes in DB
      await (supabase as any).from('ad_creatives').update({ dct_imagenes: urls }).eq('id', savedCreativeId);
      toast.success(`🖼 ${urls.length} imagen${urls.length !== 1 ? 'es' : ''} generada${urls.length !== 1 ? 's' : ''}`);
    } catch { toast.error('Error generando imágenes'); }
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
          clearInterval(interval);
          setGeneratedAssetUrls(prev => [...prev, data.asset_url]);
          setGeneratingVideo(false);
          toast.success('🎬 Video generado');
        } else if (data?.status === 'failed') {
          clearInterval(interval); setGeneratingVideo(false); toast.error('Error en generación de video');
        }
      } catch { /* keep polling */ }
    }, 5000);
  }, [savedCreativeId, clientId]);

  const handleGenerateVideo = async () => {
    const briefIdx = selectedBriefs.length > 0 ? selectedBriefs[0] : 0;
    const primaryBrief = briefsVisuales[briefIdx];
    if (!savedCreativeId || !primaryBrief) return;
    setGeneratingVideo(true); setVideoProgress('Iniciando...'); setGeneratedAssetUrls([]);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: { clientId, creativeId: savedCreativeId, promptGeneracion: primaryBrief.prompt_generacion as string },
      });
      if (error) throw error;
      if (data?.prediction_id) { startVideoPolling(data.prediction_id); }
    } catch { toast.error('Error iniciando video'); setGeneratingVideo(false); }
  };

  const reset = () => {
    setStep('strategy'); setProductMode(null); setSelectedProduct(null);
    setSelectedCategory(null); setSelectedCampaign(null); setSelectedAngle(null);
    setCustomAngle(''); setShowCustomAngle(false); setInstrucciones('');
    setGeneratedVariaciones(null); setSelectedVariacion(null); setBriefsVisuales([]);
    setSelectedBriefs([]); setSavedCreativeId(null); setGeneratedAssetUrls([]); setVideoProgress('');
  };

  const saveManualConfig = async () => {
    setSavingConfig(true);
    try {
      const faseToSave = manualFase || faseNegocio;
      const presNumerico = parseInt((manualPresupuesto || presupuestoAds).replace(/\D/g, ''), 10) || null;

      const { error } = await supabase
        .from('clients')
        .update({ 
          fase_negocio: faseToSave || null,
          presupuesto_ads: presNumerico,
        })
        .eq('id', clientId);

      if (error) throw error;

      if (faseToSave) setFaseNegocio(faseToSave);
      if (presNumerico) setPresupuestoAds(String(presNumerico));
      setManualFase('');
      setManualPresupuesto('');
      toast.success('✅ Configuración guardada');
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

            {/* Inline config form when values are missing */}
            {(!faseNegocio || !presupuestoAds) && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <p className="text-sm font-semibold text-primary">⚙️ Configura tu negocio para continuar</p>
                  <p className="text-xs text-muted-foreground">Completa estos datos o conecta el Brief con Steve para detección automática.</p>
                  
                  {!faseNegocio && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Fase de negocio</label>
                      <select
                        className="w-full text-sm border border-border rounded-md p-2 bg-background text-foreground"
                        value={manualFase}
                        onChange={e => setManualFase(e.target.value)}
                      >
                        <option value="">Selecciona tu fase...</option>
                        <option value="Fase Inicial">Fase Inicial (menos de $500.000 CLP/mes)</option>
                        <option value="Fase Crecimiento">Fase Crecimiento ($500.000 - $5.000.000 CLP/mes)</option>
                        <option value="Fase Escalado">Fase Escalado ($5.000.000 - $25.000.000 CLP/mes)</option>
                        <option value="Fase Avanzada">Fase Avanzada (más de $25.000.000 CLP/mes)</option>
                      </select>
                    </div>
                  )}

                  {!presupuestoAds && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Presupuesto mensual de ads</label>
                      <input
                        type="text"
                        placeholder="Ej: $300.000 CLP/mes"
                        className="w-full text-sm border border-border rounded-md p-2 bg-background text-foreground"
                        value={manualPresupuesto}
                        onChange={e => setManualPresupuesto(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={saveManualConfig}
                    disabled={savingConfig || (!manualFase && !faseNegocio) || (!manualPresupuesto && !presupuestoAds)}
                  >
                    {savingConfig ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Guardar y continuar
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Values display once configured */}
            {faseNegocio && presupuestoAds && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">Fase detectada</span>
                      </div>
                      <p className="text-2xl font-bold">{faseNegocio}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-secondary/20 bg-secondary/10">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-foreground" />
                        <span className="text-sm font-semibold text-foreground">Presupuesto mensual de ads</span>
                      </div>
                      <p className="text-xl font-bold">{presupuestoAds}</p>
                    </CardContent>
                  </Card>
                </div>

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

                <Button className="w-full" onClick={() => { setStep('product'); loadProducts(); }}>
                  Continuar — Elegir Producto <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            )}
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
                  {recommendedAngles.map(a => {
                    const explanation = getAngleExplanation(selectedCampaign, a);
                    return (
                      <div
                        key={a}
                        onClick={() => { setSelectedAngle(a); setShowCustomAngle(false); }}
                        className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${selectedAngle === a && !showCustomAngle ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                      >
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                          <span className="text-sm font-semibold">{a}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 ml-6">
                          {explanation || 'Ángulo versátil que funciona en múltiples etapas del funnel.'}
                        </p>
                      </div>
                    );
                  })}
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
            {briefChips.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">📋 Contexto del brief — click para incluir/excluir</p>
                <div className="flex flex-wrap gap-2">
                  {briefChips.map(chip => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => toggleChip(chip.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all max-w-[300px] truncate ${
                        activeChips.has(chip.key)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {chip.emoji} {chip.label}: {chip.value}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando copies...</> : <><Sparkles className="w-4 h-4 mr-2" />Generar 10 Variaciones de Copy</>}
            </Button>
          </motion.div>
        )}

        {/* STEP 6: VARIACIONES — 3-2-2 selection */}
        {step === 'variaciones' && generatedVariaciones && (
          <motion.div key="variaciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Formato 3-2-2</h3>
                <p className="text-xs text-muted-foreground">Selecciona 3 copies · 2 títulos · 2 descripciones</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => generateVariaciones()}>
                <RefreshCw className="w-4 h-4 mr-1" />Regenerar las 10
              </Button>
            </div>

            {generatedVariaciones.explicacion && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-foreground">
                💡 {generatedVariaciones.explicacion}
              </div>
            )}

            {/* COPIES — checkbox múltiple, mínimo 3 de 3 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold uppercase tracking-wider">Copies</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedCopies.length === 3 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {selectedCopies.length}/3 seleccionados
                </span>
                <span className="text-xs text-muted-foreground">— se suben los 3 juntos a Meta</span>
              </div>
              {generatedVariaciones.variaciones.map((v, i) => {
                const isChecked = selectedCopies.includes(i);
                const isDisabled = !isChecked && selectedCopies.length >= 3;
                return (
                  <div
                    key={i}
                    onClick={() => !isDisabled && toggleCopy(i)}
                    className={`p-4 rounded-lg border-2 transition-all space-y-2 ${isChecked ? 'border-primary bg-primary/5 cursor-pointer' : isDisabled ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/50 cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleCopy(i)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 accent-primary shrink-0"
                        />
                        <Badge variant="outline">{v.badge}</Badge>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        disabled={regeneratingIdx === i}
                        onClick={e => { e.stopPropagation(); generateVariaciones(i); }}
                      >
                        {regeneratingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                        <span className="ml-1 text-xs">Regenerar</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Texto principal</p>
                    <p className="text-sm whitespace-pre-wrap">{v.texto_principal}</p>
                    {v.cta && <Badge variant="secondary">{v.cta}</Badge>}
                  </div>
                );
              })}
            </div>

            {/* 2 TÍTULOS — checkboxes, select any 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold uppercase tracking-wider">Títulos</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedTitles.length === 2 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {selectedTitles.length}/2 seleccionados
                </span>
              </div>
              {generatedVariaciones.variaciones.map((v, i) => {
                if (!v.titulo) return null;
                const isSelected = selectedTitles.includes(i);
                const isDisabled = !isSelected && selectedTitles.length >= 2;
                return (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : isDisabled ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => {
                        if (isSelected) setSelectedTitles(selectedTitles.filter(x => x !== i));
                        else if (selectedTitles.length < 2) setSelectedTitles([...selectedTitles, i]);
                      }}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm font-semibold">{v.titulo}</span>
                  </label>
                );
              })}
            </div>

            {/* 2 DESCRIPCIONES — checkboxes, select any 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold uppercase tracking-wider">Descripciones</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedDescriptions.length === 2 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {selectedDescriptions.length}/2 seleccionadas
                </span>
              </div>
              {generatedVariaciones.variaciones.map((v, i) => {
                if (!v.descripcion) return null;
                const isSelected = selectedDescriptions.includes(i);
                const isDisabled = !isSelected && selectedDescriptions.length >= 2;
                return (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : isDisabled ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => {
                        if (isSelected) setSelectedDescriptions(selectedDescriptions.filter(x => x !== i));
                        else if (selectedDescriptions.length < 2) setSelectedDescriptions([...selectedDescriptions, i]);
                      }}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm">{v.descripcion}</span>
                  </label>
                );
              })}
            </div>

            {/* Progress + CTA */}
            <div className={`rounded-lg p-3 text-sm border ${canProceed ? 'bg-green-50 border-green-200 text-green-800' : 'bg-muted border-border text-muted-foreground'}`}>
              {canProceed
                ? '✅ Formato 3-2-2 completo — listo para aprobar'
                : `Pendiente: ${selectedCopies.length < 3 ? `${3 - selectedCopies.length} cop${3 - selectedCopies.length === 1 ? 'y' : 'ies'} · ` : ''}${selectedTitles.length < 2 ? `${2 - selectedTitles.length} título${selectedTitles.length === 1 ? '' : 's'} · ` : ''}${selectedDescriptions.length < 2 ? `${2 - selectedDescriptions.length} descripción${selectedDescriptions.length === 1 ? '' : 'es'}` : ''}`
              }
            </div>

            <Button
              className="w-full"
              disabled={!canProceed}
              onClick={handleApproveVariaciones}
            >
              <CheckCircle className="w-4 h-4 mr-2" />Aprobar y continuar con Brief Visual
            </Button>
          </motion.div>
        )}

        {/* STEP 7: BRIEF VISUAL */}
        {step === 'brief' && (
          <motion.div key="brief" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Briefs Visuales</h3>
              {briefsVisuales.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Elige tus 3 favoritos para generar las fotos/videos</p>
              )}
            </div>
            {generatingBrief ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generando 6 briefs visuales en paralelo...</p>
              </div>
            ) : briefsVisuales.length > 0 ? (
              <div className="space-y-4">
                {/* Counter */}
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedBriefs.length === 3 ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    Seleccionados: {selectedBriefs.length}/3
                  </span>
                  {selectedBriefs.length < 3 && (
                    <span className="text-xs text-muted-foreground">Selecciona {3 - selectedBriefs.length} más</span>
                  )}
                </div>

                {/* 2x3 grid of 6 brief cards */}
                <div className="grid grid-cols-1 gap-3">
                  {briefsVisuales.map((brief, index) => {
                    const copyPatternIdx = [0, 1, 2, 0, 1, 2][index];
                    const copyIndex = selectedCopies[copyPatternIdx];
                    const variacion = generatedVariaciones?.variaciones[copyIndex];
                    const isChecked = selectedBriefs.includes(index);
                    const isDisabled = !isChecked && selectedBriefs.length >= 3;
                    return (
                      <div
                        key={index}
                        onClick={() => !isDisabled && toggleBrief(index)}
                        className={`rounded-lg border-2 p-3 space-y-2 transition-all ${isChecked ? 'border-primary bg-primary/5 cursor-pointer' : isDisabled ? 'border-border opacity-40 cursor-not-allowed' : 'border-border hover:border-primary/50 cursor-pointer'}`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-primary">📋 Brief {index + 1}</p>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => toggleBrief(index)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-primary shrink-0"
                          />
                        </div>
                        {variacion && (
                          <p className="text-xs text-muted-foreground">{variacion.titulo}</p>
                        )}
                        {Object.entries(brief).filter(([k]) => k !== 'prompt_generacion').map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, ' ')}</p>
                            <p className="text-xs">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* CTA - enabled only when 3 selected */}
                {!savedCreativeId ? (
                  <Button
                    className="w-full"
                    disabled={selectedBriefs.length !== 3}
                    onClick={handleApproveBrief}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {selectedBriefs.length === 3 ? 'Generar fotos y videos' : `Selecciona ${3 - selectedBriefs.length} brief${3 - selectedBriefs.length !== 1 ? 's' : ''} más`}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
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
                    {generatedAssetUrls.length > 0 && (
                      <div className="grid grid-cols-1 gap-3">
                        {generatedAssetUrls.map((url, i) => (
                          <div key={i} className="rounded-lg overflow-hidden border">
                            <p className="text-xs font-semibold text-muted-foreground px-2 pt-2">Imagen {i + 1}</p>
                            {url.includes('.mp4') ? (
                              <video src={url} controls className="w-full" />
                            ) : (
                              <img src={url} alt={`Imagen ${i + 1}`} className="w-full" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-2">
                      <Button className="flex-1" onClick={() => setStep('completed')}>
                        <CheckCircle className="w-4 h-4 mr-2" />✅ Finalizar y ver resumen
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => setStep('publish')}>
                        <Rocket className="w-4 h-4 mr-2" />Publicar en Meta
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}


        {/* STEP 8: PUBLISH */}
        {step === 'publish' && (
          <motion.div key="publish" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('brief')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            <h3 className="text-lg font-semibold">🚀 Publicar Ad Set en Meta</h3>

            {/* Technical config card */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold text-primary">⚙️ Configuración técnica del Ad Set</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Tipo de campaña</p><p className="font-medium">{CAMPAIGN_OPTIONS.find(c => c.id === selectedCampaign)?.label}</p></div>
                  <div><p className="text-xs text-muted-foreground">Estructura</p><p className="font-medium">CBO activado</p></div>
                  <div><p className="text-xs text-muted-foreground">Presupuesto diario</p><p className="font-medium">${presupuestoAds ? (parseInt(presupuestoAds) / 30).toLocaleString('es-CL') : '—'} CLP</p></div>
                  <div><p className="text-xs text-muted-foreground">Formato</p><p className="font-medium">Advantage+ placements</p></div>
                  <div><p className="text-xs text-muted-foreground">Audiencia</p><p className="font-medium">Visitas web 30 días + seguidores IG</p></div>
                  <div><p className="text-xs text-muted-foreground">Segmentación</p><p className="font-medium">Solo edad, género, ubicación</p></div>
                </div>
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground">Ad Set — Variaciones 3-2-2</p>
                  <p className="text-xs font-medium mt-1">3 copies · 2 títulos · 2 descripciones</p>
                </div>
              </CardContent>
            </Card>

            {/* Copy summary */}
            {selectedVariacion && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Copy aprobado</p>
                  <p className="text-sm font-semibold">{selectedVariacion.titulo}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3">{selectedVariacion.texto_principal}</p>
                  {selectedVariacion.cta && <Badge>{selectedVariacion.cta}</Badge>}
                </CardContent>
              </Card>
            )}

            {/* Publish action */}
            {!publishedAdSet ? (
              <Button
                className="w-full"
                onClick={async () => {
                  setPublishLoading(true);
                  await new Promise(r => setTimeout(r, 2000)); // Simulated API call
                  const reviewDate = new Date();
                  reviewDate.setDate(reviewDate.getDate() + 7);
                  const adSetName = `${CAMPAIGN_OPTIONS.find(c => c.id === selectedCampaign)?.label} — ${effectiveAngle} — ${new Date().toLocaleDateString('es-CL')}`;
                  const simulatedId = `adset_${Date.now()}`;
                  setPublishedAdSet({
                    name: adSetName,
                    id: simulatedId,
                    budget: presupuestoAds ? `${(parseInt(presupuestoAds) / 30).toLocaleString('es-CL')} CLP/día` : '—',
                    reviewDate: reviewDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
                  });
                  setCharlieRevisionDate(reviewDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }));
                  setPublishLoading(false);
                  setStep('charlie');
                }}
                disabled={publishLoading}
              >
                {publishLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Publicando Ad Set...</> : <><Rocket className="w-4 h-4 mr-2" />✅ Confirmar y Publicar Ad Set en Meta</>}
              </Button>
            ) : null}
          </motion.div>
        )}

        {/* STEP 9: CHARLIE POST LAUNCH */}
        {step === 'charlie' && (
          <motion.div key="charlie" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Success header */}
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <Rocket className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold">🚀 ¡Ad Set lanzado con Método Charlie!</h3>
            </div>

            {/* Launch summary */}
            {publishedAdSet && (
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Producto</p><p className="font-medium">{selectedProduct?.title || selectedCategory || 'Genérico'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Ángulo</p><p className="font-medium">{effectiveAngle}</p></div>
                    <div><p className="text-xs text-muted-foreground">Presupuesto diario</p><p className="font-medium">{publishedAdSet.budget}</p></div>
                    <div><p className="text-xs text-muted-foreground">Estado</p><Badge variant="outline" className="text-xs text-amber-600 border-amber-300">En revisión por Meta (24-48h)</Badge></div>
                    <div className="col-span-2"><p className="text-xs text-muted-foreground">ID Ad Set</p><p className="font-mono text-xs text-muted-foreground">{publishedAdSet.id}</p></div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Charlie rules */}
            <Card className="border-destructive/30">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-bold text-destructive">⚠️ Reglas hasta {charlieRevisionDate}:</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4 shrink-0" /><span>❌ No pausar el Ad Set</span></div>
                  <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4 shrink-0" /><span>❌ No cambiar el presupuesto</span></div>
                  <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4 shrink-0" /><span>❌ No cambiar la audiencia</span></div>
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4 shrink-0" /><span>✅ Dejar que Meta aprenda durante 7 días</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Notification info */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Revisión Charlie agendada</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{charlieRevisionDate}</span>
                </div>
                <p className="text-xs text-muted-foreground">Te notificaremos aquí en la pestaña "📅 Revisión Charlie" cuando sea el momento de revisar.</p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />Crear otro Ad Set
              </Button>
              <Button className="flex-1" onClick={onBack}>
                Ver panel de campañas
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP: COMPLETED — success confirmation */}
        {step === 'completed' && (
          <motion.div key="completed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold">¡Anuncio creado exitosamente! 🎉</h3>
              <p className="text-muted-foreground">Tu creativo ya está en la Biblioteca con su Plan de Acción DCT listo.</p>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-xl p-5 space-y-3 border border-border">
              <p className="text-sm font-semibold">Resumen del anuncio</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Título</p>
                  <p className="font-medium truncate">{selectedVariacion?.titulo || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ángulo creativo</p>
                  <p className="font-medium">{effectiveAngle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Campaña</p>
                  <p className="font-medium">{CAMPAIGN_OPTIONS.find(c => c.id === selectedCampaign)?.label}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Imágenes generadas</p>
                  <p className="font-medium">{generatedAssetUrls.length}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => onGoToLibrary ? onGoToLibrary() : onBack()}>
                📚 Ir a Biblioteca
              </Button>
              <Button variant="outline" className="w-full" onClick={reset}>
                ➕ Crear otro anuncio
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
