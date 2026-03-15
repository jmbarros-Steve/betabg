import { useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mail, Clock, GitBranch, Plus, Trash2, Eye, Edit,
  ShoppingCart, UserPlus, Package, UserX, Zap, ChevronDown,
  Cake, Search,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface FlowStep {
  type?: 'email' | 'condition' | 'delay';
  subject?: string;
  preview_text?: string;
  html_content?: string;
  design_json?: any;
  delay_seconds: number;
  from_name?: string;
  conditions?: any;
  condition?: {
    type: string;
    field?: string;
    operator?: string;
    value?: string;
  };
  yes_steps?: FlowStep[];
  no_steps?: FlowStep[];
}

interface FlowCanvasProps {
  triggerType: string;
  steps: FlowStep[];
  onUpdateStep: (index: number, updates: Partial<FlowStep>) => void;
  onRemoveStep: (index: number) => void;
  onAddStep: (type: 'email' | 'delay' | 'condition') => void;
  onOpenStepEditor: (index: number) => void;
  onPreviewStep: (html: string) => void;
  onAddSubStep: (parentIndex: number, branch: 'yes_steps' | 'no_steps', type: 'email' | 'condition') => void;
  onUpdateSubStep: (parentIndex: number, branch: 'yes_steps' | 'no_steps', subIndex: number, updates: Partial<FlowStep>) => void;
  onRemoveSubStep: (parentIndex: number, branch: 'yes_steps' | 'no_steps', subIndex: number) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<string, any> = {
  abandoned_cart: ShoppingCart,
  welcome: UserPlus,
  customer_created: UserPlus,
  first_purchase: Package,
  post_purchase: Package,
  winback: UserX,
  birthday: Cake,
  browse_abandonment: Search,
};

const TRIGGER_LABELS: Record<string, string> = {
  abandoned_cart: 'Carrito abandonado',
  welcome: 'Nuevo suscriptor',
  customer_created: 'Nuevo cliente',
  first_purchase: 'Primera compra',
  post_purchase: 'Post-compra',
  winback: 'Cliente inactivo',
  birthday: 'Cumpleaños',
  browse_abandonment: 'Navegación abandonada',
};

const CONDITION_TYPES = [
  { value: 'opened_email', label: 'Abrió el email' },
  { value: 'clicked_email', label: 'Hizo clic en el email' },
  { value: 'has_purchased', label: 'Ha comprado' },
  { value: 'subscriber_property', label: 'Propiedad del suscriptor' },
];

const DELAY_OPTIONS = [
  { value: 0, label: 'Inmediato' },
  { value: 1800, label: '30 min' },
  { value: 3600, label: '1 hora' },
  { value: 7200, label: '2 horas' },
  { value: 14400, label: '4 horas' },
  { value: 43200, label: '12 horas' },
  { value: 86400, label: '1 día' },
  { value: 172800, label: '2 días' },
  { value: 259200, label: '3 días' },
  { value: 604800, label: '7 días' },
  { value: 1209600, label: '14 días' },
];

function delayLabel(seconds: number) {
  const opt = DELAY_OPTIONS.find(o => o.value === seconds);
  if (opt) return opt.label;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ── Node width / layout constants ──────────────────────────────────────────
const NODE_W = 280;
const CONNECTOR_GAP = 12;

// ── SVG Connector ──────────────────────────────────────────────────────────

function VerticalConnector({ height = 32 }: { height?: number }) {
  return (
    <div className="flex justify-center" style={{ height }}>
      <svg width="2" height={height} className="overflow-visible">
        <line x1="1" y1="0" x2="1" y2={height} stroke="#a1a1aa" strokeWidth="2" strokeDasharray="4 3" />
        <polygon points="-4,0 4,0 0,6" fill="#a1a1aa" transform={`translate(1, ${height - 6})`} />
      </svg>
    </div>
  );
}

// ── Trigger Node ───────────────────────────────────────────────────────────

function TriggerNode({ triggerType }: { triggerType: string }) {
  const Icon = TRIGGER_ICONS[triggerType] || Zap;
  const label = TRIGGER_LABELS[triggerType] || triggerType;

  return (
    <div className="flex justify-center">
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20"
        style={{ width: NODE_W }}
      >
        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Disparador</p>
          <p className="text-sm font-semibold">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ── Email Node ─────────────────────────────────────────────────────────────

function EmailNode({
  step,
  index,
  onUpdate,
  onRemove,
  onOpenEditor,
  onPreview,
  compact = false,
}: {
  step: FlowStep;
  index: number;
  onUpdate: (updates: Partial<FlowStep>) => void;
  onRemove: () => void;
  onOpenEditor: () => void;
  onPreview: () => void;
  compact?: boolean;
}) {
  const hasContent = !!step.html_content;

  return (
    <div className="flex justify-center">
      <Card
        className={`transition-all hover:shadow-md ${hasContent ? 'border-blue-300 bg-blue-50/30' : 'border-dashed'}`}
        style={{ width: compact ? 220 : NODE_W }}
      >
        <CardContent className={compact ? 'py-2 px-3 space-y-2' : 'py-3 px-4 space-y-2.5'}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Mail className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-blue-600`} />
              <span className={`font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>Email {index + 1}</span>
              {hasContent && (
                <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-700 border-green-200">
                  Listo
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {hasContent && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onPreview}>
                  <Eye className="w-3 h-3" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Subject */}
          <Input
            className={`${compact ? 'h-7 text-[11px]' : 'h-8 text-xs'}`}
            value={step.subject || ''}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder="Asunto del email"
          />

          {/* Delay (for email steps with delay) */}
          {step.delay_seconds > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-orange-500" />
              <Select
                value={String(step.delay_seconds)}
                onValueChange={(v) => onUpdate({ delay_seconds: Number(v) })}
              >
                <SelectTrigger className={`${compact ? 'h-6 text-[10px]' : 'h-7 text-xs'} border-orange-200`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELAY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Edit button */}
          <Button
            variant={hasContent ? 'outline' : 'default'}
            size="sm"
            className={`w-full ${compact ? 'h-7 text-[10px]' : 'h-8 text-xs'}`}
            onClick={onOpenEditor}
          >
            <Edit className="w-3 h-3 mr-1" />
            {hasContent ? 'Editar diseño' : 'Diseñar email'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Delay Node ─────────────────────────────────────────────────────────────

function DelayNode({
  step,
  onUpdate,
  onRemove,
}: {
  step: FlowStep;
  onUpdate: (updates: Partial<FlowStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex justify-center">
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-full border-2 border-orange-300 bg-orange-50"
        style={{ width: NODE_W }}
      >
        <Clock className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-xs font-medium text-orange-800 shrink-0">Esperar</span>
        <Select
          value={String(step.delay_seconds)}
          onValueChange={(v) => onUpdate({ delay_seconds: Number(v) })}
        >
          <SelectTrigger className="h-7 text-xs border-orange-200 bg-white flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELAY_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-orange-400 hover:text-destructive shrink-0" onClick={onRemove}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Condition Node ─────────────────────────────────────────────────────────

function ConditionNode({
  step,
  index,
  onUpdate,
  onRemove,
  onAddSubStep,
  onUpdateSubStep,
  onRemoveSubStep,
  onOpenStepEditor,
  onPreviewStep,
}: {
  step: FlowStep;
  index: number;
  onUpdate: (updates: Partial<FlowStep>) => void;
  onRemove: () => void;
  onAddSubStep: (branch: 'yes_steps' | 'no_steps', type: 'email' | 'condition') => void;
  onUpdateSubStep: (branch: 'yes_steps' | 'no_steps', subIndex: number, updates: Partial<FlowStep>) => void;
  onRemoveSubStep: (branch: 'yes_steps' | 'no_steps', subIndex: number) => void;
  onOpenStepEditor: (index: number) => void;
  onPreviewStep: (html: string) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Condition diamond */}
      <div
        className="relative flex items-center gap-3 px-5 py-3 rounded-xl border-2 border-purple-300 bg-purple-50"
        style={{ width: NODE_W }}
      >
        <GitBranch className="w-4 h-4 text-purple-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-purple-600 uppercase tracking-wider mb-1">Condición</p>
          <Select
            value={step.condition?.type || 'opened_email'}
            onValueChange={(v) => onUpdate({ condition: { ...step.condition, type: v } })}
          >
            <SelectTrigger className="h-7 text-xs border-purple-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map(ct => (
                <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-purple-400 hover:text-destructive shrink-0" onClick={onRemove}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Branch split connector */}
      <div className="relative w-full" style={{ height: 32 }}>
        <svg className="absolute inset-0 w-full h-full overflow-visible">
          {/* Center line down */}
          <line x1="50%" y1="0" x2="50%" y2="16" stroke="#a1a1aa" strokeWidth="2" strokeDasharray="4 3" />
          {/* Horizontal line */}
          <line x1="25%" y1="16" x2="75%" y2="16" stroke="#a1a1aa" strokeWidth="2" />
          {/* Left branch down */}
          <line x1="25%" y1="16" x2="25%" y2="32" stroke="#22c55e" strokeWidth="2" />
          <polygon points="-3,0 3,0 0,5" fill="#22c55e" transform="translate(0, 27)" style={{ transform: 'translate(25%, 27px)' }} />
          {/* Right branch down */}
          <line x1="75%" y1="16" x2="75%" y2="32" stroke="#ef4444" strokeWidth="2" />
        </svg>
      </div>

      {/* YES / NO branches side by side */}
      <div className="grid grid-cols-2 gap-4 w-full" style={{ maxWidth: NODE_W * 2 + 16 }}>
        {/* YES Branch */}
        <div className="flex flex-col items-center">
          <Badge className="mb-2 bg-green-100 text-green-700 border-green-300 text-[10px]">
            Sí
          </Badge>
          <div className="space-y-1 w-full flex flex-col items-center">
            {(step.yes_steps || []).map((subStep, subIdx) => (
              <div key={subIdx} className="flex flex-col items-center">
                {subIdx > 0 && <VerticalConnector height={20} />}
                <EmailNode
                  step={subStep}
                  index={subIdx}
                  compact
                  onUpdate={(updates) => onUpdateSubStep('yes_steps', subIdx, updates)}
                  onRemove={() => onRemoveSubStep('yes_steps', subIdx)}
                  onOpenEditor={() => {/* handled by parent via sub-step index */}}
                  onPreview={() => subStep.html_content && onPreviewStep(subStep.html_content)}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-green-600 hover:text-green-700 mt-1"
              onClick={() => onAddSubStep('yes_steps', 'email')}
            >
              <Plus className="w-3 h-3 mr-1" /> Email
            </Button>
          </div>
        </div>

        {/* NO Branch */}
        <div className="flex flex-col items-center">
          <Badge className="mb-2 bg-red-100 text-red-700 border-red-300 text-[10px]">
            No
          </Badge>
          <div className="space-y-1 w-full flex flex-col items-center">
            {(step.no_steps || []).map((subStep, subIdx) => (
              <div key={subIdx} className="flex flex-col items-center">
                {subIdx > 0 && <VerticalConnector height={20} />}
                <EmailNode
                  step={subStep}
                  index={subIdx}
                  compact
                  onUpdate={(updates) => onUpdateSubStep('no_steps', subIdx, updates)}
                  onRemove={() => onRemoveSubStep('no_steps', subIdx)}
                  onOpenEditor={() => {/* handled by parent */}}
                  onPreview={() => subStep.html_content && onPreviewStep(subStep.html_content)}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-red-600 hover:text-red-700 mt-1"
              onClick={() => onAddSubStep('no_steps', 'email')}
            >
              <Plus className="w-3 h-3 mr-1" /> Email
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Step Menu ──────────────────────────────────────────────────────────

function AddStepButton({ onAdd }: { onAdd: (type: 'email' | 'delay' | 'condition') => void }) {
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-1.5 p-1 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 hover:bg-blue-50 hover:text-blue-700"
          onClick={() => onAdd('email')}
        >
          <Mail className="w-3.5 h-3.5" /> Email
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 hover:bg-orange-50 hover:text-orange-700"
          onClick={() => onAdd('delay')}
        >
          <Clock className="w-3.5 h-3.5" /> Esperar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 hover:bg-purple-50 hover:text-purple-700"
          onClick={() => onAdd('condition')}
        >
          <GitBranch className="w-3.5 h-3.5" /> Condición
        </Button>
      </div>
    </div>
  );
}

// ── Main Canvas ────────────────────────────────────────────────────────────

export function FlowCanvas({
  triggerType,
  steps,
  onUpdateStep,
  onRemoveStep,
  onAddStep,
  onOpenStepEditor,
  onPreviewStep,
  onAddSubStep,
  onUpdateSubStep,
  onRemoveSubStep,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={canvasRef}
      className="relative w-full overflow-auto bg-gradient-to-b from-muted/20 to-muted/5 rounded-xl border p-6"
      style={{ minHeight: 400 }}
    >
      <div className="flex flex-col items-center space-y-0">
        {/* Trigger node */}
        <TriggerNode triggerType={triggerType} />

        {/* Steps */}
        {steps.map((step, index) => {
          const isCondition = step.type === 'condition';
          const isDelay = step.type === 'delay';
          const isEmail = !isCondition && !isDelay;

          return (
            <div key={index} className="flex flex-col items-center w-full">
              <VerticalConnector />

              {isEmail && (
                <EmailNode
                  step={step}
                  index={index}
                  onUpdate={(updates) => onUpdateStep(index, updates)}
                  onRemove={() => onRemoveStep(index)}
                  onOpenEditor={() => onOpenStepEditor(index)}
                  onPreview={() => step.html_content && onPreviewStep(step.html_content)}
                />
              )}

              {isDelay && (
                <DelayNode
                  step={step}
                  onUpdate={(updates) => onUpdateStep(index, updates)}
                  onRemove={() => onRemoveStep(index)}
                />
              )}

              {isCondition && (
                <ConditionNode
                  step={step}
                  index={index}
                  onUpdate={(updates) => onUpdateStep(index, updates)}
                  onRemove={() => onRemoveStep(index)}
                  onAddSubStep={(branch, type) => onAddSubStep(index, branch, type)}
                  onUpdateSubStep={(branch, subIdx, updates) => onUpdateSubStep(index, branch, subIdx, updates)}
                  onRemoveSubStep={(branch, subIdx) => onRemoveSubStep(index, branch, subIdx)}
                  onOpenStepEditor={onOpenStepEditor}
                  onPreviewStep={onPreviewStep}
                />
              )}
            </div>
          );
        })}

        {/* Add step buttons */}
        <VerticalConnector height={24} />
        <AddStepButton onAdd={onAddStep} />
      </div>
    </div>
  );
}
