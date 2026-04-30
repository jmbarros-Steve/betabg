import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Rocket, MessageSquare, Save, X, Eye, Loader2, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { CreativeImagePicker } from '@/components/client-portal/CreativeImagePicker';

interface Draft {
  id: string;
  client_id: string;
  name: string;
  status: 'draft' | 'published' | 'rejected' | 'archived';
  spec: any;
  meta_campaign_id: string | null;
  notes: string | null;
  created_at: string;
  published_at: string | null;
}

export default function CampaignDraftReview() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  useAuth();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  async function loadDraft() {
    setLoading(true);
    try {
      const { data, error } = await callApi('meta-draft', {
        body: { action: 'get', draft_id: draftId },
      });
      if (error || !data?.draft) {
        toast.error('No pudimos cargar el draft. ¿Estás autenticado y eres dueño del cliente?');
        return;
      }
      setDraft(data.draft);
      // Try to fetch preview (best-effort)
      callApi('meta-draft', { body: { action: 'preview', draft_id: draftId } })
        .then(({ data: pData }) => {
          const previews = pData?.previews || [];
          if (previews.length > 0 && previews[0].body) {
            // Meta returns iframe HTML, we extract the src
            const m = String(previews[0].body).match(/src="([^"]+)"/);
            if (m) setPreviewUrl(m[1]);
          }
        })
        .catch(() => { /* preview is optional */ });
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }

  async function applyChange(changes: any) {
    if (!draft) return;
    setSaving(true);
    try {
      const { data, error } = await callApi('meta-draft', {
        body: { action: 'update', draft_id: draft.id, changes },
      });
      if (error || !data?.draft) {
        toast.error('No se pudo guardar el cambio.');
        return;
      }
      setDraft(data.draft);
      toast.success('Cambio guardado.');
      setEditingField(null);
    } catch (err: any) {
      toast.error('Error guardando: ' + (err?.message || 'unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function publishToMeta() {
    if (!draft) return;
    if (!confirm('¿Subir esta campaña a Meta como BORRADOR (status PAUSED)? Quedará creada pero NO se activará todavía.')) return;
    setPublishing(true);
    try {
      const { data, error } = await callApi('meta-draft', {
        body: { action: 'publish', draft_id: draft.id },
      });
      if (error || !data?.ok) {
        const detail = (data as any)?.details || error?.message || data?.error || 'unknown';
        toast.error('Falló la publicación: ' + detail, { duration: 12000 });
        return;
      }
      toast.success(`Campaña creada en Meta (ID ${data.meta_campaign_id}) como BORRADOR. Para activarla entrá a Meta Ads Manager o vuelve a Steve y dile "activá la campaña".`);
      await loadDraft();
    } catch (err: any) {
      toast.error('Error publicando: ' + (err?.message || 'unknown'));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <p className="text-muted-foreground">Draft no encontrado o no autorizado.</p>
        <Button onClick={() => navigate('/portal')} className="mt-4">Volver al portal</Button>
      </div>
    );
  }

  const spec = draft.spec || {};
  const isPublished = draft.status === 'published';
  const isRejected = draft.status === 'rejected';

  function FieldRow({ label, fieldKey, value, format }: { label: string; fieldKey: string; value: any; format?: (v: any) => string }) {
    const display = format ? format(value) : (value ?? '—');
    const isEditing = editingField === fieldKey;
    return (
      <div className="flex items-start justify-between py-3 border-b last:border-b-0">
        <div className="flex-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
          {isEditing ? (
            <Input
              autoFocus
              defaultValue={typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}
              onChange={(e) => setEditValue(e.target.value)}
              className="mt-1"
            />
          ) : (
            <div className="mt-1 text-sm font-medium">{display}</div>
          )}
        </div>
        {!isPublished && !isRejected && (
          <div className="ml-4 flex gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="default" disabled={saving} onClick={() => {
                  // Build the patch based on fieldKey path (a.b.c)
                  const path = fieldKey.split('.');
                  const patch: any = {};
                  let cur = patch;
                  for (let i = 0; i < path.length - 1; i++) {
                    cur[path[i]] = {};
                    cur = cur[path[i]];
                  }
                  let v: any = editValue;
                  if (!isNaN(Number(v)) && v !== '') v = Number(v);
                  cur[path[path.length - 1]] = v;
                  applyChange(patch);
                }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingField(null); setEditValue(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => { setEditingField(fieldKey); setEditValue(value); }}>
                Editar
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <Badge variant={isPublished ? 'default' : isRejected ? 'destructive' : 'secondary'}>
          {isPublished ? '✓ Publicado en Meta (BORRADOR)' : isRejected ? '✗ Rechazado' : '◌ Borrador en Steve'}
        </Badge>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{draft.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Revisá la spec antes de subirla a Meta. Podés editar inline cualquier campo, o volver al chat con Steve para pedir cambios más grandes.
        </p>
      </div>

      {isPublished && draft.meta_campaign_id && (
        <Card className="mb-6 border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Campaña creada en Meta</p>
                <p className="text-sm text-muted-foreground mt-1">
                  ID Meta: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{draft.meta_campaign_id}</code> · Status: <strong>PAUSED</strong> (no está gastando)
                </p>
                <p className="text-sm mt-2">
                  Para activarla volvé al chat de estrategia y decile a Steve <em>"activá la campaña"</em>, o entrá directamente a Meta Ads Manager.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Configuración de la campaña</CardTitle>
            <CardDescription>Hacé click en Editar al lado de cualquier campo para cambiarlo.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldRow label="Nombre" fieldKey="name" value={draft.name} />
            <FieldRow label="Objetivo" fieldKey="objective" value={spec.objective} />
            <FieldRow
              label="Presupuesto"
              fieldKey="budget.amount_clp"
              value={spec.budget?.amount_clp}
              format={(v) => v ? `$${Number(v).toLocaleString('es-CL')} CLP (${spec.budget?.type || 'daily'})` : '—'}
            />
            <FieldRow
              label="Inicio"
              fieldKey="schedule.start"
              value={spec.schedule?.start}
              format={(v) => v ? new Date(v).toLocaleDateString('es-CL') : 'Inmediato'}
            />
            <FieldRow
              label="Fin"
              fieldKey="schedule.end"
              value={spec.schedule?.end}
              format={(v) => v ? new Date(v).toLocaleDateString('es-CL') : 'Sin fecha de fin'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audiencia</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldRow label="Edad mín." fieldKey="audience.age_min" value={spec.audience?.age_min} />
            <FieldRow label="Edad máx." fieldKey="audience.age_max" value={spec.audience?.age_max} />
            <FieldRow label="Género" fieldKey="audience.gender" value={spec.audience?.gender || 'all'} />
            <FieldRow
              label="Países"
              fieldKey="audience.geo.countries"
              value={spec.audience?.geo?.countries}
              format={(v) => Array.isArray(v) ? v.join(', ') : '—'}
            />
            <FieldRow
              label="Intereses"
              fieldKey="audience.interests"
              value={spec.audience?.interests}
              format={(v) => Array.isArray(v) ? `${v.length} intereses` : '—'}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Creativo</CardTitle>
          <CardDescription>Lo que verá el usuario en su feed.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldRow label="Tipo" fieldKey="creative.type" value={spec.creative?.type} />
          <FieldRow label="Headline" fieldKey="creative.headline" value={spec.creative?.headline} />
          <FieldRow label="Body" fieldKey="creative.body" value={spec.creative?.body} />
          <FieldRow label="Call to action" fieldKey="creative.cta" value={spec.creative?.cta} />
          <FieldRow label="URL destino" fieldKey="creative.destination_url" value={spec.creative?.destination_url} />
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Imagen del ad</Label>
              {!isPublished && !isRejected && (
                <Button size="sm" variant="outline" onClick={() => setImagePickerOpen(true)}>
                  <ImageIcon className="h-4 w-4 mr-1" /> {spec.creative?.image_url && !String(spec.creative.image_url).startsWith('PENDIENTE') ? 'Cambiar imagen' : 'Elegir imagen'}
                </Button>
              )}
            </div>
            {spec.creative?.image_url && !String(spec.creative.image_url).startsWith('PENDIENTE') ? (
              <img src={spec.creative.image_url} alt="creative" className="max-h-64 rounded border" />
            ) : (
              <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/30">
                <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Sin imagen aún</p>
                <p className="mt-1 text-xs text-muted-foreground">Hacé click en "Elegir imagen" para subir, usar del catálogo, o pegar URL.</p>
              </div>
            )}
          </div>
          {previewUrl && (
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview oficial Meta</Label>
              <iframe src={previewUrl} className="mt-2 w-full h-96 border rounded" title="Meta Preview" />
            </div>
          )}
        </CardContent>
      </Card>

      {draft.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea readOnly value={draft.notes} className="bg-muted" rows={3} />
          </CardContent>
        </Card>
      )}

      {/* Image Picker Modal */}
      <CreativeImagePicker
        clientId={draft.client_id}
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        onPick={(url) => {
          applyChange({ creative: { ...spec.creative, image_url: url } });
        }}
      />

      {!isPublished && !isRejected && (
        <div className="sticky bottom-4 bg-background/95 backdrop-blur p-4 border rounded-lg shadow-lg flex flex-col sm:flex-row gap-2 justify-end">
          <Button asChild variant="outline">
            <Link to={`/portal/${draft.client_id}?tab=estrategia`}>
              <MessageSquare className="h-4 w-4 mr-1" /> Pedirle cambios a Steve
            </Link>
          </Button>
          <Button onClick={publishToMeta} disabled={publishing} className="bg-green-600 hover:bg-green-700">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Rocket className="h-4 w-4 mr-1" />}
            Aprobar y subir a Meta como borrador
          </Button>
        </div>
      )}
    </div>
  );
}
