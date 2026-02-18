import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThumbsUp, ThumbsDown, MessageSquare, CheckCircle2, AlertTriangle } from 'lucide-react';

interface FeedbackItem {
  section: string;
  label: string;
}

const BRIEF_SECTIONS: FeedbackItem[] = [
  { section: 'resumen_ejecutivo', label: 'Resumen Ejecutivo' },
  { section: 'adn_marca', label: 'ADN de Marca' },
  { section: 'analisis_financiero', label: 'Análisis Financiero' },
  { section: 'buyer_persona', label: 'Buyer Persona' },
  { section: 'analisis_competitivo', label: 'Análisis Competitivo' },
  { section: 'posicionamiento', label: 'Posicionamiento y Diferenciación' },
  { section: 'plan_90_dias', label: 'Plan de 90 Días' },
];

interface SteveFeedbackPanelProps {
  clientId: string;
}

export function SteveFeedbackPanel({ clientId }: SteveFeedbackPanelProps) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [rating, setRating] = useState<'good' | 'needs_work' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  async function handleSubmit() {
    if (!selectedSection || !rating) return;
    setSubmitting(true);
    try {
      await supabase.from('steve_feedback').insert({
        client_id: clientId,
        content_type: 'brief_section',
        content_id: selectedSection,
        rating: rating === 'good' ? 5 : 2,
        feedback_text: feedback.trim() || null,
        improvement_notes: rating === 'needs_work' ? feedback.trim() : null,
      });

      setSubmitted(prev => new Set([...prev, selectedSection]));
      toast.success('Feedback enviado. ¡Gracias!');
      setSelectedSection(null);
      setRating(null);
      setFeedback('');
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('Error al enviar feedback');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Feedback sobre el Brief
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Dinos qué secciones del brief están bien y cuáles necesitan mejoras. Tu feedback ayuda a Steve a mejorar.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Section grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BRIEF_SECTIONS.map(item => {
            const isDone = submitted.has(item.section);
            const isSelected = selectedSection === item.section;
            return (
              <button
                key={item.section}
                onClick={() => {
                  if (isDone) return;
                  setSelectedSection(isSelected ? null : item.section);
                  setRating(null);
                  setFeedback('');
                }}
                className={`
                  relative text-left rounded-lg border p-2.5 text-xs font-medium transition-all
                  ${isDone ? 'border-primary/20 bg-primary/5 text-primary cursor-default' : ''}
                  ${isSelected && !isDone ? 'border-primary bg-primary/5' : ''}
                  ${!isSelected && !isDone ? 'border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/30' : ''}
                `}
              >
                {isDone && (
                  <CheckCircle2 className="h-3 w-3 absolute top-1.5 right-1.5 text-primary" />
                )}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Feedback form when section is selected */}
        {selectedSection && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20 animate-in fade-in duration-300">
            <p className="text-xs font-semibold text-foreground">
              {BRIEF_SECTIONS.find(s => s.section === selectedSection)?.label}
            </p>

            {/* Rating buttons */}
            <div className="flex gap-2">
              <Button
                variant={rating === 'good' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setRating('good')}
              >
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                Bien logrado
              </Button>
              <Button
                variant={rating === 'needs_work' ? 'destructive' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setRating('needs_work')}
              >
                <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                Necesita mejoras
              </Button>
            </div>

            {/* Notes */}
            {rating && (
              <div className="space-y-2 animate-in fade-in duration-200">
                {rating === 'needs_work' && (
                  <div className="flex items-start gap-1.5 text-xs text-destructive/80">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>Cuéntanos qué mejorar — esto le llega directo al equipo, sin consumir créditos.</span>
                  </div>
                )}
                <Textarea
                  placeholder={rating === 'good'
                    ? 'Opcional: ¿Qué fue lo más valioso de esta sección?'
                    : 'Describe qué está mal o qué faltó en esta sección...'
                  }
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  className="text-sm min-h-[70px] bg-background resize-none"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  size="sm"
                  className="w-full"
                >
                  {submitting ? 'Enviando...' : 'Enviar Feedback'}
                </Button>
              </div>
            )}
          </div>
        )}

        {submitted.size > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {submitted.size}/{BRIEF_SECTIONS.length} secciones evaluadas
          </p>
        )}
      </CardContent>
    </Card>
  );
}
