import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  FileText, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  Users,
  Store,
  MessageSquare,
  Target,
  Database,
  Trophy,
  DollarSign,
  Percent,
  Truck,
  Calculator,
  Gem,
  Shield,
  Gift,
  Clock,
  TrendingUp,
  MousePointer,
  Heart
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
}

const QUESTION_ICONS: Record<string, React.ReactNode> = {
  // Parte 1: Negocio
  business_type: <Building2 className="h-4 w-4" />,
  average_ticket: <DollarSign className="h-4 w-4" />,
  margins: <Percent className="h-4 w-4" />,
  shipping_cost: <Truck className="h-4 w-4" />,
  fixed_costs: <Calculator className="h-4 w-4" />,
  sales_channels: <Store className="h-4 w-4" />,
  // Parte 2: Buyer Persona Psicográfico
  persona_name: <Users className="h-4 w-4" />,
  persona_demographics: <Users className="h-4 w-4" />,
  persona_3am_pain: <Target className="h-4 w-4" />,
  persona_shame: <Heart className="h-4 w-4" />,
  persona_common_mistake: <Target className="h-4 w-4" />,
  persona_fear_not_buying: <Shield className="h-4 w-4" />,
  persona_sunday_feeling: <Heart className="h-4 w-4" />,
  persona_exact_words: <MessageSquare className="h-4 w-4" />,
  persona_internal_objection: <Shield className="h-4 w-4" />,
  persona_transformation: <TrendingUp className="h-4 w-4" />,
  persona_lifestyle_brands: <Gem className="h-4 w-4" />,
  persona_impress_who: <Users className="h-4 w-4" />,
  persona_channels: <MessageSquare className="h-4 w-4" />,
  persona_desires: <Heart className="h-4 w-4" />,
  persona_daily_frustrations: <Target className="h-4 w-4" />,
  // Parte 3: Análisis Competitivo
  competitors_list: <Trophy className="h-4 w-4" />,
  competitors_complaints: <Target className="h-4 w-4" />,
  competitors_false_promise: <Shield className="h-4 w-4" />,
  competitors_pricing: <DollarSign className="h-4 w-4" />,
  competitors_slow_point: <Clock className="h-4 w-4" />,
  competitors_tone: <MessageSquare className="h-4 w-4" />,
  competitors_ignored_channel: <Store className="h-4 w-4" />,
  competitors_entry_offer: <Gift className="h-4 w-4" />,
  why_switch_to_you: <Trophy className="h-4 w-4" />,
  uncopyable_advantage: <Gem className="h-4 w-4" />,
  // Parte 4: Estrategia Comunicacional
  purple_cow: <Gem className="h-4 w-4" />,
  big_promise: <Target className="h-4 w-4" />,
  villain: <Shield className="h-4 w-4" />,
  absurd_guarantee: <Shield className="h-4 w-4" />,
  irrefutable_proof: <Database className="h-4 w-4" />,
  insider_secret: <Gem className="h-4 w-4" />,
  ideal_tone: <MessageSquare className="h-4 w-4" />,
  irresistible_offer: <Gift className="h-4 w-4" />,
  urgency_reason: <Clock className="h-4 w-4" />,
};

const QUESTION_LABELS: Record<string, string> = {
  // Parte 1: Negocio
  business_type: 'Tipo de Negocio',
  average_ticket: 'Ticket Promedio',
  margins: 'Márgenes',
  shipping_cost: 'Costo de Envío',
  fixed_costs: 'Gastos Fijos',
  sales_channels: 'Canales de Venta',
  // Parte 2: Buyer Persona
  persona_name: 'Nombre del Persona',
  persona_demographics: 'Demografía',
  persona_3am_pain: 'Dolor de las 3 AM',
  persona_shame: 'Vergüenza',
  persona_common_mistake: 'Error Común',
  persona_fear_not_buying: 'Miedo si No Compra',
  persona_sunday_feeling: 'Sentimiento Domingo',
  persona_exact_words: 'Palabras Exactas',
  persona_internal_objection: 'Objeción Interna',
  persona_transformation: 'Transformación Soñada',
  persona_lifestyle_brands: 'Marcas que Consume',
  persona_impress_who: '¿A Quién Impresiona?',
  persona_channels: 'Canales del Cliente',
  persona_desires: 'Sueños y Deseos',
  persona_daily_frustrations: 'Frustraciones Diarias',
  // Parte 3: Competencia
  competitors_list: 'Competidores',
  competitors_complaints: 'Quejas de Competencia',
  competitors_false_promise: 'Promesas Falsas',
  competitors_pricing: 'Precios Competencia',
  competitors_slow_point: 'Punto Débil',
  competitors_tone: 'Tono Competencia',
  competitors_ignored_channel: 'Canal Ignorado',
  competitors_entry_offer: 'Oferta de Entrada',
  why_switch_to_you: '¿Por qué Cambiarse?',
  uncopyable_advantage: 'Imposible de Copiar',
  // Parte 4: Estrategia Comunicacional
  purple_cow: 'Vaca Púrpura',
  big_promise: 'Gran Promesa',
  villain: 'El Villano',
  absurd_guarantee: 'Garantía Absurda',
  irrefutable_proof: 'Prueba Irrefutable',
  insider_secret: 'Secreto del Insider',
  ideal_tone: 'Tono Ideal',
  irresistible_offer: 'Oferta Irresistible',
  urgency_reason: 'Razón de Urgencia',
};

// Question indices for each section
const SECTION_RANGES = {
  business: { start: 0, end: 6, title: 'El Negocio', icon: Building2 },
  persona: { start: 6, end: 21, title: 'Buyer Persona', icon: Users },
  competition: { start: 21, end: 31, title: 'Análisis Competitivo', icon: Trophy },
  communication: { start: 31, end: 40, title: 'Estrategia Comunicacional', icon: MessageSquare },
};

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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!briefData || !isComplete) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin Brief de Marca</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Aún no tienes un Brief de Marca. Habla con Steve para crear uno y poder generar campañas efectivas.
          </p>
          <Button onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Hablar con Steve
          </Button>
        </CardContent>
      </Card>
    );
  }

  const questions = briefData.questions || [];
  const responses = briefData.raw_responses || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Brief de Marca
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Creado con Steve • {briefData.completed_at ? new Date(briefData.completed_at).toLocaleDateString('es-CL') : 'Fecha desconocida'}
          </p>
        </div>
        <Button variant="outline" onClick={onEditBrief}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Editar con Steve
        </Button>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant="default" className="bg-primary">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Brief Completo
        </Badge>
        <Badge variant="secondary">
          {responses.length} respuestas
        </Badge>
      </div>

      {/* All 5 Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Part 1: Business */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              El Negocio
            </CardTitle>
            <CardDescription>Preguntas 1-6</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.business.start, SECTION_RANGES.business.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 1}`}
                    </div>
                    <p className="text-sm">
                      {responses[SECTION_RANGES.business.start + index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Part 2: Buyer Persona */}
        <Card className="lg:row-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Buyer Persona Psicográfico
            </CardTitle>
            <CardDescription>El Cliente Soñado • Preguntas 7-21</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[550px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.persona.start, SECTION_RANGES.persona.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${SECTION_RANGES.persona.start + index + 1}`}
                    </div>
                    <p className="text-sm">
                      {responses[SECTION_RANGES.persona.start + index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Part 3: Competitive Analysis */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Análisis Competitivo
            </CardTitle>
            <CardDescription>Debilidades a Explotar • Preguntas 22-31</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.competition.start, SECTION_RANGES.competition.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${SECTION_RANGES.competition.start + index + 1}`}
                    </div>
                    <p className="text-sm">
                      {responses[SECTION_RANGES.competition.start + index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Part 4: Communication Strategy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Estrategia Comunicacional
            </CardTitle>
            <CardDescription>Vaca Púrpura y Oferta • Preguntas 32-40</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.communication.start, SECTION_RANGES.communication.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${SECTION_RANGES.communication.start + index + 1}`}
                    </div>
                    <p className="text-sm">
                      {responses[SECTION_RANGES.communication.start + index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Summary from Steve */}
      {briefData.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              🐕 Resumen de Steve
            </CardTitle>
            <CardDescription>Análisis y recomendaciones del Bulldog Francés PhD</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-sm">{briefData.summary}</p>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}