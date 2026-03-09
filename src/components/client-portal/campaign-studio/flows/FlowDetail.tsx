import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Check, Sparkles, Zap, Clock, Mail, Info } from 'lucide-react';
import { type FlowTemplate, FLOW_CATEGORY_LABELS, FLOW_PRIORITY_COLORS } from './FlowTemplates';

interface FlowDetailProps {
  template: FlowTemplate;
  clientId: string;
  open: boolean;
  onClose: () => void;
  onFlowCreated?: () => void;
}

function formatDelay(hours: number): string {
  if (hours === 0) return 'Inmediato';
  if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.round(hours / 24);
  return `${days} día${days > 1 ? 's' : ''}`;
}

export function FlowDetail({ template, clientId, open, onClose, onFlowCreated }: FlowDetailProps) {
  const [generatingContent, setGeneratingContent] = useState(false);
  const [contentGenerated, setContentGenerated] = useState(false);
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [flowCreated, setFlowCreated] = useState(false);

  const handleGenerateContent = async () => {
    setGeneratingContent(true);
    try {
      // Get Klaviyo connection for connectionId
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!conn) {
        toast.error('No hay conexion activa de Klaviyo. Conecta Klaviyo primero.');
        setGeneratingContent(false);
        return;
      }

      const { data, error } = await callApi('steve-email-content', {
        body: {
          action: 'generate_flow_emails',
          connectionId: conn.id,
          flowType: template.id,
          clientId,
          emails: template.emails.map((e) => ({
            subject: e.subject,
            previewText: e.previewText,
            description: e.description,
            purpose: e.purpose,
            delayHours: e.delayHours,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setContentGenerated(true);
      toast.success('Contenido generado exitosamente por Steve');
    } catch (err: any) {
      console.error('Error generating flow content:', err);
      toast.error(`Error al generar contenido: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleCreateFlow = async () => {
    setCreatingFlow(true);
    try {
      // Get Klaviyo connection
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!conn) {
        toast.error('No hay conexion activa de Klaviyo. Conecta Klaviyo primero.');
        setCreatingFlow(false);
        return;
      }

      const { data, error } = await callApi('klaviyo-manage-flows', {
        body: {
          action: 'create_flow',
          connectionId: conn.id,
          flowType: template.id,
          flowName: template.nameEs,
          triggerDescription: template.triggerDescription,
          emails: template.emails.map((e) => ({
            subject: e.subject,
            previewText: e.previewText,
            delayHours: e.delayHours,
            description: e.description,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setFlowCreated(true);
      toast.success(`Flujo "${template.nameEs}" creado en Klaviyo`);
      onFlowCreated?.();
    } catch (err: any) {
      console.error('Error creating flow in Klaviyo:', err);
      toast.error(`Error al crear flujo: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setCreatingFlow(false);
    }
  };

  const handleClose = () => {
    // Reset state on close
    setContentGenerated(false);
    setFlowCreated(false);
    onClose();
  };

  const borderColor = FLOW_PRIORITY_COLORS[template.priority];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: borderColor }} />
            {template.nameEs}
          </DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Trigger info */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Disparador</p>
              <p className="text-sm text-muted-foreground">{template.triggerDescription}</p>
            </div>
          </div>

          {/* Category and priority badges */}
          <div className="flex items-center gap-2">
            <Badge variant="outline">{FLOW_CATEGORY_LABELS[template.category]}</Badge>
            <Badge
              style={{ backgroundColor: `${borderColor}15`, color: borderColor, borderColor }}
              variant="outline"
            >
              {template.priority === 'critical' ? 'Crítico' : template.priority === 'high' ? 'Alta prioridad' : 'Media prioridad'}
            </Badge>
          </div>

          {/* Best practices */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Mejores practicas</h4>
            <ul className="space-y-1.5">
              {template.bestPractices.map((practice, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                  <span>{practice}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Expected impact */}
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-sm font-medium text-green-800">Impacto esperado</p>
            <p className="text-sm text-green-700 mt-0.5">{template.expectedImpact}</p>
          </div>

          {/* Email timeline */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Secuencia de emails</h4>
            <div className="relative pl-6">
              {/* Vertical dashed line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px border-l-2 border-dashed border-muted-foreground/30" />

              <div className="space-y-5">
                {template.emails.map((email, idx) => (
                  <div key={idx} className="relative">
                    {/* Timeline node */}
                    <div
                      className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 bg-background flex items-center justify-center"
                      style={{ borderColor }}
                    >
                      <Mail className="w-2.5 h-2.5" style={{ color: borderColor }} />
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 border">
                      {/* Delay badge */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted">
                          <Clock className="w-3 h-3" />
                          {formatDelay(email.delayHours)}
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Email {idx + 1}
                        </span>
                      </div>

                      {/* Subject */}
                      <p className="text-sm font-medium">{email.subject}</p>
                      <p className="text-xs text-muted-foreground italic mt-0.5">{email.previewText}</p>

                      {/* Description and purpose */}
                      <p className="text-xs text-muted-foreground mt-2">{email.description}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        <span className="font-medium">Objetivo:</span> {email.purpose}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Success state */}
          {flowCreated && (
            <div className="flex flex-col items-center py-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-medium">Flujo creado exitosamente en Klaviyo</p>
              <p className="text-xs text-muted-foreground">
                Puedes editarlo y activarlo directamente en tu cuenta de Klaviyo.
              </p>
            </div>
          )}

          {/* Actions */}
          {!flowCreated && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleGenerateContent}
                disabled={generatingContent || contentGenerated}
              >
                {generatingContent ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generando contenido...
                  </>
                ) : contentGenerated ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-500" />
                    Contenido generado
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generar contenido con Steve
                  </>
                )}
              </Button>

              <Button
                className="flex-1"
                onClick={handleCreateFlow}
                disabled={!contentGenerated || creatingFlow}
              >
                {creatingFlow ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando en Klaviyo...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Crear en Klaviyo
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
