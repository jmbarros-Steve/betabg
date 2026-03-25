import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, CheckCircle2, Clock, AlertTriangle, Activity, ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  type: string;
  status: string;
  source: string;
  assigned_squad: string | null;
  created_at: string;
  completed_at: string | null;
}

interface QaLogRow {
  id: string;
  check_type: string;
  status: string;
  details: any;
  checked_at: string;
}

interface SloRow {
  id: string;
  name: string;
  current_success_rate: number | null;
  error_budget_remaining: number | null;
  status: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-700',
  critical: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  high: 'bg-orange-100 text-orange-700',
  media: 'bg-yellow-100 text-yellow-700',
  medium: 'bg-yellow-100 text-yellow-700',
  baja: 'bg-slate-100 text-slate-600',
  low: 'bg-slate-100 text-slate-600',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-[#D6E0F0] text-[#162D5F]',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-slate-100 text-slate-600',
};

const SLO_STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  critical: 'bg-orange-100 text-orange-700',
  frozen: 'bg-red-100 text-red-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const ALL_STATUSES = ['all', 'pending', 'in_progress', 'completed', 'failed', 'blocked'] as const;
const ALL_SQUADS = ['all', 'marketing', 'producto', 'infra', 'meta', 'email', 'google', 'shopify', 'creative'] as const;

export default function AdminCerebro() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [openErrors, setOpenErrors] = useState<QaLogRow[]>([]);
  const [slos, setSlos] = useState<SloRow[]>([]);
  const [lastQaScore, setLastQaScore] = useState<number | null>(null);
  const [lastQaDate, setLastQaDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [squadFilter, setSquadFilter] = useState<string>('all');

  // Create task dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'media',
    type: 'mejora',
    assigned_squad: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  useEffect(() => {
    if (user && isSuperAdmin) fetchAll();
  }, [user, isSuperAdmin]);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchTasks(), fetchErrors(), fetchSlos(), fetchLastQaScore()]);
    setLoading(false);
  }

  async function fetchTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, priority, type, status, source, assigned_squad, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setAllTasks((data || []) as TaskRow[]);
  }

  async function fetchErrors() {
    const { data } = await supabase.from('qa_log')
      .select('id, check_type, status, details, checked_at')
      .eq('status', 'fail')
      .order('checked_at', { ascending: false })
      .limit(5);
    setOpenErrors((data || []) as QaLogRow[]);
  }

  async function fetchSlos() {
    const { data } = await supabase.from('slo_config')
      .select('id, name, current_success_rate, error_budget_remaining, status');
    setSlos((data || []) as SloRow[]);
  }

  async function fetchLastQaScore() {
    const { data } = await supabase.from('qa_log')
      .select('details, checked_at')
      .eq('check_type', 'weekly_report')
      .order('checked_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const details = data[0].details as any;
      const score = details?.qa_scorecard?.errors_this_week != null
        ? Math.max(0, 100 - (details.qa_scorecard.errors_this_week * 5))
        : null;
      setLastQaScore(score);
      setLastQaDate(data[0].checked_at);
    }
  }

  // Active agents: squads with in_progress tasks
  const activeAgents = useMemo(() => {
    const agentMap: Record<string, number> = {};
    for (const t of allTasks) {
      if (t.status === 'in_progress' && t.assigned_squad) {
        agentMap[t.assigned_squad] = (agentMap[t.assigned_squad] || 0) + 1;
      }
    }
    return Object.entries(agentMap)
      .map(([squad, count]) => ({ squad, count }))
      .sort((a, b) => b.count - a.count);
  }, [allTasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (squadFilter !== 'all' && t.assigned_squad !== squadFilter) return false;
      return true;
    });
  }, [allTasks, statusFilter, squadFilter]);

  // Counts by status
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, in_progress: 0, completed: 0, failed: 0, blocked: 0 };
    for (const t of allTasks) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [allTasks]);

  // Last 10 completed
  const lastCompleted = useMemo(() => {
    return allTasks
      .filter((t) => t.status === 'completed')
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
      .slice(0, 10);
  }, [allTasks]);

  // Health score
  const healthScore = slos.length > 0
    ? Math.round(slos.reduce((s, slo) => s + (slo.current_success_rate || 0), 0) / slos.length)
    : null;

  async function handleCreateTask() {
    if (!newTask.title.trim()) return;
    setCreating(true);
    await supabase.from('tasks').insert({
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      priority: newTask.priority,
      type: newTask.type,
      assigned_squad: newTask.assigned_squad || null,
      source: 'user',
      status: 'pending',
    });
    setNewTask({ title: '', description: '', priority: 'media', type: 'mejora', assigned_squad: '' });
    setCreateOpen(false);
    setCreating(false);
    await fetchTasks();
  }

  if (authLoading || roleLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Brain className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">CEREBRO</h1>
              <p className="text-sm text-muted-foreground">Panel de orquestación — solo JM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Crear task manual
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Task Manual</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="task-title">Título</Label>
                    <Input
                      id="task-title"
                      value={newTask.title}
                      onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Descripción corta de la tarea"
                    />
                  </div>
                  <div>
                    <Label htmlFor="task-desc">Descripción</Label>
                    <Textarea
                      id="task-desc"
                      value={newTask.description}
                      onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Detalles, contexto, pasos..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Prioridad</Label>
                      <Select value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critica">Critica</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="media">Media</SelectItem>
                          <SelectItem value="baja">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={newTask.type} onValueChange={(v) => setNewTask((p) => ({ ...p, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bug">Bug</SelectItem>
                          <SelectItem value="fix">Fix</SelectItem>
                          <SelectItem value="mejora">Mejora</SelectItem>
                          <SelectItem value="feature">Feature</SelectItem>
                          <SelectItem value="seguridad">Seguridad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Squad</Label>
                      <Select value={newTask.assigned_squad} onValueChange={(v) => setNewTask((p) => ({ ...p, assigned_squad: v }))}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="producto">Producto</SelectItem>
                          <SelectItem value="infra">Infra</SelectItem>
                          <SelectItem value="meta">Meta</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="shopify">Shopify</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleCreateTask} disabled={creating || !newTask.title.trim()} className="w-full">
                    {creating ? 'Creando...' : 'Crear Task'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
            </Button>
          </div>
        </div>

        {/* Health Score + SLOs */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className={healthScore !== null && healthScore < 90 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {healthScore !== null ? `${healthScore}%` : 'N/A'}
              </div>
            </CardContent>
          </Card>
          {slos.map((slo) => (
            <Card key={slo.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground truncate">{slo.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{slo.current_success_rate ?? '—'}%</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`text-xs ${SLO_STATUS_COLORS[slo.status] || ''}`}>
                    {slo.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {slo.error_budget_remaining ?? '—'}% budget
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* QA Score + Active Agents */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={lastQaScore !== null && lastQaScore < 60 ? 'border-red-300 bg-red-50' : lastQaScore !== null && lastQaScore < 80 ? 'border-yellow-300 bg-yellow-50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Último QA Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {lastQaScore !== null ? `${lastQaScore}/100` : 'N/A'}
              </div>
              {lastQaDate && (
                <p className="text-xs text-muted-foreground mt-1">{formatDate(lastQaDate)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#1E3A7B]" /> Agentes Activos ({activeAgents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin agentes trabajando</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeAgents.map((a) => (
                    <Badge key={a.squad} variant="outline" className="text-sm">
                      {a.squad} <span className="ml-1 font-bold text-[#1E3A7B]">{a.count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Task counts summary */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
          {(['pending', 'in_progress', 'completed', 'failed', 'blocked'] as const).map((s) => (
            <Card
              key={s}
              className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === s ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            >
              <CardContent className="pt-4 flex items-center gap-3">
                {s === 'pending' && <Clock className="w-5 h-5 text-yellow-600" />}
                {s === 'in_progress' && <Activity className="w-5 h-5 text-[#1E3A7B]" />}
                {s === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {s === 'failed' && <AlertTriangle className="w-5 h-5 text-red-600" />}
                {s === 'blocked' && <Clock className="w-5 h-5 text-slate-400" />}
                <div>
                  <div className="text-2xl font-bold">{counts[s] || 0}</div>
                  <div className="text-xs text-muted-foreground capitalize">{s.replace('_', ' ')}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters + Task Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">
                Tareas {statusFilter !== 'all' ? `(${statusFilter.replace('_', ' ')})` : ''} — {filteredTasks.length}
              </CardTitle>
              <div className="flex items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === 'all' ? 'Todos los status' : s.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={squadFilter} onValueChange={setSquadFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Squad" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_SQUADS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === 'all' ? 'Todos los squads' : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin tareas con estos filtros</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Título</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3">Prioridad</th>
                      <th className="pb-2 pr-3">Tipo</th>
                      <th className="pb-2 pr-3">Squad</th>
                      <th className="pb-2 pr-3">Fuente</th>
                      <th className="pb-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 max-w-xs truncate font-medium" title={t.description || t.title}>
                          {t.title}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge className={`text-xs ${STATUS_COLORS[t.status] || ''}`}>
                            {t.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge className={`text-xs ${PRIORITY_COLORS[t.priority] || ''}`}>
                            {t.priority}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-xs">{t.type}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{t.assigned_squad || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{t.source}</td>
                        <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(t.status === 'completed' && t.completed_at ? t.completed_at : t.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last 10 Completed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" /> Últimas 10 Completadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastCompleted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin tareas completadas</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Título</th>
                      <th className="pb-2 pr-3">Prioridad</th>
                      <th className="pb-2 pr-3">Tipo</th>
                      <th className="pb-2 pr-3">Squad</th>
                      <th className="pb-2">Completada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastCompleted.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 max-w-xs truncate font-medium">{t.title}</td>
                        <td className="py-2 pr-3">
                          <Badge className={`text-xs ${PRIORITY_COLORS[t.priority] || ''}`}>{t.priority}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-xs">{t.type}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{t.assigned_squad || '—'}</td>
                        <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {t.completed_at ? formatDate(t.completed_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Errors */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Errores Abiertos ({openErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin errores abiertos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Tipo</th>
                      <th className="pb-2 pr-4">Detalle</th>
                      <th className="pb-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openErrors.map((err) => (
                      <tr key={err.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">{err.check_type}</Badge>
                        </td>
                        <td className="py-2 pr-4 max-w-md truncate text-xs">
                          {typeof err.details === 'string'
                            ? err.details
                            : JSON.stringify(err.details || {}).substring(0, 120)}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(err.checked_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
