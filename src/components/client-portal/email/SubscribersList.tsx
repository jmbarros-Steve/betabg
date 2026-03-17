import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Users, Plus, Search, Download, Loader2, ShoppingBag, MoreVertical, List, Filter } from 'lucide-react';
import { ListsManager } from './ListsManager';

interface SubscribersListProps {
  clientId: string;
}

export function SubscribersList({ clientId }: SubscribersListProps) {
  const [subView, setSubView] = useState<'contacts' | 'lists'>('contacts');
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [stats, setStats] = useState({ total: 0, subscribed: 0, unsubscribed: 0, bounced: 0 });

  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('query-email-subscribers', {
        body: {
          action: 'list',
          client_id: clientId,
          limit: pageSize,
          offset: page * pageSize,
          search: search || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        },
      });
      if (error) { toast.error(error); return; }
      setSubscribers(data?.subscribers || []);
      setTotal(data?.total || 0);
    } catch (err) {
      toast.error('Error cargando contactos');
    } finally {
      setLoading(false);
    }
  }, [clientId, page, search, statusFilter]);

  const loadStats = useCallback(async () => {
    const { data } = await callApi<any>('sync-email-subscribers', {
      body: { action: 'stats', client_id: clientId },
    });
    if (data) setStats(data);
  }, [clientId]);

  useEffect(() => { loadSubscribers(); }, [loadSubscribers]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await callApi<any>('sync-email-subscribers', {
        body: { action: 'sync', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      toast.success(`Sincronizado: ${data?.synced || 0} contactos de Shopify`);
      loadSubscribers();
      loadStats();
    } catch (err) {
      toast.error('Error sincronizando con Shopify');
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = async () => {
    if (!newEmail) { toast.error('Email es requerido'); return; }
    const { error } = await callApi('sync-email-subscribers', {
      body: {
        action: 'add',
        client_id: clientId,
        email: newEmail,
        first_name: newFirstName || undefined,
        last_name: newLastName || undefined,
      },
    });
    if (error) { toast.error(error); return; }
    toast.success('Contacto agregado');
    setShowAddDialog(false);
    setNewEmail('');
    setNewFirstName('');
    setNewLastName('');
    loadSubscribers();
    loadStats();
  };

  const handleExport = async () => {
    const { data, error } = await callApi<any>('query-email-subscribers', {
      body: { action: 'export', client_id: clientId },
    });
    if (error) { toast.error(error); return; }
    const csv = [
      'email,first_name,last_name,status,source,total_orders,total_spent',
      ...(data?.subscribers || []).map((s: any) =>
        `${s.email},${s.first_name || ''},${s.last_name || ''},${s.status},${s.source},${s.total_orders},${s.total_spent}`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${data?.count || 0} contactos`);
  };

  const sourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      shopify: 'Shopify',
      manual: 'Manual',
      form: 'Formulario',
    };
    return labels[source?.toLowerCase()] || source || '—';
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation: Contactos | Listas y Segmentos */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setSubView('contacts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subView === 'contacts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1.5" />
          Todos los contactos
        </button>
        <button
          onClick={() => setSubView('lists')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subView === 'lists'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Filter className="w-3.5 h-3.5 inline mr-1.5" />
          Listas y Segmentos
        </button>
      </div>

      {subView === 'lists' ? (
        <ListsManager clientId={clientId} />
      ) : (
      <>
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total contactos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">{stats.subscribed}</div>
            <p className="text-xs text-muted-foreground">Suscritos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-gray-500">{stats.unsubscribed}</div>
            <p className="text-xs text-muted-foreground">Desuscritos</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email o nombre..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="subscribed">Activos</SelectItem>
            <SelectItem value="unsubscribed">Desuscritos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingBag className="w-4 h-4 mr-1" />}
            Importar de Shopify
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" /> Agregar contacto
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" /> Exportar contactos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fuente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : subscribers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground mb-4">
                        Tu lista de contactos está vacía. Importa tus clientes de Shopify o agrega contactos manualmente.
                    </p>
                    <div className="flex justify-center gap-3">
                      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                        {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingBag className="w-4 h-4 mr-1" />}
                        Importar de Shopify
                      </Button>
                      <Button size="sm" onClick={() => setShowAddDialog(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Agregar contacto
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                subscribers.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium text-sm">{sub.email}</TableCell>
                    <TableCell className="text-sm">
                      {[sub.first_name, sub.last_name].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell>
                      {sub.status === 'subscribed' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Suscrito</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Desuscrito</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{sourceLabel(sub.source)}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= total}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Add subscriber dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@ejemplo.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre</Label>
                <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="Juan" />
              </div>
              <div>
                <Label>Apellido</Label>
                <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Pérez" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}
