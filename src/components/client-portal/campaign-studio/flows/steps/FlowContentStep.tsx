import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, Sparkles, Loader2, Check, Clock, Mail, Monitor, Smartphone, Tag, Package, RefreshCw,
} from 'lucide-react';
import { type FlowTemplate } from '../FlowTemplates';
import { type FlowWizardState } from '../FlowWizard';
import { type EditorEmail } from '../../../klaviyo/UnlayerEmailEditor';

interface FlowContentStepProps {
  template: FlowTemplate;
  clientId: string;
  state: FlowWizardState;
  updateState: (partial: Partial<FlowWizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

function formatDelay(hours: number): string {
  if (hours === 0) return 'Inmediato';
  if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.round(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''}`;
}

export function FlowContentStep({ template, clientId, state, updateState, onNext, onBack }: FlowContentStepProps) {
  const [generating, setGenerating] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  const generated = state.generatedEmails.length > 0;

  const handleGenerate = async () => {
    if (!state.klaviyoConnectionId) {
      toast.error('No hay conexion activa de Klaviyo');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await callApi('steve-email-content', {
        body: {
          action: 'generate_flow_emails',
          connectionId: state.klaviyoConnectionId,
          flowType: template.id,
          clientId,
          emails: template.emails.map((e) => ({
            subject: e.subject,
            previewText: e.previewText,
            description: e.description,
            purpose: e.purpose,
            delayHours: e.delayHours,
          })),
          // Enriched context
          products: state.products.map((p) => ({ title: p.title, price: p.price })),
          discount: state.discountEnabled
            ? { code: state.discountCode, value: state.discountValue, type: state.discountType }
            : null,
          productStrategy: template.productStrategy,
          discountEmailIndex: template.discountEmail,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Now get preview HTML for each email, passing Steve's rich bodyHtml
      const aiEmails = data?.emails || [];
      const { data: previewData, error: previewError } = await callApi('preview-flow-emails', {
        body: {
          connectionId: state.klaviyoConnectionId,
          flowType: template.id,
          emails: aiEmails.map((e: any, idx: number) => ({
            subject: e.subject || template.emails[idx]?.subject || `Email ${idx + 1}`,
            previewText: e.previewText || template.emails[idx]?.previewText || '',
            bodyHtml: e.bodyHtml || undefined,
            ctaText: e.ctaText || undefined,
          })),
          products: state.products,
          discount: state.discountEnabled
            ? { code: state.discountCode, value: state.discountValue, type: state.discountType, expiry: state.discountExpiry }
            : null,
          productStrategy: template.productStrategy,
          discountEmailIndex: template.discountEmail,
        },
      });

      const emails: EditorEmail[] = (previewData?.emails || template.emails).map((e: any, idx: number) => ({
        subject: aiEmails[idx]?.subject || e.subject || template.emails[idx]?.subject,
        previewText: aiEmails[idx]?.previewText || e.previewText || template.emails[idx]?.previewText || '',
        htmlContent: e.htmlContent || `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;"><h1>${template.emails[idx]?.subject}</h1><p>${template.emails[idx]?.description}</p></div>`,
      }));

      updateState({ generatedEmails: emails });
      toast.success('Contenido generado por Steve');
    } catch (err: any) {
      console.error('Error generating content:', err);
      toast.error(`Error al generar contenido: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateEmail = (idx: number, field: 'subject' | 'previewText', value: string) => {
    const updated = [...state.generatedEmails];
    updated[idx] = { ...updated[idx], [field]: value };
    updateState({ generatedEmails: updated });
  };

  const handleRegenerate = async (idx: number) => {
    setRegeneratingIdx(idx);
    try {
      const { data, error } = await callApi('preview-flow-emails', {
        body: {
          connectionId: state.klaviyoConnectionId,
          flowType: template.id,
          emails: [{ subject: state.generatedEmails[idx].subject, previewText: state.generatedEmails[idx].previewText }],
          products: state.products,
          discount: state.discountEnabled && template.discountEmail === idx
            ? { code: state.discountCode, value: state.discountValue, type: state.discountType, expiry: state.discountExpiry }
            : null,
          productStrategy: template.productStrategy,
          discountEmailIndex: template.discountEmail === idx ? 0 : null,
        },
      });

      if (error) throw error;
      if (data?.emails?.[0]?.htmlContent) {
        const updated = [...state.generatedEmails];
        updated[idx] = { ...updated[idx], htmlContent: data.emails[0].htmlContent };
        updateState({ generatedEmails: updated });
        toast.success(`Email ${idx + 1} regenerado`);
      }
    } catch (err: any) {
      toast.error('Error al regenerar email');
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleNext = () => {
    // Pass generated emails as the starting point for editing
    updateState({ editedEmails: [...state.generatedEmails] });
    onNext();
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Contenido de los emails</h2>
        <p className="text-sm text-muted-foreground">
          Steve genera el contenido basado en tu marca, buyer persona y mejores practicas de email marketing.
        </p>
      </div>

      {/* Generate button */}
      {!generated && (
        <Card className="p-8 flex flex-col items-center gap-4">
          <Sparkles className="w-10 h-10 text-primary" />
          <div className="text-center">
            <p className="font-medium">Generar contenido con Steve</p>
            <p className="text-sm text-muted-foreground mt-1">
              Steve escribira {template.emails.length} emails personalizados para tu marca
              {state.discountEnabled && ', incluyendo tu cupon de descuento'}
              {template.productStrategy !== 'none' && ` con ${template.productStrategy === 'cart_items' ? 'productos del carrito' : 'productos recomendados'}`}.
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} size="lg">
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Steve esta escribiendo...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Generar contenido</>
            )}
          </Button>
        </Card>
      )}

      {/* Generated emails timeline */}
      {generated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-green-600 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              {state.generatedEmails.length} emails generados
            </p>
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Regenerar todos
            </Button>
          </div>

          {state.generatedEmails.map((email, idx) => (
            <Card key={idx} className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Email {idx + 1}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                      {formatDelay(template.emails[idx].delayHours)}
                    </Badge>
                    {template.discountEmail === idx && (
                      <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-200">
                        <Tag className="w-2.5 h-2.5 mr-0.5" />Cupon
                      </Badge>
                    )}
                    {template.productStrategy !== 'none' && idx === 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 bg-blue-50 text-blue-700 border-blue-200">
                        <Package className="w-2.5 h-2.5 mr-0.5" />Productos
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleRegenerate(idx)}
                      disabled={regeneratingIdx === idx}
                    >
                      {regeneratingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setPreviewIdx(previewIdx === idx ? null : idx)}
                    >
                      {previewIdx === idx ? 'Cerrar' : 'Preview'}
                    </Button>
                  </div>
                </div>

                {/* Editable subject and preview */}
                <div className="space-y-2">
                  <Input
                    value={email.subject}
                    onChange={(e) => handleUpdateEmail(idx, 'subject', e.target.value)}
                    className="text-sm font-medium h-8"
                    placeholder="Asunto del email"
                  />
                  <Input
                    value={email.previewText}
                    onChange={(e) => handleUpdateEmail(idx, 'previewText', e.target.value)}
                    className="text-xs h-7 text-muted-foreground"
                    placeholder="Texto de vista previa"
                  />
                </div>
              </div>

              {/* Inline preview */}
              {previewIdx === idx && (
                <div className="border-t">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b">
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      className={`p-1 rounded ${previewDevice === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      className={`p-1 rounded ${previewDevice === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-center p-4 bg-muted/10">
                    <iframe
                      srcDoc={email.htmlContent}
                      className="border rounded shadow-sm"
                      style={{
                        width: previewDevice === 'desktop' ? 600 : 375,
                        height: 500,
                      }}
                      title={`Preview email ${idx + 1}`}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Atras
        </Button>
        <Button onClick={handleNext} disabled={!generated} size="lg">
          Siguiente: Editar emails
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
