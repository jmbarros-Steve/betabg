import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit2, UserPlus, Key, Copy, Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';

interface Client {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  hourly_rate: number;
  client_user_id: string | null;
}

interface Props {
  userId: string;
}

export function ClientsPanel({ userId }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    hourly_rate: '',
  });
  const [accessForm, setAccessForm] = useState({
    email: '',
    password: '',
  });

  useEffect(() => {
    fetchClients();
  }, [userId]);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, company, hourly_rate, client_user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar clientes');
    } else {
      setClients(data || []);
    }
    setLoading(false);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
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

  const handleOpenAccessDialog = (client: Client) => {
    setSelectedClient(client);
    const password = generatePassword();
    setGeneratedPassword(password);
    setAccessForm({
      email: client.email || '',
      password: password,
    });
    setCopied(false);
    setAccessDialogOpen(true);
  };

  const handleCreateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedClient) return;
    
    if (!accessForm.email.trim()) {
      toast.error('El email es requerido');
      return;
    }

    setCreatingAccess(true);

    try {
      // Create user via edge function (admin creates account for client)
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: {
          email: accessForm.email.trim(),
          password: accessForm.password,
          client_id: selectedClient.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Acceso creado exitosamente');
      setGeneratedPassword(accessForm.password);
      fetchClients();
    } catch (err) {
      console.error('Error creating access:', err);
      toast.error(err instanceof Error ? err.message : 'Error al crear acceso');
    } finally {
      setCreatingAccess(false);
    }
  };

  const handleCopyCredentials = () => {
    const credentials = `Email: ${accessForm.email}\nContraseña: ${generatedPassword}`;
    navigator.clipboard.writeText(credentials);
    setCopied(true);
    toast.success('Credenciales copiadas');
    setTimeout(() => setCopied(false), 2000);
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

      {/* Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Acceso al Portal</DialogTitle>
            <DialogDescription>
              Crea credenciales para que {selectedClient?.name} acceda a su portal de métricas
            </DialogDescription>
          </DialogHeader>
          
          {selectedClient?.client_user_id ? (
            <div className="py-4 text-center">
              <Badge variant="secondary" className="mb-4">Ya tiene acceso</Badge>
              <p className="text-sm text-muted-foreground">
                Este cliente ya tiene credenciales de acceso al portal.
              </p>
            </div>
          ) : (
            <form onSubmit={handleCreateAccess} className="space-y-4">
              <div>
                <Label htmlFor="access_email">Email de acceso</Label>
                <Input
                  id="access_email"
                  type="email"
                  value={accessForm.email}
                  onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })}
                  placeholder="cliente@email.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="access_password">Contraseña generada</Label>
                <div className="flex gap-2">
                  <Input
                    id="access_password"
                    type="text"
                    value={accessForm.password}
                    onChange={(e) => setAccessForm({ ...accessForm, password: e.target.value })}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setAccessForm({ ...accessForm, password: generatePassword() })}
                  >
                    <Key className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleCopyCredentials}
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copiado' : 'Copiar credenciales'}
                </Button>
                <Button type="submit" className="flex-1" disabled={creatingAccess}>
                  {creatingAccess ? 'Creando...' : 'Crear acceso'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{client.name}</h3>
                    {client.client_user_id && (
                      <Badge variant="outline" className="text-xs">
                        Portal activo
                      </Badge>
                    )}
                  </div>
                  {client.company && (
                    <p className="text-sm text-muted-foreground">{client.company}</p>
                  )}
                  {client.email && (
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-primary font-mono font-semibold">
                  €{client.hourly_rate}/h
                </span>
                <div className="flex gap-2">
                  {(isAdmin || client.client_user_id) && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => navigate(`/portal/${client.id}`)}
                      title={isAdmin ? 'Ver portal (vista admin)' : 'Ver portal del cliente'}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleOpenAccessDialog(client)}
                    title="Crear acceso al portal"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
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
