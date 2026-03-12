import { useState, useMemo, useCallback } from 'react';
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
  Sparkles,
  Image as ImageIcon,
  FileText,
  Type,
  Grid3X3,
  Calculator,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  Lightbulb,
  DollarSign,
  Target,
  Upload,
  Wand2,
  AlertTriangle,
  Eye,
  Zap,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';
import AdPreviewMockup from './AdPreviewMockup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestingWizard322Props {
  clientId: string;
  onBack: () => void;
  onComplete?: () => void;
}

interface Combination {
  index: number;
  imageIndex: number;
  copyIndex: number;
  headlineIndex: number;
  imageUrl: string;
  primaryText: string;
  headline: string;
  adsetName: string;
}

type WizardStep = 'config' | 'images' | 'copies' | 'headlines' | 'combinations' | 'budget' | 'review';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'config', label: 'Configuración', icon: Target },
  { key: 'images', label: 'Creativos (3)', icon: ImageIcon },
  { key: 'copies', label: 'Copies (2)', icon: FileText },
  { key: 'headlines', label: 'Títulos (2)', icon: Type },
  { key: 'combinations', label: 'Combinaciones', icon: Grid3X3 },
  { key: 'budget', label: 'Presupuesto', icon: Calculator },
  { key: 'review', label: 'Revisar y Lanzar', icon: Rocket },
];

const fmtCLP = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

// ---------------------------------------------------------------------------
// Steve Tips component
// ---------------------------------------------------------------------------

function SteveTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-foreground leading-relaxed">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Config
// ---------------------------------------------------------------------------

function StepConfig({
  campaignName,
  setCampaignName,
  cpaTarget,
  setCpaTarget,
  audienceDesc,
  setAudienceDesc,
  destinationUrl,
  setDestinationUrl,
  funnelStage,
  setFunnelStage,
  clientId,
}: {
  campaignName: string;
  setCampaignName: (v: string) => void;
  cpaTarget: string;
  setCpaTarget: (v: string) => void;
  audienceDesc: string;
  setAudienceDesc: (v: string) => void;
  destinationUrl: string;
  setDestinationUrl: (v: string) => void;
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  setFunnelStage: (v: 'tofu' | 'mofu' | 'bofu') => void;
  clientId: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const suggestedName = `Testing 3:2:2 - ${today}`;

  return (
    <div className="space-y-5">
      <SteveTip>
        La metodología 3:2:2 de Charles Tichner crea 12 combinaciones únicas (3 imágenes x 2 copies x 2 headlines). Cada combinación va en su propio Ad Set con 1 solo ad para testear variables aisladas. Campaña ABO, 7 días sin tocar.
      </SteveTip>

      <div>
        <Label>Nombre de la campaña</Label>
        <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder={suggestedName} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Steve sugiere: {suggestedName}</p>
      </div>

      <div>
        <Label>URL de destino</Label>
        <Input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://tu-tienda.com" className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">URL a la que llegarán los usuarios al hacer clic en los anuncios.</p>
      </div>

      <div>
        <Label>Etapa del Funnel</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {([
            { key: 'tofu' as const, label: 'TOFU', desc: 'Awareness' },
            { key: 'mofu' as const, label: 'MOFU', desc: 'Consideración' },
            { key: 'bofu' as const, label: 'BOFU', desc: 'Conversión' },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFunnelStage(f.key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all ${
                funnelStage === f.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              <span className="font-bold">{f.label}</span>
              <span className="text-[10px] text-muted-foreground">{f.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Steve ajusta el copy según la etapa del funnel (Sabri Suby + Russell Brunson).</p>
      </div>

      <div>
        <Label>CPA Objetivo (CLP)</Label>
        <Input type="number" value={cpaTarget} onChange={(e) => setCpaTarget(e.target.value)} placeholder="Ej: 15000" className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Si no sabes tu CPA, Steve lo estima: AOV x (1 - margen%) / 3. Revisa tu Shopify.</p>
      </div>

      <div>
        <Label>Descripción de audiencia objetivo</Label>
        <Textarea value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Ej: Mujeres 25-45, interesadas en skincare, Chile" rows={3} className="mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Images
// ---------------------------------------------------------------------------

function StepImages({
  images,
  setImages,
  generating,
  onGenerate,
}: {
  images: string[];
  setImages: (imgs: string[]) => void;
  generating: boolean;
  onGenerate: (index: number) => void;
}) {
  const updateImage = (index: number, value: string) => {
    const next = [...images];
    next[index] = value;
    setImages(next);
  };

  return (
    <div className="space-y-5">
      <SteveTip>
        3 creativos diferentes: variaciones de ángulo visual (producto solo, lifestyle, before/after). Cada imagen se combinará con los 2 copies y 2 headlines = 4 ads por imagen.
      </SteveTip>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className={`${images[i] ? 'border-primary/30' : 'border-dashed'}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">Imagen {i + 1}</Badge>
                {images[i] && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>

              {images[i] ? (
                <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  <img src={images[i]} alt={`Creativo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-muted/50 border-2 border-dashed border-border flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Sin imagen</p>
                </div>
              )}

              <Input
                placeholder="URL de imagen..."
                value={images[i] || ''}
                onChange={(e) => updateImage(i, e.target.value)}
                className="text-xs"
              />

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onGenerate(i)}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wand2 className="w-3 h-3 mr-1" />}
                Generar con IA
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Copies / Headlines (reusable)
// ---------------------------------------------------------------------------

function StepTextVariants({
  type,
  values,
  setValues,
  generating,
  onGenerate,
}: {
  type: 'copy' | 'headline';
  values: string[];
  setValues: (v: string[]) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  const count = values.length;
  const label = type === 'copy' ? 'Copy (texto principal)' : 'Título';
  const placeholder = type === 'copy'
    ? 'Escribe el texto principal del anuncio...'
    : 'Escribe el título...';
  const tip = type === 'copy'
    ? '2 copies diferentes permiten testear distintos ángulos de mensaje: uno emocional y otro racional, o uno corto y otro largo.'
    : '2 headlines diferentes: uno enfocado en beneficio y otro en urgencia/oferta. Meta muestra el headline debajo de la imagen.';

  const updateValue = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    setValues(next);
  };

  return (
    <div className="space-y-5">
      <SteveTip>{tip}</SteveTip>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label} ({count} variantes)</h3>
        <Button variant="outline" size="sm" onClick={onGenerate} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Generar con Steve
        </Button>
      </div>

      <div className="space-y-4">
        {values.map((val, i) => (
          <div key={i}>
            <Label className="text-xs">{type === 'copy' ? 'Copy' : 'Título'} {i + 1}</Label>
            {type === 'copy' ? (
              <Textarea value={val} onChange={(e) => updateValue(i, e.target.value)} placeholder={placeholder} rows={4} className="mt-1" />
            ) : (
              <Input value={val} onChange={(e) => updateValue(i, e.target.value)} placeholder={placeholder} className="mt-1" />
            )}
            <p className="text-[11px] text-muted-foreground mt-1">{val.length} caracteres</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Combinations preview
// ---------------------------------------------------------------------------

function StepCombinations({ combinations }: { combinations: Combination[] }) {
  return (
    <div className="space-y-5">
      <SteveTip>
        12 combinaciones generadas automáticamente. Cada una irá en su propio Ad Set con 1 solo ad. Así testeas variables aisladas: si cambias imagen y el CTR sube, sabes que fue la imagen.
      </SteveTip>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {combinations.map((combo) => (
          <Card key={combo.index} className="overflow-hidden">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  Ad Set {combo.index + 1}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  I{combo.imageIndex + 1} / C{combo.copyIndex + 1} / H{combo.headlineIndex + 1}
                </span>
              </div>

              {combo.imageUrl ? (
                <div className="aspect-video rounded bg-muted overflow-hidden">
                  <img src={combo.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video rounded bg-muted/50 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                </div>
              )}

              <p className="text-xs font-semibold line-clamp-1">{combo.headline || '(título)'}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{combo.primaryText || '(texto)'}</p>
              <p className="text-[10px] text-muted-foreground/70 truncate">{combo.adsetName}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Budget
// ---------------------------------------------------------------------------

function StepBudget({
  cpaTarget,
  combinations,
}: {
  cpaTarget: number;
  combinations: Combination[];
}) {
  const count = combinations.length;
  const budgetPerAdset = cpaTarget > 0 ? Math.round((cpaTarget * 50) / 7) : 0;
  const minBudgetPerAdset = cpaTarget > 0 ? Math.round((cpaTarget * 10) / 7) : 0;
  const totalDaily = budgetPerAdset * count;
  const totalWeekly = totalDaily * 7;
  const minDailyTotal = minBudgetPerAdset * count;

  return (
    <div className="space-y-5">
      <SteveTip>
        Presupuesto ideal por Ad Set = (CPA objetivo x 50) / 7 días. Esto da suficiente data estadística para declarar ganadores. Mínimo recomendado = (CPA x 10) / 7.
      </SteveTip>

      {cpaTarget <= 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">No definiste un CPA objetivo. Vuelve al paso 1 para ingresarlo o Steve lo estimará de tu Shopify.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Presupuesto Ideal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>Por Ad Set / día:</span><span className="font-bold">{fmtCLP(budgetPerAdset)}</span></div>
            <div className="flex justify-between text-sm"><span>Total diario ({count} ad sets):</span><span className="font-bold text-primary">{fmtCLP(totalDaily)}</span></div>
            <div className="flex justify-between text-sm"><span>Total 7 días:</span><span className="font-bold">{fmtCLP(totalWeekly)}</span></div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Presupuesto Mínimo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>Por Ad Set / día:</span><span className="font-bold">{fmtCLP(minBudgetPerAdset)}</span></div>
            <div className="flex justify-between text-sm"><span>Total diario ({count} ad sets):</span><span className="font-bold">{fmtCLP(minDailyTotal)}</span></div>
            <div className="flex justify-between text-sm"><span>Total 7 días:</span><span className="font-bold">{fmtCLP(minDailyTotal * 7)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <h4 className="text-sm font-semibold mb-2">Reglas de Ejecución</h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>1. Tipo de campaña: <strong>ABO (Ad Budget Optimization)</strong></li>
            <li>2. Cada Ad Set tiene <strong>1 solo ad</strong> con 1 combinación única</li>
            <li>3. <strong>No tocar nada durante 7 días</strong> — recopilar data estadística</li>
            <li>4. Día 7: Steve clasifica ganadores, potenciales y perdedores</li>
            <li>5. Ganadores pasan a campaña <strong>CBO para escalar</strong></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

export default function TestingWizard322({ clientId, onBack, onComplete }: TestingWizard322Props) {
  const { connectionId: ctxConnectionId, pageId: ctxPageId } = useMetaBusiness();

  const [step, setStep] = useState<WizardStep>('config');
  const [publishing, setPublishing] = useState(false);

  // Config
  const [campaignName, setCampaignName] = useState('');
  const [cpaTarget, setCpaTarget] = useState('');
  const [audienceDesc, setAudienceDesc] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');

  // Funnel stage
  const [funnelStage, setFunnelStage] = useState<'tofu' | 'mofu' | 'bofu'>('tofu');

  // Images
  const [images, setImages] = useState<string[]>(['', '', '']);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Copies
  const [copies, setCopies] = useState<string[]>(['', '']);
  const [generatingCopy, setGeneratingCopy] = useState(false);

  // Headlines
  const [headlines, setHeadlines] = useState<string[]>(['', '']);
  const [generatingHeadline, setGeneratingHeadline] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // ---------- Generate AI content ----------
  const handleGenerateImage = async (index: number) => {
    setGeneratingImage(true);
    try {
      const { data, error } = await callApi('generate-image', {
        body: { clientId, promptGeneracion: `Producto para anuncio de Meta Ads. Variación ${index + 1}. ${audienceDesc}` },
      });
      if (error) throw error;
      if (data?.asset_url) {
        const next = [...images];
        next[index] = data.asset_url;
        setImages(next);
        toast.success(`Imagen ${index + 1} generada`);
      }
    } catch {
      toast.error('Error generando imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleGenerateCopies = async () => {
    setGeneratingCopy(true);
    try {
      const { data, error } = await callApi('generate-meta-copy', {
        body: {
          clientId: clientId,
          funnelStage,
          adType: 'static',
          customPrompt: `Genera 2 copies DIFERENTES para testing 3:2:2. Audiencia: ${audienceDesc}. Copy 1: enfoque emocional. Copy 2: enfoque racional. Máximo 125 caracteres cada uno. Responde SOLO con JSON: {"copies":["copy1","copy2"]}`,
        },
      });
      if (error) throw error;
      const raw = data?.copy || data?.text || '';
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.copies && Array.isArray(parsed.copies)) {
          setCopies(parsed.copies.slice(0, 2));
          toast.success('Copies generados por Steve');
        }
      } catch {
        setCopies([raw.slice(0, 200), '']);
      }
    } catch {
      toast.error('Error generando copies');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const handleGenerateHeadlines = async () => {
    setGeneratingHeadline(true);
    try {
      const { data, error } = await callApi('generate-meta-copy', {
        body: {
          clientId: clientId,
          funnelStage,
          adType: 'static',
          customPrompt: `Genera 2 headlines DIFERENTES para testing 3:2:2. Audiencia: ${audienceDesc}. Headline 1: beneficio principal. Headline 2: urgencia/oferta. Máximo 40 caracteres cada uno. Responde SOLO con JSON: {"headlines":["h1","h2"]}`,
        },
      });
      if (error) throw error;
      const raw = data?.copy || data?.text || '';
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.headlines && Array.isArray(parsed.headlines)) {
          setHeadlines(parsed.headlines.slice(0, 2));
          toast.success('Headlines generados por Steve');
        }
      } catch {
        setHeadlines([raw.slice(0, 80), '']);
      }
    } catch {
      toast.error('Error generando headlines');
    } finally {
      setGeneratingHeadline(false);
    }
  };

  // ---------- Combinations ----------
  const combinations = useMemo<Combination[]>(() => {
    const result: Combination[] = [];
    let index = 0;
    for (let img = 0; img < 3; img++) {
      for (let copy = 0; copy < 2; copy++) {
        for (let hl = 0; hl < 2; hl++) {
          result.push({
            index,
            imageIndex: img,
            copyIndex: copy,
            headlineIndex: hl,
            imageUrl: images[img] || '',
            primaryText: copies[copy] || '',
            headline: headlines[hl] || '',
            adsetName: `I${img + 1}_C${copy + 1}_H${hl + 1}`,
          });
          index++;
        }
      }
    }
    return result;
  }, [images, copies, headlines]);

  // ---------- Publish ----------
  const handlePublish = async () => {
    setPublishing(true);
    try {
      if (!ctxConnectionId) {
        toast.error('No hay conexión Meta Ads activa');
        return;
      }
      if (!ctxPageId) {
        toast.error('No hay Facebook Page seleccionada. Selecciona un portfolio con página.');
        return;
      }
      if (!destinationUrl) {
        toast.error('Ingresa la URL de destino en el paso de configuración.');
        return;
      }

      const name = campaignName || `Testing 3:2:2 - ${new Date().toISOString().split('T')[0]}`;
      const cpa = Number(cpaTarget) || 15000;
      const budgetPerAdset = Math.round((cpa * 50) / 7);

      const { data: result, error: err } = await callApi('manage-meta-campaign', {
        body: {
          action: 'create_322',
          connection_id: ctxConnectionId,
          data: {
            name,
            objective: 'OUTCOME_SALES',
            status: 'PAUSED',
            cta: 'SHOP_NOW',
            destination_url: destinationUrl,
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'OFFSITE_CONVERSIONS',
            page_id: ctxPageId,
            combinations: combinations.map((c) => ({
              adset_name: c.adsetName,
              image_url: c.imageUrl,
              primary_text: c.primaryText,
              headline: c.headline,
              daily_budget: budgetPerAdset, // CLP has no cents — send as-is
            })),
          },
        },
      });

      if (err) throw err;

      const created = result?.created || 0;
      const total = result?.total || combinations.length;
      toast.success(`Campaña "${name}" creada: ${created}/${total} ads publicados en Meta (Paused).`);
      onComplete?.();
    } catch {
      toast.error('Error al crear campaña 3:2:2');
    } finally {
      setPublishing(false);
    }
  };

  // ---------- Navigation ----------
  const canProceed = () => {
    switch (step) {
      case 'config': return true;
      case 'images': return images.some((i) => i.trim());
      case 'copies': return copies.some((c) => c.trim());
      case 'headlines': return headlines.some((h) => h.trim());
      default: return true;
    }
  };

  const goNext = () => {
    const i = stepIndex;
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].key);
  };
  const goPrev = () => {
    const i = stepIndex;
    if (i > 0) setStep(STEPS[i - 1].key);
  };

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Testing 3:2:2 — Metodología Tichner
          </h2>
          <p className="text-muted-foreground text-sm">3 imágenes x 2 copies x 2 headlines = 12 Ad Sets con 1 ad cada uno</p>
        </div>
      </div>

      {/* Steps progress */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = s.key === step;
          const isPast = i < stepIndex;
          return (
            <button
              key={s.key}
              onClick={() => i <= stepIndex && setStep(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                isCurrent ? 'bg-primary text-primary-foreground' : isPast ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {isPast ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEPS[stepIndex].label}</CardTitle>
          <CardDescription className="text-xs">Paso {stepIndex + 1} de {STEPS.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'config' && (
            <StepConfig
              campaignName={campaignName} setCampaignName={setCampaignName}
              cpaTarget={cpaTarget} setCpaTarget={setCpaTarget}
              audienceDesc={audienceDesc} setAudienceDesc={setAudienceDesc}
              destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
              funnelStage={funnelStage} setFunnelStage={setFunnelStage}
              clientId={clientId}
            />
          )}
          {step === 'images' && (
            <StepImages images={images} setImages={setImages} generating={generatingImage} onGenerate={handleGenerateImage} />
          )}
          {step === 'copies' && (
            <StepTextVariants type="copy" values={copies} setValues={setCopies} generating={generatingCopy} onGenerate={handleGenerateCopies} />
          )}
          {step === 'headlines' && (
            <StepTextVariants type="headline" values={headlines} setValues={setHeadlines} generating={generatingHeadline} onGenerate={handleGenerateHeadlines} />
          )}
          {step === 'combinations' && <StepCombinations combinations={combinations} />}
          {step === 'budget' && <StepBudget cpaTarget={Number(cpaTarget) || 0} combinations={combinations} />}
          {step === 'review' && (
            <div className="space-y-5">
              <SteveTip>
                Todo listo. Al publicar se crea la campaña ABO en Meta con los 12 Ad Sets. Steve monitorea y te avisa el día 7 con resultados y recomendaciones.
              </SteveTip>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <Card><CardContent className="py-3"><p className="text-2xl font-bold text-primary">{combinations.length}</p><p className="text-xs text-muted-foreground">Conjuntos</p></CardContent></Card>
                <Card><CardContent className="py-3"><p className="text-2xl font-bold">{images.filter(Boolean).length}</p><p className="text-xs text-muted-foreground">Imágenes</p></CardContent></Card>
                <Card><CardContent className="py-3"><p className="text-2xl font-bold">{copies.filter(Boolean).length}</p><p className="text-xs text-muted-foreground">Copies</p></CardContent></Card>
                <Card><CardContent className="py-3"><p className="text-2xl font-bold">{headlines.filter(Boolean).length}</p><p className="text-xs text-muted-foreground">Títulos</p></CardContent></Card>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Campaña:</span><span className="font-medium">{campaignName || 'Testing 3:2:2'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><Badge className="text-xs bg-blue-500/15 text-blue-700 border-blue-500/30">ABO</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">CPA Objetivo:</span><span className="font-medium">{Number(cpaTarget) > 0 ? fmtCLP(Number(cpaTarget)) : 'No definido'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Presupuesto total/día:</span><span className="font-medium">{fmtCLP(Math.round((Number(cpaTarget) || 15000) * 50 / 7) * 12)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duración:</span><span className="font-medium">7 días sin tocar</span></div>
              </div>

              {/* Preview Grid */}
              {combinations.length > 0 && combinations.some((c) => c.imageUrl || c.primaryText || c.headline) && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold mb-3">Vista previa de combinaciones</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {combinations.slice(0, 3).map((combo, i) => (
                      <AdPreviewMockup
                        key={i}
                        imageUrl={combo.imageUrl || ''}
                        primaryText={combo.primaryText || ''}
                        headline={combo.headline || ''}
                        cta="SHOP_NOW"
                        destinationUrl={destinationUrl}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              <Button className="w-full" size="lg" onClick={handlePublish} disabled={publishing}>
                {publishing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando campaña...</>
                ) : (
                  <><Rocket className="w-4 h-4 mr-2" />Crear Campaña 3:2:2</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={stepIndex === 0}>
          <ArrowLeft className="w-4 h-4 mr-2" />Anterior
        </Button>
        {step !== 'review' && (
          <Button onClick={goNext} disabled={!canProceed()}>
            Siguiente<ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
