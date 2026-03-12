import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import type { BrandIdentity } from './BrandHtmlGenerator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Loader2, Check, X, FileCode } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KlaviyoTemplate {
  id: string;
  name: string;
  html: string;
  hasHtml: boolean;
  htmlLength: number;
  created: string;
  updated: string;
  extractedColors: string[];
}

interface ImportKlaviyoDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  clientId: string;
  brand: BrandIdentity;
  onImported: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '--';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportKlaviyoDialog({
  open,
  onClose,
  connectionId,
  clientId,
  brand,
  onImported,
}: ImportKlaviyoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<KlaviyoTemplate[]>([]);
  const [totalInKlaviyo, setTotalInKlaviyo] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // -----------------------------------------------------------------------
  // Fetch templates from Klaviyo on open
  // -----------------------------------------------------------------------

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setTemplates([]);
    setSelected(new Set());
    setPreviewId(null);

    try {
      const { data, error } = await callApi('import-klaviyo-templates', {
        body: { connectionId },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      const fetched: KlaviyoTemplate[] = data?.templates || [];
      setTemplates(fetched);
      setTotalInKlaviyo(data?.total_in_klaviyo || 0);

      if (fetched.length === 0) {
        setFetchError('No se encontraron plantillas en Klaviyo.');
      }
    } catch (err: any) {
      // Error handled by state below
      setFetchError(err.message || 'Error al conectar con Klaviyo');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    } else {
      // Reset state when dialog closes
      setTemplates([]);
      setSelected(new Set());
      setPreviewId(null);
      setFetchError(null);
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  }, [open, fetchTemplates]);

  // -----------------------------------------------------------------------
  // Selection helpers
  // -----------------------------------------------------------------------

  const templatesWithHtml = templates.filter((t) => t.hasHtml);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === templatesWithHtml.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(templatesWithHtml.map((t) => t.id)));
    }
  };

  const allSelected = templatesWithHtml.length > 0 && selected.size === templatesWithHtml.length;
  const someSelected = selected.size > 0 && selected.size < templatesWithHtml.length;

  // -----------------------------------------------------------------------
  // Preview
  // -----------------------------------------------------------------------

  const previewTemplate = templates.find((t) => t.id === previewId);

  useEffect(() => {
    if (previewTemplate && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewTemplate.html);
        doc.close();
      }
    }
  }, [previewTemplate]);

  // -----------------------------------------------------------------------
  // Import selected templates
  // -----------------------------------------------------------------------

  const handleImport = useCallback(async () => {
    const toImport = templates.filter((t) => selected.has(t.id) && t.hasHtml);
    if (toImport.length === 0) {
      toast.error('Selecciona al menos una plantilla con HTML');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: toImport.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const template = toImport[i];
      setImportProgress({ current: i + 1, total: toImport.length });

      try {
        const contentBlocks = JSON.stringify([
          {
            id: crypto.randomUUID(),
            type: 'html',
            props: { code: template.html },
          },
        ]);

        const { error } = await supabase.from('email_templates').insert({
          client_id: clientId,
          name: template.name,
          content_blocks: contentBlocks,
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
        successCount++;
      } catch {
        failCount++;
      }
    }

    setImporting(false);

    if (failCount === 0) {
      toast.success(`${successCount} plantilla${successCount > 1 ? 's' : ''} importada${successCount > 1 ? 's' : ''} correctamente`);
    } else {
      toast.warning(`${successCount} importada${successCount > 1 ? 's' : ''}, ${failCount} con error`);
    }

    onImported();
    onClose();
  }, [templates, selected, clientId, brand, onImported, onClose]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !importing && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
        onInteractOutside={(e) => importing && e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary" />
              <div>
                <DialogTitle className="text-lg">Importar plantillas de Klaviyo</DialogTitle>
                {!loading && templates.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Mostrando {templates.length} de {totalInKlaviyo} plantillas (más recientes)
                  </p>
                )}
              </div>
            </div>
            {!importing && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* ---- Loading state ---- */}
          {loading && (
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Conectando con Klaviyo y obteniendo plantillas...</span>
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                  <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          )}

          {/* ---- Error state ---- */}
          {!loading && fetchError && templates.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <X className="w-10 h-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-2">No se pudieron cargar las plantillas</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">{fetchError}</p>
              <Button variant="outline" onClick={fetchTemplates} className="gap-2">
                <Loader2 className="w-4 h-4" />
                Reintentar
              </Button>
            </div>
          )}

          {/* ---- Template list + preview ---- */}
          {!loading && templates.length > 0 && (
            <>
              {/* Left: template list */}
              <div className={`flex flex-col ${previewId ? 'w-1/2' : 'w-full'} border-r transition-all`}>
                {/* Select all bar */}
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAll}
                    disabled={importing || templatesWithHtml.length === 0}
                  />
                  <span className="text-sm font-medium">
                    Seleccionar todos ({templatesWithHtml.length})
                  </span>
                  {selected.size > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {selected.size} seleccionada{selected.size > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {/* Template rows */}
                <ScrollArea className="flex-1">
                  <div className="divide-y">
                    {templates.map((template) => {
                      const isSelected = selected.has(template.id);
                      const isPreviewing = previewId === template.id;

                      return (
                        <div
                          key={template.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                            isPreviewing ? 'bg-muted/60 ring-1 ring-inset ring-primary/20' : ''
                          } ${!template.hasHtml ? 'opacity-50' : ''}`}
                          onClick={() => template.hasHtml && setPreviewId(isPreviewing ? null : template.id)}
                        >
                          {/* Checkbox */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(template.id)}
                              disabled={!template.hasHtml || importing}
                            />
                          </div>

                          {/* Icon */}
                          <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />

                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{template.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(template.updated || template.created)}
                            </p>
                          </div>

                          {/* Size badge */}
                          <Badge
                            variant={template.hasHtml ? 'secondary' : 'outline'}
                            className="text-xs shrink-0"
                          >
                            {template.hasHtml ? formatBytes(template.htmlLength) : 'Sin HTML'}
                          </Badge>

                          {/* Color swatches */}
                          {template.extractedColors.length > 0 && (
                            <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                              {template.extractedColors.slice(0, 5).map((color, idx) => (
                                <div
                                  key={idx}
                                  className="w-3 h-3 rounded-full border border-border"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: preview panel */}
              {previewId && previewTemplate && (
                <div className="w-1/2 flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{previewTemplate.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setPreviewId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex-1 bg-white">
                    <iframe
                      ref={iframeRef}
                      title="Vista previa"
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && templates.length > 0 && (
          <div className="px-6 py-4 border-t bg-muted/20 shrink-0">
            {importing ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Importando plantillas...
                  </span>
                  <span className="font-medium">
                    {importProgress.current}/{importProgress.total} importadas
                  </span>
                </div>
                <Progress
                  value={
                    importProgress.total > 0
                      ? (importProgress.current / importProgress.total) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selected.size > 0
                    ? `${selected.size} plantilla${selected.size > 1 ? 's' : ''} seleccionada${selected.size > 1 ? 's' : ''}`
                    : 'Selecciona las plantillas que deseas importar'}
                </p>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={selected.size === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Importar seleccionados ({selected.size})
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
