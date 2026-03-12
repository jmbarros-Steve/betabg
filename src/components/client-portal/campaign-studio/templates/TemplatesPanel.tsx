import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { BrandIdentity } from '../templates/BrandHtmlGenerator';
import EmailBlockEditor from '../../email-blocks/EmailBlockEditor';
import { type EmailBlock, createBlock } from '../../email-blocks/blockTypes';
import { renderBlockToHtml } from '../../email-blocks/blockRenderer';
import ImportKlaviyoDialog from './ImportKlaviyoDialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Pencil, Copy, Trash2, LayoutTemplate, Loader2, Search,
  MoreVertical, Star, X, Save, Download,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplatesPanelProps {
  clientId: string;
  brand: BrandIdentity;
}

interface TemplateRow {
  id: string;
  client_id: string;
  name: string;
  content_blocks: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  button_color: string | null;
  button_text_color: string | null;
  logo_url: string | null;
  font_family: string | null;
  is_default: boolean | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffDay > 30) {
    const months = Math.floor(diffDay / 30);
    return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
  if (diffDay > 0) return `hace ${diffDay} ${diffDay === 1 ? 'día' : 'días'}`;
  if (diffHr > 0) return `hace ${diffHr} ${diffHr === 1 ? 'hora' : 'horas'}`;
  if (diffMin > 0) return `hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
  return 'justo ahora';
}

function parseBlocks(raw: string | null): EmailBlock[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultBlocks(): EmailBlock[] {
  return [
    createBlock('header_bar'),
    createBlock('image'),
    createBlock('text'),
    createBlock('button'),
    createBlock('divider'),
    createBlock('social_links'),
  ];
}

// ---------------------------------------------------------------------------
// Mini preview: renders the first few blocks as tiny HTML
// ---------------------------------------------------------------------------

function TemplateThumbnail({
  blocks,
  templateColors,
}: {
  blocks: EmailBlock[];
  templateColors: {
    primary: string;
    secondary: string;
    accent: string;
    button: string;
    buttonText: string;
    font: string;
  };
}) {
  const previewBlocks = blocks.slice(0, 3);
  const html = previewBlocks.map((b) => renderBlockToHtml(b, templateColors)).join('');

  return (
    <div
      className="w-full h-[120px] overflow-hidden rounded-md border bg-white pointer-events-none select-none"
      style={{ fontSize: '6px', lineHeight: 1.2 }}
    >
      <div
        className="origin-top-left"
        style={{ transform: 'scale(0.45)', transformOrigin: 'top left', width: '222%' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TemplatesPanel({ clientId, brand }: TemplatesPanelProps) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [klaviyoConnectionId, setKlaviyoConnectionId] = useState<string | null>(null);

  // Derive template colors from brand
  const templateColors = useMemo(
    () => ({
      primary: brand.colors.primary,
      secondary: brand.colors.secondaryBg,
      accent: brand.colors.accent,
      button: brand.colors.accent,
      buttonText: '#ffffff',
      font: `'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}`,
    }),
    [brand],
  );

  // -----------------------------------------------------------------------
  // Fetch templates
  // -----------------------------------------------------------------------

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTemplates((data as TemplateRow[]) || []);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      toast.error('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Check for active Klaviyo connection
  useEffect(() => {
    supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'klaviyo')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setKlaviyoConnectionId(data.id);
      });
  }, [clientId]);

  // -----------------------------------------------------------------------
  // CRUD: Create / Update
  // -----------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!templateName.trim()) {
      toast.error('Escribe un nombre para la plantilla');
      return;
    }
    setSaving(true);
    try {
      if (editingTemplate) {
        // Update
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: templateName.trim(),
            content_blocks: JSON.stringify(blocks),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Plantilla actualizada');
      } else {
        // Create
        const { error } = await supabase.from('email_templates').insert({
          client_id: clientId,
          name: templateName.trim(),
          content_blocks: JSON.stringify(blocks),
          primary_color: brand.colors.primary,
          secondary_color: brand.colors.secondaryBg,
          accent_color: brand.colors.accent,
          button_color: brand.colors.accent,
          button_text_color: '#ffffff',
          logo_url: brand.logoUrl || null,
          font_family: JSON.stringify(brand.fonts),
          is_default: false,
        });

        if (error) throw error;
        toast.success('Plantilla creada');
      }
      setEditorOpen(false);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      console.error('Error saving template:', err);
      toast.error('Error al guardar la plantilla');
    } finally {
      setSaving(false);
    }
  }, [editingTemplate, templateName, blocks, clientId, brand, fetchTemplates]);

  // -----------------------------------------------------------------------
  // CRUD: Duplicate
  // -----------------------------------------------------------------------

  const handleDuplicate = useCallback(
    async (template: TemplateRow) => {
      try {
        const { error } = await supabase.from('email_templates').insert({
          client_id: clientId,
          name: `${template.name} (copia)`,
          content_blocks: template.content_blocks,
          primary_color: template.primary_color,
          secondary_color: template.secondary_color,
          accent_color: template.accent_color,
          button_color: template.button_color,
          button_text_color: template.button_text_color,
          logo_url: template.logo_url,
          font_family: template.font_family,
          is_default: false,
        });

        if (error) throw error;
        toast.success('Plantilla duplicada');
        fetchTemplates();
      } catch (err: any) {
        console.error('Error duplicating template:', err);
        toast.error('Error al duplicar la plantilla');
      }
    },
    [clientId, fetchTemplates],
  );

  // -----------------------------------------------------------------------
  // CRUD: Delete
  // -----------------------------------------------------------------------

  const handleDelete = useCallback(
    async (templateId: string) => {
      try {
        const { error } = await supabase
          .from('email_templates')
          .delete()
          .eq('id', templateId);

        if (error) throw error;
        toast.success('Plantilla eliminada');
        setDeleteConfirm(null);
        fetchTemplates();
      } catch (err: any) {
        console.error('Error deleting template:', err);
        toast.error('Error al eliminar la plantilla');
      }
    },
    [fetchTemplates],
  );

  // -----------------------------------------------------------------------
  // CRUD: Set as Principal
  // -----------------------------------------------------------------------

  const handleSetPrincipal = useCallback(
    async (templateId: string) => {
      try {
        // Unset all other defaults for this client
        const { error: unsetError } = await supabase
          .from('email_templates')
          .update({ is_default: false })
          .eq('client_id', clientId);

        if (unsetError) throw unsetError;

        // Set this one as default
        const { error: setError } = await supabase
          .from('email_templates')
          .update({ is_default: true })
          .eq('id', templateId);

        if (setError) throw setError;
        toast.success('Plantilla marcada como principal');
        fetchTemplates();
      } catch (err: any) {
        console.error('Error setting principal:', err);
        toast.error('Error al marcar como principal');
      }
    },
    [clientId, fetchTemplates],
  );

  // -----------------------------------------------------------------------
  // Open editor
  // -----------------------------------------------------------------------

  const openNewTemplate = useCallback(() => {
    setEditingTemplate(null);
    setTemplateName('Nueva plantilla');
    setBlocks(defaultBlocks());
    setEditorOpen(true);
  }, []);

  const openEditTemplate = useCallback((template: TemplateRow) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setBlocks(parseBlocks(template.content_blocks));
    setEditorOpen(true);
  }, []);

  // -----------------------------------------------------------------------
  // Filtered list
  // -----------------------------------------------------------------------

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, searchQuery]);

  // -----------------------------------------------------------------------
  // Render: loading skeleton
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Plantillas</h2>
              <p className="text-sm text-muted-foreground">Cargando...</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-[120px] w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: main view
  // -----------------------------------------------------------------------

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Plantillas</h2>
              <p className="text-sm text-muted-foreground">
                Crea y administra las plantillas de email de tu marca
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {klaviyoConnectionId && (
              <Button
                variant="outline"
                onClick={() => setShowImportDialog(true)}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Importar desde Klaviyo
              </Button>
            )}
            <Button onClick={openNewTemplate} className="gap-2">
              <Plus className="w-4 h-4" />
              Nueva plantilla
            </Button>
          </div>
        </div>

        {/* Search */}
        {templates.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar plantillas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Empty state */}
        {templates.length === 0 && (
          <Card className="p-12 text-center">
            <LayoutTemplate className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">No tienes plantillas aún</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Crea tu primera plantilla para empezar.
            </p>
            <Button onClick={openNewTemplate} className="gap-2">
              <Plus className="w-4 h-4" />
              Crear plantilla
            </Button>
          </Card>
        )}

        {/* No search results */}
        {templates.length > 0 && filteredTemplates.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm">No se encontraron plantillas para "{searchQuery}"</p>
          </div>
        )}

        {/* Template grid */}
        {filteredTemplates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => {
              const tBlocks = parseBlocks(template.content_blocks);
              return (
                <Card
                  key={template.id}
                  className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
                  onClick={() => openEditTemplate(template)}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Thumbnail preview */}
                    <TemplateThumbnail blocks={tBlocks} templateColors={templateColors} />

                    {/* Name + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm truncate">{template.name}</h4>
                          {template.is_default && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
                              <Star className="w-3 h-3 mr-0.5" />
                              Principal
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {relativeTime(template.updated_at)}
                        </p>
                      </div>

                      {/* Actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => openEditTemplate(template)}
                            className="gap-2"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(template)}
                            className="gap-2"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicar
                          </DropdownMenuItem>
                          {!template.is_default && (
                            <DropdownMenuItem
                              onClick={() => handleSetPrincipal(template.id)}
                              className="gap-2"
                            >
                              <Star className="w-3.5 h-3.5" />
                              Marcar como principal
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirm(template.id)}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Editor Dialog (near-fullscreen)                                    */}
      {/* ================================================================= */}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 gap-0 flex flex-col overflow-hidden"
          // Hide the default close button; we provide our own in the header
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Editor header */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <LayoutTemplate className="w-5 h-5 text-primary shrink-0" />
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="max-w-xs h-8 text-sm font-medium border-dashed"
                placeholder="Nombre de la plantilla"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditorOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Editor body */}
          <div className="flex-1 overflow-hidden">
            <EmailBlockEditor
              blocks={blocks}
              onChange={setBlocks}
              templateColors={templateColors}
              clientId={clientId}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Delete confirmation                                                */}
      {/* ================================================================= */}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plantilla</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La plantilla será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================= */}
      {/* Import from Klaviyo Dialog                                         */}
      {/* ================================================================= */}

      {klaviyoConnectionId && (
        <ImportKlaviyoDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          connectionId={klaviyoConnectionId}
          clientId={clientId}
          brand={brand}
          onImported={fetchTemplates}
        />
      )}
    </>
  );
}
