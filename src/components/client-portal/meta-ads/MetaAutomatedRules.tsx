import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { useMetaBusiness } from './MetaBusinessContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Clock,
  History,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Copy,
  ChevronRight,
  Filter,
  Search,
  RotateCcw,
  CheckCircle2,
  Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleMetric =
  | 'CPA'
  | 'ROAS'
  | 'CTR'
  | 'SPEND'
  | 'IMPRESSIONS'
  | 'CLICKS'
  | 'CONVERSIONS'
  | 'FREQUENCY';

type RuleOperator = 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'BETWEEN';

type TimeWindow = 'LAST_3_DAYS' | 'LAST_7_DAYS' | 'LAST_14_DAYS' | 'LAST_30_DAYS';

type RuleAction =
  | 'PAUSE_CAMPAIGN'
  | 'INCREASE_BUDGET'
  | 'DECREASE_BUDGET'
  | 'SEND_NOTIFICATION'
  | 'SCALE_BUDGET';

type NotificationType = 'EMAIL' | 'IN_APP';

type ApplyTo = 'ALL_CAMPAIGNS' | 'SPECIFIC_CAMPAIGNS' | 'ACTIVE_ONLY';

type CheckFrequency = 'EVERY_30_MIN' | 'EVERY_1_HOUR' | 'EVERY_6_HOURS' | 'EVERY_12_HOURS' | 'EVERY_24_HOURS';

type ActionColor = 'red' | 'green' | 'yellow' | 'blue' | 'orange';

type ActiveTab = 'rules' | 'presets' | 'history';

interface RuleCondition {
  metric: RuleMetric;
  operator: RuleOperator;
  value: number;
  valueTo?: number; // for BETWEEN operator
  timeWindow: TimeWindow;
}

interface RuleActionConfig {
  type: RuleAction;
  percentage?: number; // for INCREASE/DECREASE budget
  amount?: number; // for SCALE budget
  notificationType?: NotificationType;
}

interface AutomatedRule {
  id: string;
  name: string;
  condition: RuleCondition;
  action: RuleActionConfig;
  applyTo: ApplyTo;
  specificCampaignIds: string[];
  checkFrequency: CheckFrequency;
  isActive: boolean;
  createdAt: string;
  lastTriggered: string | null;
  triggerCount: number;
}

interface RuleLogEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  actionType: RuleAction;
  campaignName: string;
  campaignId: string;
  details: string;
  timestamp: string;
}

interface MetaAutomatedRulesProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Constants / Helpers
// ---------------------------------------------------------------------------

const METRIC_OPTIONS: { value: RuleMetric; label: string; icon: React.ElementType }[] = [
  { value: 'CPA', label: 'CPA (Costo por Adquisición)', icon: DollarSign },
  { value: 'ROAS', label: 'ROAS (Retorno sobre Gasto)', icon: TrendingUp },
  { value: 'CTR', label: 'CTR (Tasa de Clics)', icon: Target },
  { value: 'SPEND', label: 'Gasto', icon: DollarSign },
  { value: 'IMPRESSIONS', label: 'Impresiones', icon: TrendingUp },
  { value: 'CLICKS', label: 'Clics', icon: Target },
  { value: 'CONVERSIONS', label: 'Conversiones', icon: CheckCircle2 },
  { value: 'FREQUENCY', label: 'Frecuencia', icon: RotateCcw },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: 'GREATER_THAN', label: 'Mayor que' },
  { value: 'LESS_THAN', label: 'Menor que' },
  { value: 'EQUALS', label: 'Igual a' },
  { value: 'BETWEEN', label: 'Entre' },
];

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: 'LAST_3_DAYS', label: 'Últimos 3 días' },
  { value: 'LAST_7_DAYS', label: 'Últimos 7 días' },
  { value: 'LAST_14_DAYS', label: 'Últimos 14 días' },
  { value: 'LAST_30_DAYS', label: 'Últimos 30 días' },
];

const ACTION_OPTIONS: { value: RuleAction; label: string; icon: React.ElementType; color: ActionColor }[] = [
  { value: 'PAUSE_CAMPAIGN', label: 'Pausar campaña', icon: Pause, color: 'red' },
  { value: 'INCREASE_BUDGET', label: 'Aumentar presupuesto', icon: ArrowUpRight, color: 'green' },
  { value: 'DECREASE_BUDGET', label: 'Reducir presupuesto', icon: ArrowDownRight, color: 'orange' },
  { value: 'SEND_NOTIFICATION', label: 'Enviar notificación', icon: Bell, color: 'blue' },
  { value: 'SCALE_BUDGET', label: 'Escalar presupuesto a monto', icon: TrendingUp, color: 'green' },
];

const APPLY_TO_OPTIONS: { value: ApplyTo; label: string }[] = [
  { value: 'ALL_CAMPAIGNS', label: 'Todas las campañas' },
  { value: 'SPECIFIC_CAMPAIGNS', label: 'Campañas específicas' },
  { value: 'ACTIVE_ONLY', label: 'Solo campañas activas' },
];

const FREQUENCY_OPTIONS: { value: CheckFrequency; label: string }[] = [
  { value: 'EVERY_30_MIN', label: 'Cada 30 minutos' },
  { value: 'EVERY_1_HOUR', label: 'Cada 1 hora' },
  { value: 'EVERY_6_HOURS', label: 'Cada 6 horas' },
  { value: 'EVERY_12_HOURS', label: 'Cada 12 horas' },
  { value: 'EVERY_24_HOURS', label: 'Cada 24 horas' },
];

interface PresetRule {
  name: string;
  description: string;
  condition: RuleCondition;
  action: RuleActionConfig;
  icon: React.ElementType;
  color: string;
}

const PRESET_RULES: PresetRule[] = [
  {
    name: 'Pausar si CPA > $5,000 CLP',
    description: 'Pausa automáticamente campañas cuyo costo por adquisición supera los $5,000 CLP en los últimos 7 días.',
    condition: { metric: 'CPA', operator: 'GREATER_THAN', value: 5000, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'PAUSE_CAMPAIGN' },
    icon: Pause,
    color: 'text-red-500',
  },
  {
    name: 'Escalar si ROAS > 3x',
    description: 'Aumenta el presupuesto en 20% cuando el ROAS supera 3x en los últimos 7 días.',
    condition: { metric: 'ROAS', operator: 'GREATER_THAN', value: 3, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'INCREASE_BUDGET', percentage: 20 },
    icon: TrendingUp,
    color: 'text-green-500',
  },
  {
    name: 'Pausar si sin conversiones en 3 días',
    description: 'Pausa campañas que llevan 3 días sin generar conversiones.',
    condition: { metric: 'CONVERSIONS', operator: 'EQUALS', value: 0, timeWindow: 'LAST_3_DAYS' },
    action: { type: 'PAUSE_CAMPAIGN' },
    icon: AlertTriangle,
    color: 'text-amber-500',
  },
  {
    name: 'Alertar si gasto diario > $50,000 CLP',
    description: 'Envía una notificación cuando el gasto supera $50,000 CLP en los últimos 3 días.',
    condition: { metric: 'SPEND', operator: 'GREATER_THAN', value: 50000, timeWindow: 'LAST_3_DAYS' },
    action: { type: 'SEND_NOTIFICATION', notificationType: 'IN_APP' },
    icon: Bell,
    color: 'text-blue-500',
  },
  {
    name: 'Reducir presupuesto si CTR < 1%',
    description: 'Reduce el presupuesto en 15% si el CTR cae por debajo del 1% en los últimos 7 días.',
    condition: { metric: 'CTR', operator: 'LESS_THAN', value: 1, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'DECREASE_BUDGET', percentage: 15 },
    icon: ArrowDownRight,
    color: 'text-orange-500',
  },
];

const generateId = (): string => `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const formatMetricLabel = (metric: RuleMetric): string => {
  const found = METRIC_OPTIONS.find((m) => m.value === metric);
  return found ? found.label.split(' (')[0] : metric;
};

const formatOperatorLabel = (op: RuleOperator): string => {
  const found = OPERATOR_OPTIONS.find((o) => o.value === op);
  return found ? found.label.toLowerCase() : op;
};

const formatTimeWindowLabel = (tw: TimeWindow): string => {
  const found = TIME_WINDOW_OPTIONS.find((t) => t.value === tw);
  return found ? found.label.toLowerCase() : tw;
};

const formatActionLabel = (action: RuleActionConfig): string => {
  switch (action.type) {
    case 'PAUSE_CAMPAIGN':
      return 'Pausar campaña';
    case 'INCREASE_BUDGET':
      return `Aumentar presupuesto ${action.percentage ?? 0}%`;
    case 'DECREASE_BUDGET':
      return `Reducir presupuesto ${action.percentage ?? 0}%`;
    case 'SEND_NOTIFICATION':
      return `Notificar (${action.notificationType === 'EMAIL' ? 'Email' : 'In-app'})`;
    case 'SCALE_BUDGET':
      return `Escalar presupuesto a $${(action.amount ?? 0).toLocaleString()}`;
    default:
      return action.type;
  }
};

const formatConditionSummary = (cond: RuleCondition): string => {
  const metric = formatMetricLabel(cond.metric);
  const op = formatOperatorLabel(cond.operator);
  const tw = formatTimeWindowLabel(cond.timeWindow);
  if (cond.operator === 'BETWEEN') {
    return `${metric} ${op} ${cond.value} y ${cond.valueTo ?? 0} (${tw})`;
  }
  const prefix = cond.metric === 'SPEND' || cond.metric === 'CPA' ? '$' : '';
  const suffix = cond.metric === 'CTR' || cond.metric === 'ROAS' ? (cond.metric === 'CTR' ? '%' : 'x') : '';
  return `${metric} ${op} ${prefix}${cond.value.toLocaleString()}${suffix} (${tw})`;
};

const formatFrequencyLabel = (freq: CheckFrequency): string => {
  const found = FREQUENCY_OPTIONS.find((f) => f.value === freq);
  return found ? found.label.toLowerCase() : freq;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getActionBadgeVariant = (
  actionType: RuleAction
): 'default' | 'destructive' | 'outline' | 'secondary' => {
  switch (actionType) {
    case 'PAUSE_CAMPAIGN':
      return 'destructive';
    case 'INCREASE_BUDGET':
    case 'SCALE_BUDGET':
      return 'default';
    case 'DECREASE_BUDGET':
      return 'secondary';
    case 'SEND_NOTIFICATION':
      return 'outline';
    default:
      return 'default';
  }
};

const getActionDotColor = (actionType: RuleAction): string => {
  switch (actionType) {
    case 'PAUSE_CAMPAIGN':
      return 'bg-red-500';
    case 'INCREASE_BUDGET':
    case 'SCALE_BUDGET':
      return 'bg-green-500';
    case 'DECREASE_BUDGET':
      return 'bg-orange-500';
    case 'SEND_NOTIFICATION':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

// ---------------------------------------------------------------------------
// Initial form state
// ---------------------------------------------------------------------------

const EMPTY_FORM: {
  name: string;
  metric: RuleMetric;
  operator: RuleOperator;
  value: string;
  valueTo: string;
  timeWindow: TimeWindow;
  actionType: RuleAction;
  actionPercentage: string;
  actionAmount: string;
  notificationType: NotificationType;
  applyTo: ApplyTo;
  specificCampaignIds: string[];
  checkFrequency: CheckFrequency;
} = {
  name: '',
  metric: 'CPA',
  operator: 'GREATER_THAN',
  value: '',
  valueTo: '',
  timeWindow: 'LAST_7_DAYS',
  actionType: 'PAUSE_CAMPAIGN',
  actionPercentage: '20',
  actionAmount: '',
  notificationType: 'IN_APP',
  applyTo: 'ACTIVE_ONLY',
  specificCampaignIds: [],
  checkFrequency: 'EVERY_1_HOUR',
};

// ---------------------------------------------------------------------------
// Sample log data (demo)
// ---------------------------------------------------------------------------

const SAMPLE_LOG: RuleLogEntry[] = [
  {
    id: 'log_1',
    ruleId: 'demo_1',
    ruleName: 'Pausar si CPA > $5,000',
    actionType: 'PAUSE_CAMPAIGN',
    campaignName: 'Campaña Verano 2026',
    campaignId: 'camp_01',
    details: 'CPA alcanzó $6,200 (umbral: $5,000). Campaña pausada automáticamente.',
    timestamp: '2026-02-26T14:32:00Z',
  },
  {
    id: 'log_2',
    ruleId: 'demo_2',
    ruleName: 'Escalar si ROAS > 3x',
    actionType: 'INCREASE_BUDGET',
    campaignName: 'Promo San Valentín',
    campaignId: 'camp_02',
    details: 'ROAS de 4.2x detectado. Presupuesto aumentado de $30,000 a $36,000 (+20%).',
    timestamp: '2026-02-25T09:15:00Z',
  },
  {
    id: 'log_3',
    ruleId: 'demo_3',
    ruleName: 'Alertar si gasto > $50,000',
    actionType: 'SEND_NOTIFICATION',
    campaignName: 'Brand Awareness Q1',
    campaignId: 'camp_03',
    details: 'Gasto acumulado de $52,300 en últimos 3 días. Notificación enviada.',
    timestamp: '2026-02-24T18:45:00Z',
  },
  {
    id: 'log_4',
    ruleId: 'demo_4',
    ruleName: 'Reducir presupuesto si CTR < 1%',
    actionType: 'DECREASE_BUDGET',
    campaignName: 'Retargeting Carritos',
    campaignId: 'camp_04',
    details: 'CTR de 0.68%. Presupuesto reducido de $20,000 a $17,000 (-15%).',
    timestamp: '2026-02-23T11:20:00Z',
  },
  {
    id: 'log_5',
    ruleId: 'demo_5',
    ruleName: 'Pausar si sin conversiones en 3 días',
    actionType: 'PAUSE_CAMPAIGN',
    campaignName: 'Test Audiencia Fría',
    campaignId: 'camp_05',
    details: '0 conversiones en los últimos 3 días. Campaña pausada automáticamente.',
    timestamp: '2026-02-22T08:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MetaAutomatedRules({ clientId }: MetaAutomatedRulesProps) {
  const { connectionId: ctxConnectionId } = useMetaBusiness();

  // --- State ----------------------------------------------------------------
  const [rules, setRules] = useState<AutomatedRule[]>([]);
  const [logEntries, setLogEntries] = useState<RuleLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('rules');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomatedRule | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);

  // --- Fetch rules from backend -------------------------------------------
  const fetchRules = useCallback(async () => {
    if (!clientId || !ctxConnectionId) return;
    try {
      const { data, error } = await callApi('manage-meta-rules', {
        body: { action: 'list', client_id: clientId, connection_id: ctxConnectionId },
      });
      if (error) throw new Error(error);

      const dbRules: AutomatedRule[] = (data?.rules || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        condition: r.condition as RuleCondition,
        action: r.action as RuleActionConfig,
        applyTo: r.apply_to as ApplyTo,
        specificCampaignIds: r.specific_campaign_ids || [],
        checkFrequency: r.check_frequency as CheckFrequency,
        isActive: r.is_active,
        createdAt: r.created_at,
        lastTriggered: r.last_triggered_at,
        triggerCount: r.trigger_count || 0,
      }));
      setRules(dbRules);

      const dbLogs: RuleLogEntry[] = (data?.logs || []).map((l: any) => ({
        id: l.id,
        ruleId: l.rule_id,
        ruleName: dbRules.find((r: AutomatedRule) => r.id === l.rule_id)?.name || 'Regla eliminada',
        actionType: l.action_type as RuleAction,
        campaignName: l.campaign_name,
        campaignId: l.campaign_id,
        details: l.details,
        timestamp: l.executed_at,
      }));
      setLogEntries(dbLogs);
    } catch (err) {
      console.error('[MetaAutomatedRules] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, ctxConnectionId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // --- Derived ---------------------------------------------------------------
  const filteredRules = rules.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeRuleCount = rules.filter((r) => r.isActive).length;

  // --- Handlers --------------------------------------------------------------

  const resetForm = () => setForm({ ...EMPTY_FORM });

  const openCreate = () => {
    resetForm();
    setEditingRule(null);
    setIsCreateOpen(true);
  };

  const openEdit = (rule: AutomatedRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      metric: rule.condition.metric,
      operator: rule.condition.operator,
      value: String(rule.condition.value),
      valueTo: rule.condition.valueTo != null ? String(rule.condition.valueTo) : '',
      timeWindow: rule.condition.timeWindow,
      actionType: rule.action.type,
      actionPercentage: rule.action.percentage != null ? String(rule.action.percentage) : '20',
      actionAmount: rule.action.amount != null ? String(rule.action.amount) : '',
      notificationType: rule.action.notificationType ?? 'IN_APP',
      applyTo: rule.applyTo,
      specificCampaignIds: rule.specificCampaignIds,
      checkFrequency: rule.checkFrequency,
    });
    setIsCreateOpen(true);
  };

  const applyPreset = (preset: PresetRule) => {
    resetForm();
    setEditingRule(null);
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      metric: preset.condition.metric,
      operator: preset.condition.operator,
      value: String(preset.condition.value),
      valueTo: preset.condition.valueTo != null ? String(preset.condition.valueTo) : '',
      timeWindow: preset.condition.timeWindow,
      actionType: preset.action.type,
      actionPercentage: preset.action.percentage != null ? String(preset.action.percentage) : '20',
      actionAmount: preset.action.amount != null ? String(preset.action.amount) : '',
      notificationType: preset.action.notificationType ?? 'IN_APP',
    }));
    setIsCreateOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre de la regla es obligatorio');
      return;
    }
    if (!ctxConnectionId) {
      toast.error('No hay conexion Meta Ads activa');
      return;
    }
    const numericValue = parseFloat(form.value);
    if (isNaN(numericValue)) {
      toast.error('Ingresa un valor numérico válido para la condición');
      return;
    }
    if (form.operator === 'BETWEEN') {
      const numericTo = parseFloat(form.valueTo);
      if (isNaN(numericTo) || numericTo <= numericValue) {
        toast.error('El rango "hasta" debe ser mayor que el valor "desde"');
        return;
      }
    }
    if (
      (form.actionType === 'INCREASE_BUDGET' || form.actionType === 'DECREASE_BUDGET') &&
      (isNaN(parseFloat(form.actionPercentage)) || parseFloat(form.actionPercentage) <= 0)
    ) {
      toast.error('Ingresa un porcentaje válido mayor a 0');
      return;
    }
    if (
      form.actionType === 'SCALE_BUDGET' &&
      (isNaN(parseFloat(form.actionAmount)) || parseFloat(form.actionAmount) <= 0)
    ) {
      toast.error('Ingresa un monto válido mayor a 0');
      return;
    }

    const condition: RuleCondition = {
      metric: form.metric,
      operator: form.operator,
      value: numericValue,
      ...(form.operator === 'BETWEEN' ? { valueTo: parseFloat(form.valueTo) } : {}),
      timeWindow: form.timeWindow,
    };

    const action: RuleActionConfig = {
      type: form.actionType,
      ...(form.actionType === 'INCREASE_BUDGET' || form.actionType === 'DECREASE_BUDGET'
        ? { percentage: parseFloat(form.actionPercentage) }
        : {}),
      ...(form.actionType === 'SCALE_BUDGET' ? { amount: parseFloat(form.actionAmount) } : {}),
      ...(form.actionType === 'SEND_NOTIFICATION'
        ? { notificationType: form.notificationType }
        : {}),
    };

    setSaving(true);
    try {
      if (editingRule) {
        const { error } = await callApi('manage-meta-rules', {
          body: {
            action: 'update',
            client_id: clientId,
            connection_id: ctxConnectionId,
            rule_id: editingRule.id,
            data: {
              name: form.name.trim(),
              condition,
              action,
              apply_to: form.applyTo,
              specific_campaign_ids: form.specificCampaignIds,
              check_frequency: form.checkFrequency,
            },
          },
        });
        if (error) throw new Error(error);
        toast.success('Regla actualizada correctamente');
      } else {
        const { error } = await callApi('manage-meta-rules', {
          body: {
            action: 'create',
            client_id: clientId,
            connection_id: ctxConnectionId,
            data: {
              name: form.name.trim(),
              condition,
              action,
              apply_to: form.applyTo,
              specific_campaign_ids: form.specificCampaignIds,
              check_frequency: form.checkFrequency,
            },
          },
        });
        if (error) throw new Error(error);
        toast.success('Regla creada correctamente');
      }

      setIsCreateOpen(false);
      resetForm();
      setEditingRule(null);
      await fetchRules();
    } catch (err) {
      console.error('[MetaAutomatedRules] Save error:', err);
      toast.error('Error al guardar regla');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (ruleId: string) => {
    if (!ctxConnectionId) return;
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    // Optimistic update
    setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));

    try {
      const { error } = await callApi('manage-meta-rules', {
        body: { action: 'toggle', client_id: clientId, connection_id: ctxConnectionId, rule_id: ruleId },
      });
      if (error) throw new Error(error);
      toast.info(`Regla "${rule.name}" ${!rule.isActive ? 'activada' : 'pausada'}`);
    } catch (err) {
      // Revert optimistic update
      setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, isActive: rule.isActive } : r));
      toast.error('Error al cambiar estado de la regla');
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!ctxConnectionId) return;
    const rule = rules.find((r) => r.id === ruleId);

    try {
      const { error } = await callApi('manage-meta-rules', {
        body: { action: 'delete', client_id: clientId, connection_id: ctxConnectionId, rule_id: ruleId },
      });
      if (error) throw new Error(error);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setDeleteConfirmId(null);
      if (rule) toast.success(`Regla "${rule.name}" eliminada`);
    } catch (err) {
      toast.error('Error al eliminar regla');
    }
  };

  const handleExecuteRules = async () => {
    if (!ctxConnectionId) return;
    setExecuting(true);
    try {
      const { data, error } = await callApi('manage-meta-rules', {
        body: { action: 'execute', client_id: clientId, connection_id: ctxConnectionId },
      });
      if (error) throw new Error(error);
      const executed = data?.executed || 0;
      if (executed > 0) {
        toast.success(`${executed} acción(es) ejecutada(s)`);
      } else {
        toast.info('Ninguna regla se activó con los datos actuales');
      }
      await fetchRules();
    } catch (err) {
      console.error('[MetaAutomatedRules] Execute error:', err);
      toast.error('Error al evaluar reglas');
    } finally {
      setExecuting(false);
    }
  };

  // --- Sub-renders -----------------------------------------------------------

  const renderRulesList = () => {
    if (rules.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sin reglas automatizadas</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Crea reglas para pausar campañas con bajo rendimiento, escalar presupuesto en las ganadoras, o recibir alertas cuando las métricas cambien.
            </p>
            <div className="flex gap-3">
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Crear regla
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('presets')}>
                <Copy className="h-4 w-4 mr-2" />
                Ver plantillas
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar reglas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            {activeRuleCount} activa{activeRuleCount !== 1 ? 's' : ''} de {rules.length}
          </Badge>
        </div>

        {filteredRules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron reglas que coincidan con "{searchQuery}"
          </div>
        ) : (
          filteredRules.map((rule) => (
            <Card
              key={rule.id}
              className={`transition-all ${rule.isActive ? 'border-border' : 'border-dashed opacity-70'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: rule info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold truncate">{rule.name}</h4>
                      <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                        {rule.isActive ? 'Activa' : 'Pausada'}
                      </Badge>
                    </div>

                    {/* Condition & Action summary */}
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium text-foreground bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs">
                          SI
                        </span>
                        {formatConditionSummary(rule.condition)}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium text-foreground bg-green-500/10 text-green-600 px-2 py-0.5 rounded text-xs">
                          ENTONCES
                        </span>
                        {formatActionLabel(rule.action)}
                      </div>
                    </div>

                    {/* Metadata row */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatFrequencyLabel(rule.checkFrequency)}
                      </span>
                      {rule.lastTriggered && (
                        <span className="flex items-center gap-1">
                          <History className="h-3 w-3" />
                          Último: {formatDate(rule.lastTriggered)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {rule.triggerCount} ejecucion{rule.triggerCount !== 1 ? 'es' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleRule(rule.id)}
                      aria-label={`Toggle rule ${rule.name}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    );
  };

  const renderPresets = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Plantillas predefinidas para comenzar rápidamente. Haz clic en una para personalizarla.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRESET_RULES.map((preset, idx) => {
          const Icon = preset.icon;
          return (
            <Card
              key={idx}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
              onClick={() => applyPreset(preset)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg bg-muted p-2 shrink-0 ${preset.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                      {preset.name}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderHistory = () => {
    if (logEntries.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sin historial</h3>
            <p className="text-muted-foreground max-w-md">
              Aquí aparecerá un registro cada vez que una regla automatizada se active y ejecute
              una acción sobre tus campañas.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {logEntries.map((entry) => (
          <Card key={entry.id} className="transition-all hover:shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Color dot */}
                <div className="mt-1.5 shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${getActionDotColor(entry.actionType)}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{entry.ruleName}</span>
                    <Badge variant={getActionBadgeVariant(entry.actionType)} className="text-xs">
                      {formatActionLabel({ type: entry.actionType })}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">{entry.details}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {entry.campaignName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderCreateDialog = () => {
    const showPercentage =
      form.actionType === 'INCREASE_BUDGET' || form.actionType === 'DECREASE_BUDGET';
    const showAmount = form.actionType === 'SCALE_BUDGET';
    const showNotificationType = form.actionType === 'SEND_NOTIFICATION';
    const showBetween = form.operator === 'BETWEEN';

    return (
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingRule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {editingRule ? 'Editar regla' : 'Crear regla automatizada'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Rule Name */}
            <div className="space-y-2">
              <Label htmlFor="rule-name" className="text-sm font-semibold">
                Nombre de la regla
              </Label>
              <Input
                id="rule-name"
                placeholder="Ej: Pausar campañas con CPA alto"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* CONDITION BLOCK */}
            <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                    SI
                  </span>
                  Condición de activación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Metric selector */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Métrica</Label>
                    <Select
                      value={form.metric}
                      onValueChange={(val) =>
                        setForm((prev) => ({ ...prev, metric: val as RuleMetric }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METRIC_OPTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Operador</Label>
                    <Select
                      value={form.operator}
                      onValueChange={(val) =>
                        setForm((prev) => ({ ...prev, operator: val as RuleOperator }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATOR_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Value input(s) */}
                <div className={`grid gap-4 ${showBetween ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-2">
                    <Label className="text-xs">{showBetween ? 'Valor desde' : 'Valor'}</Label>
                    <Input
                      type="number"
                      placeholder={
                        form.metric === 'CPA' || form.metric === 'SPEND'
                          ? 'Ej: 5000'
                          : form.metric === 'CTR'
                            ? 'Ej: 1.5'
                            : form.metric === 'ROAS'
                              ? 'Ej: 3'
                              : 'Ej: 100'
                      }
                      value={form.value}
                      onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                    />
                  </div>
                  {showBetween && (
                    <div className="space-y-2">
                      <Label className="text-xs">Valor hasta</Label>
                      <Input
                        type="number"
                        placeholder="Ej: 10000"
                        value={form.valueTo}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, valueTo: e.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Time window */}
                <div className="space-y-2">
                  <Label className="text-xs">Ventana de tiempo</Label>
                  <Select
                    value={form.timeWindow}
                    onValueChange={(val) =>
                      setForm((prev) => ({ ...prev, timeWindow: val as TimeWindow }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_WINDOW_OPTIONS.map((tw) => (
                        <SelectItem key={tw.value} value={tw.value}>
                          {tw.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* ACTION BLOCK */}
            <Card className="border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                    ENTONCES
                  </span>
                  Acción a ejecutar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Acción</Label>
                  <Select
                    value={form.actionType}
                    onValueChange={(val) =>
                      setForm((prev) => ({ ...prev, actionType: val as RuleAction }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Conditional fields based on action type */}
                {showPercentage && (
                  <div className="space-y-2">
                    <Label className="text-xs">Porcentaje de ajuste (%)</Label>
                    <Input
                      type="number"
                      placeholder="Ej: 20"
                      value={form.actionPercentage}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, actionPercentage: e.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {form.actionType === 'INCREASE_BUDGET'
                        ? 'El presupuesto se incrementará en este porcentaje'
                        : 'El presupuesto se reducirá en este porcentaje'}
                    </p>
                  </div>
                )}

                {showAmount && (
                  <div className="space-y-2">
                    <Label className="text-xs">Monto objetivo (CLP)</Label>
                    <Input
                      type="number"
                      placeholder="Ej: 50000"
                      value={form.actionAmount}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, actionAmount: e.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      El presupuesto diario se ajustará a este monto exacto
                    </p>
                  </div>
                )}

                {showNotificationType && (
                  <div className="space-y-2">
                    <Label className="text-xs">Tipo de notificación</Label>
                    <Select
                      value={form.notificationType}
                      onValueChange={(val) =>
                        setForm((prev) => ({
                          ...prev,
                          notificationType: val as NotificationType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN_APP">Notificación in-app</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CONFIGURATION BLOCK */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Configuración
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Apply to */}
                <div className="space-y-2">
                  <Label className="text-xs">Aplicar a</Label>
                  <Select
                    value={form.applyTo}
                    onValueChange={(val) =>
                      setForm((prev) => ({ ...prev, applyTo: val as ApplyTo }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLY_TO_OPTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Check frequency */}
                <div className="space-y-2">
                  <Label className="text-xs">Frecuencia de verificación</Label>
                  <Select
                    value={form.checkFrequency}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        checkFrequency: val as CheckFrequency,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Preview summary */}
            {form.name && form.value && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Vista previa
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold">{form.name}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded text-xs font-medium mr-1">
                      SI
                    </span>
                    {formatConditionSummary({
                      metric: form.metric,
                      operator: form.operator,
                      value: parseFloat(form.value) || 0,
                      valueTo: form.valueTo ? parseFloat(form.valueTo) : undefined,
                      timeWindow: form.timeWindow,
                    })}
                    <span className="mx-2">→</span>
                    <span className="bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded text-xs font-medium mr-1">
                      ENTONCES
                    </span>
                    {formatActionLabel({
                      type: form.actionType,
                      percentage: parseFloat(form.actionPercentage) || undefined,
                      amount: parseFloat(form.actionAmount) || undefined,
                      notificationType: form.notificationType,
                    })}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingRule(null);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingRule ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const renderDeleteConfirmDialog = () => {
    const ruleToDelete = rules.find((r) => r.id === deleteConfirmId);
    if (!ruleToDelete) return null;

    return (
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eliminar regla
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro que deseas eliminar la regla{' '}
            <span className="font-semibold text-foreground">"{ruleToDelete.name}"</span>? Esta
            acción no se puede deshacer.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteRule(ruleToDelete.id)}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // --- Main Render -----------------------------------------------------------

  const tabs: { key: ActiveTab; label: string; icon: React.ElementType }[] = [
    { key: 'rules', label: 'Mis reglas', icon: Zap },
    { key: 'presets', label: 'Plantillas', icon: Copy },
    { key: 'history', label: 'Historial', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Reglas Automatizadas
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Automatiza la gestión de tus campañas con reglas inteligentes basadas en métricas.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecuteRules}
            disabled={!activeRuleCount || executing}
            className="gap-1.5"
          >
            {executing ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {executing ? 'Evaluando...' : 'Evaluar reglas'}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva regla
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rules.length}</p>
              <p className="text-xs text-muted-foreground">Total reglas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Play className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeRuleCount}</p>
              <p className="text-xs text-muted-foreground">Activas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Pause className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rules.length - activeRuleCount}</p>
              <p className="text-xs text-muted-foreground">Pausadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <History className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logEntries.length}</p>
              <p className="text-xs text-muted-foreground">Ejecuciones</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.key === 'rules' && rules.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {rules.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'rules' && renderRulesList()}
      {activeTab === 'presets' && renderPresets()}
      {activeTab === 'history' && renderHistory()}

      {/* Dialogs */}
      {renderCreateDialog()}
      {renderDeleteConfirmDialog()}
    </div>
  );
}
