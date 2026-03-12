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
  ShoppingBag,
  Maximize2,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useMetaBusiness } from './MetaBusinessContext';
import { useBriefContext } from '@/hooks/useBriefContext';
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
type WizardStep = 'select-campaign' | 'select-adset' | 'campaign-config' | 'adset-config' | 'funnel-stage' | 'angle-select' | 'creative-focus' | 'ad-creative' | 'review';
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

const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: 'SHOP_NOW', label: 'Comprar ahora' },
  { value: 'LEARN_MORE', label: 'Saber más' },
  { value: 'SIGN_UP', label: 'Registrarse' },
  { value: 'DOWNLOAD', label: 'Descargar' },
  { value: 'CONTACT_US', label: 'Contactar' },
  { value: 'GET_OFFER', label: 'Ver oferta' },
  { value: 'BOOK_NOW', label: 'Reservar' },
];

// Different visual compositions for DCT 3:2:2 (3 images with different approaches)
// Each array has multiple options — one is picked randomly per generation to avoid repetition
const IMAGE_COMPOSITIONS_POOL = [
  // Slot 0: Product-centric shots
  [
    'Product hero shot: the product is the star, placed on a textured surface (marble countertop, raw wood, linen fabric). Dramatic side lighting, slight overhead angle. Background softly blurred with natural bokeh.',
    'Flat lay composition: the product arranged with complementary props (lifestyle accessories, natural elements) on a clean surface, shot from directly above. Soft even lighting, editorial magazine feel.',
    'Product in motion: the product captured mid-action (being poured, opened, applied, unboxed). Dynamic composition with slight motion blur on secondary elements. Crisp focus on the product itself.',
  ],
  // Slot 1: Human-centric / lifestyle shots
  [
    'Lifestyle candid: a real person genuinely enjoying the product in a specific environment (sunlit apartment, bustling street market, cozy café). Natural expression, imperfect and authentic. Product clearly visible but not forced.',
    'First-person POV: shot from the user perspective — hands holding/using the product with the environment visible ahead. Creates intimacy and "I could be there" feeling. Natural daylight.',
    'Social proof moment: person mid-reaction — smiling at the product, showing it to a friend, taking a selfie with it. Warm tones, authentic social media aesthetic but with professional quality.',
  ],
  // Slot 2: Creative/editorial shots
  [
    'Dramatic contrast: the product isolated against a bold, unexpected colored background or environment. High contrast lighting, fashion editorial style. Makes the product pop and demand attention.',
    'Before/after narrative: split or sequential composition showing the transformation or benefit. Left side shows the problem, right side shows the solution with the product. Clean dividing line or natural transition.',
    'Environmental storytelling: wide angle shot of a beautiful, aspirational space where the product is naturally integrated — not the focus but part of a desirable lifestyle scene. The viewer discovers the product within the environment.',
  ],
];

function pickComposition(slot: number): string {
  const pool = IMAGE_COMPOSITIONS_POOL[slot] || IMAGE_COMPOSITIONS_POOL[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// Step definitions per flow
// ---------------------------------------------------------------------------

const STEPS_CAMPAIGN: StepDef[] = [
  { key: 'campaign-config', label: 'Campaña', icon: Megaphone },
  { key: 'adset-config', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
  { key: 'creative-focus', label: 'Enfoque', icon: ShoppingBag },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_ADSET: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'adset-config', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
  { key: 'creative-focus', label: 'Enfoque', icon: ShoppingBag },
  { key: 'ad-creative', label: 'Anuncio', icon: FileImage },
  { key: 'review', label: 'Revisar', icon: Rocket },
];

const STEPS_AD: StepDef[] = [
  { key: 'select-campaign', label: 'Campaña', icon: Megaphone },
  { key: 'select-adset', label: 'Ad Set', icon: FolderOpen },
  { key: 'funnel-stage', label: 'Funnel', icon: Target },
  { key: 'angle-select', label: 'Ángulo', icon: Palette },
  { key: 'creative-focus', label: 'Enfoque', icon: ShoppingBag },
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
  'campaign-config': 'Elige ABO para testing (controlas cuánto gasta cada ad set) o CBO para escalar ganadores (Meta optimiza automáticamente).',
  'select-campaign': 'Busca una campaña con el mismo objetivo que tu nuevo Ad Set. Mezclar objetivos distintos puede confundir al algoritmo.',
  'adset-config': 'Cada Ad Set debe tener 1 solo ad para testear variables aisladas. Si pones múltiples ads, Meta distribuye el presupuesto desigualmente.',
  'select-adset': 'Elige un Ad Set que tenga audiencia similar a la de tu nuevo anuncio. Consistencia = mejores resultados.',
  'funnel-stage': 'TOFU para alcance, MOFU para nutrir leads, BOFU para conversión directa. El copy y CTA se adaptan a cada etapa.',
  'angle-select': 'El ángulo define el enfoque creativo del anuncio. Para TOFU usa ángulos que interrumpan el scroll. Para BOFU usa ángulos que cierren la venta.',
  'creative-focus': 'Puedes enfocar el anuncio en un producto específico (ideal para BOFU y catálogo) o en un ángulo más amplio de marca (ideal para TOFU/MOFU).',
  'ad-creative': 'El copy debe hablar al dolor/deseo del buyer persona con un CTA claro. Usa imágenes que destaquen en el feed.',
  'review': 'Verifica que el destino URL funcione, el copy no tenga errores y el presupuesto sea el correcto antes de publicar.',
};

// Step titles and descriptions for idiot-proof UX
const STEP_UI: Record<string, { title: string; subtitle: string }> = {
  'select-campaign': {
    title: 'Elige una campaña existente',
    subtitle: 'Selecciona la campaña donde quieres agregar tu nuevo anuncio, o crea una nueva.',
  },
  'select-adset': {
    title: 'Elige un conjunto de anuncios',
    subtitle: 'El Ad Set define la audiencia y el presupuesto. Elige uno existente o crea uno nuevo.',
  },
  'campaign-config': {
    title: 'Configura tu campaña',
    subtitle: 'Dale un nombre, elige el objetivo de la campaña y define el presupuesto.',
  },
  'adset-config': {
    title: 'Configura tu audiencia y presupuesto',
    subtitle: 'Define a quién le vas a mostrar el anuncio, cuánto vas a gastar y el formato creativo.',
  },
  'funnel-stage': {
    title: '¿En qué etapa del funnel estás?',
    subtitle: 'Esto cambia el tono del copy y las recomendaciones de Steve. Si no sabes, elige TOFU.',
  },
  'angle-select': {
    title: 'Elige el ángulo creativo',
    subtitle: 'El ángulo define cómo vas a comunicar tu mensaje. Steve te recomienda los mejores según tu etapa.',
  },
  'creative-focus': {
    title: '¿Sobre qué va el anuncio?',
    subtitle: 'Puedes promocionar un producto específico de tu tienda, o hacer un anuncio general de marca.',
  },
  'ad-creative': {
    title: 'Tu anuncio',
    subtitle: 'Steve genera el copy y las imágenes automáticamente. Puedes editar todo antes de publicar.',
  },
  'review': {
    title: 'Revisa antes de publicar',
    subtitle: '¡Todo listo! Revisa que todo esté correcto. La campaña se crea en pausa, la activas cuando quieras.',
  },
};

// ---------------------------------------------------------------------------
// Level Selector (pre-wizard screen)
// ---------------------------------------------------------------------------

function LevelSelector({ level, setLevel, onStart }: { level: StartLevel; setLevel: (l: StartLevel) => void; onStart: () => void }) {
  const levels: { key: StartLevel; icon: React.ElementType; label: string; desc: string; recommended?: boolean }[] = [
    { key: 'campaign', icon: Megaphone, label: 'Campaña completa', desc: 'Crea todo desde cero: campaña, audiencia y anuncio. Ideal si es tu primera vez.', recommended: true },
    { key: 'adset', icon: FolderOpen, label: 'Nuevo Ad Set', desc: 'Agrega una nueva audiencia o test a una campaña que ya existe.' },
    { key: 'ad', icon: FileImage, label: 'Nuevo Anuncio', desc: 'Agrega un anuncio nuevo a una campaña y audiencia que ya tienes.' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-bold">¿Qué quieres crear?</h2>
        <p className="text-sm text-muted-foreground">Si no sabes, elige "Campaña completa" y Steve te guía paso a paso.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {levels.map((l) => {
          const Icon = l.icon;
          const isActive = level === l.key;
          return (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={`relative flex flex-col items-center gap-2 p-5 rounded-lg border text-center transition-all ${
                isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background hover:border-primary/30'
              }`}
            >
              {l.recommended && (
                <Badge className="absolute -top-2 right-2 text-[9px] bg-green-500/15 text-green-700 border-green-500/30">Recomendado</Badge>
              )}
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
          {([
            { key: 'ABO' as BudgetType, label: 'ABO', name: 'Tú controlas', desc: 'Tú defines cuánto gasta cada audiencia. Ideal para probar.' },
            { key: 'CBO' as BudgetType, label: 'CBO', name: 'Meta controla', desc: 'Meta distribuye el dinero donde mejor funcione. Ideal para escalar.' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setBudgetType(t.key)}
              className={`flex-1 flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-all ${
                budgetType === t.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              <Badge className={`text-xs font-bold ${t.key === 'CBO' ? 'bg-purple-500/15 text-purple-700 border-purple-500/30' : 'bg-blue-500/15 text-blue-700 border-blue-500/30'}`}>{t.label}</Badge>
              <span className={`text-xs font-semibold ${budgetType === t.key ? 'text-foreground' : 'text-muted-foreground'}`}>{t.name}</span>
              <span className="text-[10px] text-muted-foreground text-center">{t.desc}</span>
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
        <div className="flex gap-2 mt-1.5">
          {[
            { label: 'Hoy', date: new Date().toISOString().split('T')[0] },
            { label: 'Mañana', date: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
            { label: 'Próximo lunes', date: (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0]; })() },
          ].map((opt) => (
            <button key={opt.label} type="button" onClick={() => setStartDate(opt.date)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${startDate === opt.date ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
              {opt.label}
            </button>
          ))}
        </div>
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
  targetCountries, setTargetCountries,
  targetAgeMin, setTargetAgeMin,
  targetAgeMax, setTargetAgeMax,
  targetGender, setTargetGender,
}: {
  name: string; setName: (v: string) => void;
  audienceDesc: string; setAudienceDesc: (v: string) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  isABO: boolean;
  adSetFormat: AdSetFormat; setAdSetFormat: (v: AdSetFormat) => void;
  cpaTarget: string; setCpaTarget: (v: string) => void;
  targetCountries: string[]; setTargetCountries: (v: string[]) => void;
  targetAgeMin: number; setTargetAgeMin: (v: number) => void;
  targetAgeMax: number; setTargetAgeMax: (v: number) => void;
  targetGender: 0 | 1 | 2; setTargetGender: (v: 0 | 1 | 2) => void;
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
    { key: 'flexible', label: 'Flexible (DCT)', desc: 'Metodología 3:2:2 — 3 imágenes, 2 textos, 2 títulos. Meta optimiza combinaciones ganadoras.', icon: Layers, recommended: isABO },
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
        <Textarea value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Describe la audiencia: demographics, intereses, comportamiento..." rows={2} className="mt-1" />
      </div>

      {/* Targeting controls */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">País</Label>
          <Select value={targetCountries[0] || 'CL'} onValueChange={(v) => setTargetCountries([v])}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CL">Chile</SelectItem>
              <SelectItem value="MX">México</SelectItem>
              <SelectItem value="CO">Colombia</SelectItem>
              <SelectItem value="AR">Argentina</SelectItem>
              <SelectItem value="PE">Perú</SelectItem>
              <SelectItem value="US">Estados Unidos</SelectItem>
              <SelectItem value="ES">España</SelectItem>
              <SelectItem value="BR">Brasil</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Género</Label>
          <Select value={String(targetGender)} onValueChange={(v) => setTargetGender(Number(v) as 0 | 1 | 2)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Todos</SelectItem>
              <SelectItem value="1">Hombres</SelectItem>
              <SelectItem value="2">Mujeres</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Edad mínima</Label>
          <Input type="number" min={18} max={65} value={targetAgeMin} onChange={(e) => { const v = Math.max(18, Math.min(65, Number(e.target.value))); setTargetAgeMin(v); if (v > targetAgeMax) setTargetAgeMax(v); }} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Edad máxima</Label>
          <Input type="number" min={18} max={65} value={targetAgeMax} onChange={(e) => { const v = Math.max(18, Math.min(65, Number(e.target.value))); setTargetAgeMax(v); if (v < targetAgeMin) setTargetAgeMin(v); }} className="mt-1" />
        </div>
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
    { key: 'tofu' as const, label: 'TOFU', name: 'Captar atención', desc: 'Gente que NO te conoce. Quieres que te vean por primera vez.', example: 'Ej: "¿Sabías que...?", contenido viral, educativo', color: 'text-blue-600 border-blue-500/30 bg-blue-500/10' },
    { key: 'mofu' as const, label: 'MOFU', name: 'Generar interés', desc: 'Gente que ya te vio. Quieres que confíen en ti.', example: 'Ej: Testimonios, comparaciones, beneficios', color: 'text-yellow-600 border-yellow-500/30 bg-yellow-500/10' },
    { key: 'bofu' as const, label: 'BOFU', name: 'Vender', desc: 'Gente lista para comprar. Quieres que hagan clic y compren.', example: 'Ej: Descuentos, urgencia, ofertas limitadas', color: 'text-green-600 border-green-500/30 bg-green-500/10' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stages.map((f) => (
          <button
            key={f.key}
            onClick={() => setFunnelStage(f.key)}
            className={`flex flex-col items-start gap-2 p-4 rounded-lg border transition-all text-left ${
              funnelStage === f.key ? `ring-1 ring-primary/20 ${f.color}` : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <Badge className={`text-xs font-bold ${funnelStage === f.key ? f.color : 'bg-muted text-muted-foreground'}`}>{f.label}</Badge>
              <span className={`text-sm font-semibold ${funnelStage === f.key ? 'text-foreground' : 'text-muted-foreground'}`}>{f.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{f.desc}</span>
            <span className="text-[10px] text-muted-foreground/70 italic">{f.example}</span>
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
// Creative Focus Step (product vs broad)
// ---------------------------------------------------------------------------

interface ShopifyProduct {
  id: string;
  title: string;
  image: string;
  price: number;
  product_type: string;
}

function CreativeFocusStep({
  clientId,
  focusType, setFocusType,
  selectedProduct, setSelectedProduct,
}: {
  clientId: string;
  focusType: 'product' | 'broad';
  setFocusType: (v: 'product' | 'broad') => void;
  selectedProduct: ShopifyProduct | null;
  setSelectedProduct: (p: ShopifyProduct | null) => void;
}) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .limit(1)
        .single();
      if (!conn?.id) { setLoadingProducts(false); return; }

      const { data } = await callApi('fetch-shopify-products', { body: { connectionId: conn.id } });
      if (data?.products) {
        setProducts(data.products.slice(0, 20).map((p: any) => ({
          id: p.id,
          title: p.title,
          image: p.variants?.[0]?.image_url || p.image || '',
          price: Number(p.variants?.[0]?.price) || 0,
          product_type: p.product_type || '',
        })));
      }
    } catch { /* no shopify */ }
    setLoadingProducts(false);
  }, [clientId]);

  useEffect(() => {
    if (focusType === 'product' && products.length === 0) fetchProducts();
  }, [focusType, products.length, fetchProducts]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setFocusType('product'); }}
          className={`flex flex-col items-center gap-2 p-5 rounded-lg border text-center transition-all ${
            focusType === 'product' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
          }`}
        >
          <ShoppingBag className={`w-8 h-8 ${focusType === 'product' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="text-sm font-semibold">Un producto</span>
          <span className="text-xs text-muted-foreground">Elige un producto de tu tienda. Steve genera el copy y la foto basándose en él.</span>
        </button>
        <button
          onClick={() => { setFocusType('broad'); setSelectedProduct(null); }}
          className={`flex flex-col items-center gap-2 p-5 rounded-lg border text-center transition-all ${
            focusType === 'broad' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
          }`}
        >
          <Palette className={`w-8 h-8 ${focusType === 'broad' ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="text-sm font-semibold">Marca en general</span>
          <span className="text-xs text-muted-foreground">No sobre un producto. Steve genera un anuncio de marca, educación o estilo de vida.</span>
        </button>
      </div>

      {focusType === 'product' && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Selecciona un producto de Shopify</Label>
          {loadingProducts ? (
            <div className="grid grid-cols-2 gap-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {products.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className={`flex gap-2 p-2 rounded-lg border text-left transition-all ${
                      isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">${p.price.toLocaleString('es-CL')}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No se encontraron productos de Shopify. Puedes continuar con ángulo amplio.
            </p>
          )}
        </div>
      )}
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
  descriptions, setDescriptions,
  images, setImages,
  cta, setCta,
  destinationUrl, setDestinationUrl,
  generating,
  onGenerateCopy,
  productContext,
  focusType,
  selectedProduct,
}: {
  clientId: string;
  adSetFormat: AdSetFormat;
  selectedAngle: string;
  headlines: string[]; setHeadlines: (v: string[]) => void;
  primaryTexts: string[]; setPrimaryTexts: (v: string[]) => void;
  descriptions: string[]; setDescriptions: (v: string[]) => void;
  images: string[]; setImages: (v: string[]) => void;
  cta: string; setCta: (v: string) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  generating: boolean;
  onGenerateCopy: () => void;
  productContext?: string;
  focusType: 'product' | 'broad';
  selectedProduct: ShopifyProduct | null;
}) {
  const [activeImageSlot, setActiveImageSlot] = useState(0);
  const [mediaTab, setMediaTab] = useState<MediaTab>(productContext ? 'ai-image' : 'upload');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(productContext || '');
  const [imageEngine, setImageEngine] = useState<'imagen' | 'gpt4o' | 'flux'>('imagen');
  const [galleryAssets, setGalleryAssets] = useState<Array<{ id: string; url: string; tipo: string }>>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
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
    setGeneratingImage(true);
    try {
      const formatMap: Record<AspectRatio, string> = { '1:1': 'square', '9:16': 'story', '16:9': 'feed' };
      const formato = formatMap[aspectRatio];

      // If user wrote a custom prompt, use it directly
      if (aiPrompt.trim()) {
        const anglePrompt = selectedAngle ? ` Ángulo creativo: ${selectedAngle}.` : '';
        const { data, error } = await callApi('generate-image', {
          body: { clientId, promptGeneracion: aiPrompt + anglePrompt, engine: imageEngine, formato },
        });
        if (error === 'NO_CREDITS') { toast.error('Sin créditos (2 por imagen)'); return; }
        if (error) throw error;
        if (data?.asset_url) { setImageAtSlot(data.asset_url); toast.success(`Imagen ${activeImageSlot + 1} generada`); }
        return;
      }

      // No custom prompt: use brief-visual pipeline with current copy + angle
      const variacionElegida = {
        titulo: headlines.find(Boolean) || 'Anuncio',
        texto_principal: primaryTexts.find(Boolean) || '',
        descripcion: descriptions.find(Boolean) || '',
        cta: cta || 'SHOP_NOW',
      };
      const angleValue = selectedAngle || 'beneficios';
      const productPhoto = focusType === 'product' && selectedProduct?.image
        ? selectedProduct.image : undefined;
      const productAssets = productPhoto ? [productPhoto] : [];

      const { data: briefData, error: briefErr } = await callApi('generate-brief-visual', {
        body: {
          clientId,
          formato: 'static',
          angulo: angleValue,
          variacionElegida,
          assetUrls: productAssets,
          productData: selectedProduct ? {
            title: selectedProduct.title,
            product_type: selectedProduct.product_type,
            body_html: '',
          } : undefined,
        },
      });

      if (briefErr) throw new Error(briefErr);

      const promptGeneracion = briefData?.prompt_generacion;
      if (!promptGeneracion) throw new Error('No se generó prompt visual');

      // Use product image as visual reference for the AI
      const fotoBase = productPhoto
        || briefData?.foto_recomendada
        || undefined;

      const { data, error } = await callApi('generate-image', {
        body: { clientId, promptGeneracion, fotoBaseUrl: fotoBase, engine: imageEngine, formato },
      });
      if (error === 'NO_CREDITS') { toast.error('Sin créditos (2 por imagen)'); return; }
      if (error) throw error;
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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {adSetFormat === 'flexible' ? 'Flexible (DCT 3:2:2)' : adSetFormat === 'carousel' ? 'Carrusel' : 'Imagen Única'}
          </Badge>
          <Button variant="outline" size="sm" onClick={onGenerateCopy} disabled={generating}>
            {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
            Steve genera copy
          </Button>
        </div>
        {adSetFormat === 'flexible' && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>Metodología 3:2:2:</strong> 3 imágenes x 2 textos x 2 títulos. Meta optimiza automáticamente las combinaciones ganadoras.
            </p>
          </div>
        )}
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
              className={`group relative w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
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
              {img && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxUrl(img); }}
                  className="absolute top-0 left-0 bg-black/60 text-white rounded-br p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Ver en grande"
                  aria-label="Ver imagen en grande"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
              )}
              {img && images.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const next = images.filter((_, j) => j !== i); setImages(next); if (activeImageSlot >= next.length) setActiveImageSlot(Math.max(0, next.length - 1)); }}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  aria-label="Eliminar imagen"
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
              <Select value={imageEngine} onValueChange={(v: 'imagen' | 'gpt4o' | 'flux') => setImageEngine(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="imagen">Imagen 4 (2 cred)</SelectItem>
                  <SelectItem value="gpt4o">GPT-4o (2 cred)</SelectItem>
                  <SelectItem value="flux">Flux Pro (2 cred)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleGenerateImage} disabled={generatingImage} className="flex-1">
                {generatingImage ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando...</> : <><Sparkles className="w-3 h-3 mr-1" />{aiPrompt.trim() ? 'Generar' : 'Auto-generar'}</>}
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
              <button aria-label="Eliminar título" onClick={() => { const next = headlines.filter((_, j) => j !== i); setHeadlines(next); }} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
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
              <button aria-label="Eliminar texto" onClick={() => { const next = primaryTexts.filter((_, j) => j !== i); setPrimaryTexts(next); }} className="text-muted-foreground hover:text-destructive mt-2"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>

      {/* ---- DESCRIPTION SLOTS ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Descripciones ({descriptions.length})</Label>
          {canAddMoreTexts && (
            <Button variant="ghost" size="sm" onClick={() => setDescriptions([...descriptions, ''])} className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />Agregar
            </Button>
          )}
        </div>
        {descriptions.map((desc, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
            <Input value={desc} onChange={(e) => { const next = [...descriptions]; next[i] = e.target.value; setDescriptions(next); }} placeholder={`Descripción ${i + 1} (opcional)`} />
            {descriptions.length > 1 && (
              <button aria-label="Eliminar descripción" onClick={() => { const next = descriptions.filter((_, j) => j !== i); setDescriptions(next); }} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>

      {/* CTA + URL */}
      <div className="space-y-4">
        <div>
          <Label>Botón CTA</Label>
          <Select value={cta} onValueChange={(v) => setCta(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CTA_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>URL de destino</Label>
          <Input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://tu-tienda.com" className="mt-1" />
        </div>
      </div>

      {/* Lightbox for viewing images in full size */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxUrl && <img src={lightboxUrl} alt="Preview" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview Panel with image cycling
// ---------------------------------------------------------------------------

function PreviewPanel({
  images, primaryTexts, headlines, descriptions, cta, pageName, destinationUrl,
}: {
  images: string[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  pageName: string;
  destinationUrl: string;
}) {
  const [previewIdx, setPreviewIdx] = useState(0);
  const filledImages = images.filter(Boolean);

  return (
    <div className="hidden lg:block">
      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Vista previa</h4>
      <div className="sticky top-4 space-y-2">
        <AdPreviewMockup
          imageUrl={images[previewIdx] || ''}
          primaryText={primaryTexts[previewIdx] || primaryTexts[0] || ''}
          headline={headlines[previewIdx] || headlines[0] || ''}
          description={descriptions[previewIdx] || descriptions[0] || ''}
          cta={cta}
          pageName={pageName}
          destinationUrl={destinationUrl}
        />
        {filledImages.length > 1 && (
          <div className="flex gap-1.5 justify-center">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setPreviewIdx(i)}
                className={`w-10 h-10 rounded border-2 overflow-hidden transition-all ${
                  previewIdx === i ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                }`}
              >
                {img ? (
                  <img src={img} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        {filledImages.length > 1 && (
          <p className="text-[10px] text-muted-foreground text-center">
            Variación {previewIdx + 1} de {images.length}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignCreateWizard({ clientId, onBack, onComplete, startFrom = 'campaign' }: CampaignCreateWizardProps) {
  const { connectionId: ctxConnectionId, pageId: ctxPageId, pageName } = useMetaBusiness();
  const briefChips = useBriefContext(clientId);

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
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(tomorrow);

  // Ad Set fields
  const [adsetName, setAdsetName] = useState('');
  const [audienceDesc, setAudienceDesc] = useState('');
  const [adsetBudget, setAdsetBudget] = useState('');

  // Targeting fields
  const [targetCountries, setTargetCountries] = useState<string[]>(['CL']);
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(65);
  const [targetGender, setTargetGender] = useState<0 | 1 | 2>(0); // 0=all, 1=male, 2=female

  // Funnel stage
  const [funnelStage, setFunnelStage] = useState<'tofu' | 'mofu' | 'bofu'>('tofu');

  // Ad Set format + CPA
  const [adSetFormat, setAdSetFormat] = useState<AdSetFormat>('flexible');
  const [cpaTarget, setCpaTarget] = useState('');

  // Angle
  const [selectedAngle, setSelectedAngle] = useState('');

  // Creative focus
  const [focusType, setFocusType] = useState<'product' | 'broad'>('broad');
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);

  // Ad fields (multi-slot)
  const [headlines, setHeadlines] = useState<string[]>(['']);
  const [primaryTexts, setPrimaryTexts] = useState<string[]>(['']);
  const [descriptions, setDescriptions] = useState<string[]>(['']);
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
    setDescriptions((prev) => {
      if (prev.length === txtCount) return prev;
      const next = prev.slice(0, txtCount);
      while (next.length < txtCount) next.push('');
      return next;
    });
  }, [adSetFormat]);

  // Auto-generate campaign name from objective/funnel/angle
  useEffect(() => {
    if (campName && campName !== '') return; // Don't overwrite user edits
    const parts: string[] = [];
    const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || '';
    if (objLabel) parts.push(objLabel);
    if (funnelStage) parts.push(funnelStage.toUpperCase());
    if (selectedAngle) parts.push(selectedAngle);
    const today = new Date().toISOString().split('T')[0];
    parts.push(today);
    setCampName(parts.join(' — '));
  }, [objective, funnelStage, selectedAngle]);

  // Auto-load CPA from brief (buyer_personas)
  useEffect(() => {
    (async () => {
      try {
        const { data: brief } = await supabase
          .from('buyer_personas')
          .select('persona_data')
          .eq('client_id', clientId)
          .eq('is_complete', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (!brief?.persona_data) return;
        const pd = brief.persona_data as any;
        // Extract from raw_responses[2] (Q2 = LOS NÚMEROS) or structured fields
        const rawQ2 = pd.raw_responses?.[2] || '';
        let price = 0, cost = 0, shipping = 0;
        if (typeof rawQ2 === 'string') {
          const priceMatch = rawQ2.match(/precio[^:]*[:=]\s*\$?([\d.,]+)/i);
          const costMatch = rawQ2.match(/costo[^:]*[:=]\s*\$?([\d.,]+)/i);
          const shipMatch = rawQ2.match(/env[ií]o[^:]*[:=]\s*\$?([\d.,]+)/i);
          if (priceMatch) price = Number(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
          if (costMatch) cost = Number(costMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
          if (shipMatch) shipping = Number(shipMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
        } else if (typeof rawQ2 === 'object') {
          // Structured form fields from brief Q2
          price = Number(rawQ2.price) || 0;
          cost = Number(rawQ2.cost) || 0;
          shipping = Number(rawQ2.shipping) || 0;
        }
        if (price > 0) {
          const margin = price - cost - shipping;
          const cpaMax = Math.round(margin * 0.30);
          if (cpaMax > 0 && !cpaTarget) {
            setCpaTarget(String(cpaMax));
            // CPA auto-loaded from brief data
          }
        }

        // Auto-fill targeting from persona
        const gender = pd.genero || pd.gender || '';
        if (gender) {
          const g = gender.toLowerCase();
          if (g.includes('mujer') || g.includes('female') || g.includes('femenin')) setTargetGender(2);
          else if (g.includes('hombre') || g.includes('male') || g.includes('masculin')) setTargetGender(1);
        }
        const age = pd.edad || pd.age || '';
        if (age) {
          const ageStr = String(age);
          const rangeMatch = ageStr.match(/(\d+)\s*[-–a]\s*(\d+)/);
          if (rangeMatch) {
            setTargetAgeMin(Math.max(18, Number(rangeMatch[1])));
            setTargetAgeMax(Math.min(65, Number(rangeMatch[2])));
          }
        }
        const country = pd.pais || pd.country || '';
        if (country) {
          const c = country.toLowerCase();
          if (c.includes('chile') || c.includes('cl')) setTargetCountries(['CL']);
          else if (c.includes('mexico') || c.includes('mx')) setTargetCountries(['MX']);
          else if (c.includes('colombia') || c.includes('co')) setTargetCountries(['CO']);
          else if (c.includes('argentin') || c.includes('ar')) setTargetCountries(['AR']);
          else if (c.includes('peru') || c.includes('pe')) setTargetCountries(['PE']);
        }
      } catch { /* brief not found */ }
    })();
  }, [clientId]);

  // Loading states
  const [submitting, setSubmitting] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState('');

  // Leave confirmation
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // ---- Navigation ----

  const hasUnsavedWork = images.some(Boolean) || primaryTexts.some((t) => t.trim()) || headlines.some((h) => h.trim());

  const handleLeaveAttempt = () => {
    if (hasUnsavedWork) {
      setShowLeaveDialog(true);
    } else {
      onBack();
    }
  };

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
      case 'creative-focus':
        return focusType === 'broad' || !!selectedProduct;
      case 'ad-creative':
        return primaryTexts.some((t) => t.trim()) && headlines.some((h) => h.trim());
      case 'review':
        return true;
      default:
        return true;
    }
  };

  // ---- AI Copy Generation ----

  const ANGLE_DESCRIPTIONS: Record<string, string> = {
    'Beneficios': 'Resalta los beneficios principales del producto de forma directa',
    'Bold Statement': 'Abre con una declaración atrevida y provocadora que interrumpa el scroll',
    'Us vs Them': 'Compara tu producto vs la competencia o vs no usarlo',
    'Call Out': 'Llama directamente a tu audiencia específica: "Si eres X, esto es para ti"',
    'Antes y Después': 'Muestra la transformación: el antes (dolor) vs el después (solución)',
    'Reviews': 'Usa testimonios y reseñas reales de clientes',
    'Detalles de Producto': 'Enfócate en specs, materiales, ingredientes, calidad',
    'Ugly Ads': 'Estilo informal, casero, sin pulir — se ve como contenido orgánico real',
    'Memes': 'Humor y cultura popular adaptada al producto',
    'Descuentos/Ofertas': 'Promoción directa con urgencia y escasez',
    'Resultados': 'Datos, números y resultados concretos obtenidos por clientes',
    'Paquetes': 'Bundles, combos y ofertas de valor',
    'Mensajes y Comentarios': 'Capturas de DMs y comentarios positivos como prueba social',
    'Credenciales en Medios': 'Apariciones en prensa, certificaciones, premios',
    'Reviews + Beneficios': 'Combina testimonios con beneficios del producto',
    'Pantalla Dividida': 'Compara visualmente dos opciones lado a lado',
    'Nueva Colección': 'Lanzamiento de productos nuevos con expectativa',
    'Cyber/Fechas Especiales': 'Aprovecha temporalidad: Cyber Monday, Black Friday, etc.',
    'Ingredientes/Material': 'Enfócate en la calidad de materiales o ingredientes',
    'Beneficios Principales': 'Lista los top 3-5 beneficios de forma clara',
  };

  const generatingRef = useRef(false);
  const handleGenerateCopy = useCallback(async (): Promise<{ texts: string[]; headlines: string[]; descriptions: string[] } | null> => {
    if (generatingRef.current) return null;
    generatingRef.current = true;
    setGeneratingCopy(true);
    try {
      const isMulti = adSetFormat === 'flexible';
      const angleDesc = ANGLE_DESCRIPTIONS[selectedAngle] || '';
      const angleHint = selectedAngle ? ` Ángulo creativo: ${selectedAngle}. ${angleDesc}` : '';
      const productHint = focusType === 'product' && selectedProduct
        ? ` Producto: ${selectedProduct.title}. Precio: $${selectedProduct.price.toLocaleString('es-CL')}. Tipo: ${selectedProduct.product_type || 'general'}.`
        : '';
      const cpaHint = cpaTarget ? ` CPA máximo objetivo: $${Number(cpaTarget).toLocaleString('es-CL')}.` : '';
      const instruction = isMulti
        ? [
            `Genera copy para DCT 3:2:2 de Meta Ads.${angleHint}${productHint}${cpaHint}`,
            `Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}. Funnel: ${funnelStage}.`,
            'Necesito 2 variaciones de texto principal, 2 de headline y 2 descripciones con enfoques diferentes.',
            'Responde SOLO con JSON: {"texts":["texto1","texto2"],"headlines":["headline1","headline2"],"descriptions":["desc1","desc2"]}',
          ].join('\n')
        : [
            `Genera copy para un anuncio de Meta Ads.${angleHint}${productHint}${cpaHint}`,
            `Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}. Funnel: ${funnelStage}.`,
            'Necesito 1 texto principal, 1 headline y 1 descripción.',
            'Responde SOLO con JSON: {"texts":["texto"],"headlines":["headline"],"descriptions":["descripción"]}',
          ].join('\n');

      const { data, error } = await callApi('generate-meta-copy', {
        body: {
          client_id: clientId,
          instruction,
        },
      });
      if (error) throw new Error(error);
      const raw = data?.copy || data?.text || '';
      if (!raw) {
        toast.error('Steve no devolvió copy — intenta de nuevo');
        return null;
      }
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const result = { texts: [] as string[], headlines: [] as string[], descriptions: [] as string[] };
        if (isMulti) {
          if (parsed.texts?.length) { setPrimaryTexts(parsed.texts.slice(0, 2)); result.texts = parsed.texts.slice(0, 2); }
          if (parsed.headlines?.length) { setHeadlines(parsed.headlines.slice(0, 2)); result.headlines = parsed.headlines.slice(0, 2); }
          if (parsed.descriptions?.length) { setDescriptions(parsed.descriptions.slice(0, 2)); result.descriptions = parsed.descriptions.slice(0, 2); }
          else if (parsed.description) { setDescriptions([parsed.description, '']); result.descriptions = [parsed.description]; }
        } else {
          const t = parsed.primary_text || parsed.texts?.[0] || '';
          const h = parsed.headline || parsed.headlines?.[0] || '';
          const d = parsed.description || parsed.descriptions?.[0] || '';
          if (t) { setPrimaryTexts([t]); result.texts = [t]; }
          if (h) { setHeadlines([h]); result.headlines = [h]; }
          if (d) { setDescriptions([d]); result.descriptions = [d]; }
        }
        toast.success('Steve generó el copy automáticamente');
        return result;
      } catch {
        // AI didn't return valid JSON — use raw text as primary text
        setPrimaryTexts([raw.slice(0, 500)]);
        return { texts: [raw.slice(0, 500)], headlines: [], descriptions: [] };
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error generando copy');
      return null;
    } finally {
      generatingRef.current = false;
      setGeneratingCopy(false);
    }
  }, [adSetFormat, selectedAngle, focusType, selectedProduct, cpaTarget, objective, audienceDesc, funnelStage, clientId]);

  // Auto-generate copy + AI image when entering ad-creative step
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (currentStep !== 'ad-creative') {
      autoGenRef.current = false;
      return;
    }
    if (autoGenRef.current) return;
    autoGenRef.current = true;

    // Auto-generate copy first, then use it to generate a proper image via brief-visual
    (async () => {
      setAutoGenerating(true);
      setAutoGenProgress('Generando copies...');
      // Step 1: Generate copy and get the result directly (don't rely on React state)
      const copyResult = await handleGenerateCopy();
      if (!copyResult) { setAutoGenerating(false); setAutoGenProgress(''); return; }

      // Step 2: Generate images using brief-visual pipeline with the copy we just got
      setAutoGenProgress('Preparando brief visual...');
      try {
        const angleValue = selectedAngle || 'beneficios';
        const productPhoto = focusType === 'product' && selectedProduct?.image
          ? selectedProduct.image : undefined;
        const productAssets = productPhoto ? [productPhoto] : [];
        const productData = selectedProduct ? {
          title: selectedProduct.title,
          product_type: selectedProduct.product_type,
          body_html: '',
        } : undefined;

        // How many images to generate (3 for DCT flexible, 1 for others)
        const imageCount = adSetFormat === 'flexible' ? 3 : 1;

        for (let slot = 0; slot < imageCount; slot++) {
          const composition = pickComposition(slot);
          const variacionElegida = {
            titulo: copyResult.headlines[0] || 'Anuncio',
            texto_principal: copyResult.texts[0] || '',
            descripcion: `${copyResult.descriptions[0] || ''}. VISUAL COMPOSITION: ${composition}`,
            cta: cta || 'SHOP_NOW',
          };

          setAutoGenProgress(`Generando imagen ${slot + 1} de ${imageCount}...`);
          // Generate brief-visual for image

          const { data: briefData, error: briefErr } = await callApi('generate-brief-visual', {
            body: { clientId, formato: 'static', angulo: angleValue, variacionElegida, assetUrls: productAssets, productData },
          });

          if (briefErr || !briefData?.prompt_generacion) {
            // Brief-visual error, skip to next image
            continue;
          }

          const fotoBase = productPhoto || briefData?.foto_recomendada || undefined;

          const { data: imgData, error: imgErr } = await callApi('generate-image', {
            body: { clientId, promptGeneracion: briefData.prompt_generacion, fotoBaseUrl: fotoBase, engine: 'imagen', formato: 'square' },
          });

          if (imgErr) {
            // Image generation error, skip to next
            if (imgErr === 'NO_CREDITS') { toast.error('Sin créditos para generar más imágenes'); break; }
            continue;
          }

          if (imgData?.asset_url) {
            setImages((prev) => {
              const next = [...prev];
              next[slot] = imgData.asset_url;
              return next;
            });
            toast.success(`Imagen ${slot + 1} generada`);
          }
        }
      } catch (err) {
        // AI image generation failed — toast already shown
      } finally {
        setAutoGenerating(false);
        setAutoGenProgress('');
      }
    })();
  }, [currentStep, handleGenerateCopy, focusType, selectedProduct, selectedAngle, clientId]);

  // ---- Save Draft ----

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
      const anguloText = selectedAngle || `${objLabel} — ${audienceDesc?.substring(0, 80) || 'Campaña directa'}`;

      const filledImages = images.filter(Boolean);
      const filledTexts = primaryTexts.filter(Boolean);
      const filledHeadlines = headlines.filter(Boolean);
      const filledDescriptions = descriptions.filter(Boolean);
      const allCopies = filledTexts.map((t, i) => ({ texto: t, tipo: i === 0 ? 'original' : 'variacion' }));

      const { error } = await supabase.from('ad_creatives').insert({
        client_id: clientId,
        funnel: funnelStage,
        formato: adSetFormat === 'carousel' ? 'carousel' : filledImages[0]?.endsWith('.mp4') ? 'video' : 'static',
        angulo: anguloText,
        titulo: filledHeadlines[0] || campName || 'Borrador sin título',
        texto_principal: filledTexts[0] || '',
        descripcion: filledDescriptions[0] || '',
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
            duracion: '7 días sin tocar',
            regla_kill: 'Pausar si gasta 2x CPA sin conversión',
            metricas_dia3: 'Hook Rate >25%, Hold Rate >15%, CTR >1.5%',
          },
        },
        dct_copies: allCopies.length > 0 ? allCopies : null,
        dct_titulos: filledHeadlines.length > 0 ? filledHeadlines : null,
        dct_descripciones: filledDescriptions.length > 0 ? filledDescriptions : null,
        dct_imagenes: filledImages.length > 0 ? filledImages : null,
      });
      if (error) throw error;

      const summary = `Borrador guardado: ${filledImages.length} imágenes, ${filledTexts.length} copies, ${filledHeadlines.length} headlines`;
      toast.success(summary);
    } catch (err) {
      // Save draft error — toast shown below
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

      if (destinationUrl && !/^https?:\/\/.+\..+/.test(destinationUrl)) {
        toast.error('URL de destino inválida — debe comenzar con https://');
        setSubmitting(false);
        return;
      }

      if (!images.some(Boolean)) {
        toast.error('Agrega al menos 1 imagen para el anuncio');
        setSubmitting(false);
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
      const filledDescriptions = descriptions.filter(Boolean);

      const submitData: Record<string, any> = {
        name,
        objective: objMap[objective],
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: ({
          TRAFFIC: 'LINK_CLICKS',
          CONVERSIONS: 'OFFSITE_CONVERSIONS',
          CATALOG: 'OFFSITE_CONVERSIONS',
          AWARENESS: 'REACH',
          ENGAGEMENT: 'POST_ENGAGEMENT',
        } as Record<string, string>)[objective] || 'OFFSITE_CONVERSIONS',
        adset_name: adsetName || `${name} - Ad Set 1`,
        primary_text: filledTexts[0] || undefined,
        headline: filledHeadlines[0] || undefined,
        description: filledDescriptions[0] || undefined,
        image_url: filledImages[0] || undefined,
        cta: cta || 'SHOP_NOW',
        destination_url: destinationUrl || undefined,
        page_id: ctxPageId || undefined,
        ad_set_format: adSetFormat,
        images: filledImages.length > 0 ? filledImages : undefined,
        texts: filledTexts.length > 0 ? filledTexts : undefined,
        headlines: filledHeadlines.length > 0 ? filledHeadlines : undefined,
        descriptions: filledDescriptions.length > 0 ? filledDescriptions : undefined,
      };

      // Use existing entities if selected
      if (existingCampaignId) {
        submitData.campaign_id = existingCampaignId;
      }
      if (existingAdsetId) {
        submitData.adset_id = existingAdsetId;
      }

      // Budget + targeting (required by Meta for new ad sets)
      if (!existingAdsetId) {
        // CLP has no cents — Meta expects smallest currency unit (1 CLP = 1)
        const budget = budgetType === 'CBO'
          ? Number(campBudget)
          : Number(adsetBudget);
        submitData.daily_budget = budget || 10000;

        // Build targeting from wizard fields
        const targetingSpec: Record<string, any> = {
          geo_locations: { countries: targetCountries.length > 0 ? targetCountries : ['CL'] },
          age_min: targetAgeMin || 18,
          age_max: targetAgeMax || 65,
        };
        if (targetGender > 0) {
          targetingSpec.genders = [targetGender];
        }
        submitData.targeting = targetingSpec;
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

      // Save creative to ad_creatives library
      try {
        const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
        const anguloText = selectedAngle || `${objLabel} — ${audienceDesc?.substring(0, 80) || 'Campaña directa'}`;
        await supabase.from('ad_creatives').insert({
          client_id: clientId,
          funnel: funnelStage,
          formato: adSetFormat === 'carousel' ? 'carousel' : filledImages[0]?.endsWith('.mp4') ? 'video' : 'static',
          angulo: anguloText,
          titulo: filledHeadlines[0] || name,
          texto_principal: filledTexts[0] || '',
          descripcion: filledDescriptions[0] || '',
          cta: cta,
          asset_url: filledImages[0] || null,
          estado: 'en_pauta',
          dct_copies: filledTexts.length > 0 ? filledTexts.map((t, i) => ({ texto: t, tipo: i === 0 ? 'original' : 'variacion' })) : null,
          dct_titulos: filledHeadlines.length > 0 ? filledHeadlines : null,
          dct_descripciones: filledDescriptions.length > 0 ? filledDescriptions : null,
          dct_imagenes: filledImages.length > 0 ? filledImages : null,
        });
      } catch (saveErr) {
        // Non-critical: creative library save failed silently
      }

      toast.success('Campaña creada como pausada en Meta. Activa cuando estés listo.');
      onComplete?.();
    } catch (err) {
      // Submit error — toast shown below
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
    focusType,
    selectedProduct: selectedProduct?.title || '',
    cpaTarget,
  };

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={wizardStarted ? () => { if (stepIndex === 0) { setWizardStarted(false); } else { goPrev(); } } : handleLeaveAttempt} className="h-8 w-8">
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
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                  {stepIndex + 1}
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">{STEP_UI[currentStep]?.title || steps[stepIndex].label}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{STEP_UI[currentStep]?.subtitle || `Paso ${stepIndex + 1} de ${steps.length}`}</CardDescription>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5 mt-3">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
                />
              </div>
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
                          targetCountries={targetCountries} setTargetCountries={setTargetCountries}
                          targetAgeMin={targetAgeMin} setTargetAgeMin={setTargetAgeMin}
                          targetAgeMax={targetAgeMax} setTargetAgeMax={setTargetAgeMax}
                          targetGender={targetGender} setTargetGender={setTargetGender}
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
                  targetCountries={targetCountries} setTargetCountries={setTargetCountries}
                  targetAgeMin={targetAgeMin} setTargetAgeMin={setTargetAgeMin}
                  targetAgeMax={targetAgeMax} setTargetAgeMax={setTargetAgeMax}
                  targetGender={targetGender} setTargetGender={setTargetGender}
                />
              )}

              {/* FUNNEL STAGE step */}
              {currentStep === 'funnel-stage' && (
                <>
                  <FunnelStageSelector funnelStage={funnelStage} setFunnelStage={setFunnelStage} />
                  {briefChips.chips.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Steve conoce tu marca:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {briefChips.chips.map((chip) => (
                          <span key={chip.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/5 text-[11px] text-foreground border border-primary/10">
                            <span>{chip.emoji}</span> <span className="font-medium">{chip.label}:</span> <span className="text-muted-foreground">{chip.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ANGLE SELECT step */}
              {currentStep === 'angle-select' && (
                <AngleSelector
                  funnelStage={funnelStage}
                  selectedAngle={selectedAngle}
                  setSelectedAngle={setSelectedAngle}
                />
              )}

              {/* CREATIVE FOCUS step */}
              {currentStep === 'creative-focus' && (
                <CreativeFocusStep
                  clientId={clientId}
                  focusType={focusType}
                  setFocusType={setFocusType}
                  selectedProduct={selectedProduct}
                  setSelectedProduct={setSelectedProduct}
                />
              )}

              {/* AD CREATIVE step */}
              {currentStep === 'ad-creative' && (
                <div className="relative">
                  {/* Auto-generation overlay */}
                  {autoGenerating && (
                    <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-4 pointer-events-auto">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                        <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-foreground">Steve está creando tu anuncio</p>
                        <p className="text-xs text-muted-foreground animate-pulse">{autoGenProgress}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground max-w-xs text-center">Esto puede tomar unos segundos. No cierres esta ventana.</p>
                    </div>
                  )}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                  <AdFormMultiSlot
                    clientId={clientId}
                    adSetFormat={adSetFormat}
                    selectedAngle={selectedAngle}
                    headlines={headlines} setHeadlines={setHeadlines}
                    primaryTexts={primaryTexts} setPrimaryTexts={setPrimaryTexts}
                    descriptions={descriptions} setDescriptions={setDescriptions}
                    images={images} setImages={setImages}
                    cta={cta} setCta={setCta}
                    destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
                    generating={generatingCopy}
                    onGenerateCopy={handleGenerateCopy}
                    productContext={focusType === 'product' && selectedProduct ? `Anuncio para producto "${selectedProduct.title}" (${selectedProduct.product_type || 'general'}). Ángulo: ${selectedAngle || 'general'}. Genera una imagen publicitaria profesional para Meta Ads.` : undefined}
                    focusType={focusType}
                    selectedProduct={selectedProduct}
                  />
                  {(primaryTexts[0] || headlines[0] || images[0]) && (
                    <PreviewPanel
                      images={images}
                      primaryTexts={primaryTexts}
                      headlines={headlines}
                      descriptions={descriptions}
                      cta={cta}
                      pageName={pageName || 'Tu Marca'}
                      destinationUrl={destinationUrl}
                    />
                  )}
                </div>
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
                  description={descriptions[0] || ''}
                  imageUrl={images[0] || ''}
                  cta={cta}
                  destinationUrl={destinationUrl}
                  pageName={pageName || 'Tu Marca'}
                  images={images.filter(Boolean)}
                  headlines={headlines}
                  primaryTexts={primaryTexts}
                  descriptions={descriptions}
                  adSetFormat={adSetFormat}
                  selectedAngle={selectedAngle}
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
              disabled={autoGenerating}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {stepIndex === 0 ? 'Volver' : 'Anterior'}
            </Button>

            <div className="flex items-center gap-2">
              {/* Save draft — available from ad-creative and review steps */}
              {(currentStep === 'ad-creative' || currentStep === 'review') && (
                <Button variant="outline" onClick={handleSaveDraft} disabled={savingDraft || autoGenerating}>
                  {savingDraft ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" />Guardar Borrador</>
                  )}
                </Button>
              )}

              {currentStep === 'review' ? (
                <Button onClick={handleSubmit} disabled={submitting} size="lg" className="bg-green-600 hover:bg-green-700">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando campaña...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Publicar en Meta (en Pausa)</>
                  )}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!canProceed() || autoGenerating} size="lg">
                  {autoGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Steve está trabajando...</>
                  ) : !canProceed() ? (
                    <>Completa este paso</>
                  ) : stepIndex === steps.length - 2 ? (
                    <>Revisar y publicar <ChevronRight className="w-4 h-4 ml-1" /></>
                  ) : (
                    <>Siguiente <ChevronRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Leave confirmation dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tienes trabajo sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si sales ahora perderás el anuncio en progreso. ¿Quieres guardar un borrador antes de salir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setShowLeaveDialog(false); onBack(); }}>
              Descartar y salir
            </Button>
            <Button onClick={async () => { await handleSaveDraft(); setShowLeaveDialog(false); onBack(); }}>
              <Save className="w-4 h-4 mr-1" />Guardar borrador y salir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
