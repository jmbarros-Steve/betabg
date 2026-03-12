import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Blocks,
  Save,
  Trash2,
  Search,
  Plus,
  Loader2,
  X,
  BarChart3,
  Calendar,
  Package,
} from 'lucide-react';

interface UniversalBlock {
  id: string;
  name: string;
  category: string;
  block_json: any;
  usage_count: number;
  created_at: string;
}

interface UniversalBlocksPanelProps {
  clientId: string;
  editor: any;
  isOpen: boolean;
  onClose: () => void;
}

const BLOCK_CATEGORIES = [
  { value: 'all', label: 'Todas' },
  { value: 'header', label: 'Encabezado' },
  { value: 'footer', label: 'Pie de página' },
  { value: 'product', label: 'Producto' },
  { value: 'cta', label: 'Llamada a la acción' },
  { value: 'testimonial', label: 'Testimonio' },
  { value: 'social', label: 'Redes sociales' },
  { value: 'content', label: 'Contenido' },
  { value: 'other', label: 'Otro' },
];

export function UniversalBlocksPanel({
  clientId,
  editor,
  isOpen,
  onClose,
}: UniversalBlocksPanelProps) {
  const [blocks, setBlocks] = useState<UniversalBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('content');
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<UniversalBlock | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi('universal-blocks', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) {
        toast.error('Error al cargar bloques: ' + error);
        return;
      }
      setBlocks(data?.blocks || []);
    } catch (err) {
      toast.error('Error al cargar bloques');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (isOpen) {
      fetchBlocks();
    }
  }, [isOpen, fetchBlocks]);

  const handleSaveBlock = async () => {
    if (!saveName.trim()) {
      toast.error('Ingresa un nombre para el bloque');
      return;
    }
    if (!editor) {
      toast.error('El editor no está disponible');
      return;
    }

    setSaving(true);
    try {
      const designJson = await new Promise<any>((resolve, reject) => {
        editor.exportHtml((data: any) => {
          if (data?.design) {
            resolve(data.design);
          } else {
            reject(new Error('No se pudo obtener el diseño del editor'));
          }
        });
      });

      const { error } = await callApi('universal-blocks', {
        body: {
          action: 'save',
          client_id: clientId,
          name: saveName.trim(),
          category: saveCategory,
          block_json: designJson,
        },
      });

      if (error) {
        toast.error('Error al guardar: ' + error);
        return;
      }

      toast.success('Bloque guardado exitosamente');
      setShowSaveDialog(false);
      setSaveName('');
      setSaveCategory('content');
      fetchBlocks();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar el bloque');
    } finally {
      setSaving(false);
    }
  };

  const handleInsertBlock = async (block: UniversalBlock) => {
    if (!editor) {
      toast.error('El editor no está disponible');
      return;
    }

    try {
      editor.loadDesign(block.block_json);

      // Increment usage count
      await callApi('universal-blocks', {
        body: {
          action: 'increment_usage',
          client_id: clientId,
          block_id: block.id,
        },
      });

      // Update local state
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === block.id ? { ...b, usage_count: b.usage_count + 1 } : b
        )
      );

      toast.success(`Bloque "${block.name}" insertado`);
    } catch (err) {
      toast.error('Error al insertar el bloque');
    }
  };

  const handleDeleteBlock = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const { error } = await callApi('universal-blocks', {
        body: {
          action: 'delete',
          client_id: clientId,
          block_id: deleteTarget.id,
        },
      });

      if (error) {
        toast.error('Error al eliminar: ' + error);
        return;
      }

      toast.success('Bloque eliminado');
      setDeleteTarget(null);
      setBlocks((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    } catch (err) {
      toast.error('Error al eliminar el bloque');
    } finally {
      setDeleting(false);
    }
  };

  const filteredBlocks = blocks.filter((block) => {
    const matchesSearch =
      !searchQuery ||
      block.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || block.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getCategoryLabel = (value: string) => {
    return (
      BLOCK_CATEGORIES.find((c) => c.value === value)?.label || value
    );
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-50 w-96 bg-background border-l shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Blocks className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Bloques universales</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Save button */}
        <div className="p-4 border-b">
          <Button
            className="w-full"
            onClick={() => setShowSaveDialog(true)}
            disabled={!editor}
          >
            <Save className="h-4 w-4 mr-2" />
            Guardar bloque actual
          </Button>
        </div>

        {/* Search and filter */}
        <div className="p-4 space-y-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar bloques..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por categoría" />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Block list */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBlocks.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Blocks className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {blocks.length === 0
                    ? 'No tienes bloques guardados. Selecciona un bloque en el editor y guardalo aqui.'
                    : 'No se encontraron bloques con los filtros actuales.'}
                </p>
              </div>
            ) : (
              filteredBlocks.map((block) => (
                <Card
                  key={block.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleInsertBlock(block)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {block.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="secondary" className="text-xs">
                            {getCategoryLabel(block.category)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            {block.usage_count} usos
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(block.created_at)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(block);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Save Block Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar bloque</DialogTitle>
            <DialogDescription>
              Guarda el diseño actual del editor como un bloque reutilizable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre del bloque</Label>
              <Input
                placeholder="Ej: Header principal, CTA producto..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={saveCategory} onValueChange={setSaveCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_CATEGORIES.filter((c) => c.value !== 'all').map(
                    (cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveDialog(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveBlock} disabled={saving || !saveName.trim()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar bloque</DialogTitle>
            <DialogDescription>
              Esta accion no se puede deshacer. El bloque &quot;{deleteTarget?.name}&quot; sera eliminado permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBlock}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
