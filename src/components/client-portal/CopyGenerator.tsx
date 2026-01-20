import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Copy, Check, Sparkles, Video, Image, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CopyGeneratorProps {
  clientId: string;
}

type FunnelStage = 'tofu' | 'mofu' | 'bofu';
type AdType = 'static' | 'video';
type OutputType = 'headlines' | 'copy' | 'script';

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
    description: 'Audiencia fría - No te conocen',
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    icon: '🎯',
  },
  mofu: {
    name: 'MOFU', 
    fullName: 'Middle of Funnel',
    description: 'Audiencia tibia - Te consideran',
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    icon: '🔥',
  },
  bofu: {
    name: 'BOFU',
    fullName: 'Bottom of Funnel',
    description: 'Audiencia caliente - Listos para comprar',
    color: 'bg-green-500/10 text-green-600 border-green-500/30',
    icon: '💰',
  },
};

export function CopyGenerator({ clientId }: CopyGeneratorProps) {
  const [adType, setAdType] = useState<AdType>('static');
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('tofu');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkBrief() {
      const { data, error } = await supabase
        .from('buyer_personas')
        .select('id, is_complete')
        .eq('client_id', clientId)
        .eq('is_complete', true)
        .maybeSingle();
      
      setHasBrief(!!data);
    }
    checkBrief();
  }, [clientId]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedContent(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-meta-copy', {
        body: {
          clientId,
          adType,
          funnelStage,
          customPrompt: customPrompt.trim() || undefined,
        },
      });

      if (error) throw error;
      setGeneratedContent(data);
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
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Generador de Copies para Meta Ads</h2>
          <p className="text-sm text-muted-foreground">
            Basado en tu Brief de Marca y la metodología Sabri Suby
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Ad Type Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tipo de Anuncio</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={adType === 'static' ? 'default' : 'outline'}
              onClick={() => setAdType('static')}
              className="flex-1"
            >
              <Image className="w-4 h-4 mr-2" />
              Estático
            </Button>
            <Button
              variant={adType === 'video' ? 'default' : 'outline'}
              onClick={() => setAdType('video')}
              className="flex-1"
            >
              <Video className="w-4 h-4 mr-2" />
              Video
            </Button>
          </CardContent>
        </Card>

        {/* Funnel Stage Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Etapa del Funnel</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            {Object.entries(FUNNEL_INFO).map(([key, info]) => (
              <Button
                key={key}
                variant={funnelStage === key ? 'default' : 'outline'}
                onClick={() => setFunnelStage(key as FunnelStage)}
                className="flex-1"
                title={info.description}
              >
                <span className="mr-1">{info.icon}</span>
                {info.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Funnel Stage Info */}
      <div className={`p-4 rounded-lg border ${FUNNEL_INFO[funnelStage].color}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{FUNNEL_INFO[funnelStage].icon}</span>
          <span className="font-semibold">{FUNNEL_INFO[funnelStage].fullName}</span>
        </div>
        <p className="text-sm opacity-80">{FUNNEL_INFO[funnelStage].description}</p>
        <p className="text-xs mt-2 opacity-70">
          {funnelStage === 'tofu' && 'Copies enfocados en llamar la atención, educar y generar curiosidad. Habla del problema, no del producto.'}
          {funnelStage === 'mofu' && 'Copies que construyen confianza, muestran credenciales y diferencian. Posiciona tu solución.'}
          {funnelStage === 'bofu' && 'Copies de conversión directa con ofertas irresistibles, urgencia y garantías. Cierra la venta.'}
        </p>
      </div>

      {/* Custom Prompt */}
      <div className="space-y-2">
        <Label htmlFor="custom-prompt">Instrucciones adicionales (opcional)</Label>
        <Textarea
          id="custom-prompt"
          placeholder="Ej: Enfócate en el dolor de los pisos opacos, menciona la garantía de 30 días, usa un tono más juvenil..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={2}
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
            Generar Copies {adType === 'video' ? 'y Guión' : ''}
          </>
        )}
      </Button>

      {/* Generated Content */}
      <AnimatePresence>
        {generatedContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Headlines */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">📢</span>
                  Headlines / Títulos
                </CardTitle>
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
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
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
                    Hooks para Video (primeros 3 segundos)
                  </CardTitle>
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
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
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
                </CardHeader>
                <CardContent>
                  <div className="relative group">
                    <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm">
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
