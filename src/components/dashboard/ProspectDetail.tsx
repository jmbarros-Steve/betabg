import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, Phone, Building2, ShoppingBag, TrendingUp,
  Tag, MessageSquare, CheckCircle2, FileText, Clock,
  Save, X, Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { ProspectTimeline } from './ProspectTimeline';
import { ProposalGenerator } from './ProposalGenerator';

interface ProspectDetailProps {
  prospectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChanged?: () => void;
}

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  discovery: 'bg-cyan-100 text-cyan-700',
  qualifying: 'bg-amber-100 text-amber-700',
  pitching: 'bg-purple-100 text-purple-700',
  closing: 'bg-green-100 text-green-700',
  converted: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-red-100 text-red-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500',
  normal: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

type Tab = 'timeline' | 'chat' | 'tareas' | 'propuestas' | 'notas';

export function ProspectDetail({ prospectId, open, onOpenChange, onStageChanged }: ProspectDetailProps) {
  const [loading, setLoading] = useState(true);
  const [prospect, setProspect] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // New task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!prospectId) return;
    setLoading(true);
    try {
      const { data, error } = await callApi('crm/prospect/detail', {
        body: { prospect_id: prospectId },
      });
      if (error) throw new Error(error);

      setProspect(data.prospect);
      setEvents(data.events || []);
      setTasks(data.tasks || []);
      setProposals(data.proposals || []);
      setMessages(data.messages || []);
      setNotes(data.prospect?.admin_notes || '');
      setTags(data.prospect?.tags || []);
    } catch (err: any) {
      toast.error(err.message || 'Error cargando prospecto');
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    if (open && prospectId) fetchDetail();
  }, [open, prospectId, fetchDetail]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const { error } = await callApi('crm/prospect/note', {
        body: { prospect_id: prospectId, note: notes },
      });
      if (error) throw new Error(error);
      toast.success('Notas guardadas');
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddTag = async () => {
    if (!tagInput.trim()) return;
    const newTags = [...tags, tagInput.trim()];
    setTags(newTags);
    setTagInput('');
    try {
      await callApi('crm/prospect/tags', {
        body: { prospect_id: prospectId, tags: newTags },
      });
    } catch {}
  };

  const handleRemoveTag = async (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    try {
      await callApi('crm/prospect/tags', {
        body: { prospect_id: prospectId, tags: newTags },
      });
    } catch {}
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const { error } = await callApi('crm/tasks', {
        body: { action: 'create', prospect_id: prospectId, title: newTaskTitle },
      });
      if (error) throw new Error(error);
      toast.success('Tarea creada');
      setNewTaskTitle('');
      fetchDetail();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const { error } = await callApi('crm/tasks', {
        body: { action: 'complete', task_id: taskId },
      });
      if (error) throw new Error(error);
      toast.success('Tarea completada');
      fetchDetail();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const handleChangePriority = async (priority: string) => {
    try {
      await callApi('crm/prospect/priority', {
        body: { prospect_id: prospectId, priority },
      });
      setProspect((p: any) => ({ ...p, priority }));
      toast.success(`Prioridad: ${priority}`);
    } catch {}
  };

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'timeline', label: 'Timeline', icon: Clock, count: events.length },
    { id: 'chat', label: 'Chat', icon: MessageSquare, count: messages.length },
    { id: 'tareas', label: 'Tareas', icon: CheckCircle2, count: tasks.length },
    { id: 'propuestas', label: 'Propuestas', icon: FileText, count: proposals.length },
    { id: 'notas', label: 'Notas', icon: Tag },
  ];

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg">
            {loading ? 'Cargando...' : (prospect?.name || prospect?.profile_name || prospect?.phone || 'Prospecto')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#1E3A7B]" />
          </div>
        ) : prospect ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Header info */}
            <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
              <Badge className={STAGE_COLORS[prospect.stage] || 'bg-slate-100'}>
                {prospect.stage}
              </Badge>
              <Badge className={PRIORITY_COLORS[prospect.priority || 'normal'] || ''}>
                {prospect.priority || 'normal'}
              </Badge>
              {prospect.lead_score != null && (
                <Badge variant="outline" className="font-mono">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  {prospect.lead_score}/100
                </Badge>
              )}
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {prospect.phone}
              </span>
              {prospect.company && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {prospect.company}
                </span>
              )}
              {prospect.what_they_sell && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <ShoppingBag className="w-3 h-3" /> {prospect.what_they_sell}
                </span>
              )}
            </div>

            {/* Priority selector */}
            <div className="flex items-center gap-1 mb-3 shrink-0">
              <span className="text-xs text-slate-400 mr-1">Prioridad:</span>
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <button
                  key={p}
                  onClick={() => handleChangePriority(p)}
                  className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                    (prospect.priority || 'normal') === p
                      ? PRIORITY_COLORS[p]
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 pb-2 mb-3 shrink-0 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-[#1E3A7B] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.count != null && tab.count > 0 && (
                      <span className={`text-[10px] ${activeTab === tab.id ? 'text-white/70' : 'text-slate-400'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'timeline' && (
                  <ProspectTimeline events={events} />
                )}

                {activeTab === 'chat' && (
                  <div className="space-y-2">
                    {messages.length === 0 ? (
                      <p className="text-center text-slate-400 py-10">Sin mensajes</p>
                    ) : (
                      [...messages].reverse().map((msg: any) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                              msg.direction === 'outbound'
                                ? 'bg-[#1E3A7B] text-white rounded-br-sm'
                                : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.body || '(media)'}</p>
                            <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-white/50' : 'text-slate-400'}`}>
                              {new Date(msg.created_at).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'tareas' && (
                  <div className="space-y-3">
                    {/* Create task inline */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nueva tarea..."
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleCreateTask}
                        disabled={creatingTask || !newTaskTitle.trim()}
                        className="h-8 bg-[#1E3A7B] hover:bg-[#162d5e]"
                      >
                        {creatingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      </Button>
                    </div>

                    {tasks.length === 0 ? (
                      <p className="text-center text-slate-400 py-8">Sin tareas</p>
                    ) : (
                      tasks.map((task: any) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50"
                        >
                          <button
                            onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                            className={`shrink-0 ${task.status === 'completed' ? 'text-green-500' : 'text-slate-300 hover:text-green-500'}`}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-slate-400 truncate">{task.description}</p>
                            )}
                          </div>
                          <Badge className={`text-[10px] ${task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {task.status}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'propuestas' && (
                  <div className="space-y-4">
                    <ProposalGenerator
                      prospectId={prospectId}
                      prospectName={prospect.name || prospect.profile_name || prospect.phone}
                      onProposalSaved={fetchDetail}
                    />

                    {proposals.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <h4 className="text-xs font-medium text-slate-500">Propuestas anteriores</h4>
                        {proposals.map((p: any) => (
                          <div key={p.id} className="p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-sm font-medium truncate">{p.title}</h5>
                              <Badge className={`text-[10px] ${p.status === 'accepted' ? 'bg-green-100 text-green-700' : p.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                {p.status}
                              </Badge>
                              {p.plan_type && <Badge variant="outline" className="text-[10px]">{p.plan_type}</Badge>}
                              {p.monthly_price && <span className="text-xs text-slate-400">${p.monthly_price}/mes</span>}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2">{p.content}</p>
                            <p className="text-[10px] text-slate-300 mt-1">
                              {new Date(p.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'notas' && (
                  <div className="space-y-4">
                    {/* Tags */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Tags</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs gap-1">
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} className="text-slate-400 hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="Agregar tag..."
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                          className="h-7 text-xs"
                        />
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddTag}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Notas del admin</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Agregar notas sobre este prospecto..."
                        rows={6}
                        className="text-sm"
                      />
                      <Button
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        size="sm"
                        className="mt-2 bg-[#1E3A7B] hover:bg-[#162d5e]"
                      >
                        {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Guardar notas
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-400 py-10">Prospecto no encontrado</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
