import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { X, Check, ChevronRight } from 'lucide-react';
import { type FlowTemplate, type DiscountType } from './FlowTemplates';
import { type EditorEmail } from '../../klaviyo/UnlayerEmailEditor';
import { FlowConfigStep } from './steps/FlowConfigStep';
import { FlowContentStep } from './steps/FlowContentStep';
import { FlowEditStep } from './steps/FlowEditStep';
import { FlowPublishStep } from './steps/FlowPublishStep';

export interface ProductItem {
  title: string;
  image_url: string;
  price: string;
  handle: string;
  url: string;
}

export interface FlowWizardState {
  discountEnabled: boolean;
  discountCode: string;
  discountValue: number;
  discountType: DiscountType;
  discountExpiry: string;
  shopifyDiscountId: string | null;
  products: ProductItem[];
  generatedEmails: EditorEmail[];
  editedEmails: EditorEmail[];
  klaviyoConnectionId: string;
  shopifyConnectionId: string;
}

interface FlowWizardProps {
  template: FlowTemplate;
  clientId: string;
  onClose: () => void;
  onFlowCreated?: () => void;
}

const STEPS = [
  { label: 'Configurar', key: 'config' },
  { label: 'Contenido', key: 'content' },
  { label: 'Editar', key: 'edit' },
  { label: 'Publicar', key: 'publish' },
] as const;

function generateDiscountCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = prefix ? prefix.toUpperCase() + '-' : '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function FlowWizard({ template, clientId, onClose, onFlowCreated }: FlowWizardProps) {
  const [step, setStep] = useState(0);
  const [flowCreated, setFlowCreated] = useState(false);

  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 30);

  const [state, setState] = useState<FlowWizardState>({
    discountEnabled: template.discountEmail !== null,
    discountCode: generateDiscountCode(template.id === 'welcome_series' ? 'BIENVENIDA' : template.id === 'abandoned_cart' ? 'CARRITO' : 'DESCUENTO'),
    discountValue: template.defaultDiscountValue,
    discountType: template.defaultDiscountType || 'percentage',
    discountExpiry: defaultExpiry.toISOString().split('T')[0],
    shopifyDiscountId: null,
    products: [],
    generatedEmails: [],
    editedEmails: [],
    klaviyoConnectionId: '',
    shopifyConnectionId: '',
  });

  const updateState = useCallback((partial: Partial<FlowWizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const canGoNext = (): boolean => {
    switch (step) {
      case 0: return true; // config is always passable
      case 1: return state.generatedEmails.length > 0;
      case 2: return state.editedEmails.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{template.nameEs}</h1>
            <p className="text-xs text-muted-foreground">{template.triggerDescription}</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
              )}
            </div>
          ))}
        </div>

        <div className="w-[100px]" /> {/* Spacer for centering */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step === 0 && (
          <FlowConfigStep
            template={template}
            clientId={clientId}
            state={state}
            updateState={updateState}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <FlowContentStep
            template={template}
            clientId={clientId}
            state={state}
            updateState={updateState}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <FlowEditStep
            template={template}
            state={state}
            updateState={updateState}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <FlowPublishStep
            template={template}
            clientId={clientId}
            state={state}
            flowCreated={flowCreated}
            onFlowCreated={() => {
              setFlowCreated(true);
              onFlowCreated?.();
            }}
            onBack={() => setStep(2)}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
