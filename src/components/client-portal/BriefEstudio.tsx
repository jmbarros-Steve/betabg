/**
 * BriefEstudio — Etapa 3
 *
 * UI de las secciones Elenco y Voz del Brief Estudio. Productos y Música
 * quedan como stubs "Próximamente" (Etapa 4).
 *
 * Endpoints usados:
 *   - GET  /api/brief-estudio/get?client_id=
 *   - POST /api/brief-estudio/save
 *   - GET  /api/brief-estudio/prefill-from-brief?client_id=
 *   - POST /api/brief-estudio/generate-actors  (Etapa 2 — fallback mock si 404)
 *   - POST /api/brief-estudio/clone-voice      (Etapa 2 — fallback mock si 404)
 *
 * Storage: bucket `client-assets`
 *   - brand-actors/{client_id}/{uuid}.jpg
 *   - brand-voices/{client_id}/{uuid}.webm|m4a
 */

import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Sparkles,
  Upload,
  RotateCcw,
  Trash2,
  Star,
  Music2,
  Package,
  Mic,
  Play,
  Pause,
  Square,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

// ─────────────────────────── Types (mirror backend) ──────────────────────────

interface BrandActor {
  id?: string;
  client_id?: string;
  source: 'ai_generated' | 'user_upload' | 'real_model';
  name: string | null;
  reference_images: string[];
  persona_tags: string[];
  is_primary: boolean;
  sort_order: number;
  // client-only slot key (kept stable across renders)
  _key?: string;
}

interface BrandVoice {
  id?: string;
  client_id?: string;
  source: 'xtts_cloned' | 'preset' | 'none';
  voice_id: string | null;
  sample_url: string | null;
  preset_key: string | null;
  is_primary: boolean;
}

interface PrefillSuggestions {
  suggested_persona_tags: string[];
  suggested_voice_tone: 'warm' | 'energetic' | 'neutral' | 'luxury';
  suggested_music_moods: string[];
}

interface VoicePreset {
  key: string;
  label: string;
  description: string;
  sample_url?: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  { key: 'warm_female_es', label: 'Femenina cálida', description: 'Cercana, emocional, buena para lifestyle.' },
  { key: 'energetic_male_es', label: 'Masculina enérgica', description: 'Dinámica, buena para retail y ofertas.' },
  { key: 'neutral_female_es', label: 'Femenina neutra', description: 'Profesional, buena para B2B y servicios.' },
  { key: 'luxury_male_es', label: 'Masculina premium', description: 'Elegante, buena para marcas aspiracionales.' },
];

const ACTOR_SLOT_LABELS = ['Actor principal', 'Actor casual', 'Actor editorial'];

const TONE_LABEL: Record<PrefillSuggestions['suggested_voice_tone'], string> = {
  warm: 'Cálido',
  energetic: 'Enérgico',
  neutral: 'Neutro',
  luxury: 'Premium',
};

// ─────────────────────────── Component ──────────────────────────────────────

interface BriefEstudioProps {
  clientId: string;
}

export default function BriefEstudio({ clientId }: BriefEstudioProps) {
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<BrandActor[]>([]);
  const [voice, setVoice] = useState<BrandVoice | null>(null);
  const [studioReady, setStudioReady] = useState(false);
  const [featuredCount, setFeaturedCount] = useState(0);
  const [hasMusic, setHasMusic] = useState(false);
  const [prefill, setPrefill] = useState<PrefillSuggestions | null>(null);
  const [prefillDismissed, setPrefillDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await callApi<{
        actors: BrandActor[];
        voice: BrandVoice | null;
        featured_products: unknown[];
        music: { moods?: string[] } | null;
        studio_ready: boolean;
      }>(`brief-estudio/get?client_id=${encodeURIComponent(clientId)}`, { method: 'GET' });

      if (cancelled) return;

      if (error) {
        toast.error(`No pudimos cargar tu estudio: ${error}`);
        setLoading(false);
        return;
      }

      if (data) {
        setActors(
          (data.actors ?? []).map((a, idx) => ({
            ...a,
            reference_images: a.reference_images ?? [],
            persona_tags: a.persona_tags ?? [],
            _key: a.id ?? `load-${idx}-${Date.now()}`,
          })),
        );
        setVoice(data.voice ?? null);
        setFeaturedCount(data.featured_products?.length ?? 0);
        setHasMusic(!!data.music && Array.isArray(data.music.moods) && data.music.moods.length > 0);
        setStudioReady(!!data.studio_ready);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Prefill suggestions (fire-and-forget)
  useEffect(() => {
    let cancelled = false;
    async function loadPrefill() {
      const { data } = await callApi<PrefillSuggestions>(
        `brief-estudio/prefill-from-brief?client_id=${encodeURIComponent(clientId)}`,
        { method: 'GET' },
      );
      if (cancelled) return;
      if (data) setPrefill(data);
    }
    loadPrefill();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Section completion flags
  const elencoComplete = actors.length > 0;
  const vozComplete = !!voice && voice.source !== 'none' && (
    voice.source === 'none' ||
    voice.source === 'preset' ? !!voice.preset_key :
    voice.source === 'xtts_cloned' ? !!voice.sample_url || !!voice.voice_id : false
  );
  // Voz especial: "sin voz" también cuenta como decidido
  const vozDecided = !!voice && (
    voice.source === 'none' ||
    (voice.source === 'preset' && !!voice.preset_key) ||
    (voice.source === 'xtts_cloned' && (!!voice.voice_id || !!voice.sample_url))
  );
  const productosComplete = featuredCount > 0;
  const musicaComplete = hasMusic;

  const completeCount = [elencoComplete, vozDecided, productosComplete, musicaComplete].filter(Boolean).length;

  // Save handlers — partial upserts
  async function persistActors(next: BrandActor[]) {
    setSaving(true);
    const { error } = await callApi('brief-estudio/save', {
      method: 'POST',
      body: {
        client_id: clientId,
        actors: next.map((a, idx) => ({
          source: a.source,
          name: a.name,
          reference_images: a.reference_images,
          persona_tags: a.persona_tags,
          is_primary: a.is_primary,
          sort_order: typeof a.sort_order === 'number' ? a.sort_order : idx,
        })),
      },
    });
    setSaving(false);
    if (error) {
      toast.error(`No pudimos guardar los actores: ${error}`);
      return false;
    }
    return true;
  }

  async function persistVoice(next: BrandVoice) {
    setSaving(true);
    const { data, error } = await callApi<{ studio_ready?: boolean }>('brief-estudio/save', {
      method: 'POST',
      body: {
        client_id: clientId,
        voice: {
          source: next.source,
          voice_id: next.voice_id,
          sample_url: next.sample_url,
          preset_key: next.preset_key,
          is_primary: true,
        },
      },
    });
    setSaving(false);
    if (error) {
      toast.error(`No pudimos guardar la voz: ${error}`);
      return false;
    }
    if (data?.studio_ready !== undefined) setStudioReady(!!data.studio_ready);
    return true;
  }

  async function handleActivateStudio() {
    // Re-trigger a save (empty) to force studio_ready recompute
    setSaving(true);
    const { data, error } = await callApi<{ studio_ready?: boolean }>('brief-estudio/save', {
      method: 'POST',
      body: { client_id: clientId },
    });
    setSaving(false);
    if (error) {
      toast.error(`No pudimos activar el estudio: ${error}`);
      return;
    }
    const ready = !!data?.studio_ready;
    setStudioReady(ready);
    if (ready) {
      toast.success('Modo Estudio activado');
    } else {
      toast.warning('Te faltan secciones para activar Modo Estudio');
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-6 space-y-6 sm:space-y-8 px-4 sm:px-0">
      <Header completeCount={completeCount} studioReady={studioReady} saving={saving} />

      {!prefillDismissed && (
        <BriefImportBanner
          prefill={prefill}
          onDismiss={() => setPrefillDismissed(true)}
        />
      )}

      <SectionElenco
        clientId={clientId}
        actors={actors}
        setActors={setActors}
        loading={loading}
        persistActors={persistActors}
        suggestedTags={prefill?.suggested_persona_tags ?? []}
      />

      <SectionVoz
        clientId={clientId}
        voice={voice}
        setVoice={setVoice}
        loading={loading}
        persistVoice={persistVoice}
        suggestedTone={prefill?.suggested_voice_tone ?? null}
      />

      <SectionProductosStub />
      <SectionMusicaStub />

      <SaveBar
        completeCount={completeCount}
        studioReady={studioReady}
        saving={saving}
        onActivate={handleActivateStudio}
      />
    </div>
  );
}

// ─────────────────────────── Header ─────────────────────────────────────────

function Header({
  completeCount,
  studioReady,
  saving,
}: {
  completeCount: number;
  studioReady: boolean;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Clapperboard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Brief Estudio</h1>
            <p className="text-sm text-slate-500">
              Arma tu elenco, voz, productos y música para crear creatividades con Steve.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {studioReady ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Modo Estudio activo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-slate-600">
              {completeCount}/4 secciones
            </Badge>
          )}
          {saving && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        </div>
      </div>
      <Progress value={(completeCount / 4) * 100} className="h-2" />
    </div>
  );
}

// ─────────────────────────── Prefill Banner ─────────────────────────────────

function BriefImportBanner({
  prefill,
  onDismiss,
}: {
  prefill: PrefillSuggestions | null;
  onDismiss: () => void;
}) {
  if (!prefill) return null;

  const hasSuggestions =
    prefill.suggested_persona_tags.length > 0 ||
    !!prefill.suggested_voice_tone ||
    prefill.suggested_music_moods.length > 0;

  if (!hasSuggestions) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-900">
            Completá tu brief primero para que autocompletemos sugerencias de voz y elenco.
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('steve:navigate-tab', { detail: { tab: 'steve' } }));
              }}
              className="ml-1 underline font-medium inline-flex items-center gap-1"
            >
              Ir al brief <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Cargamos datos de tu brief original
            </p>
            <ul className="text-sm text-amber-800 space-y-1">
              {prefill.suggested_voice_tone && (
                <li>
                  Tono sugerido para tu voz: <strong>{TONE_LABEL[prefill.suggested_voice_tone]}</strong>
                </li>
              )}
              {prefill.suggested_persona_tags.length > 0 && (
                <li className="break-words">
                  Tags del actor:{' '}
                  {prefill.suggested_persona_tags.map((t, i) => (
                    <span key={t} className="inline-block">
                      <code className="bg-white/70 rounded px-1.5 py-0.5 text-xs">{t}</code>
                      {i < prefill.suggested_persona_tags.length - 1 && ' '}
                    </span>
                  ))}
                </li>
              )}
              {prefill.suggested_music_moods.length > 0 && (
                <li>
                  Vibes musicales sugeridas:{' '}
                  <strong>{prefill.suggested_music_moods.join(', ')}</strong>
                </li>
              )}
            </ul>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Section: Elenco ────────────────────────────────

function SectionElenco({
  clientId,
  actors,
  setActors,
  loading,
  persistActors,
  suggestedTags,
}: {
  clientId: string;
  actors: BrandActor[];
  setActors: React.Dispatch<React.SetStateAction<BrandActor[]>>;
  loading: boolean;
  persistActors: (next: BrandActor[]) => Promise<boolean>;
  suggestedTags: string[];
}) {
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasAiActors = actors.some((a) => a.source === 'ai_generated');

  async function handleGenerate(regenerate: boolean) {
    if (regenerate && !window.confirm('Esto reemplazará tus actores actuales. ¿Continuar?')) {
      return;
    }
    setGenerating(true);

    // Try real endpoint first; fall back to mock if 404 (Etapa 2 pendiente)
    const { data, error } = await callApi<{ actors?: { url: string; name?: string; tags?: string[] }[] }>(
      'brief-estudio/generate-actors',
      {
        method: 'POST',
        body: { client_id: clientId, regenerate, persona_tags: suggestedTags },
        timeoutMs: 120000,
      },
    );

    let generated: { url: string; name?: string; tags?: string[] }[] = [];

    if (error) {
      // Fallback mock — Etapa 2 aún no desplegó el endpoint
      const isNotImplemented =
        /404|not found|not implemented|unknown endpoint|cannot\s+post/i.test(error);
      if (isNotImplemented) {
        console.warn('[BriefEstudio] generate-actors no disponible, usando mock:', error);
        generated = [
          { url: 'https://via.placeholder.com/400x500/9333EA/FFFFFF?text=Actor+1', name: 'Actor principal', tags: suggestedTags },
          { url: 'https://via.placeholder.com/400x500/2563EB/FFFFFF?text=Actor+2', name: 'Actor casual', tags: suggestedTags },
          { url: 'https://via.placeholder.com/400x500/DB2777/FFFFFF?text=Actor+3', name: 'Actor editorial', tags: suggestedTags },
        ];
        toast.info('Etapa 2 aún no despliega la generación real — mostramos placeholders.');
      } else {
        setGenerating(false);
        toast.error(`No pudimos generar actores: ${error}`);
        return;
      }
    } else if (data?.actors?.length) {
      generated = data.actors;
    } else {
      // Empty response fallback
      generated = [
        { url: 'https://via.placeholder.com/400x500/9333EA/FFFFFF?text=Actor+1' },
        { url: 'https://via.placeholder.com/400x500/2563EB/FFFFFF?text=Actor+2' },
        { url: 'https://via.placeholder.com/400x500/DB2777/FFFFFF?text=Actor+3' },
      ];
    }

    const next: BrandActor[] = generated.slice(0, 3).map((g, idx) => ({
      source: 'ai_generated',
      name: g.name ?? ACTOR_SLOT_LABELS[idx] ?? `Actor ${idx + 1}`,
      reference_images: [g.url],
      persona_tags: g.tags ?? suggestedTags,
      is_primary: idx === 0,
      sort_order: idx,
      _key: `gen-${Date.now()}-${idx}`,
    }));

    setActors(next);
    const ok = await persistActors(next);
    setGenerating(false);
    if (ok) toast.success('Elenco creado');
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // reset input so same file can be reselected
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo supera 10MB');
      return;
    }
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      toast.error('Sube una imagen JPG, PNG o WEBP');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `brand-actors/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('client-assets')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path);

      const newActor: BrandActor = {
        source: 'user_upload',
        name: 'Tu foto',
        reference_images: [urlData.publicUrl],
        persona_tags: [],
        is_primary: actors.length === 0,
        sort_order: actors.length,
        _key: `up-${Date.now()}`,
      };

      // Replace first empty slot, else append (max 4)
      const next = [...actors];
      const emptyIdx = next.findIndex((a) => !a.reference_images || a.reference_images.length === 0);
      if (emptyIdx >= 0) {
        next[emptyIdx] = { ...next[emptyIdx], ...newActor, sort_order: emptyIdx };
      } else if (next.length < 4) {
        next.push(newActor);
      } else {
        // replace the last one
        next[next.length - 1] = { ...newActor, sort_order: next.length - 1 };
      }

      setActors(next);
      const ok = await persistActors(next);
      if (ok) toast.success('Foto subida');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`No pudimos subir la foto: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  function handleTogglePrimary(idx: number) {
    const next = actors.map((a, i) => ({ ...a, is_primary: i === idx }));
    setActors(next);
    void persistActors(next);
  }

  function handleRename(idx: number, name: string) {
    const next = [...actors];
    next[idx] = { ...next[idx], name };
    setActors(next);
  }

  function handleRenameBlur() {
    void persistActors(actors);
  }

  function handleDelete(idx: number) {
    const next = actors.filter((_, i) => i !== idx);
    // Ensure at least one primary if any remain
    if (next.length > 0 && !next.some((a) => a.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    setActors(next);
    void persistActors(next);
  }

  // Render 3 slot cards — fill from actors[]
  const slots: (BrandActor | null)[] = [0, 1, 2].map((i) => actors[i] ?? null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">1</span>
              Elenco
            </CardTitle>
            <CardDescription>
              3 actores que van a protagonizar tus creatividades. Podés generarlos con IA o subir fotos reales.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || generating}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
              Subir foto
            </Button>
            {hasAiActors ? (
              <Button size="sm" variant="secondary" onClick={() => handleGenerate(true)} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                Regenerar
              </Button>
            ) : (
              <Button size="sm" onClick={() => handleGenerate(false)} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Generar 3 actores
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[4/5] rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : generating ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-slate-600">Creando tu elenco…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {slots.map((actor, idx) => (
              <ActorCard
                key={actor?._key ?? actor?.id ?? `slot-${idx}`}
                slotLabel={ACTOR_SLOT_LABELS[idx]}
                actor={actor}
                onTogglePrimary={() => handleTogglePrimary(idx)}
                onDelete={() => handleDelete(idx)}
                onRename={(name) => handleRename(idx, name)}
                onRenameBlur={handleRenameBlur}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActorCard({
  slotLabel,
  actor,
  onTogglePrimary,
  onDelete,
  onRename,
  onRenameBlur,
}: {
  slotLabel: string;
  actor: BrandActor | null;
  onTogglePrimary: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onRenameBlur: () => void;
}) {
  if (!actor) {
    return (
      <div className="aspect-[4/5] rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs text-center p-4">
        <Clapperboard className="w-8 h-8 mb-2 opacity-50" />
        <span className="font-medium text-slate-500">{slotLabel}</span>
        <span className="mt-1">Sin asignar</span>
      </div>
    );
  }

  const img = actor.reference_images?.[0];

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white flex flex-col">
      <div className="relative aspect-[4/5] bg-slate-100">
        {img ? (
          <img
            src={img}
            alt={actor.name ?? slotLabel}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <Clapperboard className="w-10 h-10" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            type="button"
            aria-label={actor.is_primary ? 'Actor principal' : 'Marcar como principal'}
            onClick={onTogglePrimary}
            className={`min-w-[44px] min-h-[44px] w-11 h-11 sm:w-9 sm:h-9 sm:min-w-0 sm:min-h-0 rounded-full flex items-center justify-center shadow-md transition-colors ${
              actor.is_primary ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-600 hover:bg-amber-50'
            }`}
          >
            <Star className={`w-4 h-4 ${actor.is_primary ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            aria-label="Eliminar actor"
            onClick={onDelete}
            className="min-w-[44px] min-h-[44px] w-11 h-11 sm:w-9 sm:h-9 sm:min-w-0 sm:min-h-0 rounded-full bg-white/90 text-slate-600 hover:bg-red-50 hover:text-red-600 flex items-center justify-center shadow-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute bottom-2 left-2">
          <Badge variant="secondary" className="text-xs">
            {actor.source === 'ai_generated' && 'IA'}
            {actor.source === 'user_upload' && 'Mi foto'}
            {actor.source === 'real_model' && 'Modelo'}
          </Badge>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <Input
          value={actor.name ?? ''}
          onChange={(e) => onRename(e.target.value)}
          onBlur={onRenameBlur}
          placeholder={slotLabel}
          className="h-9 text-sm"
        />
        {actor.persona_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {actor.persona_tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Section: Voz ───────────────────────────────────

type VoiceChoice = 'xtts_cloned' | 'preset' | 'none';

function SectionVoz({
  clientId,
  voice,
  setVoice,
  loading,
  persistVoice,
  suggestedTone,
}: {
  clientId: string;
  voice: BrandVoice | null;
  setVoice: React.Dispatch<React.SetStateAction<BrandVoice | null>>;
  loading: boolean;
  persistVoice: (next: BrandVoice) => Promise<boolean>;
  suggestedTone: PrefillSuggestions['suggested_voice_tone'] | null;
}) {
  const [choice, setChoice] = useState<VoiceChoice>(() => voice?.source ?? 'xtts_cloned');

  // sync radio when voice loads async
  useEffect(() => {
    if (voice?.source) setChoice(voice.source);
  }, [voice?.source]);

  async function handleChoiceChange(next: VoiceChoice) {
    setChoice(next);
    // For "none" we auto-save immediately. For the others, the sub-panel writes when the user confirms.
    if (next === 'none') {
      const nextVoice: BrandVoice = {
        source: 'none',
        voice_id: null,
        sample_url: null,
        preset_key: null,
        is_primary: true,
      };
      setVoice(nextVoice);
      await persistVoice(nextVoice);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">2</span>
          Voz
        </CardTitle>
        <CardDescription>
          La voz que va a usar Steve para locuciones de video y anuncios.
          {suggestedTone && (
            <>
              {' '}
              Sugerencia según tu brief: <strong>{TONE_LABEL[suggestedTone]}</strong>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
        ) : (
          <div className="space-y-4">
            <RadioGroup value={choice} onValueChange={(v) => handleChoiceChange(v as VoiceChoice)} className="gap-3">
              <VoiceOption
                value="xtts_cloned"
                checked={choice === 'xtts_cloned'}
                title="Clonar mi voz"
                subtitle="Recomendado — más auténtico, 30 segundos de grabación."
                badge="Recomendado"
              />
              <VoiceOption
                value="preset"
                checked={choice === 'preset'}
                title="Elegir voz pre-hecha"
                subtitle="Rápido — elegí entre 4 voces profesionales."
              />
              <VoiceOption
                value="none"
                checked={choice === 'none'}
                title="Sin voz"
                subtitle="Solo texto en pantalla + música. Nada de locución."
              />
            </RadioGroup>

            <div className="border-t border-slate-100 pt-4">
              {choice === 'xtts_cloned' && (
                <VoiceCloneRecorder
                  clientId={clientId}
                  voice={voice}
                  onSaved={(next) => setVoice(next)}
                  persistVoice={persistVoice}
                />
              )}
              {choice === 'preset' && (
                <VoicePresetPicker
                  voice={voice}
                  onSaved={(next) => setVoice(next)}
                  persistVoice={persistVoice}
                />
              )}
              {choice === 'none' && (
                <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4">
                  Steve va a generar creatividades con texto en pantalla y música de fondo, sin locución.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceOption({
  value,
  checked,
  title,
  subtitle,
  badge,
}: {
  value: string;
  checked: boolean;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <Label
      htmlFor={`voice-${value}`}
      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all min-h-[64px] ${
        checked
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <RadioGroupItem value={value} id={`voice-${value}`} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900 text-sm sm:text-base">{title}</span>
          {badge && <Badge className="text-[10px]">{badge}</Badge>}
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </Label>
  );
}

// ─────────────────────────── Voice Clone Recorder ───────────────────────────

const MAX_REC_SECONDS = 30;

function getSupportedMime(): { mime: string; ext: string; fmt: 'webm' | 'm4a' | 'ogg' } {
  if (typeof MediaRecorder === 'undefined') return { mime: 'audio/webm', ext: 'webm', fmt: 'webm' };
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return { mime: 'audio/webm;codecs=opus', ext: 'webm', fmt: 'webm' };
  if (MediaRecorder.isTypeSupported('audio/webm')) return { mime: 'audio/webm', ext: 'webm', fmt: 'webm' };
  if (MediaRecorder.isTypeSupported('audio/mp4')) return { mime: 'audio/mp4', ext: 'm4a', fmt: 'm4a' };
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return { mime: 'audio/ogg;codecs=opus', ext: 'ogg', fmt: 'ogg' };
  return { mime: '', ext: 'webm', fmt: 'webm' };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No pudimos leer el audio'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // data:audio/webm;base64,XXXX → strip prefix
      const base64 = result.includes(',') ? result.split(',', 2)[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function VoiceCloneRecorder({
  clientId,
  voice,
  onSaved,
  persistVoice,
}: {
  clientId: string;
  voice: BrandVoice | null;
  onSaved: (v: BrandVoice) => void;
  persistVoice: (next: BrandVoice) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview' | 'submitting'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mimeRef = useRef<ReturnType<typeof getSupportedMime>>(getSupportedMime());

  useEffect(() => {
    return () => {
      cleanup();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta grabación de audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = mimeRef.current;
      const options: MediaRecorderOptions = mime.mime ? { mimeType: mime.mime } : {};
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        // Safari iOS sometimes rejects options — retry without
        recorder = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = mime.mime || recorder.mimeType || 'audio/webm';
        const final = new Blob(chunksRef.current, { type });
        setBlob(final);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(final);
        setPreviewUrl(url);
        setPhase('preview');
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setSeconds(0);
      setPhase('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_REC_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`No pudimos acceder al micrófono: ${msg}`);
    }
  }

  function stopRecording() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetRecording() {
    cleanup();
    setBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    setPhase('idle');
  }

  function togglePlayPreview() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => setPlaying(false));
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  async function confirmVoice() {
    if (!blob) return;
    setPhase('submitting');
    setError(null);
    try {
      // 1) upload sample to storage for playback later
      const ext = mimeRef.current.ext;
      const path = `brand-voices/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('client-assets')
        .upload(path, blob, { contentType: blob.type || 'audio/webm' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path);
      const sampleUrl = urlData.publicUrl;

      // 2) try clone-voice endpoint (Etapa 2). Fallback = just save sample_url.
      const audioBase64 = await blobToBase64(blob);
      const { data: cloneData, error: cloneErr } = await callApi<{ voice_id?: string }>(
        'brief-estudio/clone-voice',
        {
          method: 'POST',
          body: {
            client_id: clientId,
            audio_base64: audioBase64,
            audio_format: mimeRef.current.fmt,
            sample_url: sampleUrl,
          },
          timeoutMs: 120000,
        },
      );

      if (cloneErr) {
        const isNotImplemented =
          /404|not found|not implemented|unknown endpoint|cannot\s+post/i.test(cloneErr);
        if (isNotImplemented) {
          console.warn('[BriefEstudio] clone-voice no disponible, guardando sample sin voice_id:', cloneErr);
          toast.info('Etapa 2 aún no despliega el clonado — guardamos tu muestra para más tarde.');
        } else {
          throw new Error(cloneErr);
        }
      }

      const voiceId: string | null = cloneData?.voice_id ?? null;

      const next: BrandVoice = {
        source: 'xtts_cloned',
        voice_id: voiceId,
        sample_url: sampleUrl,
        preset_key: null,
        is_primary: true,
      };

      const ok = await persistVoice(next);
      if (!ok) throw new Error('No pudimos guardar');
      onSaved(next);
      toast.success('Voz clonada guardada');
      setPhase('idle');
      setBlob(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSeconds(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      setPhase('preview');
      toast.error(`No pudimos guardar la voz: ${msg}`);
    }
  }

  const alreadyCloned = voice?.source === 'xtts_cloned' && (!!voice.voice_id || !!voice.sample_url);
  const progress = (seconds / MAX_REC_SECONDS) * 100;
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  if (alreadyCloned && phase === 'idle') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-emerald-900 text-sm">Voz clonada</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Steve ya tiene tu voz para usar en creatividades.
            </p>
            {voice?.sample_url && (
              <audio controls src={voice.sample_url} className="mt-3 w-full max-w-md" />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={resetRecording}>
            Volver a grabar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-medium text-slate-900 mb-1">Cómo grabar bien</p>
        <ul className="text-xs sm:text-sm text-slate-600 space-y-1 list-disc pl-4">
          <li>Grabá 30 segundos hablando normal, como si le contaras a un amigo qué vendés.</li>
          <li>Buscá un lugar silencioso. Sin música de fondo.</li>
          <li>Hablá pausado y claro.</li>
        </ul>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Button
            onClick={startRecording}
            size="lg"
            className="rounded-full h-20 w-20 bg-red-500 hover:bg-red-600 text-white shadow-lg"
          >
            <Mic className="w-8 h-8" />
          </Button>
          <p className="text-sm font-medium text-slate-700">Empezar a grabar</p>
        </div>
      )}

      {phase === 'recording' && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
                <Mic className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums">{mmss}</div>
            <Progress value={progress} className="h-2 w-full max-w-md" />
            <Button onClick={stopRecording} variant="outline" size="lg">
              <Square className="w-4 h-4 mr-2" /> Detener
            </Button>
          </div>
        </div>
      )}

      {phase === 'preview' && previewUrl && (
        <div className="space-y-3">
          <audio
            ref={audioRef}
            src={previewUrl}
            onEnded={() => setPlaying(false)}
            className="w-full"
            controls
          />
          <div className="flex flex-wrap gap-2 justify-center">
            <Button onClick={togglePlayPreview} variant="outline">
              {playing ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              {playing ? 'Pausar' : 'Escuchar'}
            </Button>
            <Button onClick={resetRecording} variant="outline">
              <RotateCcw className="w-4 h-4 mr-1" /> Volver a grabar
            </Button>
            <Button onClick={confirmVoice} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Usar esta voz
            </Button>
          </div>
        </div>
      )}

      {phase === 'submitting' && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Clonando tu voz…
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Voice Preset Picker ────────────────────────────

function VoicePresetPicker({
  voice,
  onSaved,
  persistVoice,
}: {
  voice: BrandVoice | null;
  onSaved: (v: BrandVoice) => void;
  persistVoice: (next: BrandVoice) => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const currentKey = voice?.source === 'preset' ? voice.preset_key : null;

  async function handlePick(key: string) {
    setSubmitting(true);
    const next: BrandVoice = {
      source: 'preset',
      voice_id: null,
      sample_url: null,
      preset_key: key,
      is_primary: true,
    };
    const ok = await persistVoice(next);
    setSubmitting(false);
    if (ok) {
      onSaved(next);
      toast.success('Voz elegida');
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {VOICE_PRESETS.map((p) => {
          const selected = currentKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePick(p.key)}
              disabled={submitting}
              className={`text-left p-4 rounded-lg border transition-all min-h-[72px] ${
                selected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900">{p.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                </div>
                {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>
              {p.sample_url && (
                <audio controls src={p.sample_url} className="mt-3 w-full h-8" />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        Las muestras de audio de las voces pre-hechas se activan en Etapa 2 (suggest-voice).
      </p>
    </div>
  );
}

// ─────────────────────────── Stubs Productos / Música ───────────────────────

function SectionProductosStub() {
  return (
    <Card className="opacity-75">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">3</span>
          Productos destacados
          <Badge variant="outline" className="ml-2">Próximamente</Badge>
        </CardTitle>
        <CardDescription>
          Elegí qué productos quiere que Steve priorice al armar creatividades.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 rounded-lg p-4">
          <Package className="w-5 h-5" />
          Esta sección se habilita en la próxima actualización.
        </div>
      </CardContent>
    </Card>
  );
}

function SectionMusicaStub() {
  return (
    <Card className="opacity-75">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">4</span>
          Música
          <Badge variant="outline" className="ml-2">Próximamente</Badge>
        </CardTitle>
        <CardDescription>
          Definí la vibe musical de tus videos (cálido, enérgico, premium, etc).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 rounded-lg p-4">
          <Music2 className="w-5 h-5" />
          Esta sección se habilita en la próxima actualización.
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Save Bar sticky ────────────────────────────────

function SaveBar({
  completeCount,
  studioReady,
  saving,
  onActivate,
}: {
  completeCount: number;
  studioReady: boolean;
  saving: boolean;
  onActivate: () => void;
}) {
  const allDone = completeCount >= 4;

  return (
    <div className="sticky bottom-16 md:bottom-4 z-20">
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 sm:p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs sm:text-sm font-medium text-slate-700">
              Progreso: {completeCount}/4 secciones
            </p>
            {saving && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Guardando
              </span>
            )}
          </div>
          <Progress value={(completeCount / 4) * 100} className="h-1.5" />
        </div>
        {allDone && !studioReady ? (
          <Button onClick={onActivate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Activar Modo Estudio
          </Button>
        ) : studioReady ? (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Modo Estudio activo
          </Badge>
        ) : (
          <span className="text-xs text-slate-500">
            Se guarda automáticamente al editar.
          </span>
        )}
      </div>
    </div>
  );
}
