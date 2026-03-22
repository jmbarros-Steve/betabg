import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Globe, Code, ShoppingCart, BarChart3,
  Eye, CheckCircle2, XCircle, AlertTriangle, Zap,
  DollarSign, Tag, Smartphone, Search, FileText,
  Brain, ThumbsUp, ThumbsDown, Lightbulb, Image
} from 'lucide-react';

interface CompetitorDeepDivePanelProps {
  clientId: string;
}

interface AIInsights {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  digital_sophistication: string;
}

interface DeepDiveData {
  tech_stack: {
    platform: string | null;
    platform_evidence: string | null;
    cms_detected: string | null;
  };
  irresistible_offer: {
    h1: string | null;
    hero_text: string | null;
    featured_products: Array<{ name: string; price: string; compare_price?: string }>;
    discount_messaging: string | null;
  };
  tracking_scripts: {
    meta_pixel: boolean;
    google_tag_manager: boolean;
    google_analytics: boolean;
    tiktok_pixel: boolean;
    klaviyo: boolean;
    hotjar: boolean;
    other: string[];
    marketing_sophistication: 'basic' | 'intermediate' | 'advanced';
  };
  page_meta: {
    title: string | null;
    description: string | null;
    og_image: string | null;
    language: string | null;
  };
  ai_insights?: AIInsights | null;
  partial?: boolean;
  html_source?: string;
}

interface TrackingRecord {
  id: string;
  ig_handle: string;
  display_name: string | null;
  store_url: string | null;
  deep_dive_data: DeepDiveData | null;
  last_deep_dive_at: string | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  shopify: 'bg-primary/10 text-primary border-primary/30',
  magento: 'bg-accent/10 text-accent-foreground border-accent/30',
  vtex: 'bg-secondary text-secondary-foreground border-secondary',
  woocommerce: 'bg-primary/10 text-primary border-primary/30',
  prestashop: 'bg-muted text-muted-foreground border-border',
  tiendanube: 'bg-secondary text-secondary-foreground border-secondary',
  jumpseller: 'bg-accent/10 text-accent-foreground border-accent/30',
  wix: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700',
  squarespace: 'bg-neutral-100 text-neutral-800 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-600',
  bigcommerce: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700',
  webflow: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-700',
  bootic: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700',
  custom: 'bg-muted text-muted-foreground border-border',
};

const SOPHISTICATION_CONFIG = {
  basic: { label: 'Basica', color: 'destructive' as const, icon: AlertTriangle },
  intermediate: { label: 'Intermedia', color: 'secondary' as const, icon: BarChart3 },
  advanced: { label: 'Avanzada', color: 'default' as const, icon: Zap },
};

const LOADING_STEPS = [
  'Descargando HTML...',
  'Analizando tech stack...',
  'Detectando scripts de tracking...',
  'Extrayendo oferta y productos...',
  'Generando insights con Steve AI...',
];

export function CompetitorDeepDivePanel({ clientId }: CompetitorDeepDivePanelProps) {
  const [competitors, setCompetitors] = useState<TrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchCompetitors();
  }, [clientId]);

  // Cleanup loading interval on unmount
  useEffect(() => {
    return () => {
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    };
  }, []);

  async function fetchCompetitors() {
    setLoading(true);
    const { data } = await supabase
      .from('competitor_tracking')
      .select('id, ig_handle, display_name, store_url, deep_dive_data, last_deep_dive_at')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('created_at');

    if (data) {
      setCompetitors(data as unknown as TrackingRecord[]);
      const inputs: Record<string, string> = {};
      data.forEach(c => { inputs[c.id] = c.store_url || ''; });
      setUrlInputs(inputs);
    }
    setLoading(false);
  }

  function startLoadingSteps() {
    setLoadingStep(0);
    if (loadingInterval.current) clearInterval(loadingInterval.current);
    let step = 0;
    loadingInterval.current = setInterval(() => {
      step++;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
      } else {
        // Stay on last step
        if (loadingInterval.current) clearInterval(loadingInterval.current);
      }
    }, 8000); // ~8s per step, total ~40s for 5 steps
  }

  function stopLoadingSteps() {
    if (loadingInterval.current) {
      clearInterval(loadingInterval.current);
      loadingInterval.current = null;
    }
    setLoadingStep(0);
  }

  async function handleDeepDive(competitor: TrackingRecord) {
    const url = urlInputs[competitor.id]?.trim();
    if (!url) {
      toast.error('Ingresa la URL de la tienda del competidor');
      return;
    }

    setScrapingId(competitor.id);
    startLoadingSteps();
    try {
      const response = await callApi('deep-dive-competitor', {
        body: {
          client_id: clientId,
          tracking_id: competitor.id,
          store_url: url,
        },
        timeoutMs: 120000, // 120s timeout (AI insights adds time)
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed');

      toast.success(`Deep Dive completado para @${competitor.ig_handle}`);
      await fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || 'Error en el analisis');
    } finally {
      stopLoadingSteps();
      setScrapingId(null);
    }
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (competitors.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin Competidores Configurados</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Primero agrega competidores en la pestana <strong>Competencia</strong> con sus handles de Instagram.
            Luego vuelve aqui para hacer el Deep Dive de sus tiendas.
          </p>
        </CardContent>
      </Card>
    );
  }

  const analyzedCompetitors = competitors.filter(c => c.deep_dive_data);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          Deep Dive — Analisis de Tiendas
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Disecciona las landing pages de tus competidores: tech stack, ofertas, scripts de tracking e insights AI.
        </p>
      </div>

      {/* Competitor URL inputs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">URLs de Tiendas</CardTitle>
          <CardDescription>Ingresa la URL de la tienda/landing page de cada competidor para analizarla</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {competitors.map(comp => (
            <div key={comp.id} className="space-y-1">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="flex-shrink-0 text-xs min-w-[100px] justify-center">
                  @{comp.ig_handle}
                </Badge>
                <Input
                  value={urlInputs[comp.id] || ''}
                  onChange={(e) => setUrlInputs(prev => ({ ...prev, [comp.id]: e.target.value }))}
                  placeholder="https://tienda-competidor.com"
                  className="flex-1"
                  disabled={scrapingId === comp.id}
                />
                <Button
                  size="sm"
                  onClick={() => handleDeepDive(comp)}
                  disabled={scrapingId !== null || !(urlInputs[comp.id]?.trim())}
                >
                  {scrapingId === comp.id ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analizando...</>
                  ) : comp.deep_dive_data ? (
                    <><Eye className="h-4 w-4 mr-1" />Re-analizar</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-1" />Analizar</>
                  )}
                </Button>
              </div>
              {scrapingId === comp.id && (
                <div className="flex items-center gap-2 ml-[112px] text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {LOADING_STEPS[loadingStep]}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Results */}
      {analyzedCompetitors.length > 0 && (
        <div className="space-y-6">
          {/* Disclaimer */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Los datos se extraen del HTML publico de la tienda. Campos marcados como "No se pudo verificar" significan que no encontramos evidencia concreta en el sitio — no se inventan datos.
            </p>
          </div>
          {/* Summary comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Comparacion Rapida</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Competidor</th>
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Plataforma</th>
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">Meta Pixel</th>
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">GTM</th>
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">TikTok</th>
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">Klaviyo</th>
                      <th className="text-left py-2 pl-4 font-medium text-muted-foreground">Nivel Mktg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyzedCompetitors.map(comp => {
                      const dd = comp.deep_dive_data!;
                      const sophConfig = SOPHISTICATION_CONFIG[dd.tracking_scripts.marketing_sophistication];
                      return (
                        <tr key={comp.id} className="border-b border-border last:border-0">
                          <td className="py-3 pr-4 font-medium">@{comp.ig_handle}</td>
                          <td className="py-3 px-4">
                            {dd.tech_stack.platform && dd.tech_stack.platform !== 'custom' ? (
                              <Badge variant="outline" className={`text-xs ${PLATFORM_COLORS[dd.tech_stack.platform] || ''}`}>
                                {dd.tech_stack.platform}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sin verificar</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {dd.tracking_scripts.meta_pixel ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {dd.tracking_scripts.google_tag_manager ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {dd.tracking_scripts.tiktok_pixel ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {dd.tracking_scripts.klaviyo ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </td>
                          <td className="py-3 pl-4">
                            <Badge variant={sophConfig.color} className="text-xs">
                              <sophConfig.icon className="h-3 w-3 mr-1" />
                              {sophConfig.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Detailed cards per competitor */}
          {analyzedCompetitors.map(comp => {
            const dd = comp.deep_dive_data!;
            return (
              <Card key={comp.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-5 w-5 text-primary" />
                      @{comp.ig_handle}
                      {comp.store_url && (
                        <a href={comp.store_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary">
                          {new URL(comp.store_url).hostname}
                        </a>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {dd.partial && (
                        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700">
                          Parcial
                        </Badge>
                      )}
                      {comp.last_deep_dive_at && (
                        <span className="text-xs text-muted-foreground">
                          Analizado: {new Date(comp.last_deep_dive_at).toLocaleDateString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Page Meta */}
                  {(dd.page_meta.title || dd.page_meta.description || dd.page_meta.og_image) && (
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Metadata de la Pagina
                      </h4>
                      {dd.page_meta.title && (
                        <p className="text-sm"><span className="text-muted-foreground">Titulo:</span> {dd.page_meta.title}</p>
                      )}
                      {dd.page_meta.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{dd.page_meta.description}</p>
                      )}
                      {dd.page_meta.og_image && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Image className="h-3 w-3" /> OG Image:
                          </p>
                          <img
                            src={dd.page_meta.og_image}
                            alt="OG Image"
                            className="rounded-md border border-border max-h-32 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Tech Stack */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" />
                        Tech Stack
                      </h4>
                      {dd.tech_stack.platform && dd.tech_stack.platform !== 'custom' ? (
                        <>
                          <Badge variant="outline" className={`${PLATFORM_COLORS[dd.tech_stack.platform] || ''}`}>
                            {dd.tech_stack.cms_detected || dd.tech_stack.platform}
                          </Badge>
                          {dd.tech_stack.platform_evidence && (
                            <p className="text-xs text-muted-foreground">{dd.tech_stack.platform_evidence}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No se pudo verificar la plataforma</p>
                      )}
                    </div>

                    {/* Irresistible Offer */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        Oferta Irresistible
                      </h4>
                      {dd.irresistible_offer.h1 ? (
                        <p className="text-sm font-medium">"{dd.irresistible_offer.h1}"</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No se pudo verificar el H1</p>
                      )}
                      {dd.irresistible_offer.discount_messaging ? (
                        <Badge variant="secondary" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {dd.irresistible_offer.discount_messaging}
                        </Badge>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No se detectaron descuentos</p>
                      )}
                      {dd.irresistible_offer.featured_products.length > 0 ? (
                        <div className="space-y-1">
                          {dd.irresistible_offer.featured_products.map((p, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="truncate">{p.name}</span>
                              <span className="font-semibold text-primary">{p.price}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No se pudieron verificar productos</p>
                      )}
                    </div>

                    {/* Tracking Scripts */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Scripts de Tracking
                      </h4>
                      <div className="space-y-1">
                        {[
                          { key: 'meta_pixel', label: 'Meta Pixel' },
                          { key: 'google_tag_manager', label: 'GTM' },
                          { key: 'google_analytics', label: 'Google Analytics' },
                          { key: 'tiktok_pixel', label: 'TikTok Pixel' },
                          { key: 'klaviyo', label: 'Klaviyo' },
                          { key: 'hotjar', label: 'Hotjar' },
                        ].map(script => (
                          <div key={script.key} className="flex items-center justify-between text-xs">
                            <span>{script.label}</span>
                            {(dd.tracking_scripts as any)[script.key] ? (
                              <CheckCircle2 className="h-3 w-3 text-primary" />
                            ) : (
                              <XCircle className="h-3 w-3 text-muted-foreground/30" />
                            )}
                          </div>
                        ))}
                        {dd.tracking_scripts.other.length > 0 && (
                          <div className="pt-1 border-t border-border mt-1">
                            <p className="text-xs text-muted-foreground">
                              Otros: {dd.tracking_scripts.other.join(', ')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Insights */}
                  {dd.ai_insights && (
                    <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 space-y-3 border border-primary/20">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        Insights de Steve AI
                      </h4>

                      {dd.ai_insights.summary && (
                        <p className="text-sm">{dd.ai_insights.summary}</p>
                      )}

                      {dd.ai_insights.digital_sophistication && (
                        <p className="text-xs text-muted-foreground italic">
                          {dd.ai_insights.digital_sophistication}
                        </p>
                      )}

                      <div className="grid gap-3 md:grid-cols-3">
                        {/* Strengths */}
                        {dd.ai_insights.strengths.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold flex items-center gap-1 text-green-700 dark:text-green-400">
                              <ThumbsUp className="h-3 w-3" /> Fortalezas
                            </p>
                            <ul className="space-y-0.5">
                              {dd.ai_insights.strengths.map((s, i) => (
                                <li key={i} className="text-xs text-muted-foreground">- {s}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Weaknesses */}
                        {dd.ai_insights.weaknesses.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold flex items-center gap-1 text-red-700 dark:text-red-400">
                              <ThumbsDown className="h-3 w-3" /> Debilidades
                            </p>
                            <ul className="space-y-0.5">
                              {dd.ai_insights.weaknesses.map((w, i) => (
                                <li key={i} className="text-xs text-muted-foreground">- {w}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Recommendations */}
                        {dd.ai_insights.recommendations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold flex items-center gap-1 text-blue-700 dark:text-blue-400">
                              <Lightbulb className="h-3 w-3" /> Recomendaciones
                            </p>
                            <ul className="space-y-0.5">
                              {dd.ai_insights.recommendations.map((r, i) => (
                                <li key={i} className="text-xs text-muted-foreground">- {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
