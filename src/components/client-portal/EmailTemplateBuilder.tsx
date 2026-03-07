import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Upload, ArrowLeft, Save, Palette, Type, Image, Code, Eye, LayoutGrid, Download, Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EmailBlockEditor from './email-blocks/EmailBlockEditor';
import type { EmailBlock } from './email-blocks/blockTypes';
import { renderBlockToHtml } from './email-blocks/blockRenderer';
import { format } from 'date-fns';

interface EmailTemplateBuilderProps {
  clientId: string;
}

interface EmailTemplate {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  button_color: string;
  button_text_color: string;
  font_family: string;
  logo_url: string | null;
  header_html: string | null;
  footer_html: string | null;
  assets: any[];
  base_html: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const FONT_OPTIONS = [
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Trebuchet MS, sans-serif',
  'Tahoma, sans-serif',
];

const DEFAULT_HEADER = (logoUrl: string | null, primaryColor: string) => `
<div style="background-color: ${primaryColor}; padding: 24px; text-align: center;">
  ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 60px; max-width: 200px;" />` : '<h1 style="color: #ffffff; margin: 0; font-size: 24px;">Tu Marca</h1>'}
</div>`;

const DEFAULT_FOOTER = (storeName: string) => `
<div style="background-color: #f5f5f5; padding: 24px; text-align: center; font-size: 12px; color: #666;">
  <p style="margin: 0 0 8px;">© 2026 ${storeName}</p>
  <p style="margin: 0 0 8px;"><a href="{% unsubscribe %}" style="color: #666;">Desuscribirse</a></p>
  <p style="margin: 0; color: #999;">Dirección de la empresa</p>
</div>`;

export default function EmailTemplateBuilder({ clientId }: EmailTemplateBuilderProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [klaviyoTemplates, setKlaviyoTemplates] = useState<any[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    primary_color: '#000000',
    secondary_color: '#ffffff',
    accent_color: '#4F46E5',
    button_color: '#000000',
    button_text_color: '#ffffff',
    font_family: 'Arial, sans-serif',
    logo_url: '' as string | null,
    header_html: '',
    footer_html: '',
    base_html: '' as string,
    assets: [] as { url: string; name: string }[],
    is_default: false,
  });
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);

  useEffect(() => { loadTemplates(); }, [clientId]);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) { toast.error('Error cargando templates'); console.error(error); }
    else setTemplates((data || []) as unknown as EmailTemplate[]);
    setLoading(false);
  };

  const startNew = () => {
    setForm({
      name: '', description: '', primary_color: '#000000', secondary_color: '#ffffff',
      accent_color: '#4F46E5', button_color: '#000000', button_text_color: '#ffffff',
      font_family: 'Arial, sans-serif', logo_url: null, header_html: '', footer_html: '',
      base_html: '', assets: [], is_default: false,
    });
    setEditing(null);
    setIsNew(true);
  };

  const startEdit = (t: EmailTemplate) => {
    setForm({
      name: t.name, description: t.description || '', primary_color: t.primary_color,
      secondary_color: t.secondary_color, accent_color: t.accent_color,
      button_color: t.button_color, button_text_color: t.button_text_color,
      font_family: t.font_family, logo_url: t.logo_url, header_html: t.header_html || '',
      footer_html: t.footer_html || '',
      base_html: t.base_html || '',
      assets: Array.isArray(t.assets) ? t.assets : [],
      is_default: t.is_default,
    });
    // Load existing content_blocks if available
    const existingBlocks = (t as any).content_blocks;
    if (Array.isArray(existingBlocks) && existingBlocks.length > 0) {
      setBlocks(existingBlocks);
    } else {
      setBlocks([]);
    }
    setEditing(t);
    setIsNew(true);
  };

  const convertToBlocks = async () => {
    if (!form.base_html) return;
    setConverting(true);
    try {
      const { data, error } = await callApi('parse-email-html', {
        body: { html: form.base_html },
      });
      if (error) { toast.error('Error al convertir plantilla'); console.error(error); return; }
      const parsed = data?.blocks || [];
      if (parsed.length === 0) { toast.error('No se pudieron extraer bloques'); return; }
      
      // Normalize blocks to match editor's expected types and prop names
      const VALID_TYPES = ['text','image','split','button','header_bar','drop_shadow','divider','social_links','spacer','product','coupon','table','review','video','html','columns','section'];
      const TYPE_MAP: Record<string, string> = {
        'header': 'html', 'footer': 'html', 'social': 'social_links',
        'heading': 'text', 'paragraph': 'text', 'cta': 'button',
        'separator': 'divider', 'gap': 'spacer', 'code': 'html',
      };
      
      const blocksWithIds = parsed.map((b: any) => {
        let type = (b.type || 'html').toLowerCase();
        if (!VALID_TYPES.includes(type)) {
          type = TYPE_MAP[type] || 'html';
        }
        
        const props = { ...(b.props || {}) };
        
        // Normalize prop names to match what the editor/renderer expects
        if (type === 'image') {
          if (props.url && !props.src) { props.src = props.url; delete props.url; }
        }
        if (type === 'html') {
          if (!props.code && props.content) { props.code = props.content; delete props.content; }
          if (!props.code) { props.code = '<!-- bloque -->'; }
        }
        if (type === 'social_links') {
          if (props.iconStyle === undefined) props.iconStyle = 'color';
          if (props.iconSize === undefined) props.iconSize = 'medium';
        }
        if (type === 'text') {
          if (!props.content) props.content = '<p></p>';
          if (!props.fontSize) props.fontSize = 14;
          if (!props.color) props.color = '#333333';
          if (!props.align) props.align = 'left';
        }
        if (type === 'button') {
          if (!props.text) props.text = 'Botón';
          if (!props.bgColor) props.bgColor = '#000000';
          if (!props.textColor) props.textColor = '#ffffff';
        }
        
        return {
          id: crypto.randomUUID(),
          type: type as any,
          props,
        };
      });
      
      setBlocks(blocksWithIds);
      
      // Save blocks to DB
      if (editing) {
        await supabase.from('email_templates')
          .update({ content_blocks: blocksWithIds } as any)
          .eq('id', editing.id);
      }
      
      toast.success(`✅ Plantilla convertida a ${blocksWithIds.length} bloques editables`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConverting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);

    const payload: any = {
      client_id: clientId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      accent_color: form.accent_color,
      button_color: form.button_color,
      button_text_color: form.button_text_color,
      font_family: form.font_family,
      logo_url: form.logo_url,
      header_html: form.header_html || null,
      footer_html: form.footer_html || null,
      base_html: form.base_html || null,
      assets: form.assets as any,
      is_default: form.is_default,
      content_blocks: blocks.length > 0 ? blocks : [],
    };

    // If setting as default, unset others
    if (form.is_default) {
      await supabase
        .from('email_templates')
        .update({ is_default: false } as any)
        .eq('client_id', clientId);
    }

    let error;
    if (editing) {
      ({ error } = await supabase.from('email_templates').update(payload as any).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('email_templates').insert(payload as any));
    }

    if (error) { toast.error('Error guardando template'); console.error(error); }
    else {
      toast.success(editing ? 'Template actualizado' : 'Template creado');
      setIsNew(false);
      setEditing(null);
      loadTemplates();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este template?')) return;
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) toast.error('Error eliminando');
    else { toast.success('Template eliminado'); loadTemplates(); }
  };

  const handleDuplicate = async (t: EmailTemplate) => {
    const payload = {
      client_id: clientId,
      name: `Copia de ${t.name}`,
      description: t.description,
      primary_color: t.primary_color,
      secondary_color: t.secondary_color,
      accent_color: t.accent_color,
      button_color: t.button_color,
      button_text_color: t.button_text_color,
      font_family: t.font_family,
      logo_url: t.logo_url,
      header_html: t.header_html,
      footer_html: t.footer_html,
      base_html: t.base_html,
      assets: t.assets as any,
      is_default: false,
    };
    const { error } = await supabase.from('email_templates').insert(payload as any);
    if (error) toast.error('Error duplicando');
    else { toast.success('Template duplicado'); loadTemplates(); }
  };

  const uploadLogo = async (file: File) => {
    const path = `${clientId}/logo-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('email-assets').upload(path, file, { upsert: true });
    if (error) { toast.error('Error subiendo logo'); return; }
    const { data } = supabase.storage.from('email-assets').getPublicUrl(path);
    setForm(prev => ({ ...prev, logo_url: data.publicUrl }));
    toast.success('Logo subido');
  };

  const uploadAsset = async (file: File) => {
    if (form.assets.length >= 20) { toast.error('Máximo 20 assets'); return; }
    const path = `${clientId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('email-assets').upload(path, file);
    if (error) { toast.error('Error subiendo asset'); return; }
    const { data } = supabase.storage.from('email-assets').getPublicUrl(path);
    setForm(prev => ({
      ...prev,
      assets: [...prev.assets, { url: data.publicUrl, name: file.name }],
    }));
    toast.success('Asset subido');
  };

  const removeAsset = (idx: number) => {
    setForm(prev => ({ ...prev, assets: prev.assets.filter((_, i) => i !== idx) }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copiada');
  };

  const [previewFullTemplate, setPreviewFullTemplate] = useState<any>(null);

  const loadKlaviyoTemplates = async () => {
    setImportLoading(true);
    setKlaviyoTemplates([]);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!conn) { toast.error('No hay conexión activa de Klaviyo'); setImportLoading(false); return; }
      const { data, error } = await callApi('import-klaviyo-templates', {
        body: { connectionId: conn.id },
      });
      if (error) { toast.error('Error cargando templates de Klaviyo'); return; }
      setKlaviyoTemplates(data?.templates || []);
      if ((data?.templates || []).length === 0) toast.info('No se encontraron templates en Klaviyo');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportLoading(false);
    }
  };

  const importKlaviyoTemplate = async (template: any) => {
    setImportingId(template.id);
    try {
      const colors = template.extractedColors || [];
      const payload = {
        client_id: clientId,
        name: `[Klaviyo] ${template.name}`,
        description: 'Importado desde Klaviyo',
        base_html: template.html,
        primary_color: colors[0] || '#000000',
        secondary_color: colors[1] || '#ffffff',
        accent_color: colors[2] || '#4F46E5',
        button_color: colors[3] || '#000000',
        button_text_color: colors[4] || '#ffffff',
      };
      const { error: insertErr } = await supabase.from('email_templates').insert(payload as any);
      if (insertErr) { toast.error('Error guardando template importado'); return; }
      toast.success(`✅ Template importado: ${template.name}`);
      setImportOpen(false);
      loadTemplates();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportingId(null);
    }
  };

  const previewHtml = generatePreview(form);

  // LIST VIEW
  if (!isNew) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Email Templates</h3>
          <div className="flex gap-2">
            <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (v) loadKlaviyoTemplates(); }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-1.5" /> Importar desde Klaviyo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>📥 Importar Template de Klaviyo (últimos 10)</DialogTitle></DialogHeader>
                {importLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Cargando templates con HTML completo... (puede tardar 5-10 seg)</p>
                  </div>
                ) : klaviyoTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No se encontraron templates en Klaviyo</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {klaviyoTemplates.map(t => (
                      <div key={t.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        {t.hasHtml ? (
                          <div
                            className="w-full h-[180px] bg-white cursor-pointer relative group"
                            onClick={() => setPreviewFullTemplate(t)}
                          >
                            <iframe
                              srcDoc={t.html}
                              className="w-[600px] h-[600px] origin-top-left pointer-events-none"
                              style={{ transform: 'scale(0.42)', transformOrigin: 'top left' }}
                              sandbox="allow-same-origin"
                              title={t.name}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-[180px] bg-muted flex items-center justify-center">
                            <Badge variant="secondary">Solo texto</Badge>
                          </div>
                        )}
                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{t.name}</p>
                              {t.created && <p className="text-[10px] text-muted-foreground">{format(new Date(t.created), 'dd/MM/yyyy HH:mm')}</p>}
                            </div>
                          </div>
                          {t.extractedColors?.length > 0 && (
                            <div className="flex gap-1">
                              {t.extractedColors.slice(0, 6).map((c: string, i: number) => (
                                <div key={i} className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: c }} title={c} />
                              ))}
                            </div>
                          )}
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={!t.hasHtml || importingId === t.id}
                            onClick={() => importKlaviyoTemplate(t)}
                          >
                            {importingId === t.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                            {t.hasHtml ? '📥 Usar este template' : 'No disponible (solo texto)'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
            {/* Full-size preview modal */}
            <Dialog open={!!previewFullTemplate} onOpenChange={v => { if (!v) setPreviewFullTemplate(null); }}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="p-4 pb-0">
                  <DialogTitle>👁️ {previewFullTemplate?.name}</DialogTitle>
                </DialogHeader>
                {previewFullTemplate?.html && (
                  <div className="bg-white">
                    <iframe
                      srcDoc={previewFullTemplate.html}
                      className="w-full border-0"
                      style={{ minHeight: '600px', height: '80vh' }}
                      sandbox="allow-same-origin"
                      title="Preview completo"
                    />
                  </div>
                )}
                <div className="p-4 pt-2 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviewFullTemplate(null)}>Cerrar</Button>
                  <Button size="sm" disabled={importingId === previewFullTemplate?.id} onClick={() => { importKlaviyoTemplate(previewFullTemplate); setPreviewFullTemplate(null); }}>
                    <Download className="w-3 h-3 mr-1" /> Importar este template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={startNew} size="sm">
              <Plus className="w-4 h-4 mr-1.5" /> Crear Template
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando templates...</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Palette className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay templates creados</p>
            <p className="text-xs mt-1">Crea uno para empezar a diseñar tus emails</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Colores</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => startEdit(t)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {[t.primary_color, t.secondary_color, t.accent_color, t.button_color, t.button_text_color].map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(t.created_at), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(t); }}>
                        ✏️
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDuplicate(t); }}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    );
  }

  // EDITOR VIEW
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setIsNew(false); setEditing(null); }}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <h3 className="text-lg font-semibold">{editing ? 'Editar Template' : 'Nuevo Template'}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* FORM — 60% */}
        <div className="lg:col-span-3 space-y-6">
          {/* Name & Description */}
          <div className="space-y-3">
            <div>
              <Label>Nombre del template *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Template Principal" />
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción breve" />
            </div>
          </div>

          {/* Colors */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Colores</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <ColorPicker label="Primario (títulos)" value={form.primary_color} onChange={v => setForm(p => ({ ...p, primary_color: v }))} />
              <ColorPicker label="Secundario (fondo)" value={form.secondary_color} onChange={v => setForm(p => ({ ...p, secondary_color: v }))} />
              <ColorPicker label="Acento (links)" value={form.accent_color} onChange={v => setForm(p => ({ ...p, accent_color: v }))} />
              <ColorPicker label="Botón (fondo)" value={form.button_color} onChange={v => setForm(p => ({ ...p, button_color: v }))} />
              <ColorPicker label="Botón (texto)" value={form.button_text_color} onChange={v => setForm(p => ({ ...p, button_text_color: v }))} />
            </div>
          </div>

          {/* Typography */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Tipografía</Label>
            </div>
            <Select value={form.font_family} onValueChange={v => setForm(p => ({ ...p, font_family: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => (
                  <SelectItem key={f} value={f}>
                    <span style={{ fontFamily: f }}>{f.split(',')[0]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Logo */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Logo</Label>
            </div>
            {form.logo_url && (
              <div className="mb-3 p-3 bg-muted rounded-lg inline-block">
                <img src={form.logo_url} alt="Logo" className="max-h-16 max-w-48 object-contain" />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" /> Subir Logo
            </Button>
          </div>

          {/* Assets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-muted-foreground" />
                <Label className="text-base font-semibold">Assets ({form.assets.length}/20)</Label>
              </div>
              <input ref={assetsInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => {
                if (e.target.files) Array.from(e.target.files).forEach(uploadAsset);
              }} />
              <Button variant="outline" size="sm" onClick={() => assetsInputRef.current?.click()} disabled={form.assets.length >= 20}>
                <Upload className="w-4 h-4 mr-1.5" /> Subir Assets
              </Button>
            </div>
            {form.assets.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {form.assets.map((a, i) => (
                  <div key={i} className="relative group border rounded-lg overflow-hidden">
                    <img src={a.url} alt={a.name} className="w-full h-20 object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white" onClick={() => copyToClipboard(a.url)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white" onClick={() => removeAsset(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate px-1 py-0.5">{a.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Convert to blocks button for imported templates */}
          {form.base_html && blocks.length === 0 && (
            <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center space-y-3 bg-primary/5">
              <Wand2 className="w-8 h-8 mx-auto text-primary" />
              <div>
                <p className="text-sm font-medium">Plantilla importada de Klaviyo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Convierte el HTML a bloques editables para usar el editor visual drag & drop
                </p>
              </div>
              <Button onClick={convertToBlocks} disabled={converting} className="w-full">
                {converting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Steve está analizando la plantilla...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-1.5" />
                    🤖 Convertir a bloques editables
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Reconvert banner when too many HTML blocks */}
          {blocks.length > 0 && form.base_html && (() => {
            const htmlCount = blocks.filter(b => b.type === 'html').length;
            return htmlCount / blocks.length > 0.4;
          })() && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  ⚠️ {blocks.filter(b => b.type === 'html').length} de {blocks.length} bloques son HTML crudo
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Reconvertir para mejor edición visual</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={convertToBlocks}
                disabled={converting}
                className="shrink-0 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
              >
                {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                🔄 Reconvertir
              </Button>
            </div>
          )}

          {/* Show raw HTML editor only if no blocks and user wants to edit manually */}
          {form.base_html && blocks.length === 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                📝 Editar HTML crudo (avanzado)
              </summary>
              <Textarea
                value={form.base_html}
                onChange={e => setForm(p => ({ ...p, base_html: e.target.value }))}
                placeholder="HTML de la plantilla..."
                rows={12}
                className="font-mono text-xs mt-2"
              />
            </details>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Header HTML</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Deja vacío para usar el default (logo centrado con fondo primario)</p>
            <Textarea
              value={form.header_html}
              onChange={e => setForm(p => ({ ...p, header_html: e.target.value }))}
              placeholder="<div style='...'>Tu header personalizado</div>"
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          {/* Footer HTML */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Footer HTML</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Deja vacío para usar el default con unsubscribe y dirección</p>
            <Textarea
              value={form.footer_html}
              onChange={e => setForm(p => ({ ...p, footer_html: e.target.value }))}
              placeholder="<div style='...'>Tu footer personalizado</div>"
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          {/* Default checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.is_default}
              onCheckedChange={v => setForm(p => ({ ...p, is_default: !!v }))}
            />
            <Label className="text-sm">Usar como template por defecto</Label>
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? 'Guardando...' : editing ? '💾 Actualizar Template' : '💾 Guardar Template'}
          </Button>
        </div>

        {/* PREVIEW — 40% */}
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Preview en vivo</Label>
            </div>
            <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
              {blocks.length > 0 ? (
                <div className="w-full">
                  {blocks.map(b => (
                    <div key={b.id} dangerouslySetInnerHTML={{ __html: renderBlockToHtml(b, {
                      primary: form.primary_color,
                      secondary: form.secondary_color,
                      accent: form.accent_color,
                      button: form.button_color,
                      buttonText: form.button_text_color,
                      font: form.font_family,
                    }) }} />
                  ))}
                </div>
              ) : form.base_html ? (
                <iframe
                  srcDoc={form.base_html}
                  className="w-full border-0"
                  style={{ minHeight: '500px' }}
                  sandbox="allow-same-origin"
                  title="Preview plantilla importada"
                />
              ) : (
                <div
                  className="w-full"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCK EDITOR */}
      <div className="mt-6 pt-6 border-t">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-4 h-4 text-muted-foreground" />
          <Label className="text-base font-semibold">Editor de Bloques</Label>
          <Badge variant="secondary" className="text-xs">Drag & Drop</Badge>
        </div>
        <EmailBlockEditor
          blocks={blocks}
          onChange={setBlocks}
          templateColors={{
            primary: form.primary_color,
            secondary: form.secondary_color,
            accent: form.accent_color,
            button: form.button_color,
            buttonText: form.button_text_color,
            font: form.font_family,
          }}
          assets={form.assets}
          clientId={clientId}
        />
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-border cursor-pointer p-0"
        />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-8 text-xs font-mono flex-1"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function generatePreview(form: {
  primary_color: string; secondary_color: string; accent_color: string;
  button_color: string; button_text_color: string; font_family: string;
  logo_url: string | null; header_html: string; footer_html: string;
}): string {
  const header = form.header_html.trim() || DEFAULT_HEADER(form.logo_url, form.primary_color);
  const footer = form.footer_html.trim() || DEFAULT_FOOTER('Tu Tienda');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color: ${form.secondary_color}; font-family: ${form.font_family};">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    ${header}
    <div style="padding: 32px 24px;">
      <h1 style="color: ${form.primary_color}; font-size: 22px; margin: 0 0 12px;">¡Hola! Este es un título de ejemplo</h1>
      <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
        Este es un párrafo de texto de ejemplo para tu email. Puedes ver cómo se verán los colores, 
        tipografía y estructura de tu template. 
        <a href="#" style="color: ${form.accent_color}; text-decoration: underline;">Este es un link de ejemplo</a>.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <img src="https://placehold.co/540x200/e2e8f0/64748b?text=Imagen+de+Ejemplo" alt="Placeholder" style="max-width: 100%; border-radius: 8px;" />
      </div>
      <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Otro párrafo de texto para mostrar la estructura completa del email y cómo se distribuye el contenido.
      </p>
      <div style="text-align: center;">
        <a href="#" style="display: inline-block; background-color: ${form.button_color}; color: ${form.button_text_color}; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Botón de Ejemplo
        </a>
      </div>
    </div>
    ${footer}
  </div>
</body>
</html>`;
}
