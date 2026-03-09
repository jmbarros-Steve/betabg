import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Megaphone,
  FolderOpen,
  FileImage,
  Loader2,
  Target,
  Sparkles,
  Upload,
  Video,
  Image as ImageIcon,
  Link as LinkIcon,
  X,
  Save,
  Send,
  Rocket,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';
import AdPreviewMockup from './AdPreviewMockup';
import StepIndicator, { type StepDef } from './wizard/StepIndicator';
import DynamicSteveTip from './wizard/DynamicSteveTip';
import CampaignSelector from './wizard/CampaignSelector';
import AdSetSelector from './wizard/AdSetSelector';
import ReviewStep from './wizard/ReviewStep';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignCreateWizardProps {
  clientId: string;
  onBack: () => void;
  onComplete?: () => void;
  startFrom?: 'campaign' | 'adset' | 'ad';
}

type StartLevel = 'campaign' | 'adset' | 'ad';
type BudgetType = 'ABO' | 'CBO';
type Objective = 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT' | 'CATALOG';
type WizardStep = 'select-campaign' | 'select-adset' | 'campaign-config' | 'adset-config' | 'funnel-stage' | 'ad-creative' | 'review';

const OBJECTIVES: { value: Objective; label: string; desc: string }[] = [
  { value: 'CONVERSIONS', label: 'Conversiones', desc: 'Ventas, leads, registros' },
  { value: 'TRAFFIC', label: 'Tráfico', desc: 'Visitas al sitio web' },
  { value: 'AWARENESS', label: 'Reconocimiento', desc: 'Alcance y awareness de marca' },
  { value: 'ENGAGEMENT', label: 'Interacción', desc: 'Likes, comentarios, compartidos' },
  { value: 'CATALOG', label: 'Catálogo', desc: 'Dynamic Product Ads desde Shopify' },
];

const CTA_OPTIONS = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'CONTACT_US', 'GET_OFFER', 'BOOK_NOW'];

// ---------------------------------------------------------------------------
// Step definitions per flow
// ---------------------------------------------------------------------------

const STEPS_CAMPAIGN: StepDef[] = [
  { key: 'campaign-config', label: 'Campaña', icon: Megaphone },
  { key: 'adset-config', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_ADSET: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'adset-config', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_AD: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'select-adset', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

function getStepsForLevel(level: StartLevel): StepDef[] {
  switch (level) {
    case 'campaign': return STEPS_CAMPAIGN;
    case 'adset': return STEPS_ADSET;
    case 'ad': return STEPS_AD;
  }
}

// ---------------------------------------------------------------------------
// Steve tip fallbacks per step
// ---------------------------------------------------------------------------

const STEVE_FALLBACKS: Record<string, string> = {
  'campaign-config': 'Elige ABO para testing (controlas cuanto gasta cada ad set) o CBO para escalar ganadores (Meta optimiza automáticamente).',
  'select-campaign': 'Busca una campaña con el mismo objetivo que tu nuevo Ad Set. Mezclar objetivos distintos puede confundir al algoritmo.',
  'adset-config': 'Cada Ad Set debe tener 1 solo ad para testear variables aisladas. Si pones múltiples ads, Meta distribuye el presupuesto desigualmente.',
  'select-adset': 'Elige un Ad Set que tenga audiencia similar a la de tu nuevo anuncio. Consistencia = mejores resultados.',
  'funnel-stage': 'TOFU para alcance, MOFU para nutrir leads, BOFU para conversión directa. El copy y CTA se adaptan a cada etapa.',
  'ad-creative': 'El copy debe hablar al dolor/deseo del buyer persona con un CTA claro. Usa imágenes que destaquen en el feed.',
  'review': 'Verifica que el destino URL funcione, el copy no tenga errores y el presupuesto sea el correcto antes de publicar.',
};

// ---------------------------------------------------------------------------
// Level Selector (pre-wizard screen)
// ---------------------------------------------------------------------------

function LevelSelector({ level, setLevel, onStart }: { level: StartLevel; setLevel: (l: StartLevel) => void; onStart: () => void }) {
  const levels: { key: StartLevel; icon: React.ElementType; label: string; desc: string }[] = [
    { key: 'campaign', icon: Megaphone, label: 'Campaña completa', desc: 'Crea todo de arriba a abajo: Campaña → Ad Set → Anuncio' },
    { key: 'adset', icon: FolderOpen, label: 'Nuevo Ad Set', desc: 'Crea un Ad Set y enchúfalo a una campaña existente o nueva' },
    { key: 'ad', icon: FileImage, label: 'Nuevo Anuncio', desc: 'Crea un anuncio y asígnalo a una campaña y Ad Set' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {levels.map((l) => {
          const Icon = l.icon;
          const isActive = level === l.key;
          return (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={`flex flex-col items-center gap-2 p-5 rounded-lg border text-center transition-all ${
                isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background hover:border-primary/30'
              }`}
            >
              <Icon className={`w-8 h-8 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-sm font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{l.label}</span>
              <span className="text-xs text-muted-foreground">{l.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-center">
        <Button size="lg" onClick={onStart} className="px-8">
          Comenzar <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign Form
// ---------------------------------------------------------------------------

function CampaignForm({
  name, setName,
  budgetType, setBudgetType,
  objective, setObjective,
  dailyBudget, setDailyBudget,
  startDate, setStartDate,
}: {
  name: string; setName: (v: string) => void;
  budgetType: BudgetType; setBudgetType: (v: BudgetType) => void;
  objective: Objective; setObjective: (v: Objective) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
}) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-5">
      <div>
        <Label>Nombre de la campaña</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Mi Campaña - ${today}`} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Steve sugiere: [Marca] - [Tipo] - [Fecha]</p>
      </div>

      <div>
        <Label>Tipo de presupuesto</Label>
        <div className="flex gap-3 mt-2">
          {(['ABO', 'CBO'] as BudgetType[]).map((t) => (
            <button
              key={t}
              onClick={() => setBudgetType(t)}
              className={`flex-1 flex flex-col items-center gap-1 p-4 rounded-lg border transition-all ${
                budgetType === t ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              <Badge className={`text-xs font-bold ${t === 'CBO' ? 'bg-purple-500/15 text-purple-700 border-purple-500/30' : 'bg-blue-500/15 text-blue-700 border-blue-500/30'}`}>{t}</Badge>
              <span className="text-xs text-muted-foreground">{t === 'ABO' ? 'Testing' : 'Escalamiento'}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Objetivo</Label>
        <Select value={objective} onValueChange={(v) => setObjective(v as Objective)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OBJECTIVES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <div className="flex flex-col">
                  <span>{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {budgetType === 'CBO' && (
        <div>
          <Label>Presupuesto diario (CLP)</Label>
          <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="50000" className="mt-1" />
          <p className="text-xs text-muted-foreground mt-1">Meta distribuirá este presupuesto entre los Ad Sets automáticamente.</p>
        </div>
      )}

      <div>
        <Label>Fecha de inicio</Label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Set Form
// ---------------------------------------------------------------------------

function AdSetForm({
  name, setName,
  audienceDesc, setAudienceDesc,
  dailyBudget, setDailyBudget,
  isABO,
}: {
  name: string; setName: (v: string) => void;
  audienceDesc: string; setAudienceDesc: (v: string) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  isABO: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Label>Nombre del Ad Set</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="[Audiencia] - [Variable test]" className="mt-1" />
      </div>

      <div>
        <Label>Audiencia / Segmento</Label>
        <Textarea value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Describe la audiencia: demographics, intereses, comportamiento..." rows={3} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Puedes crear audiencias detalladas en la sección Audiencias.</p>
      </div>

      {isABO && (
        <div>
          <Label>Presupuesto diario del Ad Set (CLP)</Label>
          <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="10000" className="mt-1" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel Stage Selector
// ---------------------------------------------------------------------------

function FunnelStageSelector({
  funnelStage, setFunnelStage,
}: {
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  setFunnelStage: (v: 'tofu' | 'mofu' | 'bofu') => void;
}) {
  const stages = [
    { key: 'tofu' as const, label: 'TOFU', desc: 'Awareness — Captar atención', color: 'text-blue-600 border-blue-500/30 bg-blue-500/10' },
    { key: 'mofu' as const, label: 'MOFU', desc: 'Consideración — Educar y nutrir', color: 'text-yellow-600 border-yellow-500/30 bg-yellow-500/10' },
    { key: 'bofu' as const, label: 'BOFU', desc: 'Conversión — Cerrar la venta', color: 'text-green-600 border-green-500/30 bg-green-500/10' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Steve ajusta el copy y las recomendaciones según la etapa del funnel de conversión.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {stages.map((f) => (
          <button
            key={f.key}
            onClick={() => setFunnelStage(f.key)}
            className={`flex flex-col items-center gap-1 p-4 rounded-lg border transition-all ${
              funnelStage === f.key ? `ring-1 ring-primary/20 ${f.color}` : 'border-border hover:border-primary/30'
            }`}
          >
            <Badge className={`text-xs font-bold ${funnelStage === f.key ? f.color : 'bg-muted text-muted-foreground'}`}>{f.label}</Badge>
            <span className="text-[11px] text-muted-foreground text-center">{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Form
// ---------------------------------------------------------------------------

type MediaTab = 'upload' | 'ai-image' | 'ai-video' | 'gallery' | 'url';
type AdFormat = '1:1' | '9:16' | '16:9';

function AdForm({
  clientId,
  headline, setHeadline,
  primaryText, setPrimaryText,
  description, setDescription,
  imageUrl, setImageUrl,
  cta, setCta,
  destinationUrl, setDestinationUrl,
  generating,
  onGenerateCopy,
}: {
  clientId: string;
  headline: string; setHeadline: (v: string) => void;
  primaryText: string; setPrimaryText: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  imageUrl: string; setImageUrl: (v: string) => void;
  cta: string; setCta: (v: string) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  generating: boolean;
  onGenerateCopy: () => void;
}) {
  const [mediaTab, setMediaTab] = useState<MediaTab>('upload');
  const [adFormat, setAdFormat] = useState<AdFormat>('1:1');
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoPolling, setVideoPolling] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [imageEngine, setImageEngine] = useState<'gpt4o' | 'flux'>('gpt4o');
  const [galleryAssets, setGalleryAssets] = useState<Array<{ id: string; url: string; tipo: string }>>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load gallery assets
  const loadGallery = useCallback(async () => {
    setLoadingGallery(true);
    try {
      const [{ data: generated }, { data: uploaded }] = await Promise.all([
        supabase.from('ad_assets').select('id, asset_url, tipo').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
        supabase.from('client_assets').select('id, url, tipo').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
      ]);
      const all: Array<{ id: string; url: string; tipo: string }> = [];
      if (generated) for (const a of generated) all.push({ id: a.id, url: a.asset_url, tipo: a.tipo });
      if (uploaded) for (const a of uploaded) all.push({ id: a.id, url: a.url, tipo: a.tipo });
      setGalleryAssets(all);
    } catch { /* ignore */ }
    setLoadingGallery(false);
  }, [clientId]);

  useEffect(() => { if (mediaTab === 'gallery') loadGallery(); }, [mediaTab, loadGallery]);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Solo se permiten imágenes y videos');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Archivo muy grande. Maximo 20MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `assets/${clientId}/uploads/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-assets').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('client-assets').getPublicUrl(path);
      setImageUrl(publicUrl);
      toast.success('Archivo subido');
    } catch (err: any) {
      toast.error(err?.message || 'Error al subir archivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // AI Image generation
  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe lo que quieres en la imagen'); return; }
    setGeneratingImage(true);
    try {
      const formatMap: Record<AdFormat, string> = { '1:1': 'square', '9:16': 'story', '16:9': 'feed' };
      const { data, error } = await callApi('generate-image', {
        body: { clientId, promptGeneracion: aiPrompt, engine: imageEngine, formato: formatMap[adFormat] },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos. Se necesitan 2 créditos por imagen.'); return; }
      if (data?.error) throw new Error(data.error);
      if (data?.asset_url) { setImageUrl(data.asset_url); toast.success('Imagen generada por IA'); }
    } catch (err: any) {
      toast.error(err?.message || 'Error generando imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  // AI Video generation
  const handleGenerateVideo = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe lo que quieres en el video'); return; }
    setGeneratingVideo(true);
    try {
      const { data, error } = await callApi('generate-video', {
        body: { clientId, promptGeneracion: aiPrompt, fotoBaseUrl: imageUrl || undefined },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos. Se necesitan 10 créditos por video.'); return; }
      if (data?.prediction_id) {
        toast.info('Video en proceso... puede tomar 1-3 minutos.');
        setVideoPolling(true);
        const pollInterval = setInterval(async () => {
          try {
            const { data: status } = await callApi('check-video-status', {
              body: { predictionId: data.prediction_id, clientId },
            });
            if (status?.status === 'succeeded' && status?.asset_url) {
              clearInterval(pollInterval);
              setImageUrl(status.asset_url);
              setVideoPolling(false);
              setGeneratingVideo(false);
              toast.success('Video generado');
            } else if (status?.status === 'failed') {
              clearInterval(pollInterval);
              setVideoPolling(false);
              setGeneratingVideo(false);
              toast.error('Error generando video');
            }
          } catch { /* keep polling */ }
        }, 5000);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error generando video');
      setGeneratingVideo(false);
    }
  };

  const MEDIA_TABS: Array<{ key: MediaTab; label: string; icon: React.ElementType }> = [
    { key: 'upload', label: 'Subir', icon: Upload },
    { key: 'ai-image', label: 'IA Imagen', icon: Sparkles },
    { key: 'ai-video', label: 'IA Video', icon: Video },
    { key: 'gallery', label: 'Galería', icon: ImageIcon },
    { key: 'url', label: 'URL', icon: LinkIcon },
  ];

  const FORMAT_OPTIONS: Array<{ key: AdFormat; label: string; desc: string }> = [
    { key: '1:1', label: 'Cuadrado', desc: 'Feed' },
    { key: '9:16', label: 'Vertical', desc: 'Stories/Reels' },
    { key: '16:9', label: 'Horizontal', desc: 'Landscape' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onGenerateCopy} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Steve genera copy
        </Button>
      </div>

      {/* Creative / Media Section */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Creativo (Imagen / Video)</Label>

        {/* Format selector */}
        <div className="flex gap-2">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setAdFormat(f.key)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                adFormat === f.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <span className="block font-bold">{f.label}</span>
              <span className="text-[10px] text-muted-foreground">{f.desc}</span>
            </button>
          ))}
        </div>

        {/* Media source tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {MEDIA_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setMediaTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mediaTab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Upload tab */}
        {mediaTab === 'upload' && (
          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors"
            >
              {uploading ? (
                <><Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">Subiendo...</p></>
              ) : (
                <><Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">Click para subir imagen o video</p><p className="text-xs text-muted-foreground/70">JPG, PNG, WebP, MP4 — max 20MB</p></>
              )}
            </button>
          </div>
        )}

        {/* AI Image tab */}
        {mediaTab === 'ai-image' && (
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe la imagen que quieres: 'Mujer joven con producto X en mano, fondo minimalista, iluminación natural, estilo editorial...'"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Select value={imageEngine} onValueChange={(v: 'gpt4o' | 'flux') => setImageEngine(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt4o">GPT-4o (2 cred)</SelectItem>
                  <SelectItem value="flux">Flux Pro (2 cred)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleGenerateImage} disabled={generatingImage || !aiPrompt.trim()} className="flex-1">
                {generatingImage ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</> : <><Sparkles className="w-4 h-4 mr-2" />Generar Imagen</>}
              </Button>
            </div>
          </div>
        )}

        {/* AI Video tab */}
        {mediaTab === 'ai-video' && (
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe el video: 'Producto girando 360 grados con fondo blanco, transiciones suaves...'"
              rows={3}
            />
            <Button onClick={handleGenerateVideo} disabled={generatingVideo || !aiPrompt.trim()} className="w-full">
              {generatingVideo ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{videoPolling ? 'Procesando video...' : 'Generando...'}</>
              ) : (
                <><Video className="w-4 h-4 mr-2" />Generar Video (10 cred)</>
              )}
            </Button>
          </div>
        )}

        {/* Gallery tab */}
        {mediaTab === 'gallery' && (
          <div>
            {loadingGallery ? (
              <div className="grid grid-cols-4 gap-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded" />)}</div>
            ) : galleryAssets.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 max-h-[250px] overflow-y-auto">
                {galleryAssets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setImageUrl(a.url); toast.success('Asset seleccionado'); }}
                    className={`aspect-square rounded overflow-hidden border-2 transition-all ${imageUrl === a.url ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/30'}`}
                  >
                    <img src={a.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No hay assets disponibles</p>
            )}
          </div>
        )}

        {/* URL tab */}
        {mediaTab === 'url' && (
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://tu-imagen.com/foto.jpg"
          />
        )}

        {/* Image preview */}
        {imageUrl && (
          <div className="relative inline-block">
            {imageUrl.endsWith('.mp4') ? (
              <video src={imageUrl} controls className="max-h-[200px] rounded border" />
            ) : (
              <img src={imageUrl} alt="" className="max-h-[200px] rounded border" />
            )}
            <button
              onClick={() => setImageUrl('')}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Copy fields */}
      <div className="space-y-4">
        <div>
          <Label>Headline</Label>
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Título principal del anuncio" className="mt-1" />
        </div>
        <div>
          <Label>Texto principal (Primary Text)</Label>
          <Textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} placeholder="El cuerpo del anuncio — habla al dolor/deseo de tu audiencia" rows={3} className="mt-1" />
        </div>
        <div>
          <Label>Descripción</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción adicional (opcional)" className="mt-1" />
        </div>
        <div>
          <Label>Botón CTA</Label>
          <Select value={cta} onValueChange={(v) => setCta(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CTA_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>URL de destino</Label>
          <Input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://tu-tienda.com" className="mt-1" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignCreateWizard({ clientId, onBack, onComplete, startFrom = 'campaign' }: CampaignCreateWizardProps) {
  const { connectionId: ctxConnectionId, pageId: ctxPageId, pageName } = useMetaBusiness();

  // Wizard navigation
  const [level, setLevel] = useState<StartLevel>(startFrom);
  const [wizardStarted, setWizardStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = getStepsForLevel(level);
  const currentStep = steps[stepIndex]?.key;

  // Existing entity selection
  const [existingCampaignId, setExistingCampaignId] = useState<string | null>(null);
  const [existingCampaignName, setExistingCampaignName] = useState('');
  const [existingAdsetId, setExistingAdsetId] = useState<string | null>(null);
  const [existingAdsetName, setExistingAdsetName] = useState('');
  const [createNewCampaign, setCreateNewCampaign] = useState(false);
  const [createNewAdset, setCreateNewAdset] = useState(false);

  // Campaign fields
  const [campName, setCampName] = useState('');
  const [budgetType, setBudgetType] = useState<BudgetType>('ABO');
  const [objective, setObjective] = useState<Objective>('CONVERSIONS');
  const [campBudget, setCampBudget] = useState('');
  const [startDate, setStartDate] = useState('');

  // Ad Set fields
  const [adsetName, setAdsetName] = useState('');
  const [audienceDesc, setAudienceDesc] = useState('');
  const [adsetBudget, setAdsetBudget] = useState('');

  // Funnel stage
  const [funnelStage, setFunnelStage] = useState<'tofu' | 'mofu' | 'bofu'>('tofu');

  // Ad fields
  const [headline, setHeadline] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [cta, setCta] = useState('SHOP_NOW');
  const [destinationUrl, setDestinationUrl] = useState('');

  // Loading states
  const [submitting, setSubmitting] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // ---- Navigation ----

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  };
  const goPrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  // ---- Validation ----

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'select-campaign':
        return !!existingCampaignId || (createNewCampaign && !!campName.trim());
      case 'select-adset':
        return !!existingAdsetId || (createNewAdset && !!adsetName.trim());
      case 'campaign-config':
        return !!campName.trim();
      case 'adset-config':
        return !!adsetName.trim() && (budgetType !== 'ABO' || !!adsetBudget);
      case 'funnel-stage':
        return true;
      case 'ad-creative':
        return !!primaryText.trim() && !!headline.trim();
      case 'review':
        return true;
      default:
        return true;
    }
  };

  // ---- AI Copy Generation ----

  const handleGenerateCopy = async () => {
    setGeneratingCopy(true);
    try {
      const { data, error } = await callApi('generate-meta-copy', {
        body: {
          clientId: clientId,
          funnelStage,
          adType: 'static',
          customPrompt: `Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}.`,
        },
      });
      if (error) throw error;
      const raw = data?.copy || data?.text || '';
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.primary_text) setPrimaryText(parsed.primary_text);
        if (parsed.headline) setHeadline(parsed.headline);
        if (parsed.description) setDescription(parsed.description);
        toast.success('Copy generado por Steve');
      } catch {
        setPrimaryText(raw.slice(0, 200));
      }
    } catch {
      toast.error('Error generando copy');
    } finally {
      setGeneratingCopy(false);
    }
  };

  // ---- Save Draft ----

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const funnelMap: Record<string, string> = {
        CONVERSIONS: 'bofu', TRAFFIC: 'tofu', AWARENESS: 'tofu', ENGAGEMENT: 'mofu', CATALOG: 'bofu',
      };
      const funnel = funnelMap[objective] || 'mofu';
      const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
      const anguloText = audienceDesc
        ? `${objLabel} — ${audienceDesc.substring(0, 80)}`
        : `${objLabel} — Campana directa`;

      // Generate DCT copy/headline variations via AI
      const allCopies: { texto: string; tipo: string }[] = [];
      const allHeadlines: string[] = [];

      if (primaryText) allCopies.push({ texto: primaryText, tipo: 'original' });
      if (headline) allHeadlines.push(headline);

      if (primaryText || headline) {
        try {
          toast.info('Generando variaciones DCT con Steve...');
          const { data: aiData } = await callApi('generate-meta-copy', {
            body: {
              client_id: clientId,
              instruction: [
                'Genera variaciones para un test DCT 3:2:2 de Meta Ads.',
                `Objetivo: ${objLabel}. Audiencia: ${audienceDesc || 'amplia'}.`,
                primaryText ? `Copy original: "${primaryText.substring(0, 200)}"` : '',
                headline ? `Headline original: "${headline}"` : '',
                description ? `Descripcion: "${description}"` : '',
                '',
                'Necesito que generes variaciones DIFERENTES pero con el mismo mensaje core.',
                'Cada variacion debe tener un angulo/enfoque distinto.',
                '',
                'Responde SOLO con JSON:',
                '{"copy_2":"texto alternativo","headline_2":"titulo alternativo","description_2":"descripcion alternativa"}',
              ].filter(Boolean).join('\n'),
            },
          });
          const raw = aiData?.copy || aiData?.text || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.copy_2) allCopies.push({ texto: parsed.copy_2, tipo: 'variacion' });
            if (parsed.headline_2) allHeadlines.push(parsed.headline_2);
          }
        } catch (aiErr) {
          console.warn('[DCT] AI variation generation failed:', aiErr);
        }
      }

      // Collect images
      const allImages: string[] = [];
      if (imageUrl) allImages.push(imageUrl);

      if (allImages.length < 3) {
        try {
          const { data: shopifyConn } = await supabase
            .from('platform_connections')
            .select('id')
            .eq('client_id', clientId)
            .eq('platform', 'shopify')
            .limit(1)
            .single();
          if (shopifyConn?.id) {
            const { data: shopData } = await callApi('fetch-shopify-products', {
              body: { connectionId: shopifyConn.id },
            });
            if (shopData?.products) {
              for (const p of shopData.products) {
                if (p.image && !allImages.includes(p.image) && allImages.length < 3) {
                  allImages.push(p.image);
                }
              }
            }
          }
        } catch { /* Shopify not connected */ }
      }

      if (allImages.length < 3) {
        try {
          const { data: adAssets } = await supabase
            .from('ad_assets')
            .select('asset_url')
            .eq('client_id', clientId)
            .not('asset_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);
          if (adAssets) {
            for (const a of adAssets) {
              if (a.asset_url && !allImages.includes(a.asset_url) && allImages.length < 3) {
                allImages.push(a.asset_url);
              }
            }
          }
        } catch { /* continue */ }
      }

      if (allImages.length < 3) {
        try {
          const { data: clientAssets } = await supabase
            .from('client_assets')
            .select('url')
            .eq('client_id', clientId)
            .in('tipo', ['producto', 'lifestyle'])
            .not('url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);
          if (clientAssets) {
            for (const a of clientAssets) {
              const isStorageUrl = a.url?.includes('/storage/v1/object/');
              if (a.url && !isStorageUrl && !allImages.includes(a.url) && allImages.length < 3) {
                allImages.push(a.url);
              }
            }
          }
        } catch { /* continue */ }
      }

      // Save to DB
      const { error } = await supabase.from('ad_creatives').insert({
        client_id: clientId,
        funnel,
        formato: imageUrl?.endsWith('.mp4') ? 'video' : 'static',
        angulo: anguloText,
        titulo: allHeadlines[0] || campName || 'Borrador sin título',
        texto_principal: allCopies[0]?.texto || primaryText,
        descripcion: description,
        cta: cta,
        asset_url: allImages[0] || null,
        estado: 'borrador',
        brief_visual: {
          type: 'campaign-draft',
          campaign_name: existingCampaignId ? existingCampaignName : campName,
          existing_campaign_id: existingCampaignId || undefined,
          existing_adset_id: existingAdsetId || undefined,
          budget_type: budgetType,
          objective,
          objective_label: objLabel,
          campaign_budget: campBudget,
          adset_name: adsetName,
          audience_description: audienceDesc,
          adset_budget: adsetBudget,
          destination_url: destinationUrl,
          start_date: startDate,
          dolor: audienceDesc || 'Sin definir',
          producto: campName?.split(' - ')[0] || 'Sin definir',
          metodologia: 'DCT 3:2:2 (Charles Tichener)',
          plan_accion: {
            tipo_campana: budgetType === 'ABO' ? 'ABO Testing' : 'CBO Escalamiento',
            presupuesto_diario: adsetBudget || campBudget || '10000',
            duracion: '7 dias sin tocar',
            regla_kill: 'Pausar si gasta 2x CPA sin conversion',
            metricas_dia3: 'Hook Rate >25%, Hold Rate >15%, CTR >1.5%',
          },
        },
        dct_copies: allCopies.length > 0 ? allCopies : null,
        dct_titulos: allHeadlines.length > 0 ? allHeadlines : null,
        dct_descripciones: description ? [description] : null,
        dct_imagenes: allImages.length > 0 ? allImages : null,
      });
      if (error) throw error;

      const summary = `DCT guardado: ${allImages.length}/3 imágenes, ${allCopies.length}/2 copies, ${allHeadlines.length}/2 headlines`;
      toast.success(summary);
    } catch (err) {
      console.error('[CampaignCreateWizard] Save draft error:', err);
      toast.error('Error al guardar borrador');
    } finally {
      setSavingDraft(false);
    }
  };

  // ---- Submit to Meta ----

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!ctxConnectionId) {
        toast.error('No hay conexión Meta Ads activa');
        return;
      }

      const name = campName || `Campaña - ${new Date().toISOString().split('T')[0]}`;
      const objMap: Record<Objective, string> = {
        CONVERSIONS: 'OUTCOME_SALES',
        TRAFFIC: 'OUTCOME_TRAFFIC',
        AWARENESS: 'OUTCOME_AWARENESS',
        ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
        CATALOG: 'OUTCOME_SALES',
      };

      const submitData: Record<string, any> = {
        name,
        objective: objMap[objective],
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: objective === 'TRAFFIC' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
        adset_name: adsetName || `${name} - Ad Set 1`,
        primary_text: primaryText || undefined,
        headline: headline || undefined,
        description: description || undefined,
        image_url: imageUrl || undefined,
        cta: cta || 'SHOP_NOW',
        destination_url: destinationUrl || undefined,
        page_id: ctxPageId || undefined,
      };

      // Use existing entities if selected
      if (existingCampaignId) {
        submitData.campaign_id = existingCampaignId;
      }
      if (existingAdsetId) {
        submitData.adset_id = existingAdsetId;
      }

      // Budget
      if (!existingAdsetId) {
        const budget = budgetType === 'CBO'
          ? Number(campBudget) * 100
          : Number(adsetBudget) * 100;
        submitData.daily_budget = budget || 1000000;
      }

      if (!existingCampaignId && startDate) {
        submitData.start_time = startDate;
      }

      const { error } = await callApi('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: ctxConnectionId,
          data: submitData,
        },
      });

      if (error) throw error;

      toast.success('Campaña creada como PAUSED en Meta. Activa cuando estés listo.');
      onComplete?.();
    } catch (err) {
      console.error('[CampaignCreateWizard] Submit error:', err);
      toast.error('Error al crear campaña');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Steve tip context ----

  const steveContext = {
    objective,
    audienceDesc,
    budgetType,
    funnelStage,
    headline,
    primaryText,
    campName,
    adsetName,
  };

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={wizardStarted ? () => { if (stepIndex === 0) { setWizardStarted(false); } else { goPrev(); } } : onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Crear Campaña</h2>
          <p className="text-muted-foreground text-sm">
            {wizardStarted
              ? `Paso ${stepIndex + 1} de ${steps.length}`
              : 'Elige desde dónde quieres empezar'}
          </p>
        </div>
      </div>

      {/* Pre-wizard: Level selector */}
      {!wizardStarted && (
        <LevelSelector
          level={level}
          setLevel={setLevel}
          onStart={() => setWizardStarted(true)}
        />
      )}

      {/* Wizard: Steps */}
      {wizardStarted && (
        <>
          {/* Step indicator */}
          <StepIndicator
            steps={steps}
            currentIndex={stepIndex}
            onStepClick={(i) => setStepIndex(i)}
          />

          {/* Steve AI tip */}
          <DynamicSteveTip
            clientId={clientId}
            stepKey={currentStep}
            context={steveContext}
            fallback={STEVE_FALLBACKS[currentStep] || ''}
          />

          {/* Step content */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {(() => { const Icon = steps[stepIndex].icon; return <Icon className="w-4 h-4 text-primary" />; })()}
                <CardTitle className="text-base">{steps[stepIndex].label}</CardTitle>
              </div>
              <CardDescription className="text-xs">Paso {stepIndex + 1} de {steps.length}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* SELECT CAMPAIGN step */}
              {currentStep === 'select-campaign' && ctxConnectionId && (
                <div className="space-y-4">
                  <CampaignSelector
                    connectionId={ctxConnectionId}
                    selectedCampaignId={existingCampaignId}
                    onSelect={(id, name) => { setExistingCampaignId(id); setExistingCampaignName(name); setCreateNewCampaign(false); }}
                    onCreateNew={() => { setCreateNewCampaign(true); setExistingCampaignId(null); setExistingCampaignName(''); }}
                    isCreatingNew={createNewCampaign}
                  />
                  {createNewCampaign && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="pt-4">
                        <CampaignForm
                          name={campName} setName={setCampName}
                          budgetType={budgetType} setBudgetType={setBudgetType}
                          objective={objective} setObjective={setObjective}
                          dailyBudget={campBudget} setDailyBudget={setCampBudget}
                          startDate={startDate} setStartDate={setStartDate}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* SELECT ADSET step */}
              {currentStep === 'select-adset' && ctxConnectionId && (existingCampaignId || createNewCampaign) && (
                <div className="space-y-4">
                  {existingCampaignId ? (
                    <AdSetSelector
                      connectionId={ctxConnectionId}
                      campaignId={existingCampaignId}
                      selectedAdsetId={existingAdsetId}
                      onSelect={(id, name) => { setExistingAdsetId(id); setExistingAdsetName(name); setCreateNewAdset(false); }}
                      onCreateNew={() => { setCreateNewAdset(true); setExistingAdsetId(null); setExistingAdsetName(''); }}
                      isCreatingNew={createNewAdset}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">Estás creando una campaña nueva, así que también necesitas un Ad Set nuevo.</p>
                    </div>
                  )}
                  {(createNewAdset || createNewCampaign) && (
                    <Card className="border-orange-500/20 bg-orange-500/5">
                      <CardContent className="pt-4">
                        <AdSetForm
                          name={adsetName} setName={setAdsetName}
                          audienceDesc={audienceDesc} setAudienceDesc={setAudienceDesc}
                          dailyBudget={adsetBudget} setDailyBudget={setAdsetBudget}
                          isABO={budgetType === 'ABO'}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* CAMPAIGN CONFIG step (Flow A only) */}
              {currentStep === 'campaign-config' && (
                <CampaignForm
                  name={campName} setName={setCampName}
                  budgetType={budgetType} setBudgetType={setBudgetType}
                  objective={objective} setObjective={setObjective}
                  dailyBudget={campBudget} setDailyBudget={setCampBudget}
                  startDate={startDate} setStartDate={setStartDate}
                />
              )}

              {/* ADSET CONFIG step (Flow A and B) */}
              {currentStep === 'adset-config' && (
                <AdSetForm
                  name={adsetName} setName={setAdsetName}
                  audienceDesc={audienceDesc} setAudienceDesc={setAudienceDesc}
                  dailyBudget={adsetBudget} setDailyBudget={setAdsetBudget}
                  isABO={budgetType === 'ABO'}
                />
              )}

              {/* FUNNEL STAGE step */}
              {currentStep === 'funnel-stage' && (
                <FunnelStageSelector funnelStage={funnelStage} setFunnelStage={setFunnelStage} />
              )}

              {/* AD CREATIVE step */}
              {currentStep === 'ad-creative' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                  <AdForm
                    clientId={clientId}
                    headline={headline} setHeadline={setHeadline}
                    primaryText={primaryText} setPrimaryText={setPrimaryText}
                    description={description} setDescription={setDescription}
                    imageUrl={imageUrl} setImageUrl={setImageUrl}
                    cta={cta} setCta={setCta}
                    destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
                    generating={generatingCopy}
                    onGenerateCopy={handleGenerateCopy}
                  />
                  {(primaryText || headline || imageUrl) && (
                    <div className="hidden lg:block">
                      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Vista previa</h4>
                      <div className="sticky top-4">
                        <AdPreviewMockup
                          imageUrl={imageUrl}
                          primaryText={primaryText}
                          headline={headline}
                          description={description}
                          cta={cta}
                          pageName={pageName || 'Tu Marca'}
                          destinationUrl={destinationUrl}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* REVIEW step */}
              {currentStep === 'review' && (
                <ReviewStep
                  existingCampaignId={existingCampaignId}
                  existingCampaignName={existingCampaignName}
                  campName={campName}
                  budgetType={budgetType}
                  objective={objective}
                  campBudget={campBudget}
                  startDate={startDate}
                  existingAdsetId={existingAdsetId}
                  existingAdsetName={existingAdsetName}
                  adsetName={adsetName}
                  audienceDesc={audienceDesc}
                  adsetBudget={adsetBudget}
                  funnelStage={funnelStage}
                  headline={headline}
                  primaryText={primaryText}
                  description={description}
                  imageUrl={imageUrl}
                  cta={cta}
                  destinationUrl={destinationUrl}
                  pageName={pageName || 'Tu Marca'}
                />
              )}
            </CardContent>
          </Card>

          {/* Bottom navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (stepIndex === 0) setWizardStarted(false);
                else goPrev();
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {stepIndex === 0 ? 'Volver' : 'Anterior'}
            </Button>

            <div className="flex items-center gap-2">
              {/* Save draft — available from ad-creative and review steps */}
              {(currentStep === 'ad-creative' || currentStep === 'review') && (
                <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft}>
                  {savingDraft ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" />Guardar Borrador</>
                  )}
                </Button>
              )}

              {currentStep === 'review' ? (
                <Button onClick={handleSubmit} disabled={submitting} size="lg">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Publicar en Meta (Paused)</>
                  )}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!canProceed()}>
                  Siguiente <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
