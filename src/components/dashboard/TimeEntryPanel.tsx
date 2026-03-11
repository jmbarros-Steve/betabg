import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface TimeEntry {
  id: string;
  client_id: string;
  description: string;
  hours: number;
  date: string;
  billed: boolean;
  clients: { name: string; hourly_rate: number } | null;
}

interface Client {
  id: string;
  name: string;
  hourly_rate: number;
}

interface Props {
  userId: string;
}

export function TimeEntryPanel({ userId }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    description: '',
    hours: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    const [entriesRes, clientsRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('*, clients(name, hourly_rate)')
        .eq('user_id', userId)
        .order('date', { ascending: false }),
      supabase
        .from('clients')
        .select('id, name, hourly_rate')
        .eq('user_id', userId)
        .order('name'),
    ]);

    if (entriesRes.error) toast.error('Error al cargar entradas');
    if (clientsRes.error) toast.error('Error al cargar clientes');

    setEntries(entriesRes.data || []);
    setClients(clientsRes.data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.client_id || !form.description.trim() || !form.hours) {
      toast.error('Todos los campos son requeridos');
      return;
    }

    const { error } = await supabase.from('time_entries').insert({
      user_id: userId,
      client_id: form.client_id,
      description: form.description.trim(),
      hours: parseFloat(form.hours),
      date: form.date,
    });

    if (error) {
      toast.error('Error al registrar horas');
    } else {
      toast.success('Horas registradas');
      fetchData();
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar entrada');
    } else {
      toast.success('Entrada eliminada');
      fetchData();
    }
  };

  const resetForm = () => {
    setForm({
      client_id: '',
      description: '',
      hours: '',
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setDialogOpen(false);
  };

  // Group by client
  const entriesByClient = entries.reduce((acc, entry) => {
    const clientName = entry.clients?.name || 'Sin cliente';
    if (!acc[clientName]) {
      acc[clientName] = { entries: [], totalHours: 0, hourlyRate: entry.clients?.hourly_rate || 0 };
    }
    acc[clientName].entries.push(entry);
    acc[clientName].totalHours += Number(entry.hours);
    return acc;
  }, {} as Record<string, { entries: TimeEntry[]; totalHours: number; hourlyRate: number }>);

  if (loading) {
    return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Registro de Horas</h2>
          <p className="text-muted-foreground">Registra las horas trabajadas por cliente</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" disabled={clients.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              Registrar Horas
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Horas</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={(value) => setForm({ ...form, client_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date">Fecha *</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="hours">Horas *</Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  placeholder="2.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Descripción *</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe el trabajo realizado..."
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Registrar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">Primero debes añadir clientes</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">No hay horas registradas</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(entriesByClient).map(([clientName, data]) => (
            <div key={clientName} className="rounded-xl bg-white border border-slate-200 overflow-hidden">
              <div className="p-4 bg-secondary/50 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{clientName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {data.totalHours.toFixed(1)} horas • €{(data.totalHours * data.hourlyRate).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono font-semibold">{data.totalHours.toFixed(1)}h</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                {data.entries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">
                        {format(new Date(entry.date), 'dd MMM yyyy', { locale: es })}
                      </p>
                      <p>{entry.description}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-primary">{Number(entry.hours).toFixed(1)}h</span>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
