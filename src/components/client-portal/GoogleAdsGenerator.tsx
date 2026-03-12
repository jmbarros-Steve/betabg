import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Copy, Check, Sparkles, Search, Monitor, Zap, RefreshCw, ArrowRight, ArrowLeft, RotateCcw, History, Trash2, Calendar, Link2, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SteveFeedbackDialog } from './SteveFeedbackDialog';
import { PDFDownloader } from './PDFDownloader';
import logoGoogleAds from '@/assets/logo-google-ads.png';

interface GoogleAdsGeneratorProps {
  clientId: string;
}

type CampaignType = 'search' | 'display' | 'performance_max' | 'remarketing';
type Step = 'campaign' | 'options' | 'result';

interface GeneratedContent {
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  sitelinks: Array<{
    title: string;
    description: string;
    suggestedUrl: string;
  }>;
}

interface SavedCopy {
  id: string;
  campaign_type: string;
  headlines: string[];
  long_headlines: string[] | null;
  descriptions: string[];
  sitelinks: GeneratedContent['sitelinks'] | null;
  custom_instructions: string | null;
  created_at: string;
}

const CAMPAIGN_INFO = {
  search: {
    name: 'Búsqueda',
    subtitle: 'Search Ads',
    description: 'Para usuarios que buscan activamente tu producto o servicio',
    icon: Search,
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',
  },
  display: {
    name: 'Display',
    subtitle: 'GDN',
    description: 'Anuncios visuales en sitios web de la red de Google',
    icon: Monitor,
    gradient: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30',
  },
  performance_max: {
    name: 'Performance Max',
    subtitle: 'PMax',
    description: 'Campañas automatizadas con IA de Google',
    icon: Zap,
    gradient: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',
  },
  remarketing: {
    name: 'Remarketing',
    subtitle: 'Retargeting',
    description: 'Reconecta con visitantes anteriores de tu sitio',
    icon: RefreshCw,
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30',
  },
};

export function GoogleAdsGenerator({ clientId }: GoogleAdsGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [step, setStep] = useState<Step>('campaign');
  const [campaignType, setCampaignType] = useState<CampaignType | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [hasBrief, setHasBrief] = useState<boolean | null>(null);
  const [savedCopies, setSavedCopies] = useState<SavedCopy[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCopyId, setExpandedCopyId] = useState<string | null>(null);
  
  // Feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastSavedCopyId, setLastSavedCopyId] = useState<string | null>(null);

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
        .from('saved_google_copies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map the data to match our SavedCopy interface
      const mappedData: SavedCopy[] = (data || []).map((item) => ({
        id: item.id,
        campaign_type: item.campaign_type,
        headlines: item.headlines,
        long_headlines: item.long_headlines,
        descriptions: item.descriptions,
        sitelinks: item.sitelinks as GeneratedContent['sitelinks'] | null,
        custom_instructions: item.custom_instructions,
        created_at: item.created_at,
      }));
      setSavedCopies(mappedData);
    } catch (error) {
      console.error('Error fetching saved copies:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectCampaign = (type: CampaignType) => {
    setCampaignType(type);
    setStep('options');
  };

  const handleBack = () => {
    if (step === 'options') {
      setStep('campaign');
      setCampaignType(null);
    } else if (step === 'result') {
      setStep('options');
      setGeneratedContent(null);
    }
  };

  const handleReset = () => {
    setStep('campaign');
    setCampaignType(null);
    setCustomPrompt('');
    setGeneratedContent(null);
    setShowFeedback(false);
    setLastSavedCopyId(null);
  };

  const saveCopyToHistory = async (content: GeneratedContent): Promise<string | null> => {
    if (!campaignType) return null;

    try {
      const insertData = {
        client_id: clientId,
        campaign_type: campaignType,
        headlines: content.headlines,
        long_headlines: content.longHeadlines,
        descriptions: content.descriptions,
        sitelinks: content.sitelinks as unknown,
        custom_instructions: customPrompt.trim() || null,
      };
      
      const { data, error } = await supabase
        .from('saved_google_copies')
        .insert([insertData] as any)
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error saving copy:', error);
      return null;
    }
  };

  const handleGenerate = async () => {
    if (!campaignType) return;
    
    setIsGenerating(true);
    setGeneratedContent(null);

    try {
      const { data, error } = await callApi('generate-google-copy', {
        body: {
          clientId,
          campaignType,
          customPrompt: customPrompt.trim() || undefined,
        },
      });

      if (error) throw error;
      setGeneratedContent(data);
      setStep('result');
      
      // Save to history
      const savedId = await saveCopyToHistory(data);
      if (savedId) {
        setLastSavedCopyId(savedId);
        // Show feedback dialog after a short delay
        setTimeout(() => setShowFeedback(true), 1500);
      }
      
      toast.success('Copies de Google Ads generados');
    } catch (error) {
      console.error('Error generating copy:', error);
      toast.error('Error al generar copies');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCopy = async (copyId: string) => {
    try {
      const { error } = await supabase
        .from('saved_google_copies')
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

  const handleFeedbackComplete = () => {
    setShowFeedback(false);
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
          <img src={logoGoogleAds} alt="Google Ads" className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Brief Incompleto</h3>
          <p className="text-muted-foreground mb-4">
            Para generar copies de Google Ads, primero necesitas completar el Brief de Marca con Steve.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <img src={logoGoogleAds} alt="Google Ads" className="w-10 h-10" />
        <div>
          <h2 className="text-xl font-bold">Generador de Copies para Google Ads</h2>
          <p className="text-sm text-muted-foreground">
            RSA Headlines, Descripciones y Sitelinks
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
            {/* Progress */}
            {step !== 'campaign' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {['campaign', 'options', 'result'].map((s, index) => (
                    <div key={s} className="flex items-center">
                      <div 
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                          step === s 
                            ? 'bg-primary text-primary-foreground' 
                            : index < ['campaign', 'options', 'result'].indexOf(step)
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {index + 1}
                      </div>
                      {index < 2 && (
                        <div className={`w-8 h-0.5 ${
                          index < ['campaign', 'options', 'result'].indexOf(step)
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
              {/* Step 1: Campaign Type */}
              {step === 'campaign' && (
                <motion.div
                  key="campaign"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold mb-2">¿Qué tipo de campaña necesitas?</h3>
                    <p className="text-sm text-muted-foreground">
                      Selecciona el tipo de campaña para generar copies optimizados
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {Object.entries(CAMPAIGN_INFO).map(([key, info]) => {
                      const Icon = info.icon;
                      return (
                        <Card
                          key={key}
                          className={`cursor-pointer transition-all border-2 ${info.bgColor}`}
                          onClick={() => handleSelectCampaign(key as CampaignType)}
                        >
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              <div className={`p-3 rounded-xl bg-gradient-to-br ${info.gradient} text-white`}>
                                <Icon className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-bold">{info.name}</h4>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-background/50">
                                    {info.subtitle}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">{info.description}</p>
                              </div>
                              <ArrowRight className="w-5 h-5 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Step 2: Options */}
              {step === 'options' && campaignType && (
                <motion.div
                  key="options"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>

                  <Card className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const Icon = CAMPAIGN_INFO[campaignType].icon;
                          return <Icon className="w-5 h-5 text-primary" />;
                        })()}
                        <div>
                          <p className="font-medium">{CAMPAIGN_INFO[campaignType].name}</p>
                          <p className="text-sm text-muted-foreground">{CAMPAIGN_INFO[campaignType].description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="customPrompt">Instrucciones adicionales (opcional)</Label>
                      <Textarea
                        id="customPrompt"
                        placeholder="Ej: Enfócate en el descuento del 20%, menciona envío gratis, usa un tono más casual..."
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="mt-2"
                        rows={3}
                      />
                    </div>

                    <Button 
                      onClick={handleGenerate} 
                      disabled={isGenerating}
                      className="w-full"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generando copies...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generar Copies de Google Ads
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Results */}
              {step === 'result' && generatedContent && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>

                  {/* Headlines */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        📝 Headlines (30 caracteres máx.)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {generatedContent.headlines.map((headline, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group">
                          <div className="flex-1">
                            <span className="text-sm">{headline}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({headline.length}/30)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(headline, `headline-${i}`)}
                          >
                            {copiedIndex === `headline-${i}` ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Long Headlines */}
                  {generatedContent.longHeadlines?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          📰 Títulos Largos (90 caracteres máx.)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {generatedContent.longHeadlines.map((headline, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group">
                            <div className="flex-1">
                              <span className="text-sm">{headline}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({headline.length}/90)
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToClipboard(headline, `long-${i}`)}
                            >
                              {copiedIndex === `long-${i}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Descriptions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        💬 Descripciones (90 caracteres máx.)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {generatedContent.descriptions.map((desc, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group">
                          <div className="flex-1">
                            <span className="text-sm">{desc}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({desc.length}/90)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(desc, `desc-${i}`)}
                          >
                            {copiedIndex === `desc-${i}` ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Sitelinks */}
                  {generatedContent.sitelinks?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Link2 className="w-5 h-5" />
                          Sitelinks
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {generatedContent.sitelinks.map((sitelink, i) => (
                          <div key={i} className="p-4 bg-muted/50 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-primary">{sitelink.title}</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                {sitelink.suggestedUrl}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{sitelink.description}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(`${sitelink.title}\n${sitelink.description}\n${sitelink.suggestedUrl}`, `sitelink-${i}`)}
                            >
                              {copiedIndex === `sitelink-${i}` ? (
                                <Check className="h-3 w-3 mr-1 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              Copiar todo
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const allText = [
                          '=== HEADLINES ===',
                          ...generatedContent.headlines,
                          '',
                          '=== TÍTULOS LARGOS ===',
                          ...(generatedContent.longHeadlines || []),
                          '',
                          '=== DESCRIPCIONES ===',
                          ...generatedContent.descriptions,
                          '',
                          '=== SITELINKS ===',
                          ...(generatedContent.sitelinks?.map(s => `${s.title}: ${s.description} (${s.suggestedUrl})`) || []),
                        ].join('\n');
                        copyToClipboard(allText, 'all');
                      }}
                    >
                      {copiedIndex === 'all' ? (
                        <Check className="w-4 h-4 mr-2 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      Copiar Todo
                    </Button>
                    
                    {campaignType && (
                      <PDFDownloader
                        type="google_copy"
                        title={`Google Ads - ${CAMPAIGN_INFO[campaignType].name}`}
                        content={{
                          campaignType: CAMPAIGN_INFO[campaignType].name,
                          headlines: generatedContent.headlines,
                          longHeadlines: generatedContent.longHeadlines,
                          descriptions: generatedContent.descriptions,
                          sitelinks: generatedContent.sitelinks,
                        }}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : savedCopies.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <History className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Aún no has generado copies de Google Ads
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {savedCopies.map((copy) => (
                <Card key={copy.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {CAMPAIGN_INFO[copy.campaign_type as CampaignType]?.name || copy.campaign_type}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(copy.created_at), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setExpandedCopyId(expandedCopyId === copy.id ? null : copy.id)}
                        >
                          <ArrowRight className={`w-4 h-4 transition-transform ${expandedCopyId === copy.id ? 'rotate-90' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteCopy(copy.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  {expandedCopyId === copy.id && (
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Headlines</p>
                        <div className="space-y-1">
                          {copy.headlines.slice(0, 5).map((h, i) => (
                            <p key={i} className="text-sm bg-muted/50 px-2 py-1 rounded">{h}</p>
                          ))}
                          {copy.headlines.length > 5 && (
                            <p className="text-xs text-muted-foreground">+{copy.headlines.length - 5} más</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Descripciones</p>
                        <div className="space-y-1">
                          {copy.descriptions.map((d, i) => (
                            <p key={i} className="text-sm bg-muted/50 px-2 py-1 rounded">{d}</p>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Steve Feedback Dialog */}
      {showFeedback && lastSavedCopyId && (
        <SteveFeedbackDialog
          clientId={clientId}
          contentType="google_copy"
          contentId={lastSavedCopyId}
          onComplete={handleFeedbackComplete}
        />
      )}
    </div>
  );
}
