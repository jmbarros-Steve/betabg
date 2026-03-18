import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Instagram, ImagePlus, Send, CalendarClock, Sparkles, Loader2, X, Plus,
  Eye, Hash, Clock, CheckCircle, AlertTriangle, Film, Images,
} from 'lucide-react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface InstagramPublisherProps {
  clientId: string;
  prefillDate?: string; // ISO date for calendar integration
  onPublished?: () => void;
}

type MediaType = 'IMAGE' | 'CAROUSEL' | 'REELS';

export function InstagramPublisher({ clientId, prefillDate, onPublished }: InstagramPublisherProps) {
  const [mediaType, setMediaType] = useState<MediaType>('IMAGE');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [scheduledAt, setScheduledAt] = useState(prefillDate || '');
  const [aiTopic, setAiTopic] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

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

  const addCarouselUrl = () => {
    if (imageUrl.trim() && imageUrls.length < 10) {
      setImageUrls(prev => [...prev, imageUrl.trim()]);
      setImageUrl('');
    }
  };

  const removeCarouselUrl = (idx: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const generateCaption = async () => {
    setGenerating(true);
    try {
      const { data, error } = await callApi<{ caption: string; hashtags: string[] }>('publish-instagram', {
        body: { action: 'generate_caption', client_id: clientId, topic: aiTopic || 'general brand post' },
      });
      if (error) { toast.error(error); return; }
      if (data?.caption) setCaption(data.caption);
      if (data?.hashtags?.length) setHashtags(data.hashtags);
      toast.success('Caption generado con IA');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const body: Record<string, any> = {
        action: 'publish',
        client_id: clientId,
        media_type: mediaType,
        caption,
        hashtags,
      };
      if (mediaType === 'CAROUSEL') {
        body.image_urls = imageUrls;
      } else if (mediaType === 'REELS') {
        body.video_url = videoUrl;
      } else {
        body.image_url = imageUrl;
      }

      const { data, error } = await callApi<{ permalink: string }>('publish-instagram', { body });
      if (error) { toast.error(error); return; }
      toast.success('Publicado en Instagram');
      onPublished?.();
      resetForm();
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduledAt) { toast.error('Selecciona fecha y hora'); return; }
    setPublishing(true);
    try {
      const body: Record<string, any> = {
        action: 'schedule',
        client_id: clientId,
        media_type: mediaType,
        caption,
        hashtags,
        scheduled_at: new Date(scheduledAt).toISOString(),
      };
      if (mediaType === 'CAROUSEL') {
        body.image_urls = imageUrls;
      } else if (mediaType === 'REELS') {
        body.video_url = videoUrl;
      } else {
        body.image_url = imageUrl;
      }

      const { error } = await callApi('publish-instagram', { body });
      if (error) { toast.error(error); return; }
      toast.success('Publicacion programada');
      setShowSchedule(false);
      onPublished?.();
      resetForm();
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setCaption('');
    setHashtags([]);
    setImageUrl('');
    setImageUrls([]);
    setVideoUrl('');
    setScheduledAt('');
    setAiTopic('');
  };

  const hasMedia = mediaType === 'CAROUSEL' ? imageUrls.length > 0
    : mediaType === 'REELS' ? !!videoUrl
    : !!imageUrl;

  const fullCaption = hashtags.length > 0
    ? `${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`
    : caption;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="w-5 h-5" />
            Publicar en Instagram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Media Type Selector */}
          <div>
            <Label>Tipo de contenido</Label>
            <div className="flex gap-2 mt-1.5">
              {([
                { type: 'IMAGE' as MediaType, icon: ImagePlus, label: 'Imagen' },
                { type: 'CAROUSEL' as MediaType, icon: Images, label: 'Carrusel' },
                { type: 'REELS' as MediaType, icon: Film, label: 'Reel' },
              ]).map(({ type, icon: Icon, label }) => (
                <Button
                  key={type}
                  variant={mediaType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMediaType(type)}
                >
                  <Icon className="w-4 h-4 mr-1.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Media Input */}
          {mediaType === 'IMAGE' && (
            <div>
              <Label>URL de la imagen</Label>
              <Input
                placeholder="https://... (imagen publica, min 320x320px)"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </div>
          )}

          {mediaType === 'CAROUSEL' && (
            <div className="space-y-2">
              <Label>Imagenes del carrusel ({imageUrls.length}/10)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="URL de imagen"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={addCarouselUrl} disabled={imageUrls.length >= 10 || !imageUrl.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageUrls.map((url, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1">
                      Imagen {i + 1}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeCarouselUrl(i)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {mediaType === 'REELS' && (
            <div>
              <Label>URL del video</Label>
              <Input
                placeholder="https://... (MP4, max 60s, min 1080px)"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
              />
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

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!caption && !hasMedia}>
              <Eye className="w-4 h-4 mr-1.5" />
              Preview
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSchedule(true)}
              disabled={!hasMedia || !caption || publishing}
            >
              <CalendarClock className="w-4 h-4 mr-1.5" />
              Programar
            </Button>
            <Button
              onClick={handlePublish}
              disabled={!hasMedia || !caption || publishing}
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

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Preview de Instagram</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            {/* Mock IG header */}
            <div className="flex items-center gap-2 p-3 border-b">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
              <span className="text-sm font-semibold">tu_marca</span>
            </div>
            {/* Image */}
            <div className="aspect-square bg-muted flex items-center justify-center">
              {imageUrl || imageUrls[0] ? (
                <img src={imageUrl || imageUrls[0]} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-12 h-12 text-muted-foreground/30" />
              )}
            </div>
            {/* Caption */}
            <div className="p-3">
              <p className="text-sm whitespace-pre-line line-clamp-6">{fullCaption || 'Tu caption aqui...'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Programar publicacion
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
