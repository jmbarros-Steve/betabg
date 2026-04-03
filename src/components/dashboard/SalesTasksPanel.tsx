import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Clock, Loader2, Plus, Sparkles,
  User, Calendar, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface SalesTask {
  id: string;
  prospect_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  wa_prospects?: {
    id: string;
    phone: string;
    name: string | null;
    profile_name: string | null;
    company: string | null;
    stage: string;
  } | null;
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_followup: 'Auto: Follow-up',
  auto_meeting_prep: 'Auto: Reunión',
  auto_proposal: 'Auto: Propuesta',
};

export function SalesTasksPanel() {
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTasks = async () => {
    try {
      const params: any = { action: 'list' };
      if (filter !== 'all') params.status = filter;

      const { data, error } = await callApi('crm/tasks', { body: params });
      if (error) throw new Error(error);
      setTasks(data?.tasks || []);
    } catch (err: any) {
      toast.error(err.message || 'Error cargando tareas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [filter]);

  const handleComplete = async (taskId: string) => {
    try {
      const { error } = await callApi('crm/tasks', {
        body: { action: 'complete', task_id: taskId },
      });
      if (error) throw new Error(error);
      toast.success('Tarea completada');
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    try {
      const { data, error } = await callApi('crm/tasks/auto-generate', {
        body: {},
      });
      if (error) throw new Error(error);
      toast.success(`${data?.created || 0} tareas creadas para ${data?.prospects_evaluated || 0} prospectos`);
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Error auto-generando');
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const { error } = await callApi('crm/tasks', {
        body: { action: 'create', title: newTitle, description: newDesc || undefined },
      });
      if (error) throw new Error(error);
      toast.success('Tarea creada');
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: 'pending', label: 'Pendientes' },
    { value: 'in_progress', label: 'En progreso' },
    { value: 'completed', label: 'Completadas' },
    { value: 'all', label: 'Todas' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tareas de Venta</h2>
          <p className="text-muted-foreground text-sm">Gestiona tareas vinculadas a prospectos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-4 h-4 mr-1" /> Nueva
          </Button>
          <Button
            size="sm"
            onClick={handleAutoGenerate}
            disabled={autoGenerating}
            className="bg-[#1E3A7B] hover:bg-[#162d5e]"
          >
            {autoGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Generando...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1" /> Auto-generar</>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              filter === opt.value
                ? 'bg-[#1E3A7B] text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tasks list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[#1E3A7B]" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" />
          <p>No hay tareas {filter !== 'all' ? `con estado "${filter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {tasks.map((task, idx) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: idx * 0.02 }}
                className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-slate-800 truncate">{task.title}</h3>
                      <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[task.status] || ''}`}>
                        {task.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {TYPE_LABELS[task.task_type] || task.task_type}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-500 mb-1.5 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      {task.wa_prospects && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {task.wa_prospects.name || task.wa_prospects.profile_name || task.wa_prospects.phone}
                          {task.wa_prospects.company && (
                            <span className="flex items-center gap-0.5">
                              <Building2 className="w-3 h-3" /> {task.wa_prospects.company}
                            </span>
                          )}
                        </span>
                      )}
                      {task.due_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.due_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(task.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                  {task.status !== 'completed' && task.status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleComplete(task.id)}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create task dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Título de la tarea"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder="Descripción (opcional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
            />
            <Button
              onClick={handleCreateTask}
              disabled={creating || !newTitle.trim()}
              className="w-full bg-[#1E3A7B] hover:bg-[#162d5e]"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear tarea
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
