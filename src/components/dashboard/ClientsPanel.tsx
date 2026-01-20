import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Client {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  hourly_rate: number;
}

interface Props {
  userId: string;
}

export function ClientsPanel({ userId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    hourly_rate: '',
  });

  useEffect(() => {
    fetchClients();
  }, [userId]);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar clientes');
    } else {
      setClients(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    const clientData = {
      user_id: userId,
      name: form.name.trim(),
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
    };

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', editingClient.id);

      if (error) {
        toast.error('Error al actualizar cliente');
      } else {
        toast.success('Cliente actualizado');
        fetchClients();
      }
    } else {
      const { error } = await supabase.from('clients').insert(clientData);

      if (error) {
        toast.error('Error al crear cliente');
      } else {
        toast.success('Cliente creado');
        fetchClients();
      }
    }

    resetForm();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar cliente');
    } else {
      toast.success('Cliente eliminado');
      fetchClients();
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      email: client.email || '',
      company: client.company || '',
      hourly_rate: client.hourly_rate.toString(),
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setForm({ name: '', email: '', company: '', hourly_rate: '' });
    setEditingClient(null);
    setDialogOpen(false);
  };

  if (loading) {
    return <div className="animate-pulse h-40 bg-card rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">Gestiona tus clientes y tarifas</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="hero">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nombre del cliente"
                  required
                />
              </div>
              <div>
                <Label htmlFor="company">Empresa</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Nombre de la empresa"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@ejemplo.com"
                />
              </div>
              <div>
                <Label htmlFor="hourly_rate">Tarifa por hora (€)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  placeholder="50.00"
                />
              </div>
              <Button type="submit" className="w-full">
                {editingClient ? 'Actualizar' : 'Crear Cliente'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">No tienes clientes aún</p>
          <p className="text-sm text-muted-foreground mt-1">Añade tu primer cliente para comenzar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client, index) => (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold">{client.name}</h3>
                {client.company && (
                  <p className="text-sm text-muted-foreground">{client.company}</p>
                )}
                {client.email && (
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-primary font-mono font-semibold">
                  €{client.hourly_rate}/h
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
