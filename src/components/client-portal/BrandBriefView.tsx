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
  // Parte 2: Buyer Persona
  persona_name: <Users className="h-4 w-4" />,
  persona_age: <Users className="h-4 w-4" />,
  persona_gender: <Users className="h-4 w-4" />,
  persona_location: <Target className="h-4 w-4" />,
  persona_education: <Database className="h-4 w-4" />,
  persona_income: <DollarSign className="h-4 w-4" />,
  persona_channels: <MessageSquare className="h-4 w-4" />,
  persona_pain: <Target className="h-4 w-4" />,
  persona_desires: <Heart className="h-4 w-4" />,
  persona_fears: <Shield className="h-4 w-4" />,
  // Parte 3: Competencia
  why_buy_from_you: <Trophy className="h-4 w-4" />,
  competitors: <Users className="h-4 w-4" />,
  differentiator: <Gem className="h-4 w-4" />,
  blue_ocean: <TrendingUp className="h-4 w-4" />,
  better_than_competition: <Trophy className="h-4 w-4" />,
  // Parte 4: Comunicación
  communication_tone: <MessageSquare className="h-4 w-4" />,
  communication_style: <Heart className="h-4 w-4" />,
  supporting_data: <Database className="h-4 w-4" />,
  // Parte 5: Oferta Perfecta
  perceived_value: <Gem className="h-4 w-4" />,
  guarantee: <Shield className="h-4 w-4" />,
  scarcity_urgency: <Clock className="h-4 w-4" />,
  clear_results: <TrendingUp className="h-4 w-4" />,
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
  persona_age: 'Edad',
  persona_gender: 'Género',
  persona_location: 'Ubicación',
  persona_education: 'Nivel Educacional',
  persona_income: 'Nivel de Ingresos',
  persona_channels: 'Canales del Cliente',
  persona_pain: 'Dolor Principal',
  persona_desires: 'Deseos y Sueños',
  persona_fears: 'Miedos y Objeciones',
  // Parte 3: Competencia
  why_buy_from_you: '¿Por qué te Compran?',
  competitors: 'Competidores',
  differentiator: 'Atributo Diferenciador',
  blue_ocean: 'Océano Azul',
  better_than_competition: 'Mejor que la Competencia',
  // Parte 4: Comunicación
  communication_tone: 'Tono de Comunicación',
  communication_style: 'Estilo de Relación',
  supporting_data: 'Prueba Social',
  // Parte 5: Oferta Perfecta
  perceived_value: 'Valor Percibido',
  guarantee: 'Garantía',
  scarcity_urgency: 'Escasez/Urgencia',
  clear_results: 'Resultados Claros',
};

// Question indices for each section
const SECTION_RANGES = {
  business: { start: 0, end: 6, title: 'El Negocio', icon: Building2 },
  persona: { start: 6, end: 16, title: 'Buyer Persona', icon: Users },
  competition: { start: 16, end: 21, title: 'Análisis Competitivo', icon: Trophy },
  communication: { start: 21, end: 24, title: 'Estrategia de Comunicación', icon: MessageSquare },
  offer: { start: 24, end: 28, title: 'Oferta Perfecta', icon: Gem },
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
              Buyer Persona
            </CardTitle>
            <CardDescription>El Cliente Soñado • Preguntas 7-16</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[550px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.persona.start, SECTION_RANGES.persona.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 7}`}
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
            <CardDescription>Océano Azul • Preguntas 17-21</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.competition.start, SECTION_RANGES.competition.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 17}`}
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
              Estrategia de Comunicación
            </CardTitle>
            <CardDescription>Preguntas 22-24</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.communication.start, SECTION_RANGES.communication.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 22}`}
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

        {/* Part 5: Perfect Offer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gem className="h-5 w-5 text-primary" />
              La Oferta Perfecta
            </CardTitle>
            <CardDescription>Metodología Sabri Suby • Preguntas 25-28</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {questions.slice(SECTION_RANGES.offer.start, SECTION_RANGES.offer.end).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-3 w-3" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 25}`}
                    </div>
                    <p className="text-sm">
                      {responses[SECTION_RANGES.offer.start + index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
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