import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Loader2,
  X,
  MousePointerClick,
  FileDown,
} from 'lucide-react';
import { type BlocksEditorRef } from './BlocksEditorWrapper';

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
  editor: BlocksEditorRef | null;
  isOpen: boolean;
  onClose: () => void;
}

const BLOCK_CATEGORIES = [
  { value: 'all', label: 'Todos' },
  { value: 'header', label: 'Encabezados' },
  { value: 'hero', label: 'Hero' },
  { value: 'section', label: 'Secciones' },
  { value: 'product', label: 'Productos' },
  { value: 'cta', label: 'Botones' },
  { value: 'content', label: 'Contenido' },
  { value: 'footer', label: 'Pie de página' },
];

const SAVE_CATEGORIES = BLOCK_CATEGORIES.filter((c) => c.value !== 'all');

type SaveSource = 'selection' | 'full';

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
  const [saveCategory, setSaveCategory] = useState('section');
  const [saveSource, setSaveSource] = useState<SaveSource>('selection');
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

  /** Get HTML from the current editor content (selection not supported in blocks editor) */
  const getSelectedHtml = (): string | null => {
    return editor?.getSelectedHtml?.() ?? null;
  };

  const openSaveDialog = (source: SaveSource) => {
    if (source === 'selection') {
      const html = getSelectedHtml();
      if (!html) {
        toast.error('Selecciona un componente en el editor primero');
        return;
      }
    }
    setSaveSource(source);
    setSaveCategory(source === 'selection' ? 'section' : 'header');
    setShowSaveDialog(true);
  };

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
      let html: string | null = null;

      if (saveSource === 'selection') {
        html = getSelectedHtml();
        if (!html) {
          throw new Error('No hay componente seleccionado. Selecciona una sección en el editor.');
        }
      } else {
        html = editor.getHtml();
      }

      if (!html) {
        throw new Error('No se pudo obtener el diseño del editor');
      }

      const { error } = await callApi('universal-blocks', {
        body: {
          action: 'save',
          client_id: clientId,
          name: saveName.trim(),
          category: saveCategory,
          block_json: html,
        },
      });

      if (error) {
        toast.error('Error al guardar: ' + error);
        return;
      }

      toast.success(
        saveSource === 'selection'
          ? 'Sección guardada exitosamente'
          : 'Bloque guardado exitosamente'
      );
      setShowSaveDialog(false);
      setSaveName('');
      fetchBlocks();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
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
      editor.addComponents(block.block_json);

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

      toast.success(`"${block.name}" insertado`);
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

  if (!isOpen) return null;

  return (
    <>
      {/* Slide-in panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-96 bg-background border-l shadow-xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">Biblioteca de Secciones</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Save buttons */}
        <div className="px-4 pt-4 pb-2 space-y-2">
          <Button
            className="w-full"
            onClick={() => openSaveDialog('selection')}
            disabled={!editor}
          >
            <MousePointerClick className="h-4 w-4 mr-2" />
            Guardar sección seleccionada
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => openSaveDialog('full')}
            disabled={!editor}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Guardar email completo
          </Button>
        </div>

        {/* Category pills */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex gap-1.5 flex-wrap">
            {BLOCK_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  categoryFilter === cat.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar secciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Block list */}
        <ScrollArea className="flex-1">
          <div className="px-4 pb-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBlocks.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Blocks className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {blocks.length === 0
                    ? 'No tienes secciones guardadas. Selecciona un componente en el editor y guárdalo como sección reutilizable.'
                    : 'No se encontraron secciones con los filtros actuales.'}
                </p>
              </div>
            ) : (
              filteredBlocks.map((block) => (
                <div
                  key={block.id}
                  onClick={() => handleInsertBlock(block)}
                  className="group relative rounded-lg border bg-card p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 hover:bg-accent/30"
                >
                  {/* Small HTML preview */}
                  <div className="rounded border bg-muted/30 mb-2 h-16 overflow-hidden pointer-events-none">
                    {typeof block.block_json === 'string' ? (
                      <iframe
                        srcDoc={block.block_json}
                        sandbox="allow-same-origin allow-scripts"
                        className="origin-top-left scale-[0.25] w-[400%] h-[400%] pointer-events-none border-0"
                        title={`Preview: ${block.name}`}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Blocks className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Block info */}
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{block.name}</p>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full capitalize shrink-0 ml-2">
                      {BLOCK_CATEGORIES.find((c) => c.value === block.category)?.label || block.category}
                    </span>
                  </div>

                  {/* Delete button — visible on hover only */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(block);
                    }}
                    className="absolute top-2 right-2 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Save Block Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {saveSource === 'selection' ? 'Guardar sección' : 'Guardar email completo'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {saveSource === 'selection'
                ? 'Guarda la sección seleccionada como bloque reutilizable'
                : 'Guarda el diseño completo como bloque reutilizable'}
            </DialogDescription>
          </DialogHeader>

          {saveSource === 'selection' && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              Se guardará el componente seleccionado en el editor como sección reutilizable.
            </p>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                placeholder={saveSource === 'selection' ? 'Ej: Hero principal' : 'Ej: Template newsletter'}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={saveCategory} onValueChange={setSaveCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAVE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
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
                'Guardar'
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar esta sección?</DialogTitle>
            <DialogDescription className="sr-only">
              Confirmar eliminación del bloque
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            &quot;{deleteTarget?.name}&quot; será eliminado permanentemente.
          </p>
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
                'Eliminar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
