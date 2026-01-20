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
  business_type: <Building2 className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  sales_channels: <Store className="h-4 w-4" />,
  communication_tone: <MessageSquare className="h-4 w-4" />,
  pain_solved: <Target className="h-4 w-4" />,
  supporting_data: <Database className="h-4 w-4" />,
  competitive_advantage: <Trophy className="h-4 w-4" />,
  average_ticket: <DollarSign className="h-4 w-4" />,
  margins: <Percent className="h-4 w-4" />,
  shipping_cost: <Truck className="h-4 w-4" />,
  fixed_costs: <Calculator className="h-4 w-4" />,
  perceived_value: <Gem className="h-4 w-4" />,
  guarantee: <Shield className="h-4 w-4" />,
  bonuses: <Gift className="h-4 w-4" />,
  scarcity_urgency: <Clock className="h-4 w-4" />,
  clear_results: <TrendingUp className="h-4 w-4" />,
  simple_decision: <MousePointer className="h-4 w-4" />,
  emotional_benefits: <Heart className="h-4 w-4" />,
};

const QUESTION_LABELS: Record<string, string> = {
  business_type: 'Tipo de Negocio',
  customers: 'Perfil de Clientes',
  sales_channels: 'Canales de Venta',
  communication_tone: 'Tono de Comunicación',
  pain_solved: 'Dolor que Solucionan',
  supporting_data: 'Data de Respaldo',
  competitive_advantage: 'Ventaja Competitiva',
  average_ticket: 'Ticket Promedio',
  margins: 'Márgenes',
  shipping_cost: 'Costo de Envío',
  fixed_costs: 'Gastos Fijos',
  perceived_value: 'Valor Percibido',
  guarantee: 'Garantía',
  bonuses: 'Bonos',
  scarcity_urgency: 'Escasez/Urgencia',
  clear_results: 'Resultados Claros',
  simple_decision: 'Decisión Simple',
  emotional_benefits: 'Beneficios Emocionales',
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

      {/* Sections */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Part 1: Business Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Conociendo el Negocio
            </CardTitle>
            <CardDescription>Preguntas 1-11</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {questions.slice(0, 11).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-4 w-4" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 1}`}
                    </div>
                    <p className="text-sm">
                      {responses[index] || <span className="text-muted-foreground italic">Sin respuesta</span>}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Part 2: Perfect Offer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gem className="h-5 w-5 text-primary" />
              La Oferta Perfecta
            </CardTitle>
            <CardDescription>Metodología Sabri Suby • Preguntas 12-18</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {questions.slice(11).map((questionId, index) => (
                  <div key={questionId} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      {QUESTION_ICONS[questionId] || <FileText className="h-4 w-4" />}
                      {QUESTION_LABELS[questionId] || `Pregunta ${index + 12}`}
                    </div>
                    <p className="text-sm">
                      {responses[index + 11] || <span className="text-muted-foreground italic">Sin respuesta</span>}
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