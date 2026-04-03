import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, Plus, Copy, ExternalLink, ToggleLeft, ToggleRight,
  Trash2, Eye, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface WebForm {
  id: string;
  form_name: string;
  fields: any[];
  is_active: boolean;
  notify_whatsapp: boolean;
  auto_create_prospect: boolean;
  created_at: string;
  web_form_submissions: { count: number }[];
}

interface Submission {
  id: string;
  data: Record<string, any>;
  prospect_id: string | null;
  created_at: string;
  ip_address: string;
}

export function WebFormsPanel() {
  const [forms, setForms] = useState<WebForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newFormName, setNewFormName] = useState('');

  // Submissions modal
  const [selectedForm, setSelectedForm] = useState<WebForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const fetchForms = useCallback(async () => {
    try {
      const { data, error } = await callApi('crm/web-forms', { body: { action: 'list' } });
      if (error) throw new Error(error);
      setForms(data?.forms || []);
    } catch (err: any) {
      toast.error(err.message || 'Error cargando formularios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const handleCreate = async () => {
    if (!newFormName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await callApi('crm/web-forms', {
        body: { action: 'create', form_name: newFormName },
      });
      if (error) throw new Error(error);
      toast.success('Formulario creado');
      setNewFormName('');
      fetchForms();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (formId: string, isActive: boolean) => {
    try {
      const { error } = await callApi('crm/web-forms', {
        body: { action: 'update', form_id: formId, is_active: !isActive },
      });
      if (error) throw new Error(error);
      setForms((prev) =>
        prev.map((f) => (f.id === formId ? { ...f, is_active: !isActive } : f))
      );
      toast.success(isActive ? 'Desactivado' : 'Activado');
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const handleDelete = async (formId: string) => {
    if (!confirm('Eliminar formulario y todas sus submissions?')) return;
    try {
      const { error } = await callApi('crm/web-forms', {
        body: { action: 'delete', form_id: formId },
      });
      if (error) throw new Error(error);
      setForms((prev) => prev.filter((f) => f.id !== formId));
      toast.success('Eliminado');
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  const handleViewSubmissions = async (form: WebForm) => {
    setSelectedForm(form);
    setLoadingSubs(true);
    try {
      const { data, error } = await callApi('crm/web-forms', {
        body: { action: 'get', form_id: form.id },
      });
      if (error) throw new Error(error);
      setSubmissions(data?.submissions || []);
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setLoadingSubs(false);
    }
  };

  const getFormUrl = (formId: string) => {
    return `${window.location.origin}/formulario/${formId}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const getEmbedCode = (formId: string) => {
    const url = getFormUrl(formId);
    return `<iframe src="${url}" width="100%" height="500" frameborder="0" style="border:none;border-radius:12px;"></iframe>`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#1E3A7B]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">Formularios Web</h2>
      </div>

      {/* Create form */}
      <div className="flex gap-2">
        <Input
          placeholder="Nombre del formulario..."
          value={newFormName}
          onChange={(e) => setNewFormName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="max-w-sm"
        />
        <Button
          onClick={handleCreate}
          disabled={creating || !newFormName.trim()}
          className="bg-[#1E3A7B] hover:bg-[#162d5e]"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Crear formulario
        </Button>
      </div>

      {/* Forms list */}
      {forms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">No hay formularios creados</p>
          <p className="text-xs text-slate-300 mt-1">Crea uno para empezar a capturar leads</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {forms.map((form) => {
            const subCount = form.web_form_submissions?.[0]?.count || 0;

            return (
              <div
                key={form.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-700 truncate">
                      {form.form_name}
                    </h3>
                    <Badge className={form.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}>
                      {form.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {subCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {subCount} submissions
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {getFormUrl(form.id)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(getFormUrl(form.id))}
                    title="Copiar link"
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(getEmbedCode(form.id))}
                    title="Copiar iframe"
                    className="h-8 w-8 p-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewSubmissions(form)}
                    title="Ver submissions"
                    className="h-8 w-8 p-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(form.id, form.is_active)}
                    title={form.is_active ? 'Desactivar' : 'Activar'}
                    className="h-8 w-8 p-0"
                  >
                    {form.is_active ? (
                      <ToggleRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-slate-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(form.id)}
                    title="Eliminar"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submissions modal */}
      {selectedForm && (
        <Dialog open={!!selectedForm} onOpenChange={(open) => !open && setSelectedForm(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Submissions — {selectedForm.form_name}</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              {loadingSubs ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : submissions.length === 0 ? (
                <p className="text-center text-slate-400 py-10">Sin submissions</p>
              ) : (
                <div className="space-y-3">
                  {submissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-slate-400">
                          {new Date(sub.created_at).toLocaleString('es-CL', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        {sub.prospect_id && (
                          <Badge variant="outline" className="text-[10px]">
                            Prospecto creado
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(sub.data).map(([key, val]) => (
                          <div key={key} className="text-xs">
                            <span className="text-slate-400">{key}:</span>{' '}
                            <span className="text-slate-700">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
