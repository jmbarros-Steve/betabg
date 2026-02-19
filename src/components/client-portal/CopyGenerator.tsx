import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Sparkles, Image, Video, ArrowLeft, ArrowRight,
  RotateCcw, CheckCircle, ThumbsDown, ImageIcon, RefreshCw,
  Edit, Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ClientAssetsGallery } from './ClientAssetsGallery';
import { AdCreativesLibrary } from './AdCreativesLibrary';

interface CopyGeneratorProps {
  clientId: string;
}

type Funnel = 'tofu' | 'mofu' | 'bofu';
type Formato = 'static' | 'video';
type WizardStep = 'funnel' | 'formato' | 'angulo' | 'instrucciones' | 'variaciones' | 'brief';

interface Variacion {
  badge: string;
  titulo: string;
  texto_principal: string;
  descripcion: string;
  cta: string;
}

interface GeneratedVariaciones {
  explicacion: string;
  variaciones: Variacion[];
}

interface ClientAsset {
  id: string;
  url: string;
  nombre: string;
  tipo: string;
  created_at: string;
}

const FUNNEL_INFO = {
  tofu: {
    emoji: '🎯',
    label: 'TOFU',
    subtitle: 'Audiencia Fría',
    desc: 'No te conocen. Hay que educar y generar curiosidad.',
    color: 'border-blue-400 bg-blue-50 hover:bg-blue-100',
    activeColor: 'border-blue-500 bg-blue-500 text-white',
    recomienda: ['Call Out', 'Bold Statement', 'Ugly Ads', 'Memes'],
  },
  mofu: {
    emoji: '🔥',
    label: 'MOFU',
    subtitle: 'Audiencia Tibia',
    desc: 'Te consideran. Hay que construir confianza.',
    color: 'border-amber-400 bg-amber-50 hover:bg-amber-100',
    activeColor: 'border-amber-500 bg-amber-500 text-white',
    recomienda: ['Reviews', 'Us vs Them', 'Credenciales en Medios', 'Testimonios'],
  },
  bofu: {
    emoji: '💰',
    label: 'BOFU',
    subtitle: 'Audiencia Caliente',
    desc: 'Listos para comprar. Hay que cerrar la venta.',
    color: 'border-green-400 bg-green-50 hover:bg-green-100',
    activeColor: 'border-green-500 bg-green-500 text-white',
    recomienda: ['Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Reviews + Beneficios'],
  },
};

const ALL_ANGLES = [
  'Beneficios', 'Bold Statement', 'Us vs Them', 'Call Out',
  'Antes y Después', 'Beneficios Principales', 'Pantalla Dividida',
  'Nueva Colección', 'Reviews', 'Detalles de Producto', 'Ugly Ads',
  'Cyber/Fechas Especiales', 'Ingredientes/Material', 'Credenciales en Medios',
  'Reviews + Beneficios', 'Memes', 'Descuentos/Ofertas', 'Resultados',
  'Paquetes', 'Mensajes y Comentarios',
];

export function CopyGenerator({ clientId }: CopyGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'assets' | 'biblioteca'>('generate');
  const [step, setStep] = useState<WizardStep>('funnel');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [formato, setFormato] = useState<Formato | null>(null);
  const [angulo, setAngulo] = useState<string | null>(null);
  const [customAngulo, setCustomAngulo] = useState('');
  const [showCustomAngulo, setShowCustomAngulo] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariaciones, setGeneratedVariaciones] = useState<GeneratedVariaciones | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);

  // Brief visual state
  const [selectedVariacion, setSelectedVariacion] = useState<Variacion | null>(null);
  const [briefVisual, setBriefVisual] = useState<Record<string, unknown> | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState<string | null>(null);
  const [savedCreativeId, setSavedCreativeId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('buyer_personas')
      .select('id, is_complete')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle()
      .then(({ data }) => setHasBrief(!!data));
  }, [clientId]);

  const resetWizard = () => {
    setStep('funnel');
    setFunnel(null);
    setFormato(null);
    setAngulo(null);
    setCustomAngulo('');
    setShowCustomAngulo(false);
    setInstrucciones('');
    setGeneratedVariaciones(null);
    setSelectedVariacion(null);
    setBriefVisual(null);
    setEditingBrief(false);
    setSelectedFotoUrl(null);
    setSavedCreativeId(null);
  };

  const efectiveAngulo = showCustomAngulo && customAngulo.trim() ? customAngulo.trim() : angulo;

  const getRecommendedAngles = (): string[] => {
    if (!funnel) return [];
    return FUNNEL_INFO[funnel].recomienda;
  };

  const generateVariaciones = async (regenerateIdx?: number) => {
    if (!funnel || !formato || !efectiveAngulo) return;

    if (regenerateIdx !== undefined) {
      setRegeneratingIdx(regenerateIdx);
    } else {
      setIsGenerating(true);
    }

    try {
      const { data, error } = await supabase.functions.invoke('generate-meta-copy', {
        body: {
          clientId,
          adType: formato,
          funnelStage: funnel,
          angulo: efectiveAngulo,
          customPrompt: instrucciones.trim() || undefined,
          assetUrls: assets.slice(0, 5).map(a => a.url),
          mode: 'variaciones',
        },
      });

      if (error) throw error;

      // Try to parse the response
      let parsed: GeneratedVariaciones;
      if (typeof data === 'string') {
        const clean = data.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } else {
        parsed = data;
      }

      if (regenerateIdx !== undefined && generatedVariaciones) {
        // Replace just that one variacion
        const updatedVars = [...generatedVariaciones.variaciones];
        if (parsed.variaciones?.[0]) {
          updatedVars[regenerateIdx] = { ...parsed.variaciones[0], badge: `Variación ${['A', 'B', 'C'][regenerateIdx]}` };
        }
        setGeneratedVariaciones({ ...generatedVariaciones, variaciones: updatedVars });
      } else {
        setGeneratedVariaciones(parsed);
        setStep('variaciones');
      }
      toast.success('Copies generados');
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
    await generateBriefVisual(v);
  };

  const generateBriefVisual = async (v: Variacion) => {
    setGeneratingBrief(true);
    setBriefVisual(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-meta-copy', {
        body: {
          clientId,
          adType: formato,
          funnelStage: funnel,
          angulo: efectiveAngulo,
          assetUrls: assets.slice(0, 5).map(a => a.url),
          variacionElegida: v,
          mode: 'brief_visual',
        },
      });

      if (error) throw error;

      let parsed: Record<string, unknown>;
      if (typeof data === 'string') {
        const clean = data.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } else {
        parsed = data;
      }

      setBriefVisual(parsed);

      // Auto-select recommended photo
      if (parsed.foto_recomendada && typeof parsed.foto_recomendada === 'string') {
        setSelectedFotoUrl(parsed.foto_recomendada as string);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error generando el brief visual');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    if (!briefVisual || !selectedVariacion || !funnel || !formato || !efectiveAngulo) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ad_creatives')
        .insert({
          client_id: clientId,
          funnel,
          formato,
          angulo: efectiveAngulo,
          titulo: selectedVariacion.titulo,
          texto_principal: selectedVariacion.texto_principal,
          descripcion: selectedVariacion.descripcion,
          cta: selectedVariacion.cta,
          brief_visual: briefVisual,
          prompt_generacion: (briefVisual.prompt_generacion as string) || null,
          foto_base_url: selectedFotoUrl,
          estado: 'aprobado',
          custom_instructions: instrucciones.trim() || null,
        })
        .select('id')
        .single();

      if (error) throw error;
      setSavedCreativeId(data?.id || null);
      toast.success('✅ Creativo guardado en la Biblioteca');
    } catch (err) {
      toast.error('Error al guardar');
    }
  };

  const stepTitles: Record<WizardStep, string> = {
    funnel: 'Paso 1 — Funnel',
    formato: 'Paso 2 — Formato',
    angulo: 'Paso 3 — Ángulo',
    instrucciones: 'Paso 4 — Instrucciones',
    variaciones: 'Paso 5 — Variaciones',
    brief: 'Paso 6 — Brief Visual',
  };

  const steps: WizardStep[] = ['funnel', 'formato', 'angulo', 'instrucciones', 'variaciones', 'brief'];
  const currentStepIdx = steps.indexOf(step);

  if (hasBrief === null) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!hasBrief) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Brief Incompleto</h3>
          <p className="text-sm text-muted-foreground">Completa el Brief de Marca con Steve primero para usar el generador de copies.</p>
        </CardContent>
      </Card>
    );
  }

  const recommendedAngles = getRecommendedAngles();
  const otherAngles = ALL_ANGLES.filter(a => !recommendedAngles.includes(a));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Generador de Meta Ads</h2>
          <p className="text-sm text-muted-foreground">Metodología Sabri Suby + Russell Brunson</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate" id="generate-tab-trigger">
            <Sparkles className="w-4 h-4 mr-2" />Generar
          </TabsTrigger>
          <TabsTrigger value="assets" id="assets-tab-trigger">
            <ImageIcon className="w-4 h-4 mr-2" />Mis Assets
          </TabsTrigger>
          <TabsTrigger value="biblioteca">
            <ImageIcon className="w-4 h-4 mr-2" />Biblioteca
          </TabsTrigger>
        </TabsList>

        {/* ─── GENERATE TAB ─── */}
        <TabsContent value="generate" className="mt-6">
          {/* Asset warning banner */}
          <ClientAssetsGallery
            clientId={clientId}
            compact
            onAssetsLoaded={setAssets}
          />

          {/* Progress bar */}
          <div className="flex items-center gap-1 mb-6">
            {steps.slice(0, 4).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < currentStepIdx ? 'bg-primary/20 text-primary' :
                  i === currentStepIdx ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>{i + 1}</div>
                {i < 3 && <div className={`flex-1 h-0.5 w-8 ${i < currentStepIdx ? 'bg-primary/40' : 'bg-muted'}`} />}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={resetWizard}>
              <RotateCcw className="w-4 h-4 mr-1" />Reiniciar
            </Button>
          </div>

          <AnimatePresence mode="wait">
            {/* ── STEP 1: FUNNEL ── */}
            {step === 'funnel' && (
              <motion.div key="funnel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <h3 className="text-lg font-semibold text-center">¿En qué etapa del funnel está tu audiencia?</h3>
                <div className="grid gap-4">
                  {(Object.entries(FUNNEL_INFO) as [Funnel, typeof FUNNEL_INFO.tofu][]).map(([key, info]) => (
                    <Card
                      key={key}
                      className={`cursor-pointer transition-all border-2 ${funnel === key ? info.activeColor : info.color}`}
                      onClick={() => { setFunnel(key); setStep('formato'); }}
                    >
                      <CardContent className="p-5 flex items-center gap-4">
                        <span className="text-4xl">{info.emoji}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-base">{info.label}</span>
                            <Badge variant="outline" className="text-[10px]">{info.subtitle}</Badge>
                          </div>
                          <p className="text-sm">{info.desc}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 opacity-50" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: FORMATO ── */}
            {step === 'formato' && funnel && (
              <motion.div key="formato" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep('funnel')}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Volver
                </Button>
                <h3 className="text-lg font-semibold text-center">¿Qué tipo de creativo necesitas?</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { key: 'static' as Formato, emoji: '📸', label: 'Estático', desc: 'Ideal para Reviews, Beneficios, Ofertas y BOFU', rec: funnel === 'bofu' },
                    { key: 'video' as Formato, emoji: '🎬', label: 'Video', desc: 'Ideal para TOFU, Transformaciones y Ugly Ads', rec: funnel === 'tofu' },
                  ].map(f => (
                    <Card
                      key={f.key}
                      className="cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all border-2"
                      onClick={() => { setFormato(f.key); setStep('angulo'); }}
                    >
                      <CardContent className="p-8 text-center">
                        <div className="text-5xl mb-3">{f.emoji}</div>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <h4 className="font-bold">{f.label}</h4>
                          {f.rec && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">⭐ Recomendado</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{f.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: ÁNGULO ── */}
            {step === 'angulo' && funnel && formato && (
              <motion.div key="angulo" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <Button variant="ghost" size="sm" onClick={() => setStep('formato')}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Volver
                </Button>
                <h3 className="text-lg font-semibold">¿Qué ángulo creativo usamos?</h3>

                {/* Recommended angles */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">⭐ Recomendados para {funnel.toUpperCase()}</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendedAngles.map(a => (
                      <button
                        key={a}
                        onClick={() => { setAngulo(a); setShowCustomAngulo(false); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                          angulo === a && !showCustomAngulo
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        ⭐ {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Other angles */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Otros ángulos</p>
                  <div className="flex flex-wrap gap-2">
                    {otherAngles.map(a => (
                      <button
                        key={a}
                        onClick={() => { setAngulo(a); setShowCustomAngulo(false); }}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                          angulo === a && !showCustomAngulo
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom angle */}
                <button
                  onClick={() => { setShowCustomAngulo(true); setAngulo(null); }}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border-2 border-dashed transition-all ${
                    showCustomAngulo ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
                  }`}
                >
                  <Edit className="w-4 h-4" />
                  ✏️ Quiero usar mi propio ángulo
                </button>
                {showCustomAngulo && (
                  <input
                    type="text"
                    value={customAngulo}
                    onChange={e => setCustomAngulo(e.target.value)}
                    placeholder="Describe tu ángulo creativo..."
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    autoFocus
                  />
                )}

                <Button
                  className="w-full"
                  disabled={!efectiveAngulo}
                  onClick={() => setStep('instrucciones')}
                >
                  Continuar <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {/* ── STEP 4: INSTRUCCIONES ── */}
            {step === 'instrucciones' && (
              <motion.div key="instrucciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep('angulo')}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Volver
                </Button>

                {/* Summary */}
                <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50">
                  <Badge variant="outline">{funnel?.toUpperCase()}</Badge>
                  <Badge variant="outline">{formato === 'video' ? '🎬 Video' : '📸 Imagen'}</Badge>
                  <Badge variant="outline">{efectiveAngulo}</Badge>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-1">Instrucciones adicionales</h3>
                  <p className="text-sm text-muted-foreground mb-3">Opcional — menciona ofertas específicas, temporadas, productos destacados, etc.</p>
                  <Textarea
                    value={instrucciones}
                    onChange={e => setInstrucciones(e.target.value)}
                    placeholder="Ej: Tenemos 30% OFF esta semana. El producto estrella es el set premium de 3 piezas."
                    className="min-h-[100px]"
                  />
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={isGenerating}
                  onClick={() => generateVariaciones()}
                >
                  {isGenerating ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" />Generando con IA...</>
                  ) : (
                    <><Wand2 className="w-5 h-5 mr-2" />✨ Generar 3 Variaciones de Copy</>
                  )}
                </Button>
              </motion.div>
            )}

            {/* ── STEP 5: VARIACIONES ── */}
            {step === 'variaciones' && generatedVariaciones && (
              <motion.div key="variaciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setStep('instrucciones')}>
                    <ArrowLeft className="w-4 h-4 mr-1" />Volver
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => generateVariaciones()} disabled={isGenerating}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                    Regenerar las 3
                  </Button>
                </div>

                {/* Explicación de Steve */}
                <div className="p-4 rounded-lg border-l-4 border-amber-400 bg-amber-50">
                  <p className="text-xs font-semibold text-amber-700 mb-1">💡 Por qué este ángulo funciona</p>
                  <p className="text-sm text-amber-800">{generatedVariaciones.explicacion}</p>
                </div>

                {/* 3 variaciones */}
                <div className="grid gap-4 md:grid-cols-3">
                  {generatedVariaciones.variaciones.map((v, idx) => (
                    <Card key={idx} className="flex flex-col">
                      <CardContent className="p-4 flex flex-col flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge className="bg-primary/10 text-primary border-primary/20">{v.badge}</Badge>
                          <button
                            onClick={() => generateVariaciones(idx)}
                            disabled={regeneratingIdx === idx}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            {regeneratingIdx === idx
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ThumbsDown className="w-3 h-3" />}
                            Regenerar
                          </button>
                        </div>

                        <div className="space-y-2 flex-1">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Título</p>
                            <p className="text-sm font-semibold">{v.titulo}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Texto Principal</p>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{v.texto_principal}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Descripción</p>
                            <p className="text-sm">{v.descripcion}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">CTA</p>
                            <p className="text-sm font-medium text-primary">{v.cta}</p>
                          </div>
                        </div>

                        <Button
                          className="w-full"
                          size="sm"
                          onClick={() => handleChooseVariacion(v)}
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Elegir esta variación
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP 6: BRIEF VISUAL ── */}
            {step === 'brief' && (
              <motion.div key="brief" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <Button variant="ghost" size="sm" onClick={() => setStep('variaciones')}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Volver a variaciones
                </Button>

                {generatingBrief && (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generando brief visual con IA...</p>
                  </div>
                )}

                {briefVisual && !generatingBrief && (
                  <>
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                      <p className="text-xs font-semibold text-amber-700 mb-1">📋 Brief Visual de Producción</p>
                      <p className="text-xs text-amber-600">
                        {briefVisual.tipo === 'video' ? '🎬 Video · Costo estimado: ~$0.50 USD' : '🖼 Imagen · Costo estimado: ~$0.05 USD'}
                      </p>
                    </div>

                    {/* Brief fields */}
                    <div className="grid gap-3">
                      {Object.entries(briefVisual)
                        .filter(([k]) => k !== 'tipo')
                        .map(([key, val]) => (
                          <div key={key} className="p-3 rounded-lg border border-border bg-card">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                              {key.replace(/_/g, ' ')}
                            </p>
                            {typeof val === 'object' ? (
                              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80">
                                {JSON.stringify(val, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-sm">{String(val)}</p>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Foto recomendada */}
                    {assets.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">📷 Foto base</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {assets.map(a => (
                            <button
                              key={a.id}
                              onClick={() => setSelectedFotoUrl(a.url)}
                              className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                                selectedFotoUrl === a.url ? 'border-primary' : 'border-transparent'
                              }`}
                            >
                              <img src={a.url} alt={a.nombre} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generación stub */}
                    <div className="p-4 rounded-lg border border-dashed border-border bg-muted/30">
                      <p className="text-sm font-medium mb-2">🚀 Generación de Creativo</p>
                      <div className="flex gap-2">
                        <Button variant="outline" disabled className="flex-1">
                          <ImageIcon className="w-4 h-4 mr-2 opacity-40" />
                          🖼 Generar Imagen
                        </Button>
                        <Button variant="outline" disabled className="flex-1">
                          <Video className="w-4 h-4 mr-2 opacity-40" />
                          🎬 Generar Video
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Próximamente — integración con Fal.ai / Kling AI
                      </p>
                    </div>

                    {savedCreativeId ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <p className="text-sm text-green-700 font-medium">Guardado en la Biblioteca de Creativos</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => setActiveTab('biblioteca')}
                        >
                          Ver biblioteca →
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <Button
                          className="flex-1"
                          onClick={handleApproveBrief}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          ✅ Aprobar Brief y Guardar
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => generateBriefVisual(selectedVariacion!)}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Regenerar
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ─── ASSETS TAB ─── */}
        <TabsContent value="assets" className="mt-6">
          <ClientAssetsGallery
            clientId={clientId}
            onAssetsLoaded={setAssets}
          />
        </TabsContent>

        {/* ─── BIBLIOTECA TAB ─── */}
        <TabsContent value="biblioteca" className="mt-6">
          <AdCreativesLibrary clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
