import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Loader2, List, Filter, Trash2, Users, Upload, ArrowLeft, FileUp, ShoppingCart, Star, UserPlus, Clock, Mail, Zap } from 'lucide-react';
import { SegmentBuilder } from './SegmentBuilder';

interface ListsManagerProps {
  clientId: string;
}

interface EmailList {
  id: string;
  name: string;
  description: string | null;
  type: 'static' | 'segment';
  filters: any[];
  subscriber_count: number;
  created_at: string;
}

interface ListMember {
  member_id: string;
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  source: string;
  added_at: string;
}

const SEGMENT_TEMPLATES = [
  {
    name: 'Compradores frecuentes',
    description: 'Clientes con 3 o más compras',
    icon: ShoppingCart,
    color: 'text-green-600 bg-green-50',
    filters: [{ field: 'total_orders', operator: 'gte', value: '3' }],
  },
  {
    name: 'Clientes VIP',
    description: 'Clientes que han gastado $100.000+',
    icon: Star,
    color: 'text-yellow-600 bg-yellow-50',
    filters: [{ field: 'total_spent', operator: 'gte', value: '100000' }],
  },
  {
    name: 'Nuevos clientes',
    description: 'Registrados en los últimos 30 días',
    icon: UserPlus,
    color: 'text-blue-600 bg-blue-50',
    filters: [{ field: 'subscribed_at', operator: 'gte', value: 'relative:30d' }],
  },
  {
    name: 'Inactivos',
    description: 'Sin compras en más de 90 días',
    icon: Clock,
    color: 'text-red-600 bg-red-50',
    filters: [{ field: 'last_order_at', operator: 'lte', value: 'relative:90d' }],
  },
  {
    name: 'Carrito abandonado',
    description: 'Contactos de carritos abandonados',
    icon: ShoppingCart,
    color: 'text-orange-600 bg-orange-50',
    filters: [{ field: 'source', operator: 'eq', value: 'shopify_abandoned' }],
  },
  {
    name: 'Solo suscritos',
    description: 'Contactos activamente suscritos',
    icon: Mail,
    color: 'text-purple-600 bg-purple-50',
    filters: [{ field: 'status', operator: 'eq', value: 'subscribed' }],
  },
];

export function ListsManager({ clientId }: ListsManagerProps) {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCustomCreate, setShowCustomCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'static' | 'segment'>('static');
  const [segmentFilters, setSegmentFilters] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  // Detail view state
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);

  // CSV import state
  const [showImport, setShowImport] = useState(false);
  const [importTarget, setImportTarget] = useState<EmailList | null>(null);
  const [csvData, setCsvData] = useState<{ email: string; first_name?: string; last_name?: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('manage-email-lists', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setLists(data?.lists || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const loadMembers = useCallback(async (listId: string) => {
    setMembersLoading(true);
    try {
      const { data, error } = await callApi<any>('manage-email-lists', {
        body: { action: 'get_members', client_id: clientId, list_id: listId, limit: 100 },
      });
      if (error) { toast.error(error); return; }
      setMembers(data?.members || []);
      setMembersTotal(data?.total || 0);
    } finally {
      setMembersLoading(false);
    }
  }, [clientId]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Nombre es requerido'); return; }
    setCreating(true);
    try {
      const { error } = await callApi('manage-email-lists', {
        body: {
          action: 'create',
          client_id: clientId,
          name: newName.trim(),
          description: newDesc.trim() || null,
          type: newType,
          filters: newType === 'segment' ? segmentFilters : [],
        },
      });
      if (error) { toast.error(error); return; }
      toast.success(newType === 'segment' ? 'Segmento creado' : 'Lista creada');
      setShowCreate(false);
      setShowCustomCreate(false);
      setNewName('');
      setNewDesc('');
      setNewType('static');
      setSegmentFilters([]);
      loadLists();
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFromTemplate = async (template: typeof SEGMENT_TEMPLATES[0]) => {
    setCreating(true);
    try {
      const { error } = await callApi('manage-email-lists', {
        body: {
          action: 'create',
          client_id: clientId,
          name: template.name,
          description: template.description,
          type: 'segment',
          filters: template.filters,
        },
      });
      if (error) { toast.error(error); return; }
      toast.success(`Segmento "${template.name}" creado`);
      setShowCreate(false);
      loadLists();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (list: EmailList) => {
    if (!confirm(`Eliminar "${list.name}"?`)) return;
    const { error } = await callApi('manage-email-lists', {
      body: { action: 'delete', client_id: clientId, list_id: list.id },
    });
    if (error) { toast.error(error); return; }
    toast.success('Eliminado');
    if (selectedList?.id === list.id) setSelectedList(null);
    loadLists();
  };

  const handleRemoveMember = async (memberId: string, subscriberId: string) => {
    if (!selectedList) return;
    const { error } = await callApi('manage-email-lists', {
      body: { action: 'remove_members', client_id: clientId, list_id: selectedList.id, subscriber_ids: [subscriberId] },
    });
    if (error) { toast.error(error); return; }
    toast.success('Contacto removido de la lista');
    loadMembers(selectedList.id);
    loadLists();
  };

  const handleOpenList = (list: EmailList) => {
    setSelectedList(list);
    if (list.type === 'static') {
      loadMembers(list.id);
    }
  };

  // CSV Import
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        toast.error('El CSV debe tener al menos una fila de datos');
        return;
      }

      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const emailIdx = headers.findIndex(h => h === 'email' || h === 'correo' || h === 'e-mail');
      const fnIdx = headers.findIndex(h => h === 'first_name' || h === 'nombre' || h === 'name');
      const lnIdx = headers.findIndex(h => h === 'last_name' || h === 'apellido' || h === 'surname');

      if (emailIdx === -1) {
        toast.error('El CSV debe tener una columna "email"');
        return;
      }

      const parsed = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        return {
          email: cols[emailIdx] || '',
          first_name: fnIdx >= 0 ? cols[fnIdx] : undefined,
          last_name: lnIdx >= 0 ? cols[lnIdx] : undefined,
        };
      }).filter(r => r.email && r.email.includes('@'));

      setCsvData(parsed);
      toast.success(`${parsed.length} contactos encontrados en el CSV`);
    };
    reader.readAsText(file);
  };

  const handleImportCsv = async () => {
    if (!importTarget || csvData.length === 0) return;
    setImporting(true);
    try {
      // First add contacts to email_subscribers
      let addedCount = 0;
      const batchSize = 20;
      const subscriberIds: string[] = [];

      for (let i = 0; i < csvData.length; i += batchSize) {
        const batch = csvData.slice(i, i + batchSize);
        for (const contact of batch) {
          const { data, error } = await callApi<any>('sync-email-subscribers', {
            body: {
              action: 'add',
              client_id: clientId,
              email: contact.email,
              first_name: contact.first_name || undefined,
              last_name: contact.last_name || undefined,
            },
          });
          if (!error && data?.id) {
            subscriberIds.push(data.id);
            addedCount++;
          }
        }
      }

      // Then add them to the list
      if (subscriberIds.length > 0) {
        await callApi('manage-email-lists', {
          body: {
            action: 'add_members',
            client_id: clientId,
            list_id: importTarget.id,
            subscriber_ids: subscriberIds,
          },
        });
      }

      toast.success(`${addedCount} contactos importados a "${importTarget.name}"`);
      setShowImport(false);
      setCsvData([]);
      setImportTarget(null);
      loadLists();
      if (selectedList?.id === importTarget.id) {
        loadMembers(importTarget.id);
      }
    } finally {
      setImporting(false);
    }
  };

  const staticLists = lists.filter(l => l.type === 'static');
  const segments = lists.filter(l => l.type === 'segment');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view for a selected list
  if (selectedList) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedList(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver
          </Button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{selectedList.name}</h3>
            {selectedList.description && (
              <p className="text-sm text-muted-foreground">{selectedList.description}</p>
            )}
          </div>
          <Badge variant="outline">
            {selectedList.type === 'segment' ? 'Segmento' : 'Lista'}
          </Badge>
        </div>

        {selectedList.type === 'segment' ? (
          <div className="space-y-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm font-medium mb-2">Filtros del segmento:</p>
                {selectedList.filters?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedList.filters.map((f: any, i: number) => (
                      <Badge key={i} variant="secondary">
                        {f.field} {f.operator} {f.value}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin filtros (todos los suscritos)</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedList.subscriber_count} contactos coinciden</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {membersTotal} contacto{membersTotal !== 1 ? 's' : ''} en esta lista
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setImportTarget(selectedList); setShowImport(true); }}
              >
                <Upload className="w-4 h-4 mr-1" /> Importar CSV
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground mb-3">Lista vacia</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setImportTarget(selectedList); setShowImport(true); }}
                          >
                            <Upload className="w-4 h-4 mr-1" /> Importar contactos CSV
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      members.map((m) => (
                        <TableRow key={m.member_id}>
                          <TableCell className="text-sm font-medium">{m.email}</TableCell>
                          <TableCell className="text-sm">
                            {[m.first_name, m.last_name].filter(Boolean).join(' ') || '--'}
                          </TableCell>
                          <TableCell>
                            <Badge className={m.status === 'subscribed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                              {m.status === 'subscribed' ? 'Suscrito' : 'Desuscrito'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRemoveMember(m.member_id, m.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // Main list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Listas y Segmentos</h3>
          <p className="text-sm text-muted-foreground">Organiza tus contactos en grupos</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Crear
        </Button>
      </div>

      {lists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <List className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-1">No tienes listas ni segmentos</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crea listas para agrupar contactos o segmentos para filtrar por comportamiento
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Crear lista o segmento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Static Lists */}
          {staticLists.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <List className="w-4 h-4" /> Listas ({staticLists.length})
              </h4>
              <div className="grid gap-2">
                {staticLists.map(list => (
                  <Card key={list.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => handleOpenList(list)}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <List className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{list.name}</p>
                          {list.description && (
                            <p className="text-xs text-muted-foreground">{list.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <Users className="w-3 h-3 mr-1" /> {list.subscriber_count}
                        </Badge>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={(e) => { e.stopPropagation(); handleDelete(list); }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Segments */}
          {segments.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Filter className="w-4 h-4" /> Segmentos ({segments.length})
              </h4>
              <div className="grid gap-2">
                {segments.map(list => (
                  <Card key={list.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => handleOpenList(list)}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Filter className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">{list.name}</p>
                          {list.description && (
                            <p className="text-xs text-muted-foreground">{list.description}</p>
                          )}
                          {list.filters?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {list.filters.map((f: any, i: number) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">
                                  {f.field} {f.operator} {f.value}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <Users className="w-3 h-3 mr-1" /> {list.subscriber_count}
                        </Badge>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={(e) => { e.stopPropagation(); handleDelete(list); }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Panel */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setShowCustomCreate(false); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{showCustomCreate ? `Crear ${newType === 'segment' ? 'Segmento' : 'Lista'}` : 'Crear Lista o Segmento'}</DialogTitle>
          </DialogHeader>

          {!showCustomCreate ? (
            <div className="space-y-6">
              {/* Templates section */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" /> Usar template (un clic)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {SEGMENT_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    return (
                      <Card
                        key={template.name}
                        className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                        onClick={() => !creating && handleCreateFromTemplate(template)}
                      >
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${template.color}`}>
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground">{template.description}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {template.filters.map((f, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {f.field} {f.operator} {f.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {creating && (
                  <div className="flex items-center justify-center py-2 mt-2">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Creando segmento...</span>
                  </div>
                )}
              </div>

              {/* Custom creation section */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Crear personalizado</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => { setNewType('static'); setShowCustomCreate(true); }}
                  >
                    <List className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Lista manual</span>
                    <span className="text-xs text-muted-foreground">Agrega contactos manualmente o por CSV</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => { setNewType('segment'); setShowCustomCreate(true); }}
                  >
                    <Filter className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium">Segmento con filtros</span>
                    <span className="text-xs text-muted-foreground">Define reglas para segmentar automáticamente</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={newType === 'segment' ? 'ej: Compradores frecuentes' : 'ej: VIP Clientes'}
                />
              </div>
              <div>
                <Label>Descripcion</Label>
                <Textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Opcional"
                  rows={2}
                />
              </div>
              {newType === 'segment' && (
                <div className="border rounded-lg p-3">
                  <SegmentBuilder
                    clientId={clientId}
                    compact
                    onApply={(filters) => setSegmentFilters(filters)}
                  />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowCustomCreate(false); setNewName(''); setNewDesc(''); setSegmentFilters([]); }}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Volver
                </Button>
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setCsvData([]); setImportTarget(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar contactos CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sube un archivo CSV con columnas: <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">first_name</code> (opcional), <code className="bg-muted px-1 rounded">last_name</code> (opcional)
            </p>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {csvData.length > 0
                  ? `${csvData.length} contactos listos para importar`
                  : 'Haz click para seleccionar un archivo CSV'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {csvData.length > 0 && (
              <div className="max-h-40 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Email</th>
                      <th className="text-left px-2 py-1">Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{row.email}</td>
                        <td className="px-2 py-1">{[row.first_name, row.last_name].filter(Boolean).join(' ') || '--'}</td>
                      </tr>
                    ))}
                    {csvData.length > 10 && (
                      <tr className="border-t">
                        <td colSpan={2} className="px-2 py-1 text-muted-foreground text-center">
                          ... y {csvData.length - 10} mas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setCsvData([]); }}>Cancelar</Button>
            <Button onClick={handleImportCsv} disabled={importing || csvData.length === 0}>
              {importing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Importar {csvData.length} contactos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
