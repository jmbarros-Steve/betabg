import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, CheckCircle2, Clock, AlertTriangle, Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

interface TaskRow {
  id: string;
  title: string;
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
  in_progress: 'bg-blue-100 text-blue-700',
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

export default function AdminCerebro() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [pendingTasks, setPendingTasks] = useState<TaskRow[]>([]);
  const [inProgressTasks, setInProgressTasks] = useState<TaskRow[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskRow[]>([]);
  const [openErrors, setOpenErrors] = useState<QaLogRow[]>([]);
  const [slos, setSlos] = useState<SloRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  useEffect(() => {
    if (user && isSuperAdmin) fetchAll();
  }, [user, isSuperAdmin]);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchTasks(), fetchErrors(), fetchSlos()]);
    setLoading(false);
  }

  async function fetchTasks() {
    const [pending, inProgress, completed] = await Promise.all([
      supabase.from('tasks').select('id, title, priority, type, status, source, assigned_squad, created_at, completed_at')
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('id, title, priority, type, status, source, assigned_squad, created_at, completed_at')
        .eq('status', 'in_progress').order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('id, title, priority, type, status, source, assigned_squad, created_at, completed_at')
        .eq('status', 'completed').order('completed_at', { ascending: false }).limit(10),
    ]);
    setPendingTasks((pending.data || []) as TaskRow[]);
    setInProgressTasks((inProgress.data || []) as TaskRow[]);
    setCompletedTasks((completed.data || []) as TaskRow[]);
  }

  async function fetchErrors() {
    const { data } = await supabase.from('qa_log')
      .select('id, check_type, status, details, checked_at')
      .eq('status', 'fail')
      .order('checked_at', { ascending: false })
      .limit(15);
    setOpenErrors((data || []) as QaLogRow[]);
  }

  async function fetchSlos() {
    const { data } = await supabase.from('slo_config')
      .select('id, name, current_success_rate, error_budget_remaining, status');
    setSlos((data || []) as SloRow[]);
  }

  // Health score: weighted average of SLO success rates
  const healthScore = slos.length > 0
    ? Math.round(slos.reduce((s, slo) => s + (slo.current_success_rate || 0), 0) / slos.length)
    : null;

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
        <div className="flex items-center justify-between">
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
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
          </Button>
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

        {/* Task counts summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold">{pendingTasks.length}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{inProgressTasks.length}</div>
                <div className="text-xs text-muted-foreground">In Progress</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{completedTasks.length}</div>
                <div className="text-xs text-muted-foreground">Completadas (últ. 10)</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending + In Progress Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" /> Tareas Pending ({pendingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaskTable tasks={pendingTasks} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" /> En Progreso ({inProgressTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TaskTable tasks={inProgressTasks} />
            </CardContent>
          </Card>
        </div>

        {/* Completed Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" /> Últimas 10 Completadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TaskTable tasks={completedTasks} showCompleted />
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

function TaskTable({ tasks, showCompleted = false }: { tasks: TaskRow[]; showCompleted?: boolean }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Sin tareas</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-3">Título</th>
            <th className="pb-2 pr-3">Prioridad</th>
            <th className="pb-2 pr-3">Tipo</th>
            <th className="pb-2 pr-3">Squad</th>
            <th className="pb-2">{showCompleted ? 'Completada' : 'Creada'}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="py-2 pr-3 max-w-xs truncate font-medium">{t.title}</td>
              <td className="py-2 pr-3">
                <Badge className={`text-xs ${PRIORITY_COLORS[t.priority] || ''}`}>
                  {t.priority}
                </Badge>
              </td>
              <td className="py-2 pr-3">
                <Badge variant="outline" className="text-xs">{t.type}</Badge>
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{t.assigned_squad || '—'}</td>
              <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(showCompleted && t.completed_at ? t.completed_at : t.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
