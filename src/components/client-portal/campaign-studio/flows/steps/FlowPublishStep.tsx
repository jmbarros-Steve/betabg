import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowLeft, Zap, Loader2, Check, Clock, Mail, Monitor, Smartphone, Tag, Package, ExternalLink, PartyPopper, AlertTriangle, Play,
} from 'lucide-react';
import { type FlowTemplate } from '../FlowTemplates';
import { type FlowWizardState } from '../FlowWizard';

interface FlowPublishStepProps {
  template: FlowTemplate;
  clientId: string;
  state: FlowWizardState;
  flowCreated: boolean;
  onFlowCreated: () => void;
  onBack: () => void;
  onClose: () => void;
}

function formatDelay(hours: number): string {
  if (hours === 0) return 'Inmediato';
  if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''}`;
  const days = Math.round(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''}`;
}

export function FlowPublishStep({ template, clientId, state, flowCreated, onFlowCreated, onBack, onClose }: FlowPublishStepProps) {
  const [publishing, setPublishing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [flowLive, setFlowLive] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [flowId, setFlowId] = useState<string | null>(null);

  const emails = state.editedEmails.length > 0 ? state.editedEmails : state.generatedEmails;

  const handlePublish = async () => {
    if (!state.klaviyoConnectionId) {
      toast.error('No hay conexion activa de Klaviyo');
      return;
    }
    setPublishing(true);
    try {
      const { data, error } = await callApi('klaviyo-manage-flows', {
        body: {
          action: 'create_flow',
          connectionId: state.klaviyoConnectionId,
          name: template.nameEs,
          triggerType: template.id,
          emails: emails.map((e, idx) => ({
            subject: e.subject,
            previewText: e.previewText,
            delaySeconds: (template.emails[idx]?.delayHours || 0) * 3600,
            htmlContent: e.htmlContent,
          })),
          discount: state.discountEnabled
            ? { code: state.discountCode, value: state.discountValue, type: state.discountType }
            : null,
          productStrategy: template.productStrategy,
          discountEmailIndex: template.discountEmail,
        },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.message || data.error || 'Error al crear flujo');

      setFlowId(data?.flowId || null);
      onFlowCreated();

      if (data?.flowCreated) {
        toast.success(`Flujo "${template.nameEs}" creado en Klaviyo`);
      } else {
        toast.warning('No se pudo crear el flow completo en Klaviyo. Revisa el dashboard de Klaviyo para más detalles.');
      }
    } catch (err: any) {
      // Error handled by toast below
      toast.error(`Error al publicar: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleActivateFlow = async () => {
    if (!flowId || !state.klaviyoConnectionId) return;
    setActivating(true);
    try {
      const { data, error } = await callApi('klaviyo-manage-flows', {
        body: {
          action: 'activate_flow',
          connectionId: state.klaviyoConnectionId,
          flowId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al activar');
      setFlowLive(true);
      toast.success('Flow activado — los emails se enviaran automaticamente');
    } catch (err: any) {
      toast.error(`Error al activar: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setActivating(false);
    }
  };

  if (flowCreated) {
    const isFullFlow = !!flowId;
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center gap-6 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
          flowLive ? 'bg-green-100' : isFullFlow ? 'bg-blue-100' : 'bg-amber-100'
        }`}>
          {flowLive ? (
            <PartyPopper className="w-10 h-10 text-green-600" />
          ) : isFullFlow ? (
            <Check className="w-10 h-10 text-blue-600" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-amber-600" />
          )}
        </div>
        <div>
          <h2 className="text-2xl font-semibold">
            {flowLive
              ? 'Flow activo'
              : isFullFlow
              ? 'Flujo creado — listo para activar'
              : 'Flow no pudo crearse automaticamente'}
          </h2>
          <p className="text-muted-foreground mt-2">
            {flowLive
              ? `"${template.nameEs}" esta activo en Klaviyo. Los emails se enviaran automaticamente segun el trigger configurado.`
              : isFullFlow
              ? `"${template.nameEs}" fue creado en Klaviyo en modo borrador. Activalo para que empiece a enviar emails automaticamente.`
              : `No fue posible crear el flow completo en Klaviyo. Los templates fueron limpiados. Puedes intentar de nuevo o crear el flow manualmente en Klaviyo.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFullFlow && !flowLive && (
            <Button onClick={handleActivateFlow} disabled={activating}>
              {activating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Activando...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" />Activar flow</>
              )}
            </Button>
          )}
          {flowId && (
            <Button variant="outline" asChild>
              <a
                href={`https://www.klaviyo.com/flows/${flowId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver en Klaviyo
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
          )}
          <Button variant={isFullFlow && !flowLive ? 'ghost' : 'default'} onClick={onClose}>
            Volver a flujos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Revisar y publicar</h2>
        <p className="text-sm text-muted-foreground">
          Revisa los emails antes de crear el flujo en Klaviyo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email preview */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Email selector tabs */}
            <div className="flex items-center border-b bg-muted/30 px-2">
              {emails.map((email, idx) => (
                <button
                  key={idx}
                  onClick={() => setPreviewIdx(idx)}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    previewIdx === idx
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    Email {idx + 1}
                    {template.discountEmail === idx && <Tag className="w-3 h-3 text-amber-500" />}
                  </span>
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 pr-2">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded ${previewDevice === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded ${previewDevice === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Subject preview */}
            <div className="px-4 py-2 border-b bg-white">
              <p className="text-sm font-medium">{emails[previewIdx]?.subject}</p>
              <p className="text-xs text-muted-foreground">{emails[previewIdx]?.previewText}</p>
            </div>

            {/* Email preview iframe */}
            <div className="flex justify-center p-4 bg-muted/10" style={{ minHeight: 500 }}>
              <iframe
                srcDoc={emails[previewIdx]?.htmlContent || ''}
                className="border rounded shadow-sm bg-white"
                style={{
                  width: previewDevice === 'desktop' ? 600 : 375,
                  height: 500,
                }}
                title={`Preview email ${previewIdx + 1}`}
              />
            </div>
          </Card>
        </div>

        {/* Config summary */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Resumen del flujo</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{template.nameEs}</p>
                  <p className="text-xs text-muted-foreground">{template.triggerDescription}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p>{emails.length} emails en la secuencia</p>
              </div>

              {template.productStrategy !== 'none' && (
                <div className="flex items-start gap-2">
                  <Package className="w-4 h-4 text-[#2A4F9E] shrink-0 mt-0.5" />
                  <p>
                    {template.productStrategy === 'cart_items'
                      ? 'Productos del carrito (dinamico)'
                      : template.productStrategy === 'most_viewed'
                      ? `${state.products.length} productos mas vistos`
                      : `${state.products.length} productos mas vendidos`}
                  </p>
                </div>
              )}

              {state.discountEnabled && (
                <div className="flex items-start gap-2">
                  <Tag className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p>Cupon: <span className="font-mono font-medium">{state.discountCode}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {state.discountType === 'percentage'
                        ? `${state.discountValue}% de descuento`
                        : state.discountType === 'fixed_amount'
                        ? `$${state.discountValue} de descuento`
                        : 'Envio gratis'}
                      {state.discountExpiry && ` · Hasta ${state.discountExpiry}`}
                    </p>
                    {state.shopifyDiscountId && (
                      <Badge variant="outline" className="text-[10px] mt-1 bg-green-50 text-green-700 border-green-200">
                        <Check className="w-2.5 h-2.5 mr-0.5" />Creado en Shopify
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Timeline</h3>
            <div className="relative pl-5">
              <div className="absolute left-[7px] top-1 bottom-1 w-px border-l-2 border-dashed border-muted-foreground/30" />
              {template.emails.map((email, idx) => (
                <div key={idx} className="relative mb-3 last:mb-0">
                  <div className="absolute -left-5 top-0.5 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background" />
                  <div className="text-xs">
                    <p className="font-medium">{emails[idx]?.subject || email.subject}</p>
                    <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDelay(email.delayHours)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Publish button */}
          <Button
            onClick={handlePublish}
            disabled={publishing}
            size="lg"
            className="w-full"
          >
            {publishing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando en Klaviyo...</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" />Crear flujo en Klaviyo</>
            )}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-start pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Atras
        </Button>
      </div>
    </div>
  );
}
