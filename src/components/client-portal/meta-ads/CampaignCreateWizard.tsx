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
  Layers,
  Plus,
  Palette,
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
type WizardStep = 'select-campaign' | 'select-adset' | 'campaign-config' | 'adset-config' | 'funnel-stage' | 'angle-select' | 'ad-creative' | 'review';
type AdSetFormat = 'flexible' | 'carousel' | 'single';

// Angle recommendations per funnel stage (from CopyGenerator.tsx)
const ANGLE_RECOMMENDATIONS: Record<string, string[]> = {
  tofu: ['Call Out', 'Bold Statement', 'Ugly Ads', 'Memes'],
  mofu: ['Reviews', 'Us vs Them', 'Credenciales en Medios', 'Reviews + Beneficios'],
  bofu: ['Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Reviews + Beneficios'],
};

const ALL_ANGLES = ['Beneficios', 'Bold Statement', 'Us vs Them', 'Call Out', 'Antes y Después', 'Beneficios Principales', 'Pantalla Dividida', 'Nueva Colección', 'Reviews', 'Detalles de Producto', 'Ugly Ads', 'Cyber/Fechas Especiales', 'Ingredientes/Material', 'Credenciales en Medios', 'Reviews + Beneficios', 'Memes', 'Descuentos/Ofertas', 'Resultados', 'Paquetes', 'Mensajes y Comentarios'];

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
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_ADSET: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'adset-config', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_AD: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'select-adset', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
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
  'angle-select': 'El ángulo define el enfoque creativo del anuncio. Para TOFU usa ángulos que interrumpan el scroll. Para BOFU usa ángulos que cierren la venta.',
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
  adSetFormat, setAdSetFormat,
  cpaTarget, setCpaTarget,
}: {
  name: string; setName: (v: string) => void;
  audienceDesc: string; setAudienceDesc: (v: string) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  isABO: boolean;
  adSetFormat: AdSetFormat; setAdSetFormat: (v: AdSetFormat) => void;
  cpaTarget: string; setCpaTarget: (v: string) => void;
}) {
  const cpa = Number(cpaTarget) || 0;
  const recommendedBudget = cpa > 0 ? Math.round((cpa * 10) / 7) : 0;

  // Auto-fill budget when CPA changes
  useEffect(() => {
    if (recommendedBudget > 0 && isABO && !dailyBudget) {
      setDailyBudget(String(recommendedBudget));
    }
  }, [recommendedBudget]);

  const formats: { key: AdSetFormat; label: string; desc: string; icon: React.ElementType; recommended?: boolean }[] = [
    { key: 'flexible', label: 'Flexible', desc: 'Meta optimiza combinaciones. 3 fotos, 2 textos, 2 headlines.', icon: Layers, recommended: isABO },
    { key: 'carousel', label: 'Carrusel', desc: 'Múltiples imágenes en swipe. 3+ fotos.', icon: ImageIcon },
    { key: 'single', label: 'Imagen Única', desc: 'Un solo creativo. 1 foto, 1 texto, 1 headline.', icon: FileImage },
  ];

  return (
    <div className="space-y-5">
      {/* Format selector */}
      <div>
        <Label className="text-sm font-semibold">Formato del Ad Set</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {formats.map((f) => {
            const Icon = f.icon;
            const isActive = adSetFormat === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setAdSetFormat(f.key)}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-lg border text-center transition-all ${
                  isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                }`}
              >
                {f.recommended && (
                  <Badge className="absolute -top-2 right-1 text-[9px] bg-green-500/15 text-green-700 border-green-500/30">Steve recomienda</Badge>
                )}
                <Icon className={`w-6 h-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-xs font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{f.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{f.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Nombre del Ad Set</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="[Audiencia] - [Variable test]" className="mt-1" />
      </div>

      <div>
        <Label>Audiencia / Segmento</Label>
        <Textarea value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Describe la audiencia: demographics, intereses, comportamiento..." rows={3} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Puedes crear audiencias detalladas en la sección Audiencias.</p>
      </div>

      {/* CPA + Budget */}
      {isABO && (
        <>
          <div>
            <Label>CPA Objetivo (CLP)</Label>
            <Input type="number" value={cpaTarget} onChange={(e) => setCpaTarget(e.target.value)} placeholder="15000" className="mt-1" />
            {recommendedBudget > 0 && (
              <p className="text-xs text-primary mt-1 font-medium">
                Steve recomienda: ${recommendedBudget.toLocaleString('es-CL')}/día por Ad Set
                <span className="text-muted-foreground font-normal"> (CPA × 10 compras ÷ 7 días = data suficiente para validar)</span>
              </p>
            )}
          </div>

          <div>
            <Label>Presupuesto diario del Ad Set (CLP)</Label>
            <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="10000" className="mt-1" />
          </div>
        </>
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
// Angle Selector
// ---------------------------------------------------------------------------

function AngleSelector({
  funnelStage,
  selectedAngle, setSelectedAngle,
}: {
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  selectedAngle: string;
  setSelectedAngle: (v: string) => void;
}) {
  const recommended = ANGLE_RECOMMENDATIONS[funnelStage] || [];
  const others = ALL_ANGLES.filter((a) => !recommended.includes(a));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Steve recomienda estos ángulos creativos para <Badge className="text-[10px]">{funnelStage.toUpperCase()}</Badge>:
      </p>

      {/* Recommended angles */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-primary">Recomendados por Steve</Label>
        <div className="grid grid-cols-2 gap-2">
          {recommended.map((angle) => {
            const isActive = selectedAngle === angle;
            return (
              <button
                key={angle}
                onClick={() => setSelectedAngle(angle)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                  isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                }`}
              >
                <Sparkles className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{angle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Other angles */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Otros ángulos disponibles</Label>
        <div className="flex flex-wrap gap-1.5">
          {others.map((angle) => {
            const isActive = selectedAngle === angle;
            return (
              <button
                key={angle}
                onClick={() => setSelectedAngle(angle)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                {angle}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Form (Multi-slot)
// ---------------------------------------------------------------------------

type MediaTab = 'upload' | 'ai-image' | 'ai-video' | 'gallery' | 'url';
type AspectRatio = '1:1' | '9:16' | '16:9';

function AdFormMultiSlot({
  clientId,
  adSetFormat,
  selectedAngle,
  headlines, setHeadlines,
  primaryTexts, setPrimaryTexts,
  description, setDescription,
  images, setImages,
  cta, setCta,
  destinationUrl, setDestinationUrl,
  generating,
  onGenerateCopy,
}: {
  clientId: string;
  adSetFormat: AdSetFormat;
  selectedAngle: string;
  headlines: string[]; setHeadlines: (v: string[]) => void;
  primaryTexts: string[]; setPrimaryTexts: (v: string[]) => void;
  description: string; setDescription: (v: string) => void;
  images: string[]; setImages: (v: string[]) => void;
  cta: string; setCta: (v: string) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  generating: boolean;
  onGenerateCopy: () => void;
}) {
  const [activeImageSlot, setActiveImageSlot] = useState(0);
  const [mediaTab, setMediaTab] = useState<MediaTab>('upload');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [imageEngine, setImageEngine] = useState<'gpt4o' | 'flux'>('gpt4o');
  const [galleryAssets, setGalleryAssets] = useState<Array<{ id: string; url: string; tipo: string }>>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const setImageAtSlot = (url: string) => {
    const next = [...images];
    next[activeImageSlot] = url;
    setImages(next);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error('Solo imágenes y videos'); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error('Max 20MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `assets/${clientId}/uploads/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-assets').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('client-assets').getPublicUrl(path);
      setImageAtSlot(publicUrl);
      toast.success(`Imagen ${activeImageSlot + 1} subida`);
    } catch (err: any) { toast.error(err?.message || 'Error'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe la imagen'); return; }
    setGeneratingImage(true);
    try {
      const formatMap: Record<AspectRatio, string> = { '1:1': 'square', '9:16': 'story', '16:9': 'feed' };
      const anglePrompt = selectedAngle ? ` Ángulo creativo: ${selectedAngle}.` : '';
      const { data, error } = await callApi('generate-image', {
        body: { clientId, promptGeneracion: aiPrompt + anglePrompt, engine: imageEngine, formato: formatMap[aspectRatio] },
      });
      if (error) throw error;
      if (data?.error === 'NO_CREDITS') { toast.error('Sin créditos (2 por imagen)'); return; }
      if (data?.asset_url) { setImageAtSlot(data.asset_url); toast.success(`Imagen ${activeImageSlot + 1} generada`); }
    } catch (err: any) { toast.error(err?.message || 'Error'); }
    finally { setGeneratingImage(false); }
  };

  const canAddMoreImages = adSetFormat === 'flexible' || adSetFormat === 'carousel';
  const canAddMoreTexts = adSetFormat === 'flexible';

  const MEDIA_TABS: Array<{ key: MediaTab; label: string; icon: React.ElementType }> = [
    { key: 'upload', label: 'Subir', icon: Upload },
    { key: 'ai-image', label: 'IA Imagen', icon: Sparkles },
    { key: 'gallery', label: 'Galería', icon: ImageIcon },
    { key: 'url', label: 'URL', icon: LinkIcon },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          {adSetFormat === 'flexible' ? 'Flexible (DCT 3:2:2)' : adSetFormat === 'carousel' ? 'Carrusel' : 'Imagen Única'}
        </Badge>
        <Button variant="outline" size="sm" onClick={onGenerateCopy} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Steve genera copy
        </Button>
      </div>

      {/* ---- IMAGE SLOTS ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Creativos ({images.length} {images.length === 1 ? 'imagen' : 'imágenes'})</Label>
          {canAddMoreImages && (
            <Button variant="ghost" size="sm" onClick={() => setImages([...images, ''])} className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />Agregar
            </Button>
          )}
        </div>

        {adSetFormat === 'flexible' && images.length <= 3 && (
          <p className="text-[11px] text-muted-foreground">Steve recomienda 3 imágenes para testing óptimo (DCT 3:2:2)</p>
        )}

        {/* Image slot tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImageSlot(i)}
              className={`relative w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                activeImageSlot === i ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              {img ? (
                <img src={img} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center">{i + 1}</span>
              {img && images.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const next = images.filter((_, j) => j !== i); setImages(next); if (activeImageSlot >= next.length) setActiveImageSlot(Math.max(0, next.length - 1)); }}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="w-2 h-2" />
                </button>
              )}
            </button>
          ))}
        </div>

        {/* Aspect ratio */}
        <div className="flex gap-2">
          {([['1:1', 'Cuadrado'], ['9:16', 'Vertical'], ['16:9', 'Horizontal']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAspectRatio(key)} className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${aspectRatio === key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Media source tabs for active slot */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {MEDIA_TABS.map((t) => { const Icon = t.icon; return (
            <button key={t.key} onClick={() => setMediaTab(t.key)} className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${mediaTab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-3 h-3" /><span className="hidden sm:inline">{t.label}</span>
            </button>
          ); })}
        </div>

        {mediaTab === 'upload' && (
          <div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
              {uploading ? <><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-1" /><p className="text-xs text-muted-foreground">Subiendo...</p></> : <><Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" /><p className="text-xs text-muted-foreground">Subir imagen {activeImageSlot + 1}</p></>}
            </button>
          </div>
        )}

        {mediaTab === 'ai-image' && (
          <div className="space-y-2">
            <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={`Describe la imagen ${activeImageSlot + 1}${selectedAngle ? ` (ángulo: ${selectedAngle})` : ''}...`} rows={2} />
            <div className="flex gap-2">
              <Select value={imageEngine} onValueChange={(v: 'gpt4o' | 'flux') => setImageEngine(v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt4o">GPT-4o (2 cred)</SelectItem>
                  <SelectItem value="flux">Flux Pro (2 cred)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleGenerateImage} disabled={generatingImage || !aiPrompt.trim()} className="flex-1">
                {generatingImage ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando...</> : <><Sparkles className="w-3 h-3 mr-1" />Generar</>}
              </Button>
            </div>
          </div>
        )}

        {mediaTab === 'gallery' && (
          <div>
            {loadingGallery ? <div className="grid grid-cols-4 gap-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded" />)}</div>
            : galleryAssets.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                {galleryAssets.map((a) => (
                  <button key={a.id} onClick={() => { setImageAtSlot(a.url); toast.success(`Imagen ${activeImageSlot + 1} seleccionada`); }} className={`aspect-square rounded overflow-hidden border-2 transition-all ${images[activeImageSlot] === a.url ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/30'}`}>
                    <img src={a.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-4">No hay assets</p>}
          </div>
        )}

        {mediaTab === 'url' && (
          <Input value={images[activeImageSlot] || ''} onChange={(e) => setImageAtSlot(e.target.value)} placeholder="https://tu-imagen.com/foto.jpg" />
        )}
      </div>

      {/* ---- HEADLINE SLOTS ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Headlines ({headlines.length})</Label>
          {canAddMoreTexts && (
            <Button variant="ghost" size="sm" onClick={() => setHeadlines([...headlines, ''])} className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />Agregar
            </Button>
          )}
        </div>
        {headlines.map((hl, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
            <Input value={hl} onChange={(e) => { const next = [...headlines]; next[i] = e.target.value; setHeadlines(next); }} placeholder={`Headline ${i + 1}`} />
            {headlines.length > 1 && (
              <button onClick={() => { const next = headlines.filter((_, j) => j !== i); setHeadlines(next); }} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>

      {/* ---- PRIMARY TEXT SLOTS ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Textos principales ({primaryTexts.length})</Label>
          {canAddMoreTexts && (
            <Button variant="ghost" size="sm" onClick={() => setPrimaryTexts([...primaryTexts, ''])} className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />Agregar
            </Button>
          )}
        </div>
        {primaryTexts.map((txt, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-xs text-muted-foreground w-4 shrink-0 mt-2">{i + 1}.</span>
            <Textarea value={txt} onChange={(e) => { const next = [...primaryTexts]; next[i] = e.target.value; setPrimaryTexts(next); }} placeholder={`Texto ${i + 1} — habla al dolor/deseo de tu audiencia`} rows={2} className="flex-1" />
            {primaryTexts.length > 1 && (
              <button onClick={() => { const next = primaryTexts.filter((_, j) => j !== i); setPrimaryTexts(next); }} className="text-muted-foreground hover:text-destructive mt-2"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>

      {/* Description + CTA + URL */}
      <div className="space-y-4">
        <div>
          <Label>Descripción (opcional)</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción adicional" className="mt-1" />
        </div>
        <div>
          <Label>Botón CTA</Label>
          <Select value={cta} onValueChange={(v) => setCta(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CTA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
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

  // Ad Set format + CPA
  const [adSetFormat, setAdSetFormat] = useState<AdSetFormat>('flexible');
  const [cpaTarget, setCpaTarget] = useState('');

  // Angle
  const [selectedAngle, setSelectedAngle] = useState('');

  // Ad fields (multi-slot)
  const [headlines, setHeadlines] = useState<string[]>(['']);
  const [primaryTexts, setPrimaryTexts] = useState<string[]>(['']);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>(['']);
  const [cta, setCta] = useState('SHOP_NOW');
  const [destinationUrl, setDestinationUrl] = useState('');

  // Reset slot counts when format changes
  useEffect(() => {
    const imgCount = adSetFormat === 'single' ? 1 : 3;
    const txtCount = adSetFormat === 'flexible' ? 2 : 1;
    setImages((prev) => {
      if (prev.length === imgCount) return prev;
      const next = prev.slice(0, imgCount);
      while (next.length < imgCount) next.push('');
      return next;
    });
    setHeadlines((prev) => {
      if (prev.length === txtCount) return prev;
      const next = prev.slice(0, txtCount);
      while (next.length < txtCount) next.push('');
      return next;
    });
    setPrimaryTexts((prev) => {
      if (prev.length === txtCount) return prev;
      const next = prev.slice(0, txtCount);
      while (next.length < txtCount) next.push('');
      return next;
    });
  }, [adSetFormat]);

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
      case 'angle-select':
        return !!selectedAngle;
      case 'ad-creative':
        return primaryTexts.some((t) => t.trim()) && headlines.some((h) => h.trim());
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
      const isMulti = adSetFormat === 'flexible';
      const angleHint = selectedAngle ? ` Ángulo creativo: ${selectedAngle}.` : '';
      const instruction = isMulti
        ? [
            `Genera copy para DCT 3:2:2 de Meta Ads.${angleHint}`,
            `Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}. Funnel: ${funnelStage}.`,
            'Necesito 2 variaciones de texto principal y 2 de headline con enfoques diferentes.',
            'Responde SOLO con JSON: {"texts":["texto1","texto2"],"headlines":["headline1","headline2"],"description":"descripcion"}',
          ].join('\n')
        : `Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}. Funnel: ${funnelStage}.${angleHint}`;

      const { data, error } = await callApi('generate-meta-copy', {
        body: {
          clientId: clientId,
          funnelStage,
          adType: 'static',
          customPrompt: instruction,
        },
      });
      if (error) throw error;
      const raw = data?.copy || data?.text || '';
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (isMulti) {
          if (parsed.texts?.length) setPrimaryTexts(parsed.texts.slice(0, 2));
          if (parsed.headlines?.length) setHeadlines(parsed.headlines.slice(0, 2));
          if (parsed.description) setDescription(parsed.description);
        } else {
          if (parsed.primary_text || parsed.texts?.[0]) {
            const next = [...primaryTexts];
            next[0] = parsed.primary_text || parsed.texts[0];
            setPrimaryTexts(next);
          }
          if (parsed.headline || parsed.headlines?.[0]) {
            const next = [...headlines];
            next[0] = parsed.headline || parsed.headlines[0];
            setHeadlines(next);
          }
          if (parsed.description) setDescription(parsed.description);
        }
        toast.success('Copy generado por Steve');
      } catch {
        const next = [...primaryTexts];
        next[0] = raw.slice(0, 200);
        setPrimaryTexts(next);
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
      const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
      const anguloText = selectedAngle || `${objLabel} — ${audienceDesc?.substring(0, 80) || 'Campaña directa'}`;

      const filledImages = images.filter(Boolean);
      const filledTexts = primaryTexts.filter(Boolean);
      const filledHeadlines = headlines.filter(Boolean);
      const allCopies = filledTexts.map((t, i) => ({ texto: t, tipo: i === 0 ? 'original' : 'variacion' }));

      const { error } = await supabase.from('ad_creatives').insert({
        client_id: clientId,
        funnel: funnelStage,
        formato: adSetFormat === 'carousel' ? 'carousel' : filledImages[0]?.endsWith('.mp4') ? 'video' : 'static',
        angulo: anguloText,
        titulo: filledHeadlines[0] || campName || 'Borrador sin título',
        texto_principal: filledTexts[0] || '',
        descripcion: description,
        cta: cta,
        asset_url: filledImages[0] || null,
        estado: 'borrador',
        brief_visual: {
          type: 'campaign-draft',
          ad_set_format: adSetFormat,
          selected_angle: selectedAngle,
          cpa_target: cpaTarget,
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
          metodologia: adSetFormat === 'flexible' ? 'DCT 3:2:2 (Charles Tichener)' : adSetFormat,
          plan_accion: {
            tipo_campana: budgetType === 'ABO' ? 'ABO Testing' : 'CBO Escalamiento',
            presupuesto_diario: adsetBudget || campBudget || '10000',
            duracion: '7 dias sin tocar',
            regla_kill: 'Pausar si gasta 2x CPA sin conversion',
            metricas_dia3: 'Hook Rate >25%, Hold Rate >15%, CTR >1.5%',
          },
        },
        dct_copies: allCopies.length > 0 ? allCopies : null,
        dct_titulos: filledHeadlines.length > 0 ? filledHeadlines : null,
        dct_descripciones: description ? [description] : null,
        dct_imagenes: filledImages.length > 0 ? filledImages : null,
      });
      if (error) throw error;

      const summary = `Borrador guardado: ${filledImages.length} imágenes, ${filledTexts.length} copies, ${filledHeadlines.length} headlines`;
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

      const filledTexts = primaryTexts.filter(Boolean);
      const filledHeadlines = headlines.filter(Boolean);
      const filledImages = images.filter(Boolean);

      const submitData: Record<string, any> = {
        name,
        objective: objMap[objective],
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: objective === 'TRAFFIC' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
        adset_name: adsetName || `${name} - Ad Set 1`,
        primary_text: filledTexts[0] || undefined,
        headline: filledHeadlines[0] || undefined,
        description: description || undefined,
        image_url: filledImages[0] || undefined,
        cta: cta || 'SHOP_NOW',
        destination_url: destinationUrl || undefined,
        page_id: ctxPageId || undefined,
        ad_set_format: adSetFormat,
        images: filledImages.length > 1 ? filledImages : undefined,
        texts: filledTexts.length > 1 ? filledTexts : undefined,
        headlines: filledHeadlines.length > 1 ? filledHeadlines : undefined,
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
    selectedAngle,
    adSetFormat,
    headline: headlines[0] || '',
    primaryText: primaryTexts[0] || '',
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
                          adSetFormat={adSetFormat} setAdSetFormat={setAdSetFormat}
                          cpaTarget={cpaTarget} setCpaTarget={setCpaTarget}
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
                  adSetFormat={adSetFormat} setAdSetFormat={setAdSetFormat}
                  cpaTarget={cpaTarget} setCpaTarget={setCpaTarget}
                />
              )}

              {/* FUNNEL STAGE step */}
              {currentStep === 'funnel-stage' && (
                <FunnelStageSelector funnelStage={funnelStage} setFunnelStage={setFunnelStage} />
              )}

              {/* ANGLE SELECT step */}
              {currentStep === 'angle-select' && (
                <AngleSelector
                  funnelStage={funnelStage}
                  selectedAngle={selectedAngle}
                  setSelectedAngle={setSelectedAngle}
                />
              )}

              {/* AD CREATIVE step */}
              {currentStep === 'ad-creative' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                  <AdFormMultiSlot
                    clientId={clientId}
                    adSetFormat={adSetFormat}
                    selectedAngle={selectedAngle}
                    headlines={headlines} setHeadlines={setHeadlines}
                    primaryTexts={primaryTexts} setPrimaryTexts={setPrimaryTexts}
                    description={description} setDescription={setDescription}
                    images={images} setImages={setImages}
                    cta={cta} setCta={setCta}
                    destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
                    generating={generatingCopy}
                    onGenerateCopy={handleGenerateCopy}
                  />
                  {(primaryTexts[0] || headlines[0] || images[0]) && (
                    <div className="hidden lg:block">
                      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Vista previa</h4>
                      <div className="sticky top-4">
                        <AdPreviewMockup
                          imageUrl={images[0] || ''}
                          primaryText={primaryTexts[0] || ''}
                          headline={headlines[0] || ''}
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
                  headline={headlines[0] || ''}
                  primaryText={primaryTexts[0] || ''}
                  description={description}
                  imageUrl={images[0] || ''}
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
