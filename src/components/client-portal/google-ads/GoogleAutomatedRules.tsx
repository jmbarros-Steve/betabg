import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Zap,
  History,
  Loader2,
} from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  condition: { metric: string; operator: string; value: number; timeWindow: string };
  action: { type: string; percentage?: number };
  apply_to: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface ExecutionLog {
  id: string;
  rule_id: string;
  campaign_id: string;
  campaign_name: string;
  action_type: string;
  details: string;
  metrics_snapshot: any;
  executed_at: string;
}

interface GoogleAutomatedRulesProps {
  connectionId: string;
  clientId: string;
}

const METRIC_OPTIONS = [
  { value: 'cpa', label: 'CPA (Costo por Conversion)' },
  { value: 'roas', label: 'ROAS' },
  { value: 'ctr', label: 'CTR (%)' },
  { value: 'spend', label: 'Gasto Total' },
  { value: 'impressions', label: 'Impresiones' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'conversions', label: 'Conversiones' },
];

const OPERATOR_OPTIONS = [
  { value: 'GREATER_THAN', label: 'Mayor que' },
  { value: 'LESS_THAN', label: 'Menor que' },
];

const TIME_WINDOW_OPTIONS = [
  { value: 'LAST_3_DAYS', label: 'Ultimos 3 dias' },
  { value: 'LAST_7_DAYS', label: 'Ultimos 7 dias' },
  { value: 'LAST_14_DAYS', label: 'Ultimos 14 dias' },
  { value: 'LAST_30_DAYS', label: 'Ultimos 30 dias' },
];

const ACTION_OPTIONS = [
  { value: 'PAUSE_CAMPAIGN', label: 'Pausar Campana' },
  { value: 'INCREASE_BUDGET', label: 'Aumentar Presupuesto' },
  { value: 'DECREASE_BUDGET', label: 'Reducir Presupuesto' },
  { value: 'SEND_NOTIFICATION', label: 'Solo Notificar' },
];

const PRESETS = [
  {
    name: 'Pausar si CPA > $10,000 CLP (7d)',
    condition: { metric: 'cpa', operator: 'GREATER_THAN', value: 10000, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'PAUSE_CAMPAIGN' },
  },
  {
    name: 'Pausar si ROAS < 1.0 (7d)',
    condition: { metric: 'roas', operator: 'LESS_THAN', value: 1.0, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'PAUSE_CAMPAIGN' },
  },
  {
    name: 'Aumentar budget 20% si ROAS > 3.0 (14d)',
    condition: { metric: 'roas', operator: 'GREATER_THAN', value: 3.0, timeWindow: 'LAST_14_DAYS' },
    action: { type: 'INCREASE_BUDGET', percentage: 20 },
  },
  {
    name: 'Reducir budget 20% si ROAS < 1.5 (14d)',
    condition: { metric: 'roas', operator: 'LESS_THAN', value: 1.5, timeWindow: 'LAST_14_DAYS' },
    action: { type: 'DECREASE_BUDGET', percentage: 20 },
  },
  {
    name: 'Notificar si CTR < 1% (7d)',
    condition: { metric: 'ctr', operator: 'LESS_THAN', value: 1.0, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'SEND_NOTIFICATION' },
  },
  // ─── Search-specific presets (Tier 3) ─────────────────────────────────
  // Presets keyword-scope activos desde B1 (motor keyword-scope en execute-google-rules.ts).
  // El motor hace GAQL keyword_view en vivo + agregación + mutate adGroupCriterionOperation.
  {
    name: '[Search] Notificar si CTR < 0.5% (7d)',
    condition: { metric: 'ctr', operator: 'LESS_THAN', value: 0.5, timeWindow: 'LAST_7_DAYS' },
    action: { type: 'SEND_NOTIFICATION' },
  },
  {
    name: '[Search] Pausar keyword si CPA > $15,000 CLP (7d)',
    condition: { metric: 'cpa', operator: 'GREATER_THAN', value: 15000, timeWindow: 'LAST_7_DAYS', scope: 'keyword' },
    action: { type: 'PAUSE_KEYWORD' },
  },
  {
    name: '[Search] Reducir bid 15% si CTR < 0.5% (14d)',
    condition: { metric: 'ctr', operator: 'LESS_THAN', value: 0.5, timeWindow: 'LAST_14_DAYS', scope: 'keyword' },
    action: { type: 'DECREASE_BID', percentage: 15 },
  },
  {
    name: '[Search] Aumentar bid 10% si conversions >= 3 (14d)',
    condition: { metric: 'conversions', operator: 'GREATER_THAN_OR_EQUAL', value: 3, timeWindow: 'LAST_14_DAYS', scope: 'keyword' },
    action: { type: 'INCREASE_BID', percentage: 10 },
  },
];

const actionLabels: Record<string, string> = {
  PAUSE_CAMPAIGN: 'Pausar',
  INCREASE_BUDGET: 'Aumentar Budget',
  DECREASE_BUDGET: 'Reducir Budget',
  SEND_NOTIFICATION: 'Notificar',
  // Keyword-scope (backlog — requiere extender execute-google-rules.ts)
  PAUSE_KEYWORD: 'Pausar Keyword',
  INCREASE_BID: 'Aumentar Bid',
  DECREASE_BID: 'Reducir Bid',
};

export default function GoogleAutomatedRules({ connectionId, clientId }: GoogleAutomatedRulesProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formMetric, setFormMetric] = useState('cpa');
  const [formOperator, setFormOperator] = useState('GREATER_THAN');
  const [formValue, setFormValue] = useState('');
  const [formTimeWindow, setFormTimeWindow] = useState('LAST_7_DAYS');
  const [formActionType, setFormActionType] = useState('PAUSE_CAMPAIGN');
  const [formPercentage, setFormPercentage] = useState('20');
  const [formApplyTo, setFormApplyTo] = useState('ALL_CAMPAIGNS');

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callApi('manage-google-rules', {
      body: { action: 'list', client_id: clientId, connection_id: connectionId },
    });

    if (error) {
      toast.error('Error cargando reglas: ' + error);
      setLoading(false);
      return;
    }

    setRules(data?.rules || []);
    setLogs(data?.logs || []);
    setLoading(false);
  }, [clientId, connectionId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = async (rule: Rule) => {
    // Optimistic update
    setRules(prev =>
      prev.map(r => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    );

    const { error } = await callApi('manage-google-rules', {
      body: { action: 'toggle', client_id: clientId, connection_id: connectionId, rule_id: rule.id },
    });

    if (error) {
      toast.error('Error: ' + error);
      setRules(prev =>
        prev.map(r => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r))
      );
    }
  };

  const handleDelete = async (ruleId: string) => {
    const { error } = await callApi('manage-google-rules', {
      body: { action: 'delete', client_id: clientId, connection_id: connectionId, rule_id: ruleId },
    });

    if (error) {
      toast.error('Error eliminando regla: ' + error);
      return;
    }

    setRules(prev => prev.filter(r => r.id !== ruleId));
    toast.success('Regla eliminada');
  };

  const resetForm = () => {
    setFormName('');
    setFormMetric('cpa');
    setFormOperator('GREATER_THAN');
    setFormValue('');
    setFormTimeWindow('LAST_7_DAYS');
    setFormActionType('PAUSE_CAMPAIGN');
    setFormPercentage('20');
    setFormApplyTo('ALL_CAMPAIGNS');
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('Ingresa un nombre para la regla');
      return;
    }
    const parsedValue = Number(formValue);
    if (isNaN(parsedValue) || parsedValue < 0) {
      toast.error('El valor debe ser un numero valido');
      return;
    }

    setCreating(true);

    const { data, error } = await callApi('manage-google-rules', {
      body: {
        action: 'create',
        client_id: clientId,
        connection_id: connectionId,
        data: {
          name: formName.trim(),
          condition: {
            metric: formMetric,
            operator: formOperator,
            value: parsedValue,
            timeWindow: formTimeWindow,
          },
          action: {
            type: formActionType,
            ...(formActionType.includes('BUDGET') ? { percentage: Number(formPercentage) || 20 } : {}),
          },
          apply_to: formApplyTo,
        },
      },
    });

    setCreating(false);

    if (error) {
      toast.error('Error creando regla: ' + error);
      return;
    }

    if (data?.rule) {
      setRules(prev => [data.rule, ...prev]);
    }
    toast.success('Regla creada');
    setCreateOpen(false);
    resetForm();
  };

  const handlePreset = async (preset: typeof PRESETS[number]) => {
    setCreating(true);

    const { data, error } = await callApi('manage-google-rules', {
      body: {
        action: 'create',
        client_id: clientId,
        connection_id: connectionId,
        data: {
          name: preset.name,
          condition: preset.condition,
          action: preset.action,
          apply_to: 'ALL_CAMPAIGNS',
        },
      },
    });

    setCreating(false);

    if (error) {
      toast.error('Error: ' + error);
      return;
    }

    if (data?.rule) {
      setRules(prev => [data.rule, ...prev]);
    }
    toast.success('Regla preset creada');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'rules' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('rules')}
          >
            <Zap className="w-4 h-4 mr-1" />
            Reglas ({rules.length})
          </Button>
          <Button
            variant={activeTab === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('history')}
          >
            <History className="w-4 h-4 mr-1" />
            Historial ({logs.length})
          </Button>
        </div>
        {activeTab === 'rules' && (
          <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            Crear Regla
          </Button>
        )}
      </div>

      {/* Presets */}
      {activeTab === 'rules' && rules.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reglas Rapidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(preset)}
                  disabled={creating}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {activeTab === 'rules' && (
        <div className="space-y-2">
          {rules.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay reglas automaticas configuradas. Crea una regla o usa un preset rapido.
              </CardContent>
            </Card>
          )}

          {rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="py-3 flex items-center gap-4">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={() => handleToggle(rule)}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Si {rule.condition.metric.toUpperCase()} {rule.condition.operator === 'GREATER_THAN' ? '>' : '<'} {rule.condition.value}
                    {' '}({TIME_WINDOW_OPTIONS.find(t => t.value === rule.condition.timeWindow)?.label || rule.condition.timeWindow})
                    {' '}→ {actionLabels[rule.action.type] || rule.action.type}
                    {rule.action.percentage ? ` ${rule.action.percentage}%` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rule.trigger_count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {rule.trigger_count}x
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(rule.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Show presets below existing rules too */}
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {PRESETS.map((preset, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(preset)}
                  disabled={creating}
                  className="text-xs"
                >
                  + {preset.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Execution history */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay ejecuciones registradas todavia.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-left p-3 font-medium">Campana</th>
                    <th className="text-left p-3 font-medium">Accion</th>
                    <th className="text-left p-3 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.executed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 max-w-[200px] truncate" title={log.campaign_name}>
                        {log.campaign_name || log.campaign_id}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {actionLabels[log.action_type] || log.action_type}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground max-w-[300px] truncate" title={log.details}>
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Rule Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Crear Regla Automatica</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Ej: Pausar si CPA alto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Metrica</Label>
                <Select value={formMetric} onValueChange={setFormMetric}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operador</Label>
                <Select value={formOperator} onValueChange={setFormOperator}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATOR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  value={formValue}
                  onChange={e => setFormValue(e.target.value)}
                  placeholder="Ej: 10000"
                />
              </div>
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select value={formTimeWindow} onValueChange={setFormTimeWindow}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_WINDOW_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Accion</Label>
                <Select value={formActionType} onValueChange={setFormActionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formActionType.includes('BUDGET') && (
                <div className="space-y-2">
                  <Label>Porcentaje (%)</Label>
                  <Input
                    type="number"
                    value={formPercentage}
                    onChange={e => setFormPercentage(e.target.value)}
                    placeholder="20"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Aplicar a</Label>
              <Select value={formApplyTo} onValueChange={setFormApplyTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_CAMPAIGNS">Todas las campanas</SelectItem>
                  <SelectItem value="ACTIVE_ONLY">Solo activas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear Regla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
