import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  CheckCircle2,
  FileJson,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OrphanRow {
  id: string;
  end_user_id: string | null;
  end_user_email: string | null;
  end_user_name: string | null;
  partner_id: string | null;
  event_type: string | null;
  status: string | null;
  raw_payload: Record<string, any>;
  received_at: string;
  assigned_to_client_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

type FilterMode = 'all' | 'unassigned' | 'assigned';

export default function AdminOrphanMetaConnections() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [rows, setRows] = useState<OrphanRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('unassigned');

  // Modal state
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [payloadRow, setPayloadRow] = useState<OrphanRow | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRow, setAssignRow] = useState<OrphanRow | null>(null);
  const [assignClientId, setAssignClientId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && user && !isSuperAdmin) navigate('/portal');
  }, [user, authLoading, isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void fetchAll();
  }, [isSuperAdmin]);

  async function fetchAll() {
    setLoading(true);
    const [orphansRes, clientsRes] = await Promise.all([
      (supabase as any)
        .from('orphan_meta_connections')
        .select('*')
        .order('received_at', { ascending: false }),
      (supabase as any)
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true }),
    ]);

    if (orphansRes.error) {
      console.error('[AdminOrphanMeta] orphans fetch error:', orphansRes.error);
      toast.error('No se pudieron cargar las huérfanas');
    } else {
      setRows((orphansRes.data ?? []) as OrphanRow[]);
    }

    if (clientsRes.error) {
      console.error('[AdminOrphanMeta] clients fetch error:', clientsRes.error);
    } else {
      setClients((clientsRes.data ?? []) as ClientOption[]);
    }

    setLoading(false);
  }

  function openPayload(row: OrphanRow) {
    setPayloadRow(row);
    setPayloadOpen(true);
  }

  function openAssign(row: OrphanRow) {
    setAssignRow(row);
    setAssignClientId('');
    setAssignOpen(true);
  }

  async function confirmAssign() {
    if (!assignRow || !assignClientId || !user) return;
    setAssigning(true);

    const { error } = await (supabase as any)
      .from('orphan_meta_connections')
      .update({
        assigned_to_client_id: assignClientId,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', assignRow.id);

    setAssigning(false);

    if (error) {
      console.error('[AdminOrphanMeta] assign error:', error);
      toast.error('Error al asignar: ' + error.message);
      return;
    }

    const clientName = clients.find((c) => c.id === assignClientId)?.name ?? 'cliente';
    toast.success(`Huérfana asignada a ${clientName}`);

    setRows((prev) =>
      prev.map((r) =>
        r.id === assignRow.id
          ? {
              ...r,
              assigned_to_client_id: assignClientId,
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
            }
          : r,
      ),
    );

    setAssignOpen(false);
    setAssignRow(null);
  }

  const filteredRows = useMemo(() => {
    let data = rows;

    if (filter === 'unassigned') {
      data = data.filter((r) => !r.assigned_to_client_id);
    } else if (filter === 'assigned') {
      data = data.filter((r) => !!r.assigned_to_client_id);
    }

    const q = search.trim().toLowerCase();
    if (!q) return data;

    return data.filter(
      (r) =>
        (r.end_user_id ?? '').toLowerCase().includes(q) ||
        (r.end_user_name ?? '').toLowerCase().includes(q) ||
        (r.end_user_email ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q),
    );
  }, [rows, filter, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const unassigned = rows.filter((r) => !r.assigned_to_client_id).length;
    const assigned = total - unassigned;
    return { total, unassigned, assigned };
  }, [rows]);

  function clientNameForRow(row: OrphanRow): string {
    if (!row.assigned_to_client_id) return '—';
    return clients.find((c) => c.id === row.assigned_to_client_id)?.name ?? row.assigned_to_client_id;
  }

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/cerebro')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Conexiones Meta huérfanas
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Webhooks de Leadsie que no pudieron matchearse a un cliente. Asignalas manualmente.
              </p>
            </div>
          </div>
          <Button onClick={() => fetchAll()} variant="outline" size="sm" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Refrescar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<FileJson className="w-4 h-4" />}
          />
          <StatCard
            label="Sin asignar"
            value={stats.unassigned}
            tone="amber"
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <StatCard
            label="Asignadas"
            value={stats.assigned}
            tone="emerald"
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por user_id, nombre, email o nota"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              <SelectItem value="assigned">Asignadas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">Cargando...</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                {rows.length === 0
                  ? 'Aún no hay huérfanas. Bien ahí.'
                  : 'Sin resultados para tu filtro.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recibido</TableHead>
                    <TableHead>End user</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Razón</TableHead>
                    <TableHead>Asignado a</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(row.received_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-slate-900">
                          {row.end_user_name ?? <span className="text-slate-400">sin nombre</span>}
                        </div>
                        {row.end_user_id ? (
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {row.end_user_id.length > 36
                              ? row.end_user_id.slice(0, 36) + '…'
                              : row.end_user_id}
                          </div>
                        ) : null}
                        {row.end_user_email ? (
                          <div className="text-xs text-slate-500 mt-0.5">{row.end_user_email}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.status ? (
                          <Badge variant="outline" className="text-xs">
                            {row.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">
                        {row.notes ?? '—'}
                      </TableCell>
                      <TableCell>
                        {row.assigned_to_client_id ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {clientNameForRow(row)}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            sin asignar
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openPayload(row)}
                            title="Ver payload"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                          </Button>
                          {!row.assigned_to_client_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssign(row)}
                            >
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              Asignar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payload modal */}
      <Dialog open={payloadOpen} onOpenChange={setPayloadOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Payload completo del webhook</DialogTitle>
            <DialogDescription>
              {payloadRow?.received_at &&
                new Date(payloadRow.received_at).toLocaleString('es-CL')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-900 text-slate-100 p-4 rounded-md">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {payloadRow ? JSON.stringify(payloadRow.raw_payload, null, 2) : ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign modal */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar a un cliente</DialogTitle>
            <DialogDescription>
              Esto solo marca la huérfana como revisada. Para crear la conexión Meta real, igual
              hay que correr el flujo manual o reenviar el webhook.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-xs text-slate-500">
              End user del webhook:{' '}
              <span className="font-mono text-slate-700">
                {assignRow?.end_user_name ?? assignRow?.end_user_id ?? '—'}
              </span>
            </div>
            <Select value={assignClientId} onValueChange={setAssignClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assigning}>
              Cancelar
            </Button>
            <Button onClick={confirmAssign} disabled={!assignClientId || assigning}>
              {assigning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const toneClass = {
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          {icon && <div className="text-slate-400">{icon}</div>}
        </div>
        <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
