import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Sparkles, Image as ImageIcon, Video, ArrowLeft, ArrowRight,
  RotateCcw, CheckCircle, ThumbsDown, RefreshCw, Edit, Wand2,
  Coins, AlertCircle, Download, Play, Target, Settings, FileText, Copy, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { ClientAssetsGallery } from './ClientAssetsGallery';
import { AdCreativesLibrary } from './AdCreativesLibrary';
import { MetaAdCreator } from './MetaAdCreator';
import { MetaAdsConfigPanel } from './MetaAdsConfigPanel';
import { useBriefContext } from '@/hooks/useBriefContext';
import { PlanGate } from './PlanGate';

interface CopyGeneratorProps { clientId: string; }

type Funnel = 'tofu' | 'mofu' | 'bofu';
type Formato = 'static' | 'video';
type WizardStep = 'funnel' | 'formato' | 'angulo' | 'instrucciones' | 'variaciones' | 'brief';

interface Variacion {
  badge: string; titulo: string; texto_principal: string; descripcion: string; cta: string;
}
interface GeneratedVariaciones { explicacion: string; variaciones: Variacion[]; }
interface ClientAsset { id: string; url: string; nombre: string; tipo: string; created_at: string; }
interface BriefVisual { tipo: string; [key: string]: unknown; }
interface Credits { creditos_disponibles: number; creditos_usados: number; plan: string; }

interface VideoScriptScene { texto: string; visual: string; duracion_segundos: number; }
interface VideoScript {
  titulo: string; duracion: string; funnel: string;
  hook: { texto: string; visual: string; duracion_segundos: number };
  body: VideoScriptScene[];
  cta: { texto: string; visual: string; duracion_segundos: number };
  musica_sugerida: string; notas_produccion: string;
}

// Smart renderer for brief visual fields — handles objects like texto_overlay, colores, escenas
const renderBriefField = (key: string, val: unknown): React.ReactNode => {
  if (val == null) return <p className="text-sm text-muted-foreground">—</p>;
  if (typeof val !== 'object') return <p className="text-sm">{String(val)}</p>;
  if (Array.isArray(val)) {
    return (
      <ul className="space-y-1">
        {val.map((item, i) => (
          <li key={i} className="text-sm">
            {typeof item === 'object' && item !== null
              ? <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
                  {Object.entries(item).map(([k, v]) => (
                    <p key={k}><span className="font-medium text-muted-foreground text-xs uppercase">{k.replace(/_/g, ' ')}:</span> {String(v)}</p>
                  ))}
                </div>
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  const entries = Object.entries(val as Record<string, unknown>);
  const isColorObj = key.toLowerCase().includes('color') || entries.some(([, v]) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v as string));
  if (isColorObj) {
    return (
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-sm">
            <div className="w-5 h-5 rounded border border-border shrink-0" style={{ backgroundColor: String(v) }} />
            <span className="text-muted-foreground text-xs">{k.replace(/_/g, ' ')}:</span>
            <span className="font-mono text-xs">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k}>
          <span className="font-medium text-muted-foreground text-xs uppercase">{k.replace(/_/g, ' ')}:</span>{' '}
          {typeof v === 'object' ? <span className="text-sm">{JSON.stringify(v)}</span> : <span className="text-sm">{String(v)}</span>}
        </div>
      ))}
    </div>
  );
};

const FUNNEL_INFO = {
  tofu: { emoji: '🎯', label: 'TOFU', subtitle: 'Audiencia Fría', desc: 'No te conocen. Hay que educar y generar curiosidad.', border: 'border-[#38BDF8]', bg: 'bg-[#F0F4FA] hover:bg-[#D6E0F0]', activeBg: 'bg-[#2A4F9E] text-white border-[#2A4F9E]', recomienda: ['Call Out', 'Bold Statement', 'Ugly Ads', 'Memes'] },
  mofu: { emoji: '🔥', label: 'MOFU', subtitle: 'Audiencia Tibia', desc: 'Te consideran. Hay que construir confianza.', border: 'border-amber-400', bg: 'bg-amber-50 hover:bg-amber-100', activeBg: 'bg-amber-500 text-white border-amber-500', recomienda: ['Reviews', 'Us vs Them', 'Credenciales en Medios', 'Reviews + Beneficios'] },
  bofu: { emoji: '💰', label: 'BOFU', subtitle: 'Audiencia Caliente', desc: 'Listos para comprar. Hay que cerrar la venta.', border: 'border-green-400', bg: 'bg-green-50 hover:bg-green-100', activeBg: 'bg-green-500 text-white border-green-500', recomienda: ['Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Reviews + Beneficios'] },
};

const ALL_ANGLES = ['Beneficios', 'Bold Statement', 'Us vs Them', 'Call Out', 'Antes y Después', 'Beneficios Principales', 'Pantalla Dividida', 'Nueva Colección', 'Reviews', 'Detalles de Producto', 'Ugly Ads', 'Cyber/Fechas Especiales', 'Ingredientes/Material', 'Credenciales en Medios', 'Reviews + Beneficios', 'Memes', 'Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Mensajes y Comentarios'];

export function CopyGenerator({ clientId }: CopyGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'crear' | 'generate' | 'assets' | 'biblioteca' | 'config'>('crear');
  const [step, setStep] = useState<WizardStep>('funnel');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [formato, setFormato] = useState<Formato | null>(null);
  const [angulo, setAngulo] = useState<string | null>(null);
  const [customAngulo, setCustomAngulo] = useState('');
  const [showCustomAngulo, setShowCustomAngulo] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);
  const { chips: briefChips, activeChips, toggleChip, getActiveChipsText } = useBriefContext(clientId);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariaciones, setGeneratedVariaciones] = useState<GeneratedVariaciones | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [isSavingBrief, setIsSavingBrief] = useState(false);

  // Brief visual
  const [selectedVariacion, setSelectedVariacion] = useState<Variacion | null>(null);
  const [briefVisual, setBriefVisual] = useState<BriefVisual | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState<string | null>(null);
  const [savedCreativeId, setSavedCreativeId] = useState<string | null>(null);

  // Script generation state
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<VideoScript | null>(null);
  const [scriptDuracion, setScriptDuracion] = useState<'15s' | '30s' | '60s'>('30s');

  // Generation state
  const [generatingImage, setGeneratingImage] = useState(false);
  const imageEngine = 'imagen'; // All image generation uses Gemini
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoPollingId, setVideoPollingId] = useState<string | null>(null);
  const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [generatedAssetUrl, setGeneratedAssetUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<string>('');

  useEffect(() => {
    supabase.from('buyer_personas').select('id, is_complete').eq('client_id', clientId).eq('is_complete', true).maybeSingle()
      .then(({ data }) => setHasBrief(!!data))
      .catch((err) => console.error('[CopyGenerator] Query failed:', err));
    fetchCredits();
  }, [clientId]);

  const fetchCredits = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('client_credits').select('creditos_disponibles, creditos_usados, plan').eq('client_id', clientId).maybeSingle();
    if (error) { toast.error('Error al cargar créditos'); return; }
    if (!data) {
      setCredits({ creditos_disponibles: 0, creditos_usados: 0, plan: 'free_beta' });
      toast.error('No se encontraron créditos. Contacta al administrador.');
      return;
    }
    setCredits(data);
  };

  const resetWizard = () => {
    setStep('funnel'); setFunnel(null); setFormato(null); setAngulo(null);
    setCustomAngulo(''); setShowCustomAngulo(false); setInstrucciones('');
    setGeneratedVariaciones(null); setSelectedVariacion(null); setBriefVisual(null);
    setSelectedFotoUrl(null); setSavedCreativeId(null);
    setGeneratedAssetUrl(null); setVideoPollingId(null); setVideoProgress('');
    setGeneratedScript(null);
  };

  const efectiveAngulo = showCustomAngulo && customAngulo.trim() ? customAngulo.trim() : angulo;
  const recommendedAngles = funnel ? FUNNEL_INFO[funnel].recomienda : [];
  const otherAngles = ALL_ANGLES.filter(a => !recommendedAngles.includes(a));

  const generateVariaciones = async (regenerateIdx?: number) => {
    if (!funnel || !formato || !efectiveAngulo) return;

    if ((credits?.creditos_disponibles ?? 0) < 1 && regenerateIdx === undefined) {
      toast.error('Sin créditos disponibles');
      return;
    }

    if (regenerateIdx !== undefined) setRegeneratingIdx(regenerateIdx);
    else setIsGenerating(true);

    try {
      const chipsText = getActiveChipsText();
      const fullInstrucciones = [instrucciones.trim(), chipsText].filter(Boolean).join('. ') || undefined;
      const { data, error } = await callApi('generate-copy', {
        body: { clientId, funnel, formato, angulo: efectiveAngulo, instrucciones: fullInstrucciones, assetUrls: assets.slice(0, 5).map(a => a.url) },
      });

      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos disponibles'); return; }

      let parsed: GeneratedVariaciones = data;
      if (typeof data === 'string') { const c = data.replace(/```json|```/g, '').trim(); parsed = JSON.parse(c); }

      if (regenerateIdx !== undefined && generatedVariaciones) {
        const updatedVars = [...generatedVariaciones.variaciones];
        if (parsed.variaciones?.[0]) updatedVars[regenerateIdx] = { ...parsed.variaciones[0], badge: `Variación ${['A', 'B', 'C'][regenerateIdx]}` };
        setGeneratedVariaciones({ ...generatedVariaciones, variaciones: updatedVars });
      } else {
        setGeneratedVariaciones(parsed);
        setStep('variaciones');
        await fetchCredits();
      }
      toast.success('Copies generados');
    } catch {
      // Error handled by toast
      toast.error('Error al generar copies');
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
      const { data, error } = await callApi('generate-brief-visual', {
        body: { clientId, formato, angulo: efectiveAngulo, variacionElegida: v, assetUrls: assets.slice(0, 5).map(a => a.url) },
      });
      if (error) throw error;
      let parsed: BriefVisual = data;
      if (typeof data === 'string') { const c = data.replace(/```json|```/g, '').trim(); parsed = JSON.parse(c); }
      setBriefVisual(parsed);
      // Auto-select recommended photo
      if (parsed.foto_recomendada && typeof parsed.foto_recomendada === 'string') {
        const recommendedUrl = parsed.foto_recomendada as string;
        const matchedAsset = assets.find(a => recommendedUrl.includes(a.url) || a.url.includes(recommendedUrl.split(' ')[0]));
        if (matchedAsset) setSelectedFotoUrl(matchedAsset.url);
        else if (assets.length > 0) setSelectedFotoUrl(assets[0].url);
      }
    } catch {
      // Error handled by toast
      toast.error('Error generando el brief visual');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    if (!briefVisual || !selectedVariacion || !funnel || !formato || !efectiveAngulo || isSavingBrief) return;
    setIsSavingBrief(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('ad_creatives').insert({
        client_id: clientId, funnel, formato, angulo: efectiveAngulo,
        titulo: selectedVariacion.titulo, texto_principal: selectedVariacion.texto_principal,
        descripcion: selectedVariacion.descripcion, cta: selectedVariacion.cta,
        brief_visual: briefVisual, prompt_generacion: (briefVisual.prompt_generacion as string) || null,
        foto_base_url: selectedFotoUrl, estado: 'aprobado', custom_instructions: instrucciones.trim() || null,
      }).select('id').single();
      if (error) throw error;
      setSavedCreativeId(data?.id || null);
      toast.success('Creativo guardado en la Biblioteca');
    } catch { toast.error('Error al guardar'); }
    finally { setIsSavingBrief(false); }
  };

  const handleGenerateImage = async () => {
    if (!savedCreativeId || !briefVisual) return;
    if (!briefVisual.prompt_generacion) { toast.error('Error al generar brief visual'); return; }
    setGeneratingImage(true);
    setGeneratedAssetUrl(null);
    try {
      const { data, error } = await callApi('generate-image', {
        body: {
          clientId, creativeId: savedCreativeId,
          promptGeneracion: briefVisual.prompt_generacion as string,
          fotoBaseUrl: selectedFotoUrl,
          engine: imageEngine,
        },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Se necesitan 2 créditos para generar imagen'); return; }
      if (data?.asset_url) {
        setGeneratedAssetUrl(data.asset_url);
        await fetchCredits();
        toast.success('Imagen generada');
      }
    } catch {
      // Error handled by toast
      toast.error('Error generando imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!savedCreativeId || !briefVisual) return;
    if (!briefVisual.prompt_generacion) { toast.error('Error al generar brief visual'); return; }
    setGeneratingVideo(true);
    setVideoProgress('Iniciando generación...');
    setGeneratedAssetUrl(null);
    try {
      const { data, error } = await callApi('generate-video', {
        body: {
          clientId, creativeId: savedCreativeId,
          promptGeneracion: briefVisual.prompt_generacion as string,
          fotoBaseUrl: selectedFotoUrl,
        },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Se necesitan 10 créditos para generar video'); setGeneratingVideo(false); return; }
      if (data?.prediction_id) {
        setVideoPollingId(data.prediction_id);
        await fetchCredits();
        startVideoPolling(data.prediction_id);
      }
    } catch {
      // Error handled by toast
      toast.error('Error iniciando generación de video');
      setGeneratingVideo(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!funnel) return;
    if ((credits?.creditos_disponibles ?? 0) < 1 && credits?.plan !== 'free_beta') {
      toast.error('Sin créditos disponibles');
      return;
    }
    setGeneratingScript(true);
    setGeneratedScript(null);
    try {
      const { data, error } = await callApi('generate-video-script', {
        body: {
          clientId, duracion: scriptDuracion, funnel,
          angulo: efectiveAngulo || undefined,
          instrucciones: instrucciones.trim() || undefined,
          variacionTexto: selectedVariacion ? `${selectedVariacion.titulo}\n${selectedVariacion.texto_principal}\n${selectedVariacion.cta}` : undefined,
        },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos para generar script'); return; }
      if (data?.script) {
        setGeneratedScript(data.script);
        await fetchCredits();
        toast.success('Script de video generado');
      }
    } catch {
      toast.error('Error al generar script de video');
    } finally {
      setGeneratingScript(false);
    }
  };

  const copyScriptToClipboard = () => {
    if (!generatedScript) return;
    const text = [
      `SCRIPT: ${generatedScript.titulo} (${generatedScript.duracion})`,
      '',
      `HOOK (${generatedScript.hook.duracion_segundos}s):`,
      `  Texto: ${generatedScript.hook.texto}`,
      `  Visual: ${generatedScript.hook.visual}`,
      '',
      'BODY:',
      ...generatedScript.body.map((s, i) => [
        `  Escena ${i + 1} (${s.duracion_segundos}s):`,
        `    Texto: ${s.texto}`,
        `    Visual: ${s.visual}`,
      ]).flat(),
      '',
      `CTA (${generatedScript.cta.duracion_segundos}s):`,
      `  Texto: ${generatedScript.cta.texto}`,
      `  Visual: ${generatedScript.cta.visual}`,
      '',
      `Música: ${generatedScript.musica_sugerida}`,
      `Notas: ${generatedScript.notas_produccion}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Script copiado al portapapeles');
  };

  const startVideoPolling = useCallback(async (predictionId: string) => {
    const messages = ['Procesando escenas...', 'Generando movimiento...', 'Aplicando efectos...', 'Finalizando video...'];
    let msgIdx = 0;
    let pollCount = 0;
    const MAX_POLLS = 120; // 10 minutos máximo
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(interval);
        setGeneratingVideo(false);
        setVideoPollingId(null);
        toast.error('La generación del video tardó demasiado. Intenta de nuevo.');
        return;
      }
      setVideoProgress(messages[msgIdx % messages.length]);
      msgIdx++;
      try {
        const { data, error } = await callApi('check-video-status', {
          body: { predictionId, creativeId: savedCreativeId, clientId },
        });
        if (error || !data) return;
        if (data.status === 'succeeded' && data.asset_url) {
          clearInterval(interval);
          setGeneratedAssetUrl(data.asset_url);
          setGeneratingVideo(false);
          setVideoPollingId(null);
          toast.success('Video generado');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setGeneratingVideo(false);
          setVideoPollingId(null);
          toast.error('Error en la generación del video');
        }
      } catch {
        // Continuar polling en caso de error transitorio de red
      }
    }, 5000);
    videoIntervalRef.current = interval;
  }, [savedCreativeId, clientId]);

  // Cleanup video polling interval on unmount
  useEffect(() => {
    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    };
  }, []);

  const steps: WizardStep[] = ['funnel', 'formato', 'angulo', 'instrucciones', 'variaciones', 'brief'];
  const currentStepIdx = steps.indexOf(step);

  if (hasBrief === null) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

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

  return (
    <div className="space-y-6">
      {/* Header with credits */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Sparkles className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold">Steve Ads</h2>
            <p className="text-sm text-muted-foreground">Metodología Sabri Suby + Russell Brunson</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            {credits?.plan === 'free_beta' ? '✨ Beta gratuita — Créditos ilimitados' : `${credits?.creditos_disponibles?.toLocaleString() || '?'} créditos`}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="crear"><Target className="w-4 h-4 mr-1.5" />Crear Anuncio</TabsTrigger>
          <TabsTrigger value="generate" id="generate-tab-trigger"><Sparkles className="w-4 h-4 mr-1.5" />Generar Copy</TabsTrigger>
          <TabsTrigger value="assets" id="assets-tab-trigger"><ImageIcon className="w-4 h-4 mr-1.5" />Assets</TabsTrigger>
          <TabsTrigger value="biblioteca"><Play className="w-4 h-4 mr-1.5" />Biblioteca</TabsTrigger>
          <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1.5" />Configuración</TabsTrigger>
        </TabsList>

        {/* ─── GENERATE TAB ─── */}
        <TabsContent value="generate" className="mt-6">
          <PlanGate feature="copies.generate" clientId={clientId}>
          <ClientAssetsGallery clientId={clientId} compact onAssetsLoaded={setAssets} />

          {/* Progress */}
          <div className="flex items-center gap-1 mb-6">
            {steps.slice(0, 4).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i < currentStepIdx ? 'bg-primary/20 text-primary' : i === currentStepIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</div>
                {i < 3 && <div className={`flex-1 h-0.5 w-8 ${i < currentStepIdx ? 'bg-primary/40' : 'bg-muted'}`} />}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={resetWizard}><RotateCcw className="w-4 h-4 mr-1" />Reiniciar</Button>
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 1: FUNNEL */}
            {step === 'funnel' && (
              <motion.div key="funnel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <h3 className="text-lg font-semibold text-center">¿En qué etapa del funnel está tu audiencia?</h3>
                <div className="grid gap-4">
                  {(Object.entries(FUNNEL_INFO) as [Funnel, typeof FUNNEL_INFO.tofu][]).map(([key, info]) => (
                    <Card key={key} className={`cursor-pointer transition-all border-2 ${funnel === key ? info.activeBg : `${info.border} ${info.bg}`}`} onClick={() => { setFunnel(key); setStep('formato'); }}>
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

            {/* STEP 2: FORMATO */}
            {step === 'formato' && funnel && (
              <motion.div key="formato" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep('funnel')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
                <h3 className="text-lg font-semibold text-center">¿Qué tipo de creativo necesitas?</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { key: 'static' as Formato, emoji: '📸', label: 'Estático', desc: 'Ideal para Reviews, Beneficios, Ofertas y BOFU', rec: funnel === 'bofu', cost: '2 créditos' },
                    { key: 'video' as Formato, emoji: '🎬', label: 'Video', desc: 'Ideal para TOFU, Transformaciones y Ugly Ads', rec: funnel === 'tofu', cost: '10 créditos' },
                  ].map(f => (
                    <Card key={f.key} className="cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all border-2" onClick={() => { setFormato(f.key); setStep('angulo'); }}>
                      <CardContent className="p-8 text-center">
                        <div className="text-5xl mb-3">{f.emoji}</div>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <h4 className="font-bold">{f.label}</h4>
                          {f.rec && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">⭐ Recomendado</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{f.desc}</p>
                        <span className="text-xs text-muted-foreground">Generación: {f.cost}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 3: ÁNGULO */}
            {step === 'angulo' && funnel && formato && (
              <motion.div key="angulo" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <Button variant="ghost" size="sm" onClick={() => setStep('formato')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
                <h3 className="text-lg font-semibold">¿Qué ángulo creativo usamos?</h3>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Recomendados para {funnel.toUpperCase()}</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendedAngles.map(a => (
                      <div key={a} className="flex flex-col">
                        <button onClick={() => { setAngulo(a); setShowCustomAngulo(false); }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${angulo === a && !showCustomAngulo ? 'border-primary bg-primary text-primary-foreground' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>
                          ⭐ {a}
                        </button>
                        <p className="text-[10px] text-muted-foreground mt-0.5 px-2 max-w-[200px]">Ángulo versátil que funciona en múltiples etapas del funnel.</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Otros ángulos</p>
                  <div className="flex flex-wrap gap-2">
                    {otherAngles.map(a => (
                      <button key={a} onClick={() => { setAngulo(a); setShowCustomAngulo(false); }}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${angulo === a && !showCustomAngulo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50 hover:bg-primary/5'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setShowCustomAngulo(true); setAngulo(null); }}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border-2 border-dashed transition-all ${showCustomAngulo ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}>
                  <Edit className="w-4 h-4" />✏️ Quiero usar mi propio ángulo
                </button>
                {showCustomAngulo && (
                  <input type="text" value={customAngulo} onChange={e => setCustomAngulo(e.target.value)}
                    placeholder="Describe tu ángulo creativo..."
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" autoFocus />
                )}
                <Button className="w-full" disabled={!efectiveAngulo} onClick={() => setStep('instrucciones')}>
                  Continuar <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {/* STEP 4: INSTRUCCIONES */}
            {step === 'instrucciones' && (
              <motion.div key="instrucciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep('angulo')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50">
                  <Badge variant="outline">{funnel?.toUpperCase()}</Badge>
                  <Badge variant="outline">{formato === 'video' ? '🎬 Video' : '📸 Imagen'}</Badge>
                  <Badge variant="outline">{efectiveAngulo}</Badge>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Instrucciones adicionales</h3>
                  <p className="text-sm text-muted-foreground mb-3">Opcional — ofertas específicas, temporadas, productos destacados, etc.</p>
                  {briefChips.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Contexto del brief -- click para incluir/excluir</p>
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
                  <Textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)} placeholder="Ej: Tenemos 30% OFF esta semana. El producto estrella es el set premium de 3 piezas." className="min-h-[100px]" />
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                  <Coins className="w-4 h-4 text-primary shrink-0" />
                  <span>Generar copies consume <strong>1 crédito</strong> · Tienes{' '}
                    <strong>{credits?.creditos_disponibles?.toLocaleString() || '∞'}</strong> disponibles
                  </span>
                </div>
                <Button className="w-full" size="lg" disabled={isGenerating} onClick={() => generateVariaciones()}>
                  {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Generando con IA...</> : <><Wand2 className="w-5 h-5 mr-2" />✨ Generar 3 Variaciones</>}
                </Button>
              </motion.div>
            )}

            {/* STEP 5: VARIACIONES */}
            {step === 'variaciones' && generatedVariaciones && (
              <motion.div key="variaciones" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setStep('instrucciones')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
                  <Button variant="outline" size="sm" onClick={() => generateVariaciones()} disabled={isGenerating}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />🔄 Regenerar las 3
                  </Button>
                </div>
                <div className="p-4 rounded-lg border-l-4 border-amber-400 bg-amber-50">
                  <p className="text-xs font-semibold text-amber-700 mb-1">💡 Por qué este ángulo funciona</p>
                  <p className="text-sm text-amber-800">{generatedVariaciones.explicacion}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {generatedVariaciones.variaciones.map((v, idx) => (
                    <Card key={idx} className="flex flex-col">
                      <CardContent className="p-4 flex flex-col flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge className="bg-primary/10 text-primary border-primary/20">{v.badge}</Badge>
                          <button onClick={() => generateVariaciones(idx)} disabled={regeneratingIdx !== null || isGenerating}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground">
                            {regeneratingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                            👎 Regenerar
                          </button>
                        </div>
                        <div className="space-y-2 flex-1">
                          <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Título</p><p className="text-sm font-semibold">{v.titulo}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Texto Principal</p><p className="text-sm whitespace-pre-wrap leading-relaxed">{v.texto_principal}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Descripción</p><p className="text-sm">{v.descripcion}</p></div>
                          <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">CTA</p><p className="text-sm font-medium text-primary">{v.cta}</p></div>
                        </div>
                        <Button className="w-full" size="sm" onClick={() => handleChooseVariacion(v)}>
                          <CheckCircle className="w-4 h-4 mr-1.5" />✅ Elegir esta variación
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 6: BRIEF VISUAL */}
            {step === 'brief' && (
              <motion.div key="brief" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <Button variant="ghost" size="sm" onClick={() => setStep('variaciones')}><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>

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
                      <p className="text-xs text-amber-600">{briefVisual.tipo === 'video' ? '🎬 Generación de video · Costo: ~$0.50 USD · 10 créditos' : '🖼 Generación de imagen · Costo: ~$0.05 USD · 2 créditos'}</p>
                    </div>

                    {/* Brief fields */}
                    <div className="grid gap-3">
                      {Object.entries(briefVisual).filter(([k]) => k !== 'tipo').map(([key, val]) => (
                        <div key={key} className="p-3 rounded-lg border border-border bg-card">
                          <p className="text-sm font-medium text-muted-foreground mb-1">{key.replace(/_/g, ' ')}</p>
                          {renderBriefField(key, val)}
                        </div>
                      ))}
                    </div>

                    {/* Photo selector */}
                    {assets.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">📷 Foto base para generación</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {assets.map(a => (
                            <button key={a.id} onClick={() => setSelectedFotoUrl(a.url)}
                              className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${selectedFotoUrl === a.url ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/40'}`}>
                              <img src={a.url} alt={a.nombre} className="w-full h-full object-cover" />
                            </button>
                          ))}
                          <button onClick={() => setSelectedFotoUrl(null)}
                            className={`shrink-0 w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center transition-all text-xs text-muted-foreground ${!selectedFotoUrl ? 'border-primary' : 'border-border'}`}>
                            Sin foto
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Approve & Save */}
                    {!savedCreativeId ? (
                      <div className="flex gap-3">
                        <Button className="flex-1" onClick={handleApproveBrief} disabled={isSavingBrief}>
                          {isSavingBrief ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                          {isSavingBrief ? 'Guardando...' : '✅ Aprobar Brief y Guardar'}
                        </Button>
                        <Button variant="outline" onClick={() => selectedVariacion && handleChooseVariacion(selectedVariacion)}>
                          <RefreshCw className="w-4 h-4 mr-1" />Regenerar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                          <p className="text-sm text-green-700 font-medium flex-1">Guardado en Biblioteca</p>
                          <Button size="sm" variant="ghost" onClick={() => setActiveTab('biblioteca')}>Ver →</Button>
                        </div>

                        {/* Generated asset preview */}
                        {generatedAssetUrl && (
                          <div className="rounded-lg overflow-hidden border border-border">
                            {briefVisual.tipo === 'video' ? (
                              <video src={generatedAssetUrl} controls className="w-full max-h-80 object-contain bg-black" />
                            ) : (
                              <img src={generatedAssetUrl} alt="Generado" className="w-full max-h-80 object-contain" onError={(e) => { (e.target as HTMLImageElement).alt = 'Error al cargar imagen'; (e.target as HTMLImageElement).className = 'w-full h-40 flex items-center justify-center bg-muted text-muted-foreground text-sm'; }} />
                            )}
                            <div className="p-3 flex justify-end">
                              <Button size="sm" variant="outline" asChild>
                                <a href={generatedAssetUrl} download target="_blank" rel="noreferrer">
                                  <Download className="w-4 h-4 mr-1.5" />Descargar
                                </a>
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Generation buttons */}
                        {!generatedAssetUrl && (
                          <div className="space-y-3">
                            <p className="text-sm font-medium">🚀 Generar creativo con IA</p>
                            {/* Image generation powered by Gemini */}
                            {briefVisual.tipo !== 'video' ? (
                              <Button
                                className="w-full"
                                disabled={generatingImage}
                                onClick={handleGenerateImage}
                              >
                                {generatingImage ? (
                                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generando imagen (~10s)...</>
                                ) : (
                                  <><ImageIcon className="w-4 h-4 mr-2" />🖼 Generar Imagen — 2 créditos</>
                                )}
                              </Button>
                            ) : (
                              <div className="space-y-2">
                                <Button className="w-full" disabled={generatingVideo} onClick={handleGenerateVideo}>
                                  {generatingVideo ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{videoProgress || 'Generando video...'} (~60s)</>
                                  ) : (
                                    <><Video className="w-4 h-4 mr-2" />🎬 Generar Video — 10 créditos</>
                                  )}
                                </Button>
                                {generatingVideo && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span>La generación tarda ~60 segundos. Puedes seguir navegando.</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Script de Video */}
                            <div className="pt-3 border-t border-border">
                              <p className="text-sm font-medium mb-2">Script de Video</p>
                              <div className="flex gap-2 mb-2">
                                {(['15s', '30s', '60s'] as const).map(d => (
                                  <button key={d} type="button" onClick={() => setScriptDuracion(d)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${scriptDuracion === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'}`}>
                                    <Clock className="w-3 h-3 inline mr-1" />{d}
                                  </button>
                                ))}
                              </div>
                              <Button variant="outline" className="w-full" disabled={generatingScript} onClick={handleGenerateScript}>
                                {generatingScript ? (
                                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generando script...</>
                                ) : (
                                  <><FileText className="w-4 h-4 mr-2" />Generar Script — 1 crédito</>
                                )}
                              </Button>
                            </div>

                            {/* Script result */}
                            {generatedScript && (
                              <div className="mt-3 space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-bold">{generatedScript.titulo}</h4>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{generatedScript.duracion}</Badge>
                                    <button onClick={copyScriptToClipboard} className="text-muted-foreground hover:text-foreground transition-colors">
                                      <Copy className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                                    <p className="text-xs font-bold text-red-700 uppercase mb-1">Hook ({generatedScript.hook.duracion_segundos}s)</p>
                                    <p className="text-sm font-medium">{generatedScript.hook.texto}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{generatedScript.hook.visual}</p>
                                  </div>

                                  {generatedScript.body.map((scene, i) => (
                                    <div key={i} className="p-3 rounded-lg bg-[#F0F4FA] border border-[#B5C8E0]">
                                      <p className="text-xs font-bold text-[#162D5F] uppercase mb-1">Escena {i + 1} ({scene.duracion_segundos}s)</p>
                                      <p className="text-sm">{scene.texto}</p>
                                      <p className="text-xs text-muted-foreground mt-1">{scene.visual}</p>
                                    </div>
                                  ))}

                                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                                    <p className="text-xs font-bold text-green-700 uppercase mb-1">CTA ({generatedScript.cta.duracion_segundos}s)</p>
                                    <p className="text-sm font-medium">{generatedScript.cta.texto}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{generatedScript.cta.visual}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2 rounded bg-muted"><span className="font-medium">Música:</span> {generatedScript.musica_sugerida}</div>
                                  <div className="p-2 rounded bg-muted"><span className="font-medium">Notas:</span> {generatedScript.notas_produccion}</div>
                                </div>

                                <Button variant="outline" size="sm" className="w-full" onClick={handleGenerateScript} disabled={generatingScript}>
                                  <RefreshCw className={`w-3 h-3 mr-1 ${generatingScript ? 'animate-spin' : ''}`} />Regenerar Script
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </PlanGate>
        </TabsContent>

        <TabsContent value="crear" className="mt-6">
          <PlanGate feature="meta_ads.create" clientId={clientId}>
            <MetaAdCreator clientId={clientId} onBack={() => setActiveTab('crear')} onGoToLibrary={() => setActiveTab('biblioteca')} />
          </PlanGate>
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <ClientAssetsGallery clientId={clientId} onAssetsLoaded={setAssets} />
        </TabsContent>

        <TabsContent value="biblioteca" className="mt-6">
          <AdCreativesLibrary clientId={clientId} />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <MetaAdsConfigPanel clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
