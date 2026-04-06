import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Instagram, Facebook, ImagePlus, Send, CalendarClock, Sparkles, Loader2, X, Plus,
  Eye, Hash, Clock, CheckCircle, Film, Images, Upload, Link, Wand2, Trash2, Type, Link2,
} from 'lucide-react';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ─────────────────── Types ─────────────────── */

type Platform = 'instagram' | 'facebook' | 'both';
type ImageSourceMode = 'upload' | 'ai' | 'url';
type IGMediaType = 'IMAGE' | 'CAROUSEL' | 'REELS' | 'STORIES';
type FBMediaType = 'TEXT' | 'PHOTO' | 'VIDEO' | 'LINK';

const API_URL = import.meta.env.VITE_API_URL as string;

/* ─────────────────── Image Picker ─────────────────── */

function ImagePicker({
  value,
  onChange,
  clientId,
}: {
  value: string;
  onChange: (url: string) => void;
  clientId: string;
}) {
  const [mode, setMode] = useState<ImageSourceMode>('upload');
  const [uploading, setUploading] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [urlInput, setUrlInput] = useState(value);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return; }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { toast.error('Formato no soportado. Usa JPG, PNG o WebP'); return; }

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Sesion expirada'); return; }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/upload-email-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const result = await res.json();
      if (result.success && result.url) {
        onChange(result.url);
      } else {
        toast.error(result.error || 'Error al subir imagen');
      }
    } catch {
      toast.error('Error al subir imagen');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Escribe un prompt para generar la imagen'); return; }
    setGeneratingImg(true);
    try {
      const { data, error } = await callApi<{ asset_url: string }>('generate-image', {
        body: { clientId, promptGeneracion: aiPrompt },
      });
      if (error) { toast.error(error); return; }
      if (data?.asset_url) {
        onChange(data.asset_url);
        toast.success('Imagen generada');
      }
    } finally {
      setGeneratingImg(false);
    }
  };

  const busy = uploading || generatingImg;

  // If we already have an image, show preview
  if (value) {
    return (
      <div className="relative group rounded-lg overflow-hidden border bg-muted">
        <img src={value} alt="Preview" className="w-full aspect-square object-cover" />
        <button
          type="button"
          onClick={() => { onChange(''); setUrlInput(''); setAiPrompt(''); }}
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mode tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
        {([
          { m: 'upload' as ImageSourceMode, icon: Upload, label: 'Subir' },
          { m: 'ai' as ImageSourceMode, icon: Wand2, label: 'Generar IA' },
          { m: 'url' as ImageSourceMode, icon: Link, label: 'Pegar URL' },
        ]).map(({ m, icon: Icon, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors ${mode === m ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Upload mode */}
      {mode === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !busy && fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${busy ? 'opacity-50 cursor-wait bg-muted' : 'hover:border-primary/50 hover:bg-muted/50'}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
            disabled={busy}
          />
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? 'Subiendo...' : 'Arrastra o haz clic para subir'}
          </p>
          <p className="text-xs text-muted-foreground/70">JPG, PNG o WebP - Max 5MB</p>
        </div>
      )}

      {/* AI generate mode */}
      {mode === 'ai' && (
        <div className="space-y-2">
          <Input
            placeholder="Describe la imagen (ej: modelo usando vestido rojo en la playa)"
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            disabled={generatingImg}
          />
          <Button
            size="sm"
            onClick={handleGenerateAI}
            disabled={generatingImg || !aiPrompt.trim()}
            className="w-full"
          >
            {generatingImg ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generando...</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-1.5" />Generar imagen</>
            )}
          </Button>
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div className="flex gap-2">
          <Input
            placeholder="https://... (imagen publica, min 320x320px)"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" variant="outline" onClick={() => { if (urlInput.trim()) onChange(urlInput.trim()); }} disabled={!urlInput.trim()}>
            <CheckCircle className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Social Publisher ─────────────────── */

interface SocialPublisherProps {
  clientId: string;
  prefillDate?: string;
  onPublished?: () => void;
}

export function SocialPublisher({ clientId, prefillDate, onPublished }: SocialPublisherProps) {
  // --- Platform state ---
  const [platform, setPlatform] = useState<Platform>('instagram');

  // --- Instagram state ---
  const [igMediaType, setIgMediaType] = useState<IGMediaType>('IMAGE');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [crossPost, setCrossPost] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // --- Facebook state ---
  const [fbMediaType, setFbMediaType] = useState<FBMediaType>('PHOTO');
  const [fbMessage, setFbMessage] = useState('');
  const [fbImageUrl, setFbImageUrl] = useState('');
  const [fbVideoUrl, setFbVideoUrl] = useState('');
  const [fbLinkUrl, setFbLinkUrl] = useState('');

  // --- Shared state ---
  const [scheduledAt, setScheduledAt] = useState(prefillDate || '');
  const [aiTopic, setAiTopic] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // --- Profile info for preview ---
  const [igProfile, setIgProfile] = useState<{ username: string; profile_picture_url: string } | null>(null);
  const [fbPage, setFbPage] = useState<{ name: string; picture_url: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('ig_account_id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .maybeSingle();

      const { data } = await callApi<{ username: string; profile_picture_url: string }>('publish-instagram', {
        body: { action: 'get_profile', client_id: clientId, ig_account_id: conn?.ig_account_id || undefined },
      });
      if (data?.username) setIgProfile(data);
    })();

    // Fetch FB page info
    (async () => {
      const { data } = await callApi<{ name: string; picture_url: string }>('publish-facebook', {
        body: { action: 'get_page', client_id: clientId },
      });
      if (data?.name) setFbPage(data);
    })();
  }, [clientId]);

  /* ── Hashtag helpers ── */
  const addHashtag = useCallback(() => {
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (tag && !hashtags.includes(tag) && hashtags.length < 30) {
      setHashtags(prev => [...prev, tag]);
      setHashtagInput('');
    }
  }, [hashtagInput, hashtags]);

  const removeHashtag = (tag: string) => {
    setHashtags(prev => prev.filter(h => h !== tag));
  };

  /* ── Carousel helpers ── */
  const addCarouselImage = (url: string) => {
    if (url && imageUrls.length < 10) {
      setImageUrls(prev => [...prev, url]);
    }
  };

  const removeCarouselUrl = (idx: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── Video upload (Reels) ── */
  const handleVideoUpload = async (file: File) => {
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) { toast.error('El video no puede superar 100MB'); return; }
    if (!file.type.startsWith('video/')) { toast.error('Solo archivos de video (MP4, MOV)'); return; }
    setUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${clientId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('instagram-videos').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('instagram-videos').getPublicUrl(path);
      setVideoUrl(urlData.publicUrl);
      toast.success('Video subido');
    } catch (err: any) {
      toast.error(err?.message || 'Error al subir video');
    } finally {
      setUploadingVideo(false);
    }
  };

  /* ── AI Caption Generators ── */
  const generateCaption = async () => {
    setGenerating(true);
    try {
      if (platform === 'facebook') {
        const { data, error } = await callApi<{ caption: string }>('publish-facebook', {
          body: { action: 'generate_caption', client_id: clientId, topic: aiTopic || 'general brand post' },
        });
        if (error) { toast.error(error); return; }
        if (data?.caption) setFbMessage(data.caption);
        toast.success('Caption generado con IA');
      } else {
        // instagram or both
        const { data, error } = await callApi<{ caption: string; hashtags: string[] }>('publish-instagram', {
          body: { action: 'generate_caption', client_id: clientId, topic: aiTopic || 'general brand post' },
        });
        if (error) { toast.error(error); return; }
        if (data?.caption) {
          setCaption(data.caption);
          if (platform === 'both') setFbMessage(data.caption);
        }
        if (data?.hashtags?.length) setHashtags(data.hashtags);
        toast.success('Caption generado con IA');
      }
    } finally {
      setGenerating(false);
    }
  };

  /* ── Publish Instagram ── */
  const publishIG = async () => {
    const body: Record<string, any> = {
      action: 'publish',
      client_id: clientId,
      media_type: igMediaType === 'STORIES' ? 'STORIES' : igMediaType,
      caption,
      hashtags,
      cross_post: crossPost,
    };
    if (igMediaType === 'CAROUSEL') {
      body.image_urls = imageUrls;
    } else if (igMediaType === 'REELS') {
      body.video_url = videoUrl;
    } else if (igMediaType === 'STORIES') {
      body.image_url = imageUrl || undefined;
      body.video_url = videoUrl || undefined;
    } else {
      body.image_url = imageUrl;
    }
    return callApi<{ permalink: string }>('publish-instagram', { body });
  };

  /* ── Publish Facebook ── */
  const publishFB = async () => {
    const body: Record<string, any> = {
      action: 'publish',
      client_id: clientId,
      media_type: platform === 'both' ? 'PHOTO' : fbMediaType,
      message: platform === 'both' ? (caption + (hashtags.length > 0 ? '\n\n' + hashtags.map(h => `#${h}`).join(' ') : '')) : fbMessage,
    };
    if (platform === 'both') {
      body.image_url = imageUrl;
    } else {
      if (fbMediaType === 'PHOTO') body.image_url = fbImageUrl;
      if (fbMediaType === 'VIDEO') body.video_url = fbVideoUrl;
      if (fbMediaType === 'LINK') body.link_url = fbLinkUrl;
    }
    return callApi<{ post_id: string }>('publish-facebook', { body });
  };

  /* ── Schedule Instagram ── */
  const scheduleIG = async (isoDate: string) => {
    const body: Record<string, any> = {
      action: 'schedule',
      client_id: clientId,
      media_type: igMediaType === 'STORIES' ? 'STORIES' : igMediaType,
      caption,
      hashtags,
      scheduled_at: isoDate,
      cross_post: crossPost,
    };
    if (igMediaType === 'CAROUSEL') {
      body.image_urls = imageUrls;
    } else if (igMediaType === 'REELS') {
      body.video_url = videoUrl;
    } else if (igMediaType === 'STORIES') {
      body.image_url = imageUrl || undefined;
      body.video_url = videoUrl || undefined;
    } else {
      body.image_url = imageUrl;
    }
    return callApi('publish-instagram', { body });
  };

  /* ── Schedule Facebook ── */
  const scheduleFB = async (isoDate: string) => {
    const body: Record<string, any> = {
      action: 'schedule',
      client_id: clientId,
      media_type: platform === 'both' ? 'PHOTO' : fbMediaType,
      message: platform === 'both' ? (caption + (hashtags.length > 0 ? '\n\n' + hashtags.map(h => `#${h}`).join(' ') : '')) : fbMessage,
      scheduled_at: isoDate,
    };
    if (platform === 'both') {
      body.image_url = imageUrl;
    } else {
      if (fbMediaType === 'PHOTO') body.image_url = fbImageUrl;
      if (fbMediaType === 'VIDEO') body.video_url = fbVideoUrl;
      if (fbMediaType === 'LINK') body.link_url = fbLinkUrl;
    }
    return callApi('publish-facebook', { body });
  };

  /* ── Handle Publish ── */
  const handlePublish = async () => {
    setPublishing(true);
    try {
      if (platform === 'both') {
        const results = await Promise.allSettled([publishIG(), publishFB()]);
        const igResult = results[0];
        const fbResult = results[1];

        const igOk = igResult.status === 'fulfilled' && !igResult.value.error;
        const fbOk = fbResult.status === 'fulfilled' && !fbResult.value.error;

        const igErr = igResult.status === 'rejected'
          ? igResult.reason?.message || 'Error desconocido'
          : (igResult.status === 'fulfilled' && igResult.value.error ? igResult.value.error : null);
        const fbErr = fbResult.status === 'rejected'
          ? fbResult.reason?.message || 'Error desconocido'
          : (fbResult.status === 'fulfilled' && fbResult.value.error ? fbResult.value.error : null);

        if (igOk && fbOk) {
          toast.success('Publicado en Instagram y Facebook');
          onPublished?.();
          resetForm();
        } else if (igOk && !fbOk) {
          toast.warning(`Publicado en Instagram. Error en Facebook: ${fbErr}`);
          onPublished?.();
        } else if (!igOk && fbOk) {
          toast.warning(`Publicado en Facebook. Error en Instagram: ${igErr}`);
          onPublished?.();
        } else {
          toast.error(`Error en ambas plataformas. IG: ${igErr} | FB: ${fbErr}`);
        }
      } else if (platform === 'instagram') {
        const { error } = await publishIG();
        if (error) { toast.error(error); return; }
        toast.success('Publicado en Instagram');
        onPublished?.();
        resetForm();
      } else {
        const { error } = await publishFB();
        if (error) { toast.error(error); return; }
        toast.success('Publicado en Facebook');
        onPublished?.();
        resetForm();
      }
    } finally {
      setPublishing(false);
    }
  };

  /* ── Handle Schedule ── */
  const handleSchedule = async () => {
    if (!scheduledAt) { toast.error('Selecciona fecha y hora'); return; }
    const isoDate = new Date(scheduledAt).toISOString();
    setPublishing(true);
    try {
      if (platform === 'both') {
        const results = await Promise.allSettled([scheduleIG(isoDate), scheduleFB(isoDate)]);
        const igResult = results[0];
        const fbResult = results[1];

        const igOk = igResult.status === 'fulfilled' && !igResult.value.error;
        const fbOk = fbResult.status === 'fulfilled' && !fbResult.value.error;

        const igErr = igResult.status === 'rejected'
          ? igResult.reason?.message || 'Error desconocido'
          : (igResult.status === 'fulfilled' && igResult.value.error ? igResult.value.error : null);
        const fbErr = fbResult.status === 'rejected'
          ? fbResult.reason?.message || 'Error desconocido'
          : (fbResult.status === 'fulfilled' && fbResult.value.error ? fbResult.value.error : null);

        if (igOk && fbOk) {
          toast.success('Programado en Instagram y Facebook');
          setShowSchedule(false);
          onPublished?.();
          resetForm();
        } else if (igOk && !fbOk) {
          toast.warning(`Programado en Instagram. Error en Facebook: ${fbErr}`);
          setShowSchedule(false);
          onPublished?.();
        } else if (!igOk && fbOk) {
          toast.warning(`Programado en Facebook. Error en Instagram: ${igErr}`);
          setShowSchedule(false);
          onPublished?.();
        } else {
          toast.error(`Error en ambas plataformas. IG: ${igErr} | FB: ${fbErr}`);
        }
      } else if (platform === 'instagram') {
        const { error } = await scheduleIG(isoDate);
        if (error) { toast.error(error); return; }
        toast.success('Publicacion programada en Instagram');
        setShowSchedule(false);
        onPublished?.();
        resetForm();
      } else {
        const { error } = await scheduleFB(isoDate);
        if (error) { toast.error(error); return; }
        toast.success('Publicacion programada en Facebook');
        setShowSchedule(false);
        onPublished?.();
        resetForm();
      }
    } finally {
      setPublishing(false);
    }
  };

  /* ── Reset ── */
  const resetForm = () => {
    setCaption('');
    setHashtags([]);
    setImageUrl('');
    setImageUrls([]);
    setVideoUrl('');
    setFbMessage('');
    setFbImageUrl('');
    setFbVideoUrl('');
    setFbLinkUrl('');
    setScheduledAt('');
    setAiTopic('');
    setHashtagInput('');
  };

  /* ── Computed values ── */
  const igHasMedia = igMediaType === 'CAROUSEL' ? imageUrls.length > 0
    : igMediaType === 'REELS' ? !!videoUrl
    : igMediaType === 'STORIES' ? !!(imageUrl || videoUrl)
    : !!imageUrl;

  const fbCanPublish = fbMediaType === 'TEXT' ? !!fbMessage
    : fbMediaType === 'PHOTO' ? !!(fbImageUrl && fbMessage)
    : fbMediaType === 'VIDEO' ? !!(fbVideoUrl && fbMessage)
    : fbMediaType === 'LINK' ? !!(fbLinkUrl && fbMessage)
    : false;

  const bothCanPublish = !!imageUrl && !!caption;

  const canPublish = platform === 'instagram' ? (igHasMedia && !!caption)
    : platform === 'facebook' ? fbCanPublish
    : bothCanPublish;

  const fullCaption = hashtags.length > 0
    ? `${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`
    : caption;

  const previewImage = platform === 'facebook' ? fbImageUrl : imageUrl;
  const canPreview = platform === 'facebook' ? !!(fbMessage || fbImageUrl) : !!(caption || imageUrl || imageUrls[0]);

  /* ─────────────────── Render ─────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Platform Toggle ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/80 border">
        <button
          type="button"
          onClick={() => setPlatform('instagram')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            platform === 'instagram'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
              : 'hover:bg-background/60 text-muted-foreground'
          }`}
        >
          <Instagram className="w-4.5 h-4.5" />
          Instagram
        </button>
        <button
          type="button"
          onClick={() => setPlatform('facebook')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            platform === 'facebook'
              ? 'bg-blue-600 text-white shadow-md'
              : 'hover:bg-background/60 text-muted-foreground'
          }`}
        >
          <Facebook className="w-4.5 h-4.5" />
          Facebook
        </button>
        <button
          type="button"
          onClick={() => setPlatform('both')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            platform === 'both'
              ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 text-white shadow-md'
              : 'hover:bg-background/60 text-muted-foreground'
          }`}
        >
          <Images className="w-4.5 h-4.5" />
          Ambos
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {platform === 'instagram' && <Instagram className="w-5 h-5 text-purple-500" />}
            {platform === 'facebook' && <Facebook className="w-5 h-5 text-blue-600" />}
            {platform === 'both' && (
              <div className="flex -space-x-1">
                <Instagram className="w-5 h-5 text-purple-500" />
                <Facebook className="w-5 h-5 text-blue-600" />
              </div>
            )}
            {platform === 'instagram' && 'Publicar en Instagram'}
            {platform === 'facebook' && 'Publicar en Facebook'}
            {platform === 'both' && 'Publicar en Instagram y Facebook'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ════════════════════════════════════════════════════════
               INSTAGRAM FLOW
             ════════════════════════════════════════════════════════ */}
          {platform === 'instagram' && (
            <>
              {/* Media Type Selector */}
              <div>
                <Label>Tipo de contenido</Label>
                <div className="flex gap-2 mt-1.5">
                  {([
                    { type: 'IMAGE' as IGMediaType, icon: ImagePlus, label: 'Imagen' },
                    { type: 'CAROUSEL' as IGMediaType, icon: Images, label: 'Carrusel' },
                    { type: 'REELS' as IGMediaType, icon: Film, label: 'Reel' },
                    { type: 'STORIES' as IGMediaType, icon: Clock, label: 'Story' },
                  ]).map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      variant={igMediaType === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setIgMediaType(type)}
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* IMAGE */}
              {igMediaType === 'IMAGE' && (
                <div>
                  <Label>Imagen</Label>
                  <ImagePicker value={imageUrl} onChange={setImageUrl} clientId={clientId} />
                </div>
              )}

              {/* CAROUSEL */}
              {igMediaType === 'CAROUSEL' && (
                <div className="space-y-3">
                  <Label>Imagenes del carrusel ({imageUrls.length}/10)</Label>
                  {imageUrls.length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {imageUrls.map((url, i) => (
                        <div key={i} className="relative group rounded-md overflow-hidden border aspect-square bg-muted">
                          <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeCarouselUrl(i)}
                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {imageUrls.length < 10 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Agregar imagen al carrusel:</p>
                      <ImagePicker value="" onChange={addCarouselImage} clientId={clientId} />
                    </div>
                  )}
                </div>
              )}

              {/* REELS */}
              {igMediaType === 'REELS' && (
                <div className="space-y-3">
                  <Label>Video del Reel</Label>
                  {videoUrl ? (
                    <div className="flex items-center gap-2 p-2 border rounded bg-muted/30">
                      <Film className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">{videoUrl}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setVideoUrl('')}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="border-2 border-dashed rounded-lg p-4 text-center">
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime"
                          className="hidden"
                          id="video-upload-ig"
                          onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                        />
                        <label htmlFor="video-upload-ig" className="cursor-pointer">
                          {uploadingVideo ? (
                            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-1" />
                          ) : (
                            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {uploadingVideo ? 'Subiendo...' : 'Click para subir video (MP4/MOV, max 100MB)'}
                          </p>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">o URL:</span>
                        <Input
                          placeholder="https://..."
                          value={videoUrl}
                          onChange={e => setVideoUrl(e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={crossPost}
                      onChange={(e) => setCrossPost(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-muted-foreground">Publicar tambien en Stories</span>
                  </label>
                </div>
              )}

              {/* STORIES */}
              {igMediaType === 'STORIES' && (
                <div className="space-y-3">
                  <Label>Media para Story</Label>
                  <p className="text-xs text-muted-foreground">Sube una imagen o video para tu Story (desaparece en 24h)</p>
                  <ImagePicker value={imageUrl} onChange={setImageUrl} clientId={clientId} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">o video:</span>
                    <Input
                      placeholder="URL del video..."
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                      className="flex-1 h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* AI Caption Generator */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Generar caption con IA
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Tema o producto (ej: lanzamiento coleccion verano)"
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={generateCaption} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Caption */}
              <div>
                <Label>Caption</Label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  placeholder="Escribe tu caption... (max 2,200 caracteres)"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  maxLength={2200}
                />
                <p className="text-xs text-muted-foreground mt-1">{caption.length}/2,200</p>
              </div>

              {/* Hashtags */}
              <div>
                <Label className="flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  Hashtags ({hashtags.length}/30)
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Agregar hashtag"
                    value={hashtagInput}
                    onChange={e => setHashtagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addHashtag} disabled={hashtags.length >= 30}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {hashtags.map(tag => (
                      <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeHashtag(tag)}>
                        #{tag} <X className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════
               FACEBOOK FLOW
             ════════════════════════════════════════════════════════ */}
          {platform === 'facebook' && (
            <>
              {/* Media Type Selector */}
              <div>
                <Label>Tipo de contenido</Label>
                <div className="flex gap-2 mt-1.5">
                  {([
                    { type: 'TEXT' as FBMediaType, icon: Type, label: 'Texto' },
                    { type: 'PHOTO' as FBMediaType, icon: ImagePlus, label: 'Foto' },
                    { type: 'VIDEO' as FBMediaType, icon: Film, label: 'Video' },
                    { type: 'LINK' as FBMediaType, icon: Link2, label: 'Link' },
                  ]).map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      variant={fbMediaType === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFbMediaType(type)}
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* PHOTO */}
              {fbMediaType === 'PHOTO' && (
                <div>
                  <Label>Imagen</Label>
                  <ImagePicker value={fbImageUrl} onChange={setFbImageUrl} clientId={clientId} />
                </div>
              )}

              {/* VIDEO */}
              {fbMediaType === 'VIDEO' && (
                <div>
                  <Label>URL del video</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="https://... (URL publica del video)"
                      value={fbVideoUrl}
                      onChange={e => setFbVideoUrl(e.target.value)}
                      className="flex-1"
                    />
                    {fbVideoUrl && (
                      <Button size="sm" variant="ghost" onClick={() => setFbVideoUrl('')}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* LINK */}
              {fbMediaType === 'LINK' && (
                <div>
                  <Label>URL del link</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="https://... (URL a compartir)"
                      value={fbLinkUrl}
                      onChange={e => setFbLinkUrl(e.target.value)}
                      className="flex-1"
                    />
                    {fbLinkUrl && (
                      <Button size="sm" variant="ghost" onClick={() => setFbLinkUrl('')}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* AI Caption Generator */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Generar mensaje con IA
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Tema o producto (ej: promocion Black Friday)"
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={generateCaption} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Message */}
              <div>
                <Label>Mensaje</Label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  placeholder="Escribe tu mensaje para Facebook..."
                  value={fbMessage}
                  onChange={e => setFbMessage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">{fbMessage.length} caracteres</p>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════
               BOTH FLOW
             ════════════════════════════════════════════════════════ */}
          {platform === 'both' && (
            <>
              {/* Info badge */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Images className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Solo imagenes al publicar en ambas plataformas. El caption se adapta a cada una.
                </p>
              </div>

              {/* Image */}
              <div>
                <Label>Imagen</Label>
                <ImagePicker value={imageUrl} onChange={setImageUrl} clientId={clientId} />
              </div>

              {/* AI Caption Generator */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Generar caption con IA
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Tema o producto (ej: lanzamiento coleccion verano)"
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={generateCaption} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Caption (shared) */}
              <div>
                <Label>Caption</Label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  placeholder="Escribe tu caption... (max 2,200 caracteres para IG)"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  maxLength={2200}
                />
                <p className="text-xs text-muted-foreground mt-1">{caption.length}/2,200 (limite Instagram)</p>
              </div>

              {/* Hashtags */}
              <div>
                <Label className="flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  Hashtags ({hashtags.length}/30)
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Agregar hashtag"
                    value={hashtagInput}
                    onChange={e => setHashtagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addHashtag} disabled={hashtags.length >= 30}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {hashtags.map(tag => (
                      <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeHashtag(tag)}>
                        #{tag} <X className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════
               ACTION BUTTONS (all platforms)
             ════════════════════════════════════════════════════════ */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!canPreview}>
              <Eye className="w-4 h-4 mr-1.5" />
              Preview
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSchedule(true)}
              disabled={!canPublish || publishing}
            >
              <CalendarClock className="w-4 h-4 mr-1.5" />
              Programar
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!canPublish || publishing}
              className="flex-1"
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1.5" />
              )}
              Publicar ahora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════
           PREVIEW DIALOG
         ════════════════════════════════════════════════════════ */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {platform === 'instagram' && 'Preview de Instagram'}
              {platform === 'facebook' && 'Preview de Facebook'}
              {platform === 'both' && 'Preview'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* IG Preview */}
            {(platform === 'instagram' || platform === 'both') && (
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                  <Instagram className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Instagram</span>
                </div>
                <div className="flex items-center gap-2 p-3 border-b">
                  {igProfile?.profile_picture_url ? (
                    <img src={igProfile.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
                  )}
                  <span className="text-sm font-semibold">{igProfile?.username || 'tu_marca'}</span>
                </div>
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {(imageUrl || imageUrls[0]) ? (
                    <img src={imageUrl || imageUrls[0]} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-12 h-12 text-muted-foreground/30" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm whitespace-pre-line line-clamp-6">{fullCaption || 'Tu caption aqui...'}</p>
                </div>
              </div>
            )}

            {/* FB Preview */}
            {(platform === 'facebook' || platform === 'both') && (
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10">
                  <Facebook className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Facebook</span>
                </div>
                <div className="flex items-center gap-2 p-3 border-b">
                  {fbPage?.picture_url ? (
                    <img src={fbPage.picture_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-500" />
                  )}
                  <div>
                    <span className="text-sm font-semibold block">{fbPage?.name || 'Tu Pagina'}</span>
                    <span className="text-xs text-muted-foreground">Ahora</span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm whitespace-pre-line line-clamp-8">
                    {platform === 'both'
                      ? (fullCaption || 'Tu mensaje aqui...')
                      : (fbMessage || 'Tu mensaje aqui...')}
                  </p>
                </div>
                {/* Photo preview in FB */}
                {((platform === 'both' && imageUrl) || (platform === 'facebook' && fbMediaType === 'PHOTO' && fbImageUrl)) && (
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <img
                      src={platform === 'both' ? imageUrl : fbImageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* Link preview in FB */}
                {platform === 'facebook' && fbMediaType === 'LINK' && fbLinkUrl && (
                  <div className="mx-3 mb-3 p-3 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Link2 className="w-3.5 h-3.5" />
                      <span className="truncate">{fbLinkUrl}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-around p-2 border-t text-xs text-muted-foreground">
                  <span>Me gusta</span>
                  <span>Comentar</span>
                  <span>Compartir</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
           SCHEDULE DIALOG
         ════════════════════════════════════════════════════════ */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Programar publicacion
              {platform === 'both' && (
                <Badge variant="secondary" className="ml-2">IG + FB</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Hora de Chile (America/Santiago)</p>
            </div>
            {platform === 'both' && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Se programara en Instagram y Facebook a la misma hora.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancelar</Button>
            <Button onClick={handleSchedule} disabled={publishing || !scheduledAt}>
              {publishing && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
