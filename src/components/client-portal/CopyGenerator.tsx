import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Copy, Check, Sparkles, Video, Image, Megaphone, FileText, ArrowRight, ArrowLeft, RotateCcw, History, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CopyGeneratorProps {
  clientId: string;
}

type FunnelStage = 'tofu' | 'mofu' | 'bofu';
type AdType = 'static' | 'video';
type Step = 'funnel' | 'adType' | 'options' | 'result';

interface GeneratedContent {
  headlines: string[];
  primaryText: string;
  description?: string;
  hooks?: string[];
  script?: string;
}

interface SavedCopy {
  id: string;
  funnel_stage: string;
  ad_type: string;
  has_script: boolean;
  headlines: string[];
  primary_texts: string[];
  descriptions: string[];
  video_hooks: string[] | null;
  video_scripts: string[] | null;
  custom_instructions: string | null;
  created_at: string;
}

const FUNNEL_INFO = {
  tofu: {
    name: 'TOFU',
    fullName: 'Top of Funnel',
    subtitle: 'Audiencia Fría',
    description: 'No te conocen. Hay que educar y generar curiosidad.',
    details: 'Copies enfocados en el PROBLEMA, no el producto. Interrumpir el scroll, generar intriga.',
    icon: '🎯',
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',
    activeColor: 'bg-blue-500 text-white border-blue-600',
  },
  mofu: {
    name: 'MOFU', 
    fullName: 'Middle of Funnel',
    subtitle: 'Audiencia Tibia',
    description: 'Te consideran. Hay que construir confianza.',
    details: 'Copies que muestran credenciales, testimonios y te diferencian de la competencia.',
    icon: '🔥',
    gradient: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',
    activeColor: 'bg-amber-500 text-white border-amber-600',
  },
  bofu: {
    name: 'BOFU',
    fullName: 'Bottom of Funnel',
    subtitle: 'Audiencia Caliente',
    description: 'Listos para comprar. Hay que cerrar la venta.',
    details: 'Copies de conversión con ofertas irresistibles, urgencia y garantías.',
    icon: '💰',
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30',
    activeColor: 'bg-green-500 text-white border-green-600',
  },
};

const AD_TYPE_INFO = {
  static: {
    name: 'Estático',
    description: 'Anuncio con imagen',
    details: 'Headlines, texto principal y descripción para anuncios con imagen.',
    icon: Image,
    emoji: '🖼️',
  },
  video: {
    name: 'Video',
    description: 'Anuncio con video',
    details: 'Headlines, texto, hooks para los primeros 3 segundos y guión completo.',
    icon: Video,
    emoji: '🎬',
  },
};

export function CopyGenerator({ clientId }: CopyGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [step, setStep] = useState<Step>('funnel');
  const [funnelStage, setFunnelStage] = useState<FunnelStage | null>(null);
  const [adType, setAdType] = useState<AdType | null>(null);
  const [needsScript, setNeedsScript] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);
  
  // History state
  const [savedCopies, setSavedCopies] = useState<SavedCopy[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCopyId, setExpandedCopyId] = useState<string | null>(null);

  useEffect(() => {
    async function checkBrief() {
      const { data } = await supabase
        .from('buyer_personas')
        .select('id, is_complete')
        .eq('client_id', clientId)
        .eq('is_complete', true)
        .maybeSingle();
      
      setHasBrief(!!data);
    }
    checkBrief();
  }, [clientId]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchSavedCopies();
    }
  }, [activeTab, clientId]);

  const fetchSavedCopies = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('saved_meta_copies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedCopies(data || []);
    } catch (error) {
      console.error('Error fetching saved copies:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectFunnel = (stage: FunnelStage) => {
    setFunnelStage(stage);
    setStep('adType');
  };

  const handleSelectAdType = (type: AdType) => {
    setAdType(type);
    setStep('options');
  };

  const handleBack = () => {
    if (step === 'adType') {
      setStep('funnel');
      setFunnelStage(null);
    } else if (step === 'options') {
      setStep('adType');
      setAdType(null);
    } else if (step === 'result') {
      setStep('options');
      setGeneratedContent(null);
    }
  };

  const handleReset = () => {
    setStep('funnel');
    setFunnelStage(null);
    setAdType(null);
    setNeedsScript(true);
    setCustomPrompt('');
    setGeneratedContent(null);
  };

  const saveCopyToHistory = async (content: GeneratedContent) => {
    if (!funnelStage || !adType) return;

    try {
      const { error } = await supabase
        .from('saved_meta_copies')
        .insert({
          client_id: clientId,
          funnel_stage: funnelStage,
          ad_type: adType,
          has_script: adType === 'video' && needsScript,
          headlines: content.headlines,
          primary_texts: [content.primaryText],
          descriptions: content.description ? [content.description] : [],
          video_hooks: content.hooks || null,
          video_scripts: content.script ? [content.script] : null,
          custom_instructions: customPrompt.trim() || null,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving copy:', error);
    }
  };

  const handleGenerate = async () => {
    if (!funnelStage || !adType) return;
    
    setIsGenerating(true);
    setGeneratedContent(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-meta-copy', {
        body: {
          clientId,
          adType,
          funnelStage,
          needsScript: adType === 'video' ? needsScript : false,
          customPrompt: customPrompt.trim() || undefined,
        },
      });

      if (error) throw error;
      setGeneratedContent(data);
      setStep('result');
      
      // Save to history automatically
      await saveCopyToHistory(data);
      
      toast.success('¡Copies generados y guardados!');
    } catch (error) {
      console.error('Error generating copy:', error);
      toast.error('Error al generar copies. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCopy = async (copyId: string) => {
    try {
      const { error } = await supabase
        .from('saved_meta_copies')
        .delete()
        .eq('id', copyId);

      if (error) throw error;
      
      setSavedCopies(prev => prev.filter(c => c.id !== copyId));
      toast.success('Copy eliminado');
    } catch (error) {
      console.error('Error deleting copy:', error);
      toast.error('Error al eliminar');
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (hasBrief === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasBrief) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Brief Incompleto</h3>
          <p className="text-muted-foreground mb-4">
            Para generar copies efectivos, primero necesitas completar el Brief de Marca con Steve.
          </p>
          <p className="text-sm text-muted-foreground">
            Ve a la pestaña <strong>"Steve"</strong> y responde las 40 preguntas para desbloquear el generador de copies.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Generador de Copies para Meta Ads</h2>
          <p className="text-sm text-muted-foreground">
            Metodología Sabri Suby + Russell Brunson
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'history')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generar
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial
            {savedCopies.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20">
                {savedCopies.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Generate Tab */}
        <TabsContent value="generate" className="mt-6">
          <div className="space-y-6">
            {/* Progress Indicator */}
            {step !== 'funnel' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {['funnel', 'adType', 'options', 'result'].map((s, index) => (
                    <div key={s} className="flex items-center">
                      <div 
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                          step === s 
                            ? 'bg-primary text-primary-foreground' 
                            : index < ['funnel', 'adType', 'options', 'result'].indexOf(step)
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {index + 1}
                      </div>
                      {index < 3 && (
                        <div className={`w-8 h-0.5 ${
                          index < ['funnel', 'adType', 'options', 'result'].indexOf(step)
                            ? 'bg-primary/50'
                            : 'bg-muted'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reiniciar
                </Button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* Step 1: Select Funnel Stage */}
              {step === 'funnel' && (
                <motion.div
                  key="funnel"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold mb-2">¿En qué etapa del funnel está tu audiencia?</h3>
                    <p className="text-sm text-muted-foreground">
                      Selecciona la temperatura de tu tráfico para generar copies adecuados
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {Object.entries(FUNNEL_INFO).map(([key, info]) => (
                      <Card
                        key={key}
                        className={`cursor-pointer transition-all border-2 ${info.bgColor}`}
                        onClick={() => handleSelectFunnel(key as FunnelStage)}
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <span className="text-4xl">{info.icon}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-lg font-bold">{info.name}</h4>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-background/50">
                                  {info.subtitle}
                                </span>
                              </div>
                              <p className="font-medium mb-1">{info.description}</p>
                              <p className="text-sm text-muted-foreground">{info.details}</p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 2: Select Ad Type */}
              {step === 'adType' && funnelStage && (
                <motion.div
                  key="adType"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <Button variant="ghost" size="sm" onClick={handleBack} className="mb-2">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>

                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted mb-3">
                      <span>{FUNNEL_INFO[funnelStage].icon}</span>
                      <span className="text-sm font-medium">{FUNNEL_INFO[funnelStage].name} seleccionado</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">¿Qué tipo de anuncio necesitas?</h3>
                    <p className="text-sm text-muted-foreground">
                      Elige el formato de tu creatividad
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {Object.entries(AD_TYPE_INFO).map(([key, info]) => {
                      const Icon = info.icon;
                      return (
                        <Card
                          key={key}
                          className="cursor-pointer transition-all hover:border-primary/50 hover:bg-primary/5"
                          onClick={() => handleSelectAdType(key as AdType)}
                        >
                          <CardContent className="p-8 text-center">
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                              <Icon className="w-8 h-8 text-primary" />
                            </div>
                            <h4 className="text-lg font-bold mb-1">{info.name}</h4>
                            <p className="text-sm text-muted-foreground mb-2">{info.description}</p>
                            <p className="text-xs text-muted-foreground">{info.details}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Options */}
              {step === 'options' && funnelStage && adType && (
                <motion.div
                  key="options"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <Button variant="ghost" size="sm" onClick={handleBack} className="mb-2">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>

                  {/* Summary */}
                  <Card className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span>{FUNNEL_INFO[funnelStage].icon}</span>
                          <span className="font-medium">{FUNNEL_INFO[funnelStage].name}</span>
                        </div>
                        <div className="text-muted-foreground">→</div>
                        <div className="flex items-center gap-2">
                          <span>{AD_TYPE_INFO[adType].emoji}</span>
                          <span className="font-medium">{AD_TYPE_INFO[adType].name}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Script Option for Video */}
                  {adType === 'video' && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <Label htmlFor="needs-script" className="text-base font-medium cursor-pointer">
                                ¿Necesitas guiones para el video?
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Genera guiones estructurados con timestamps e indicaciones visuales
                              </p>
                            </div>
                          </div>
                          <Switch
                            id="needs-script"
                            checked={needsScript}
                            onCheckedChange={setNeedsScript}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Custom Instructions */}
                  <div className="space-y-2">
                    <Label htmlFor="custom-prompt">Instrucciones adicionales (opcional)</Label>
                    <Textarea
                      id="custom-prompt"
                      placeholder="Ej: Enfócate en el dolor de los pisos opacos, menciona la garantía de 30 días, usa un tono más juvenil..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Generate Button */}
                  <Button 
                    onClick={handleGenerate} 
                    disabled={isGenerating}
                    size="lg"
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generando copies...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generar Copies {adType === 'video' && needsScript ? 'y Guiones' : ''}
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {/* Step 4: Results */}
              {step === 'result' && generatedContent && funnelStage && adType && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {/* Summary Bar */}
                  <Card className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span>{FUNNEL_INFO[funnelStage].icon}</span>
                            <span className="font-medium">{FUNNEL_INFO[funnelStage].name}</span>
                          </div>
                          <div className="text-muted-foreground">→</div>
                          <div className="flex items-center gap-2">
                            <span>{AD_TYPE_INFO[adType].emoji}</span>
                            <span className="font-medium">{AD_TYPE_INFO[adType].name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded-full">
                            ✓ Guardado en historial
                          </span>
                          <Button variant="outline" size="sm" onClick={handleReset}>
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Generar otros
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <GeneratedContentDisplay 
                    content={generatedContent}
                    adType={adType}
                    copiedIndex={copiedIndex}
                    onCopy={copyToClipboard}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : savedCopies.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin copies guardados</h3>
                <p className="text-muted-foreground mb-4">
                  Cuando generes copies, se guardarán automáticamente aquí.
                </p>
                <Button onClick={() => setActiveTab('generate')}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generar primer copy
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {savedCopies.map((copy) => {
                const funnelInfo = FUNNEL_INFO[copy.funnel_stage as FunnelStage];
                const adInfo = AD_TYPE_INFO[copy.ad_type as AdType];
                const isExpanded = expandedCopyId === copy.id;

                return (
                  <Card key={copy.id} className="overflow-hidden">
                    <CardHeader 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedCopyId(isExpanded ? null : copy.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span>{funnelInfo?.icon || '📝'}</span>
                            <span className="font-medium">{funnelInfo?.name || copy.funnel_stage}</span>
                          </div>
                          <div className="text-muted-foreground">→</div>
                          <div className="flex items-center gap-2">
                            <span>{adInfo?.emoji || '📄'}</span>
                            <span className="font-medium">{adInfo?.name || copy.ad_type}</span>
                          </div>
                          {copy.has_script && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              Con guión
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(copy.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCopy(copy.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <CardContent className="border-t pt-4">
                            <SavedCopyDisplay 
                              copy={copy}
                              copiedIndex={copiedIndex}
                              onCopy={copyToClipboard}
                            />
                          </CardContent>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Component to display generated content
function GeneratedContentDisplay({ 
  content, 
  adType, 
  copiedIndex, 
  onCopy 
}: { 
  content: GeneratedContent;
  adType: AdType;
  copiedIndex: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Headlines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">📢</span>
            Headlines / Títulos
          </CardTitle>
          <CardDescription>
            5 variaciones de headlines para probar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {content.headlines.map((headline, index) => (
            <div
              key={index}
              className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg group"
            >
              <p className="font-medium flex-1">{headline}</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCopy(headline, `headline-${index}`)}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                {copiedIndex === `headline-${index}` ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Primary Text */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">✍️</span>
            Texto Principal
          </CardTitle>
          <CardDescription>
            Copy completo siguiendo Hook → Historia → Oferta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative group">
            <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap">
              {content.primaryText}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCopy(content.primaryText, 'primary')}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copiedIndex === 'primary' ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {content.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              Descripción Corta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative group">
              <div className="p-4 bg-muted/50 rounded-lg">
                {content.description}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCopy(content.description!, 'description')}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {copiedIndex === 'description' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Hooks */}
      {adType === 'video' && content.hooks && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">🎬</span>
              Hooks para Video
            </CardTitle>
            <CardDescription>
              Los primeros 3 segundos son TODO. Prueba estos hooks para detener el scroll.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {content.hooks.map((hook, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg group"
              >
                <div className="flex-1">
                  <span className="text-xs font-medium text-muted-foreground mb-1 block">
                    Hook #{index + 1}
                  </span>
                  <p className="font-medium">{hook}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onCopy(hook, `hook-${index}`)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  {copiedIndex === `hook-${index}` ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Video Script */}
      {adType === 'video' && content.script && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">🎥</span>
              Guión Completo
            </CardTitle>
            <CardDescription>
              Estructura Star → Story → Solution con timestamps e indicaciones visuales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative group">
              <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm font-mono">
                {content.script}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCopy(content.script!, 'script')}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {copiedIndex === 'script' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Component to display saved copy from history
function SavedCopyDisplay({ 
  copy, 
  copiedIndex, 
  onCopy 
}: { 
  copy: SavedCopy;
  copiedIndex: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const adType = copy.ad_type as AdType;
  
  return (
    <div className="space-y-4">
      {/* Headlines */}
      {copy.headlines.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>📢</span> Headlines
          </h4>
          <div className="space-y-2">
            {copy.headlines.map((headline, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 p-2 bg-muted/50 rounded-lg group text-sm"
              >
                <p className="flex-1">{headline}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => onCopy(headline, `saved-headline-${copy.id}-${index}`)}
                >
                  {copiedIndex === `saved-headline-${copy.id}-${index}` ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Text */}
      {copy.primary_texts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>✍️</span> Texto Principal
          </h4>
          <div className="relative group">
            <div className="p-3 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm">
              {copy.primary_texts[0]}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(copy.primary_texts[0], `saved-primary-${copy.id}`)}
            >
              {copiedIndex === `saved-primary-${copy.id}` ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Description */}
      {copy.descriptions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>📝</span> Descripción
          </h4>
          <div className="relative group">
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              {copy.descriptions[0]}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(copy.descriptions[0], `saved-desc-${copy.id}`)}
            >
              {copiedIndex === `saved-desc-${copy.id}` ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Video Hooks */}
      {adType === 'video' && copy.video_hooks && copy.video_hooks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>🎬</span> Hooks para Video
          </h4>
          <div className="space-y-2">
            {copy.video_hooks.map((hook, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 p-2 bg-muted/50 rounded-lg group text-sm"
              >
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground">Hook #{index + 1}:</span>
                  <p>{hook}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => onCopy(hook, `saved-hook-${copy.id}-${index}`)}
                >
                  {copiedIndex === `saved-hook-${copy.id}-${index}` ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Script */}
      {adType === 'video' && copy.video_scripts && copy.video_scripts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>🎥</span> Guión
          </h4>
          <div className="relative group">
            <div className="p-3 bg-muted/50 rounded-lg whitespace-pre-wrap text-xs font-mono max-h-60 overflow-y-auto">
              {copy.video_scripts[0]}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onCopy(copy.video_scripts![0], `saved-script-${copy.id}`)}
            >
              {copiedIndex === `saved-script-${copy.id}` ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Custom Instructions */}
      {copy.custom_instructions && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <strong>Instrucciones usadas:</strong> {copy.custom_instructions}
          </p>
        </div>
      )}
    </div>
  );
}
