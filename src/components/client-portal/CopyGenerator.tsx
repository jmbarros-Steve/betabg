import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Copy, Check, Sparkles, Video, Image, Megaphone, FileText, ArrowRight, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [step, setStep] = useState<Step>('funnel');
  const [funnelStage, setFunnelStage] = useState<FunnelStage | null>(null);
  const [adType, setAdType] = useState<AdType | null>(null);
  const [needsScript, setNeedsScript] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);

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
      toast.success('¡Copies generados exitosamente!');
    } catch (error) {
      console.error('Error generating copy:', error);
      toast.error('Error al generar copies. Intenta de nuevo.');
    } finally {
      setIsGenerating(false);
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
      <div className="flex items-center justify-between">
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
        {step !== 'funnel' && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reiniciar
          </Button>
        )}
      </div>

      {/* Progress Indicator */}
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
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Generar otros copies
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                {generatedContent.headlines.map((headline, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg group"
                  >
                    <p className="font-medium flex-1">{headline}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(headline, `headline-${index}`)}
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
                    {generatedContent.primaryText}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(generatedContent.primaryText, 'primary')}
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
            {generatedContent.description && (
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
                      {generatedContent.description}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(generatedContent.description!, 'description')}
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
            {adType === 'video' && generatedContent.hooks && (
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
                  {generatedContent.hooks.map((hook, index) => (
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
                        onClick={() => copyToClipboard(hook, `hook-${index}`)}
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
            {adType === 'video' && generatedContent.script && (
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
                      {generatedContent.script}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(generatedContent.script!, 'script')}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
