import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, Eye, Edit2, Plus, Minus,
  CheckCircle2, Clock, AlertCircle, Search, X, Save, Loader2,
  Copy, Check, ShoppingBag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  shop_domain: string | null;
  created_at: string;
  client_user_id: string | null;
  credits?: ClientCredit | null;
  research?: BrandResearch[];
  hasPersona?: boolean;
}

type BriefStatus = 'complete' | 'in_progress' | 'not_started';

function getBriefStatus(client: ClientRow): BriefStatus {
  const hasResearch = (client.research?.length ?? 0) > 0;
  if (hasResearch && client.hasPersona) return 'complete';
  if (hasResearch || client.hasPersona) return 'in_progress';
  return 'not_started';
}

const PLAN_OPTIONS = [
  { value: 'free_beta', label: 'Free Beta' },
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'agency', label: 'Agency' },
];

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

function ClientDetail({ client, onClose, onRefresh }: {
  client: ClientRow;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [addingCredits, setAddingCredits] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [editForm, setEditForm] = useState({
    name: client.name,
    email: client.email ?? '',
    company: client.company ?? '',
    plan: client.credits?.plan ?? 'free_beta',
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
          shop_domain: editForm.shopDomain || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      // Update plan if changed
      if (editForm.plan !== client.credits?.plan) {
        const { error: credErr } = await supabase
          .from('client_credits')
          .update({ plan: editForm.plan })
          .eq('client_id', client.id);
        if (credErr) throw credErr;
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
      toast.success(`+${amount} créditos agregados`);
      setCreditAmount('');
      onRefresh();
    } catch (err) {
      toast.error('Error al agregar créditos');
    } finally {
      setAddingCredits(false);
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
          </div>
        </div>

        {/* Créditos y plan */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Plan y Créditos</h4>

          <div>
            <Label className="text-xs">Plan</Label>
            <Select value={editForm.plan} onValueChange={v => setEditForm({ ...editForm, plan: v })}>
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

          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Créditos a agregar"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddCredits} disabled={addingCredits}>
              {addingCredits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
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

export function AdminClientsPanel() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchAll();
  }, [refreshKey]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch all clients (super admin sees all via RLS)
      const { data: clientsData, error } = await supabase
        .from('clients')
        .select('id, name, email, company, shop_domain, created_at, client_user_id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch credits for all clients
      const { data: creditsData } = await supabase
        .from('client_credits')
        .select('client_id, creditos_disponibles, creditos_usados, plan');

      // Fetch research presence
      const { data: researchData } = await supabase
        .from('brand_research')
        .select('client_id, id, research_type');

      // Fetch persona presence
      const { data: personaData } = await supabase
        .from('buyer_personas')
        .select('client_id, is_complete');

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

      const enriched: ClientRow[] = (clientsData || []).map(c => ({
        ...c,
        credits: creditsMap.get(c.id) ?? null,
        research: researchMap.get(c.id) ?? [],
        hasPersona: personaSet.has(c.id),
      }));

      setClients(enriched);
    } catch {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">{clients.length} clientes en total</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

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

      {/* Client list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No hay clientes que coincidan</div>
        )}
        {filtered.map((client, index) => {
          const status = getBriefStatus(client);
          const isExpanded = expandedId === client.id;

          return (
            <div key={client.id}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`rounded-xl border transition-colors cursor-pointer ${
                  isExpanded
                    ? 'border-primary/40 bg-white'
                    : 'border-slate-200 bg-white hover:border-primary/20'
                }`}
                onClick={() => setExpandedId(isExpanded ? null : client.id)}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
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
                        {client.shop_domain && (
                          <Badge variant="outline" className="text-xs">Shopify</Badge>
                        )}
                        {client.client_user_id && (
                          <Badge variant="secondary" className="text-xs">Portal activo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {client.email ?? 'Sin email'} · {new Date(client.created_at).toLocaleDateString('es-CL')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={status} />
                    {client.credits && (
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground">{client.credits.plan}</div>
                        <div className="text-sm font-mono font-semibold">
                          {client.credits.creditos_disponibles.toLocaleString()} cr.
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
