import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Clock, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  User, Calendar, ArrowUpCircle, Loader2, RefreshCw, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  client_id: string;
  subject: string;
  conversation: string | null;
  status: string;
  priority: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_email?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Abierto', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
  in_progress: { label: 'En progreso', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  resolved: { label: 'Resuelto', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  closed: { label: 'Cerrado', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critica', color: 'bg-red-500 text-white' },
  high: { label: 'Alta', color: 'bg-orange-500 text-white' },
  medium: { label: 'Media', color: 'bg-blue-500 text-white' },
  low: { label: 'Baja', color: 'bg-slate-400 text-white' },
};

export function AdminSupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  async function fetchTickets() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Enrich with client info
      const clientIds = [...new Set((data || []).map((t: any) => t.client_id).filter(Boolean))];
      let clientMap: Record<string, { name: string; email: string }> = {};

      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name, email')
          .in('id', clientIds);

        if (clients) {
          clientMap = Object.fromEntries(clients.map((c: any) => [c.id, { name: c.name || '', email: c.email || '' }]));
        }
      }

      const enriched = (data || []).map((t: any) => ({
        ...t,
        client_name: clientMap[t.client_id]?.name || 'Sin nombre',
        client_email: clientMap[t.client_id]?.email || '',
      }));

      setTickets(enriched);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      toast.error('Error al cargar tickets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTickets(); }, []);

  async function updateStatus(ticketId: string, newStatus: string) {
    const updates: any = { status: newStatus };
    if (newStatus === 'resolved') updates.resolved_at = new Date().toISOString();

    const { error } = await supabase
      .from('support_tickets' as any)
      .update(updates)
      .eq('id', ticketId);

    if (error) {
      toast.error('Error al actualizar');
      return;
    }

    toast.success(`Ticket ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus, ...updates } : t));
  }

  async function saveNotes(ticketId: string) {
    const { error } = await supabase
      .from('support_tickets' as any)
      .update({ admin_notes: notesText })
      .eq('id', ticketId);

    if (error) {
      toast.error('Error al guardar notas');
      return;
    }

    toast.success('Notas guardadas');
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, admin_notes: notesText } : t));
    setEditingNotes(null);
  }

  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.subject.toLowerCase().includes(q) ||
        t.client_name?.toLowerCase().includes(q) ||
        t.client_email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tickets de Soporte</h2>
          <p className="text-sm text-slate-500 mt-1">
            {counts.open} abiertos, {counts.in_progress} en progreso
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: 'open', label: 'Abiertos', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
          { key: 'in_progress', label: 'En progreso', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
          { key: 'resolved', label: 'Resueltos', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { key: 'all', label: 'Total', icon: MessageSquare, color: 'text-slate-500', bg: 'bg-slate-50' },
        ].map((stat) => {
          const SIcon = stat.icon;
          return (
            <div
              key={stat.key}
              className={`${stat.bg} rounded-xl p-4 border border-slate-200 cursor-pointer hover:shadow-sm transition-shadow`}
              onClick={() => setFilter(stat.key as any)}
            >
              <SIcon className={`w-5 h-5 ${stat.color} mb-2`} />
              <div className="text-2xl font-bold text-slate-900">{counts[stat.key as keyof typeof counts]}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filter === f
                  ? 'bg-[#1E3A7B] text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'Todos' : STATUS_CONFIG[f]?.label || f}
              <span className="ml-1 opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por asunto o cliente..."
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay tickets {filter !== 'all' ? STATUS_CONFIG[filter]?.label.toLowerCase() + 's' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((ticket) => {
              const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
              const priorityCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedId === ticket.id;

              return (
                <motion.div
                  key={ticket.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow"
                >
                  {/* Ticket header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    className="w-full p-4 flex items-center gap-4 text-left"
                  >
                    <StatusIcon className={`w-5 h-5 shrink-0 ${
                      ticket.status === 'open' ? 'text-red-500' :
                      ticket.status === 'in_progress' ? 'text-amber-500' :
                      'text-green-500'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm text-slate-900 truncate">{ticket.subject}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityCfg.color} border-0`}>
                          {priorityCfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ticket.client_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(ticket.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <Badge variant="outline" className={`text-[10px] shrink-0 ${statusCfg.color}`}>
                      {statusCfg.label}
                    </Badge>

                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-100"
                      >
                        <div className="p-4 space-y-4">
                          {/* Client info */}
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-500">Cliente:</span>
                            <span className="font-medium text-slate-800">{ticket.client_name}</span>
                            {ticket.client_email && (
                              <span className="text-slate-400">{ticket.client_email}</span>
                            )}
                          </div>

                          {/* Conversation */}
                          {ticket.conversation && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Conversacion con Chonga</p>
                              <div className="bg-slate-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                                {ticket.conversation.split('\n').map((line, i) => {
                                  const isClient = line.startsWith('Cliente:');
                                  return (
                                    <p key={i} className={`text-xs mb-1.5 ${isClient ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                                      {line}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Admin notes */}
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notas del equipo</p>
                            {editingNotes === ticket.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={notesText}
                                  onChange={(e) => setNotesText(e.target.value)}
                                  placeholder="Escribe notas sobre este ticket..."
                                  className="text-sm min-h-[80px]"
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => saveNotes(ticket.id)}>Guardar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}>Cancelar</Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => { setEditingNotes(ticket.id); setNotesText(ticket.admin_notes || ''); }}
                                className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors min-h-[40px]"
                              >
                                {ticket.admin_notes || <span className="text-slate-400 italic">Click para agregar notas...</span>}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            {ticket.status === 'open' && (
                              <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, 'in_progress')} className="gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> En progreso
                              </Button>
                            )}
                            {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                              <Button size="sm" onClick={() => updateStatus(ticket.id, 'resolved')} className="gap-1.5 bg-green-600 hover:bg-green-700">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                              </Button>
                            )}
                            {ticket.status === 'resolved' && (
                              <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, 'closed')} className="gap-1.5">
                                Cerrar
                              </Button>
                            )}
                            {ticket.status !== 'open' && ticket.status !== 'closed' && (
                              <Button size="sm" variant="ghost" onClick={() => updateStatus(ticket.id, 'open')} className="gap-1.5 text-slate-500">
                                <ArrowUpCircle className="w-3.5 h-3.5" /> Reabrir
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
