import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, Eye, Plus, Trash2,
  CheckCircle2, Clock, AlertCircle, Search, X, Save, Loader2,
  Copy, Check, ShoppingBag, UserPlus, Coins
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PlanBadge } from '@/components/client-portal/PlanBadge';
import { PLAN_SLUGS, PLAN_INFO, type PlanSlug } from '@/lib/plan-features';

const EDGE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co/functions/v1';

interface ClientCredit {
  creditos_disponibles: number;
  creditos_usados: number;
  plan: string;
}

interface BrandResearch {
  id: string;
  research_type: string;
}

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  rut: string | null;
  razon_social: string | null;
  shop_domain: string | null;
  created_at: string;
  client_user_id: string | null;
  credits?: ClientCredit | null;
  research?: BrandResearch[];
  hasPersona?: boolean;
  subscriptionPlanSlug?: PlanSlug;
  subscriptionId?: string;
}

type BriefStatus = 'complete' | 'in_progress' | 'not_started';

function getBriefStatus(client: ClientRow): BriefStatus {
  const hasResearch = (client.research?.length ?? 0) > 0;
  if (hasResearch && client.hasPersona) return 'complete';
  if (hasResearch || client.hasPersona) return 'in_progress';
  return 'not_started';
}

const PLAN_OPTIONS = PLAN_SLUGS.map(slug => ({
  value: slug,
  label: `${PLAN_INFO[slug].emoji} ${PLAN_INFO[slug].nombre}`,
}));

const DEFAULT_PLAN = 'visual';
const DEFAULT_TOKENS = 500;

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function deleteClientsViaEdge(clientIds: string[]): Promise<{ deleted: number; errors?: string[] }> {
  const token = await getAuthToken();
  const res = await fetch(`${EDGE_URL}/admin-delete-clients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ client_ids: clientIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || 'Error al eliminar');
  }
  return res.json();
}

function StatusBadge({ status }: { status: BriefStatus }) {
  if (status === 'complete') return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Brief completo
    </Badge>
  );
  if (status === 'in_progress') return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
      <Clock className="w-3 h-3" /> En proceso
    </Badge>
  );
  return (
    <Badge className="bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400 gap-1">
      <AlertCircle className="w-3 h-3" /> Sin empezar
    </Badge>
  );
}

function ClientDetail({ client, onClose, onRefresh, onDelete }: {
  client: ClientRow;
  onClose: () => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingCredits, setAddingCredits] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [editForm, setEditForm] = useState({
    name: client.name,
    email: client.email ?? '',
    company: client.company ?? '',
    rut: client.rut ?? '',
    razon_social: client.razon_social ?? '',
    plan: client.credits?.plan ?? 'pro',
    subscriptionPlan: client.subscriptionPlanSlug ?? 'visual' as PlanSlug,
    shopDomain: client.shop_domain ?? '',
  });
  const [linkCopied, setLinkCopied] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: editForm.name,
          email: editForm.email || null,
          company: editForm.company || null,
          rut: editForm.rut || null,
          razon_social: editForm.razon_social || null,
          shop_domain: editForm.shopDomain || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      if (editForm.plan !== client.credits?.plan) {
        const { error: credErr } = await supabase
          .from('client_credits')
          .update({ plan: editForm.plan })
          .eq('client_id', client.id);
        if (credErr) throw credErr;
      }

      // Update subscription plan if changed
      if (editForm.subscriptionPlan !== client.subscriptionPlanSlug && client.client_user_id) {
        const { data: newPlan } = await supabase
          .from('subscription_plans')
          .select('id')
          .eq('slug', editForm.subscriptionPlan)
          .single();

        if (newPlan) {
          if (client.subscriptionId) {
            // Update existing subscription
            await supabase
              .from('user_subscriptions')
              .update({ plan_id: newPlan.id })
              .eq('id', client.subscriptionId);
          } else {
            // Create new subscription
            await supabase
              .from('user_subscriptions')
              .insert({
                user_id: client.client_user_id,
                plan_id: newPlan.id,
                status: 'active',
                credits_used: 0,
                credits_reset_at: new Date().toISOString(),
              });
          }
        }
      }

      toast.success('Cliente actualizado');
      onRefresh();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCredits = async () => {
    const amount = parseInt(creditAmount);
    if (!amount || amount <= 0) {
      toast.error('Ingresa una cantidad válida');
      return;
    }
    setAddingCredits(true);
    try {
      const currentAvailable = client.credits?.creditos_disponibles ?? 0;
      const { error } = await supabase
        .from('client_credits')
        .update({ creditos_disponibles: currentAvailable + amount })
        .eq('client_id', client.id);

      if (error) throw error;
      toast.success(`+${amount} tokens agregados`);
      setCreditAmount('');
      onRefresh();
    } catch {
      toast.error('Error al agregar tokens');
    } finally {
      setAddingCredits(false);
    }
  };

  const handleSetCredits = async (newAmount: number) => {
    try {
      const { error } = await supabase
        .from('client_credits')
        .update({ creditos_disponibles: newAmount })
        .eq('client_id', client.id);

      if (error) throw error;
      toast.success(`Tokens actualizados a ${newAmount}`);
      onRefresh();
    } catch {
      toast.error('Error al actualizar tokens');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteClientsViaEdge([client.id]);
      toast.success(`${client.name} eliminado`);
      onDelete(client.id);
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const generateAndCopyLink = async () => {
    let domain = editForm.shopDomain.trim().toLowerCase();
    if (!domain) {
      toast.error('Primero ingresa el dominio de Shopify');
      return;
    }
    if (!domain.endsWith('.myshopify.com')) {
      domain = domain.replace(/\.myshopify\.com$/, '') + '.myshopify.com';
      setEditForm(f => ({ ...f, shopDomain: domain }));
    }
    const installUrl = `https://steve-api-850416724643.us-central1.run.app/api/shopify-install?shop=${encodeURIComponent(domain)}`;
    await navigator.clipboard.writeText(installUrl);
    setLinkCopied(true);
    toast.success('Link copiado al clipboard');
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const briefStatus = getBriefStatus(client);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mt-2 mb-4 rounded-xl border border-slate-200 bg-white p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={briefStatus} />
          {client.shop_domain && (
            <Badge variant="outline" className="text-xs">{client.shop_domain}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate(`/portal/${client.id}`)}>
            <Eye className="w-4 h-4 mr-1" /> Ver Portal
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará a <strong>{client.name}</strong> ({client.email}) y todos sus datos asociados (créditos, research, usuario auth, etc.). Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Editar info */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Información</h4>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Empresa</Label>
              <Input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">RUT</Label>
              <Input value={editForm.rut} onChange={e => setEditForm({ ...editForm, rut: e.target.value })} placeholder="12.345.678-9" />
            </div>
            <div>
              <Label className="text-xs">Razón Social</Label>
              <Input value={editForm.razon_social} onChange={e => setEditForm({ ...editForm, razon_social: e.target.value })} placeholder="Empresa SpA" />
            </div>
          </div>
        </div>

        {/* Créditos y plan */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Plan y Tokens</h4>

          <div>
            <Label className="text-xs">Plan Steve Ads</Label>
            <Select value={editForm.subscriptionPlan} onValueChange={v => setEditForm({ ...editForm, subscriptionPlan: v as PlanSlug })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {client.credits && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Disponibles</span>
                <span className="font-mono font-semibold text-green-600">
                  {client.credits.creditos_disponibles.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Usados</span>
                <span className="font-mono">{client.credits.creditos_usados.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Add tokens */}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Tokens a agregar"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddCredits} disabled={addingCredits}>
              {addingCredits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {/* Quick token actions */}
          <div className="flex gap-2 flex-wrap">
            {[100, 250, 500, 1000].map(amount => (
              <Button
                key={amount}
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => handleSetCredits(amount)}
              >
                <Coins className="w-3 h-3 mr-1" /> {amount}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Shopify Integration */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ShoppingBag className="w-4 h-4" /> Shopify
        </h4>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Dominio Shopify</Label>
            <Input
              placeholder="mi-tienda.myshopify.com"
              value={editForm.shopDomain}
              onChange={e => setEditForm({ ...editForm, shopDomain: e.target.value })}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={generateAndCopyLink}
            disabled={!editForm.shopDomain.trim()}
          >
            {linkCopied
              ? <><Check className="w-4 h-4 mr-2 text-green-500" /> Copiado</>
              : <><Copy className="w-4 h-4 mr-2" /> Copiar Link de Instalación</>
            }
          </Button>
          {client.shop_domain && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Shopify conectado: {client.shop_domain}
            </p>
          )}
        </div>
      </div>

      {/* Research status */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Estado del Brief</h4>
        <div className="flex flex-wrap gap-2">
          {['brand_analysis', 'market_research', 'competitor_analysis'].map(type => {
            const has = client.research?.some(r => r.research_type === type);
            return (
              <Badge key={type} variant={has ? 'default' : 'outline'} className="text-xs">
                {has ? '✓' : '○'} {type.replace('_', ' ')}
              </Badge>
            );
          })}
          <Badge variant={client.hasPersona ? 'default' : 'outline'} className="text-xs">
            {client.hasPersona ? '✓' : '○'} buyer persona
          </Badge>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar cambios
        </Button>
      </div>
    </motion.div>
  );
}

function CreateClientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', company: '', rut: '', razon_social: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Nombre, email y contraseña son requeridos');
      return;
    }
    if (form.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setCreating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${EDGE_URL}/admin-create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          company: form.company.trim() || null,
          rut: form.rut.trim() || null,
          razon_social: form.razon_social.trim() || null,
          plan: DEFAULT_PLAN,
          tokens: DEFAULT_TOKENS,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || err.msg || 'Error al crear cliente');
      }

      toast.success(`Cliente ${form.name} creado con Plan Visual`);
      setForm({ name: '', email: '', password: '', company: '', rut: '', razon_social: '' });
      setOpen(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear cliente');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="hero">
          <UserPlus className="w-4 h-4 mr-2" />
          Crear Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Cliente — Plan Visual</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del cliente" required />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@empresa.cl" required />
          </div>
          <div>
            <Label>Contraseña *</Label>
            <Input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" required />
          </div>
          <div>
            <Label>Empresa</Label>
            <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Nombre de la empresa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>RUT</Label>
              <Input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" />
            </div>
            <div>
              <Label>Razón Social</Label>
              <Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} placeholder="Empresa SpA" />
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            Plan Visual (por defecto) — se puede cambiar después
          </div>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Crear Cliente
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminClientsPanel() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [refreshKey]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select('id, name, email, company, rut, razon_social, shop_domain, created_at, client_user_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: creditsData } = await supabase
        .from('client_credits')
        .select('client_id, creditos_disponibles, creditos_usados, plan');

      const { data: researchData } = await supabase
        .from('brand_research')
        .select('client_id, id, research_type');

      const { data: personaData } = await supabase
        .from('buyer_personas')
        .select('client_id, is_complete');

      // Fetch subscription plans for all users
      const { data: subsData } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, plan_id, subscription_plans(slug)')
        .eq('status', 'active');

      const subsMap = new Map<string, { slug: PlanSlug; subId: string }>();
      subsData?.forEach((s: any) => {
        const slug = s.subscription_plans?.slug as PlanSlug;
        if (slug) subsMap.set(s.user_id, { slug, subId: s.id });
      });

      const creditsMap = new Map<string, ClientCredit>();
      creditsData?.forEach(c => creditsMap.set(c.client_id, {
        creditos_disponibles: c.creditos_disponibles,
        creditos_usados: c.creditos_usados,
        plan: c.plan,
      }));

      const researchMap = new Map<string, BrandResearch[]>();
      researchData?.forEach(r => {
        if (!researchMap.has(r.client_id)) researchMap.set(r.client_id, []);
        researchMap.get(r.client_id)!.push({ id: r.id, research_type: r.research_type });
      });

      const personaSet = new Set<string>();
      personaData?.forEach(p => { if (p.is_complete) personaSet.add(p.client_id); });

      const enriched: ClientRow[] = (clientsData || []).map(c => {
        const sub = c.client_user_id ? subsMap.get(c.client_user_id) : undefined;
        return {
          ...c,
          credits: creditsMap.get(c.id) ?? null,
          research: researchMap.get(c.id) ?? [],
          hasPersona: personaSet.has(c.id),
          subscriptionPlanSlug: sub?.slug,
          subscriptionId: sub?.subId,
        };
      });

      setClients(enriched);
      setSelected(new Set());
    } catch {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    setExpandedId(null);
    setRefreshKey(k => k + 1);
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const result = await deleteClientsViaEdge(Array.from(selected));
      toast.success(`${result.deleted} cliente(s) eliminado(s)`);
      if (result.errors?.length) {
        console.error('Delete errors:', result.errors);
      }
      setSelected(new Set());
      setExpandedId(null);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    } finally {
      setBulkDeleting(false);
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.rut ?? '').toLowerCase().includes(q) ||
      (c.razon_social ?? '').toLowerCase().includes(q) ||
      (c.shop_domain ?? '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">{clients.length} clientes en total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <CreateClientDialog onCreated={() => setRefreshKey(k => k + 1)} />
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200"
        >
          <span className="text-sm font-medium text-red-700">
            {selected.size} seleccionado(s)
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Eliminar seleccionados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar {selected.size} cliente(s)</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminarán {selected.size} clientes y todos sus datos asociados (créditos, research, usuarios auth, etc.). Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleBulkDelete}
                >
                  Eliminar {selected.size}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Deseleccionar
          </Button>
        </motion.div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Con brief completo', value: clients.filter(c => getBriefStatus(c) === 'complete').length, color: 'text-green-600' },
          { label: 'En proceso', value: clients.filter(c => getBriefStatus(c) === 'in_progress').length, color: 'text-yellow-600' },
          { label: 'Sin empezar', value: clients.filter(c => getBriefStatus(c) === 'not_started').length, color: 'text-red-500' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl bg-white border border-slate-200 p-3 text-center card-hover">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={selected.size === filtered.length && filtered.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">Seleccionar todos</span>
        </div>
      )}

      {/* Client list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No hay clientes que coincidan</div>
        )}
        {filtered.map((client, index) => {
          const status = getBriefStatus(client);
          const isExpanded = expandedId === client.id;
          const isSelected = selected.has(client.id);

          return (
            <div key={client.id}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-red-300 bg-red-50/50'
                    : isExpanded
                    ? 'border-primary/40 bg-white'
                    : 'border-slate-200 bg-white hover:border-primary/20'
                }`}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div onClick={(e) => toggleSelect(client.id, e)}>
                      <Checkbox
                        checked={isSelected}
                        className="pointer-events-none"
                      />
                    </div>
                    <div
                      className="flex items-center gap-3 flex-1"
                      onClick={() => setExpandedId(isExpanded ? null : client.id)}
                    >
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      }
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{client.name}</span>
                          {client.company && (
                            <span className="text-sm text-muted-foreground">· {client.company}</span>
                          )}
                          {client.rut && (
                            <span className="text-xs text-muted-foreground font-mono">({client.rut})</span>
                          )}
                          {client.shop_domain && (
                            <Badge variant="outline" className="text-xs">Shopify</Badge>
                          )}
                          {client.client_user_id && (
                            <Badge variant="secondary" className="text-xs">Portal activo</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {client.email ?? 'Sin email'}
                          {client.razon_social ? ` · ${client.razon_social}` : ''}
                          {' · '}{new Date(client.created_at).toLocaleDateString('es-CL')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0" onClick={() => setExpandedId(isExpanded ? null : client.id)}>
                    <StatusBadge status={status} />
                    {client.subscriptionPlanSlug && (
                      <PlanBadge planSlug={client.subscriptionPlanSlug} />
                    )}
                    {client.credits && (
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground">{client.credits.plan}</div>
                        <div className="text-sm font-mono font-semibold">
                          {client.credits.creditos_disponibles.toLocaleString()} tokens
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              <AnimatePresence>
                {isExpanded && (
                  <ClientDetail
                    key={`detail-${client.id}`}
                    client={client}
                    onClose={() => setExpandedId(null)}
                    onRefresh={() => setRefreshKey(k => k + 1)}
                    onDelete={handleDeleteClient}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
