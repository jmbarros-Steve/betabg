import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Copy,
  FlaskConical,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIContentAssistantProps {
  clientId: string;
  campaignType: string;
  subject: string;
  previewText: string;
  title: string;
  introText: string;
  onApply: (field: string, value: string) => void;
  onApplySubjects?: (subjects: string[]) => void;
}

interface SubjectResult {
  subjects: string[];
  previewTexts: string[];
}

interface AnalysisResult {
  score: number;
  feedback: Array<{
    type: 'success' | 'warning' | 'error';
    message: string;
  }>;
}

interface ABVariant {
  subject: string;
  strategy: string;
}

export function AIContentAssistant({
  clientId,
  campaignType,
  subject,
  previewText,
  title,
  introText,
  onApply,
  onApplySubjects,
}: AIContentAssistantProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Section states
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectResult, setSubjectResult] = useState<SubjectResult | null>(
    null
  );

  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );

  const [loadingVariants, setLoadingVariants] = useState(false);
  const [abVariants, setAbVariants] = useState<ABVariant[]>([]);

  // Section open states
  const [subjectsOpen, setSubjectsOpen] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);

  useEffect(() => {
    loadConnection();
  }, [clientId]);

  const loadConnection = async () => {
    try {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConnectionId(data.id);
      }
    } catch (err) {
      console.error('Error loading connection for AI assistant:', err);
    }
  };

  const generateSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const { data, error } = await callApi(
        'steve-email-content',
        {
          body: {
            connectionId,
            action: 'generate_subject',
            campaignType,
            currentSubject: subject,
            currentTitle: title,
            currentIntro: introText,
            clientId,
          },
        }
      );

      if (error) throw new Error(error);

      const subjects = data?.subjects || data?.subject_lines || [];
      const previewTexts = data?.preview_texts || data?.previewTexts || [];

      setSubjectResult({
        subjects: Array.isArray(subjects) ? subjects.slice(0, 5) : [],
        previewTexts: Array.isArray(previewTexts)
          ? previewTexts.slice(0, 5)
          : [],
      });

      toast.success('Subject lines generados');
    } catch (err: any) {
      console.error('Error generating subjects:', err);
      toast.error('Error al generar subject lines');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const analyzeContent = async () => {
    if (!subject && !title && !introText) {
      toast.error('Agrega contenido primero para poder analizarlo');
      return;
    }

    setLoadingAnalysis(true);
    try {
      const { data, error } = await callApi(
        'steve-email-content',
        {
          body: {
            connectionId,
            action: 'analyze_content',
            campaignType,
            subject,
            previewText,
            title,
            introText,
            clientId,
          },
        }
      );

      if (error) throw new Error(error);

      const score = data?.score ?? 0;
      const feedback = data?.feedback || [];

      setAnalysisResult({
        score,
        feedback: Array.isArray(feedback)
          ? feedback.map((f: any) =>
              typeof f === 'string'
                ? { type: 'info' as const, message: f }
                : { type: f.type || 'info', message: f.message || f }
            )
          : [],
      });

      setAnalysisOpen(true);
      toast.success('Analisis completado');
    } catch (err: any) {
      console.error('Error analyzing content:', err);
      toast.error('Error al analizar contenido');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const generateABVariants = async () => {
    if (!subject) {
      toast.error('Necesitas un subject line primero');
      return;
    }

    setLoadingVariants(true);
    try {
      const { data, error } = await callApi(
        'steve-email-content',
        {
          body: {
            connectionId,
            action: 'generate_ab_variants',
            subject,
            campaignType,
            clientId,
          },
        }
      );

      if (error) throw new Error(error);

      const variants = data?.variants || [];
      setAbVariants(
        Array.isArray(variants)
          ? variants.map((v: any) =>
              typeof v === 'string'
                ? { subject: v, strategy: '' }
                : { subject: v.subject || v, strategy: v.strategy || '' }
            )
          : []
      );

      setVariantsOpen(true);
      toast.success('Variantes A/B generadas');
    } catch (err: any) {
      console.error('Error generating A/B variants:', err);
      toast.error('Error al generar variantes A/B');
    } finally {
      setLoadingVariants(false);
    }
  };

  const handleApplySubject = (value: string) => {
    onApply('subject', value);
    toast.success('Subject aplicado');
  };

  const handleApplyPreviewText = (value: string) => {
    onApply('previewText', value);
    toast.success('Preview text aplicado');
  };

  const getScoreColor = (score: number) => {
    if (score > 70) return 'bg-green-500 text-white';
    if (score > 40) return 'bg-yellow-500 text-white';
    return 'bg-red-500 text-white';
  };

  const getFeedbackIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <Card className="border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">
                Asistente de Contenido AI
              </span>
            </div>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Section 1: Generate Subject Lines */}
            <div className="space-y-3">
              <Collapsible open={subjectsOpen} onOpenChange={setSubjectsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium w-full text-left hover:text-primary transition-colors">
                    {subjectsOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <Wand2 className="w-3.5 h-3.5" />
                    Generar Subject Lines
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSubjects}
                    disabled={loadingSubjects}
                    className="w-full"
                  >
                    {loadingSubjects ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        Generar con Steve
                      </>
                    )}
                  </Button>

                  {loadingSubjects && (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  )}

                  {subjectResult && subjectResult.subjects.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Subject Lines:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {subjectResult.subjects.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => handleApplySubject(s)}
                            className="text-xs bg-muted hover:bg-primary/10 hover:text-primary border border-border rounded-lg px-3 py-1.5 text-left transition-colors leading-tight"
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {subjectResult.previewTexts.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground font-medium mt-2">
                            Preview Texts:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {subjectResult.previewTexts.map((pt, i) => (
                              <button
                                key={i}
                                onClick={() => handleApplyPreviewText(pt)}
                                className="text-xs bg-muted hover:bg-primary/10 hover:text-primary border border-border rounded-lg px-3 py-1.5 text-left transition-colors leading-tight"
                              >
                                {pt}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Separator />

            {/* Section 2: Content Analysis */}
            <div className="space-y-3">
              <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium w-full text-left hover:text-primary transition-colors">
                    {analysisOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <FlaskConical className="w-3.5 h-3.5" />
                    Analisis de Contenido
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={analyzeContent}
                    disabled={loadingAnalysis}
                    className="w-full"
                  >
                    {loadingAnalysis ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
                        Analizar
                      </>
                    )}
                  </Button>

                  {loadingAnalysis && (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  )}

                  {analysisResult && (
                    <div className="space-y-3">
                      {/* Score badge */}
                      <div className="flex items-center justify-center">
                        <div
                          className={cn(
                            'w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold',
                            getScoreColor(analysisResult.score)
                          )}
                        >
                          {analysisResult.score}
                        </div>
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {analysisResult.score > 70
                          ? 'Buen contenido!'
                          : analysisResult.score > 40
                            ? 'Hay espacio para mejorar'
                            : 'Necesita trabajo'}
                      </p>

                      {/* Feedback items */}
                      {analysisResult.feedback.length > 0 && (
                        <div className="space-y-2">
                          {analysisResult.feedback.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs"
                            >
                              {getFeedbackIcon(item.type)}
                              <span className="leading-relaxed">
                                {item.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <Separator />

            {/* Section 3: A/B Variants */}
            {subject && (
              <div className="space-y-3">
                <Collapsible
                  open={variantsOpen}
                  onOpenChange={setVariantsOpen}
                >
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-sm font-medium w-full text-left hover:text-primary transition-colors">
                      {variantsOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <Copy className="w-3.5 h-3.5" />
                      Variantes A/B
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateABVariants}
                      disabled={loadingVariants}
                      className="w-full"
                    >
                      {loadingVariants ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Generar variantes A/B
                        </>
                      )}
                    </Button>

                    {loadingVariants && (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    )}

                    {abVariants.length > 0 && (
                      <div className="space-y-2">
                        {abVariants.map((variant, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              handleApplySubject(variant.subject)
                            }
                            className="w-full text-left bg-muted hover:bg-primary/10 border border-border rounded-lg p-2.5 transition-colors"
                          >
                            <p className="text-xs font-medium">
                              {variant.subject}
                            </p>
                            {variant.strategy && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {variant.strategy}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
