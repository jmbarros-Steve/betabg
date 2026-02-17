import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';
import { 
  FileText, RefreshCw, CheckCircle2, AlertCircle, Download,
  Building2, Users, Trophy, MessageSquare, DollarSign, Store,
  Target, Heart, Shield, TrendingUp, Gem, Clock, Gift
} from 'lucide-react';

interface BrandBriefViewProps {
  clientId: string;
  onEditBrief: () => void;
}

interface BriefData {
  raw_responses?: string[];
  summary?: string;
  completed_at?: string;
  questions?: string[];
  answered_count?: number;
  total_questions?: number;
}

const QUESTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; section: string }> = {
  business_pitch: { label: 'El Negocio', icon: <Building2 className="h-4 w-4" />, section: 'negocio' },
  numbers: { label: 'Números Clave', icon: <DollarSign className="h-4 w-4" />, section: 'negocio' },
  sales_channels: { label: 'Canales de Venta', icon: <Store className="h-4 w-4" />, section: 'negocio' },
  persona_profile: { label: 'Perfil del Cliente', icon: <Users className="h-4 w-4" />, section: 'persona' },
  persona_pain: { label: 'Dolor y Vergüenza', icon: <Heart className="h-4 w-4" />, section: 'persona' },
  persona_words: { label: 'Palabras y Objeciones', icon: <MessageSquare className="h-4 w-4" />, section: 'persona' },
  persona_transformation: { label: 'Transformación', icon: <TrendingUp className="h-4 w-4" />, section: 'persona' },
  persona_lifestyle: { label: 'Estilo de Vida', icon: <Gem className="h-4 w-4" />, section: 'persona' },
  competitors: { label: 'Competidores', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  competitors_weakness: { label: 'Fallas Competencia', icon: <Shield className="h-4 w-4" />, section: 'competencia' },
  your_advantage: { label: 'Tu Ventaja', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  purple_cow_promise: { label: 'Vaca Púrpura', icon: <Gem className="h-4 w-4" />, section: 'estrategia' },
  villain_guarantee: { label: 'Villano y Garantía', icon: <Shield className="h-4 w-4" />, section: 'estrategia' },
  proof_tone: { label: 'Prueba y Tono', icon: <Target className="h-4 w-4" />, section: 'estrategia' },
  offer_urgency: { label: 'Oferta y Urgencia', icon: <Gift className="h-4 w-4" />, section: 'estrategia' },
};

const SECTIONS = [
  { id: 'negocio', title: 'El Negocio', icon: Building2 },
  { id: 'persona', title: 'Buyer Persona', icon: Users },
  { id: 'competencia', title: 'Análisis Competitivo', icon: Trophy },
  { id: 'estrategia', title: 'Estrategia', icon: MessageSquare },
];

export function BrandBriefView({ clientId, onEditBrief }: BrandBriefViewProps) {
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBrief();
  }, [clientId]);

  async function fetchBrief() {
    try {
      const { data, error } = await supabase
        .from('buyer_personas')
        .select('persona_data, is_complete')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBriefData(data.persona_data as BriefData);
        setIsComplete(data.is_complete);
      }
    } catch (error) {
      console.error('Error fetching brief:', error);
      toast.error('Error al cargar el brief');
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadPDF() {
    if (!briefData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Brief de Marca Estratégico', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generado: ${briefData.completed_at ? new Date(briefData.completed_at).toLocaleDateString('es-CL') : new Date().toLocaleDateString('es-CL')}`, margin, y);
    doc.setTextColor(0);
    y += 15;

    const questions = briefData.questions || [];
    const responses = briefData.raw_responses || [];

    for (const section of SECTIONS) {
      const sectionQuestions = questions
        .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
        .filter(q => q.config?.section === section.id);

      if (sectionQuestions.length === 0) continue;

      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 100, 200);
      doc.text(section.title.toUpperCase(), margin, y);
      doc.setTextColor(0);
      y += 8;

      for (const q of sectionQuestions) {
        if (y > 260) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(q.config?.label || q.qId, margin, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(q.response || 'Sin respuesta', maxWidth);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 6;
      }

      y += 4;
    }

    // Summary
    if (briefData.summary) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 100, 200);
      doc.text('RESUMEN DE STEVE', margin, y);
      doc.setTextColor(0);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      // Strip markdown for PDF
      const cleanSummary = briefData.summary.replace(/[*#_]/g, '').replace(/\n{3,}/g, '\n\n');
      const summaryLines = doc.splitTextToSize(cleanSummary, maxWidth);
      
      for (const line of summaryLines) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 4;
      }
    }

    doc.save('Brief_de_Marca.pdf');
    toast.success('PDF descargado');
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const questions = briefData?.questions || [];
  const responses = briefData?.raw_responses || [];
  const answeredCount = briefData?.answered_count || responses.length;
  const totalQuestions = briefData?.total_questions || 15;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  // Show in-progress view
  if (!isComplete && briefData && answeredCount > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Brief de Marca
            </h2>
            <p className="text-muted-foreground text-sm mt-1">En progreso — habla con Steve para completarlo</p>
          </div>
          <Button onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Continuar con Steve
          </Button>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progreso del Brief</span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, answered: !!responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                const done = sectionQs.filter(q => q.answered).length;
                const total = Object.values(QUESTION_CONFIG).filter(c => c.section === section.id).length;
                return (
                  <div key={section.id} className="bg-muted/50 rounded-lg p-3 text-center">
                    <section.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{done}/{total}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Answered questions */}
        {questions.map((qId, i) => {
          if (!responses[i]) return null;
          const config = QUESTION_CONFIG[qId];
          if (!config) return null;
          return (
            <Card key={qId}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                  {config.icon}
                  {config.label}
                  <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />
                </div>
                <p className="text-sm">{responses[i]}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // No brief at all
  if (!briefData || !isComplete) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin Brief de Marca</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Habla con Steve para crear tu Brief Estratégico en solo 15 preguntas.
          </p>
          <Button onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Hablar con Steve
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Complete brief
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Brief de Marca
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Creado con Steve • {briefData.completed_at ? new Date(briefData.completed_at).toLocaleDateString('es-CL') : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
          <Button variant="outline" onClick={onEditBrief}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Editar con Steve
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="default" className="bg-primary">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Brief Completo
        </Badge>
        <Badge variant="secondary">{responses.length} respuestas</Badge>
      </div>

      {/* Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map(section => {
          const sectionQs = questions
            .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
            .filter(q => q.config?.section === section.id);

          if (sectionQs.length === 0) return null;

          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <section.icon className="h-5 w-5 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sectionQs.map(q => (
                    <div key={q.qId} className="border-b border-border pb-2 last:border-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                        {q.config?.icon}
                        {q.config?.label}
                      </div>
                      <p className="text-sm">{q.response || <span className="text-muted-foreground italic">Sin respuesta</span>}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      {briefData.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              🐕 Resumen de Steve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{briefData.summary}</ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
