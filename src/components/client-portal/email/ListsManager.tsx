import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Loader2, List, Filter, Trash2, Users, Search } from 'lucide-react';
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

export function ListsManager({ clientId }: ListsManagerProps) {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'static' | 'segment'>('static');
  const [segmentFilters, setSegmentFilters] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

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
      setNewName('');
      setNewDesc('');
      setNewType('static');
      setSegmentFilters([]);
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
    loadLists();
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

      {/* Static Lists */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <List className="w-4 h-4" /> Listas ({staticLists.length})
        </h4>
        {staticLists.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <List className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                Crea listas para agrupar contactos manualmente
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {staticLists.map(list => (
              <Card key={list.id}>
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
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(list)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Segments */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Filter className="w-4 h-4" /> Segmentos ({segments.length})
        </h4>
        {segments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Filter className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                Crea segmentos basados en comportamiento de compra
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {segments.map(list => (
              <Card key={list.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Filter className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{list.name}</p>
                      {list.description && (
                        <p className="text-xs text-muted-foreground">{list.description}</p>
                      )}
                      {list.filters?.length > 0 && (
                        <div className="flex gap-1 mt-1">
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
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(list)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear {newType === 'segment' ? 'Segmento' : 'Lista'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Lista (contactos manuales)</SelectItem>
                  <SelectItem value="segment">Segmento (filtros automaticos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
