import { useState, useEffect, useCallback, useRef } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
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
  Search,
  MapPin,
  Globe,
  Users,
  Minus,
  Trash2,
  SlidersHorizontal,
  Zap,
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
type BudgetType = 'ABO' | 'CBO' | 'ADVANTAGE';
type Objective = 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT' | 'CATALOG';
type WizardStep = 'select-campaign' | 'select-adset' | 'campaign-config' | 'adset-config' | 'funnel-stage' | 'angle-select' | 'creative-focus' | 'ad-creative' | 'review';
type AdSetFormat = 'flexible' | 'carousel' | 'single' | 'catalog';

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
  onNameEdited,
  onSuggestName,
  budgetType, setBudgetType,
  objective, setObjective,
  dailyBudget, setDailyBudget,
  startDate, setStartDate,
  cpaTarget,
}: {
  name: string; setName: (v: string) => void;
  onNameEdited?: () => void;
  onSuggestName?: () => string;
  budgetType: BudgetType; setBudgetType: (v: BudgetType) => void;
  objective: Objective; setObjective: (v: Objective) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  cpaTarget?: string;
}) {
  const cboCpa = Number(cpaTarget) || 0;
  const cboRecommended = cboCpa > 0 ? Math.round((cboCpa * 10) / 7) : 0;
  return (
    <div className="space-y-5">
      <div>
        <Label>Nombre de la campaña</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); onNameEdited?.(); }}
            placeholder="Ej: JardinEva-CONV-Lookalike-Mar26"
            className="flex-1"
          />
          {onSuggestName && (
            <button
              type="button"
              onClick={() => setName(onSuggestName())}
              className="px-3 py-2 text-xs font-medium rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            >
              Sugerir nombre
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Formato: [Marca]-[Objetivo]-[Audiencia]-[Fecha]</p>
      </div>

      <div>
        <Label>Tipo de campaña</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {([
            { key: 'ABO' as BudgetType, label: 'ABO', name: 'Tú controlas', desc: 'Tú defines cuánto gasta cada audiencia. Ideal para probar.', badgeClass: 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#2A4F9E]/30' },
            { key: 'CBO' as BudgetType, label: 'CBO', name: 'Meta controla budget', desc: 'Meta distribuye el dinero donde mejor funcione. Ideal para escalar.', badgeClass: 'bg-purple-500/15 text-purple-700 border-purple-500/30' },
            { key: 'ADVANTAGE' as BudgetType, label: 'Advantage+ Catálogo', name: 'DPA con catálogo (ecommerce)', desc: 'Meta genera ads dinámicos con los productos de tu catálogo Shopify. Requiere elegir catálogo y colección.', badgeClass: 'bg-green-500/15 text-green-700 border-green-500/30' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setBudgetType(t.key)}
              className={`relative flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-all ${
                budgetType === t.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
              }`}
            >
              {t.key === 'ADVANTAGE' && (
                <Sparkles className="absolute top-2 right-2 w-3.5 h-3.5 text-green-600" />
              )}
              <Badge className={`text-xs font-bold ${t.badgeClass}`}>
                {t.key === 'ADVANTAGE' ? 'Advantage+ Catálogo' : <JargonTooltip term={t.key} />}
              </Badge>
              <span className={`text-xs font-semibold text-center ${budgetType === t.key ? 'text-foreground' : 'text-muted-foreground'}`}>{t.name}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Objetivo {budgetType === 'ADVANTAGE' && <span className="text-[10px] text-green-700 font-normal">(bloqueado en CATALOG para Advantage+)</span>}</Label>
        <Select value={objective} onValueChange={(v) => setObjective(v as Objective)} disabled={budgetType === 'ADVANTAGE'}>
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

      {(budgetType === 'CBO' || budgetType === 'ADVANTAGE') && (
        <div>
          <Label>Presupuesto diario (CLP)</Label>
          <div className="flex gap-2 mt-1">
            <Input type="number" min="0" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="50000" className="flex-1" />
            {cboRecommended > 0 && dailyBudget !== String(cboRecommended) && (
              <button
                type="button"
                onClick={() => setDailyBudget(String(cboRecommended))}
                className="px-3 py-2 text-xs font-medium rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
              >
                Aplicar ${cboRecommended.toLocaleString('es-CL')}/día
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {budgetType === 'ADVANTAGE'
              ? 'Meta distribuirá este presupuesto donde mejor funcione (placements, audiencia, creativos).'
              : 'Meta distribuirá este presupuesto entre los Ad Sets automáticamente.'}
            {cboRecommended > 0 && (
              <span className="block mt-0.5">Recomendado: CPA ${cboCpa.toLocaleString('es-CL')} × 10 ÷ 7 = <span className="font-medium text-primary">${cboRecommended.toLocaleString('es-CL')}/día</span></span>
            )}
            {!cboRecommended && (
              <span className="block mt-0.5">Fórmula Tichner: CPA × 10 ÷ 7 = presupuesto/día.</span>
            )}
          </p>
        </div>
      )}

      {budgetType === 'ADVANTAGE' && (
        <div className="space-y-2 p-3 rounded-lg border border-green-300 bg-green-50/50">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-green-600 mt-0.5" />
            <div className="text-xs text-green-900">
              <p className="font-semibold">Modo Advantage+ Catálogo (DPA) activado</p>
              <p className="text-green-800/80 mt-1">
                Meta generará anuncios dinámicos mostrando productos de tu <strong>catálogo</strong> a cada persona
                según su comportamiento. Objetivo forzado a <strong>Catálogo (Ventas)</strong>.
                Abajo elegí el catálogo y la colección (Product Set) a promocionar.
              </p>
            </div>
          </div>
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

// ---------------------------------------------------------------------------
// Interest Search (queries Meta targeting search API)
// ---------------------------------------------------------------------------

function InterestSearch({
  connectionId,
  selectedInterests,
  onAdd,
  onRemove,
  placeholder = 'Buscar intereses...',
  isExclusion = false,
}: {
  connectionId?: string;
  selectedInterests: Array<{ id: string; name: string }>;
  onAdd: (interest: { id: string; name: string }) => void;
  onRemove: (id: string) => void;
  placeholder?: string;
  isExclusion?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; audience_size_lower_bound: number; audience_size_upper_bound: number; path: string[] }>>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!connectionId || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await callApi('meta-targeting-search', {
        body: { connection_id: connectionId, search_type: 'interests', query: q },
      });
      if (data?.success && Array.isArray(data.results)) {
        setResults(data.results.filter((r: any) => !selectedInterests.find(s => s.id === r.id)));
      }
    } catch (err) {
      console.error('[InterestSearch] Error:', err);
      toast.error('Error al buscar intereses');
    }
    setSearching(false);
  }, [connectionId, selectedInterests]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length >= 2) {
      searchTimeout.current = setTimeout(() => doSearch(value), 400);
      setShowResults(true);
    } else {
      setResults([]);
      setShowResults(false);
    }
  };

  // Cleanup searchTimeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  // Close dropdown on click outside
  // Cleanup searchTimeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const borderColor = isExclusion ? 'border-red-500/30' : 'border-border';

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 border rounded-lg px-2.5 py-1.5 mt-1 ${borderColor} bg-background`}>
        <Search className={`w-3.5 h-3.5 shrink-0 ${isExclusion ? 'text-red-400' : 'text-muted-foreground'}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowResults(true); }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Search results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-background shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onAdd({ id: r.id, name: r.name });
                setQuery('');
                setResults([]);
                setShowResults(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="min-w-0">
                <span className="font-medium truncate block">{r.name}</span>
                {r.path && r.path.length > 0 && (
                  <span className="text-[10px] text-muted-foreground truncate block">{r.path.join(' > ')}</span>
                )}
              </div>
              {(r.audience_size_lower_bound > 0 || r.audience_size_upper_bound > 0) && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Intl.NumberFormat('es-CL', { notation: 'compact' }).format(r.audience_size_lower_bound)}
                  {r.audience_size_upper_bound > r.audience_size_lower_bound && ` - ${new Intl.NumberFormat('es-CL', { notation: 'compact' }).format(r.audience_size_upper_bound)}`}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected interests as chips */}
      {selectedInterests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedInterests.map((interest) => (
            <span
              key={interest.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                isExclusion
                  ? 'bg-red-500/10 text-red-700 border-red-500/30'
                  : 'bg-primary/10 text-primary border-primary/30'
              }`}
            >
              {interest.name}
              <button
                type="button"
                onClick={() => onRemove(interest.id)}
                className="ml-0.5 hover:text-foreground"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {!connectionId && (
        <p className="text-[10px] text-muted-foreground mt-1">Conecta tu cuenta de Meta para buscar intereses.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location Search (queries Meta geo location API)
// ---------------------------------------------------------------------------

function LocationSearch({
  connectionId,
  selectedLocations,
  onAdd,
  onRemove,
}: {
  connectionId?: string;
  selectedLocations: Array<{ key: string; name: string; type: string; country_name: string }>;
  onAdd: (loc: { key: string; name: string; type: string; country_name: string }) => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ key: string; name: string; type: string; country_name: string; region: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!connectionId || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await callApi('meta-targeting-search', {
        body: { connection_id: connectionId, search_type: 'locations', query: q },
      });
      if (data?.success && Array.isArray(data.results)) {
        setResults(data.results.filter((r: any) => !selectedLocations.find(s => s.key === r.key)));
      }
    } catch (err) {
      console.error('[LocationSearch] Error:', err);
      toast.error('Error al buscar ubicaciones');
    }
    setSearching(false);
  }, [connectionId, selectedLocations]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length >= 2) {
      searchTimeout.current = setTimeout(() => doSearch(value), 400);
      setShowResults(true);
    } else {
      setResults([]);
      setShowResults(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeLabel = (type: string) => {
    switch (type) {
      case 'country': return 'País';
      case 'region': return 'Región';
      case 'city': return 'Ciudad';
      case 'zip': return 'Código Postal';
      default: return type;
    }
  };

  return (
    <div ref={containerRef} className="relative mt-2">
      <div className="flex items-center gap-2 border rounded-lg px-2.5 py-1.5 bg-background">
        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowResults(true); }}
          placeholder="Buscar ciudades o regiones: Santiago, CDMX, Bogotá..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-background shadow-lg">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                onAdd({ key: r.key, name: r.name, type: r.type, country_name: r.country_name });
                setQuery('');
                setResults([]);
                setShowResults(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <span className="font-medium truncate block">{r.name}</span>
                  {r.region && <span className="text-[10px] text-muted-foreground">{r.region}, {r.country_name}</span>}
                  {!r.region && r.country_name && <span className="text-[10px] text-muted-foreground">{r.country_name}</span>}
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">{typeLabel(r.type)}</Badge>
            </button>
          ))}
        </div>
      )}

      {selectedLocations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedLocations.map((loc) => (
            <span
              key={loc.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1E3A7B]/10 text-[#162D5F] border border-[#2A4F9E]/30"
            >
              <MapPin className="w-2.5 h-2.5" />
              {loc.name}{loc.country_name ? `, ${loc.country_name}` : ''}
              <button type="button" onClick={() => onRemove(loc.key)} className="ml-0.5 hover:text-foreground">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface MetaAudienceOption {
  id: string;
  name: string;
  type: 'custom' | 'lookalike' | 'saved';
  approximate_count?: number;
}

function AdSetForm({
  name, setName,
  audienceDesc, setAudienceDesc,
  dailyBudget, setDailyBudget,
  isABO,
  adSetFormat, setAdSetFormat,
  autoMediaType, setAutoMediaType,
  cpaTarget, setCpaTarget,
  targetCountries, setTargetCountries,
  targetAgeMin, setTargetAgeMin,
  targetAgeMax, setTargetAgeMax,
  targetGender, setTargetGender,
  connectionId,
  selectedAudienceIds, setSelectedAudienceIds,
  targetInterests, setTargetInterests,
  targetExcludeInterests, setTargetExcludeInterests,
  targetLocations, setTargetLocations,
  clientId,
  selectedProductId,
  // Pixel + conversion event
  objective, availablePixels, selectedPixelId, setSelectedPixelId,
  customEventType, setCustomEventType,
  // Placements
  placementsMode, setPlacementsMode,
  selectedPlatforms, setSelectedPlatforms,
  fbPositions, setFbPositions,
  igPositions, setIgPositions,
}: {
  name: string; setName: (v: string) => void;
  audienceDesc: string; setAudienceDesc: (v: string) => void;
  dailyBudget: string; setDailyBudget: (v: string) => void;
  isABO: boolean;
  adSetFormat: AdSetFormat; setAdSetFormat: (v: AdSetFormat) => void;
  autoMediaType: 'photo' | 'video'; setAutoMediaType: (v: 'photo' | 'video') => void;
  cpaTarget: string; setCpaTarget: (v: string) => void;
  targetCountries: string[]; setTargetCountries: (v: string[]) => void;
  targetAgeMin: number; setTargetAgeMin: (v: number) => void;
  targetAgeMax: number; setTargetAgeMax: (v: number) => void;
  targetGender: 0 | 1 | 2; setTargetGender: (v: 0 | 1 | 2) => void;
  connectionId?: string;
  selectedAudienceIds: string[]; setSelectedAudienceIds: (v: string[]) => void;
  targetInterests: Array<{ id: string; name: string }>; setTargetInterests: (v: Array<{ id: string; name: string }>) => void;
  targetExcludeInterests: Array<{ id: string; name: string }>; setTargetExcludeInterests: (v: Array<{ id: string; name: string }>) => void;
  targetLocations: Array<{ key: string; name: string; type: string; country_name: string }>; setTargetLocations: (v: Array<{ key: string; name: string; type: string; country_name: string }>) => void;
  clientId: string;
  selectedProductId?: string;
  objective: Objective;
  availablePixels: Array<{ id: string; name: string; last_fired: string | null }>;
  selectedPixelId: string; setSelectedPixelId: (v: string) => void;
  customEventType: string; setCustomEventType: (v: string) => void;
  placementsMode: 'advantage' | 'manual'; setPlacementsMode: (v: 'advantage' | 'manual') => void;
  selectedPlatforms: string[]; setSelectedPlatforms: (v: string[]) => void;
  fbPositions: string[]; setFbPositions: (v: string[]) => void;
  igPositions: string[]; setIgPositions: (v: string[]) => void;
}) {
  // Fetch available audiences from Meta
  const [metaAudiences, setMetaAudiences] = useState<MetaAudienceOption[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [audiencesFetched, setAudiencesFetched] = useState(false);

  useEffect(() => {
    if (!connectionId || audiencesFetched) return;
    let cancelled = false;
    (async () => {
      setAudiencesLoading(true);
      try {
        const { data } = await callApi('manage-meta-audiences', {
          body: { action: 'list', connection_id: connectionId },
        });
        if (!cancelled && data?.success && Array.isArray(data.audiences)) {
          const mapped: MetaAudienceOption[] = data.audiences.map((a: any) => ({
            id: a.id,
            name: a.name,
            type: a.subtype === 'LOOKALIKE' ? 'lookalike' as const
              : a.subtype === 'CUSTOM' || a.subtype === 'WEBSITE' || a.subtype === 'ENGAGEMENT'
                ? 'custom' as const
                : 'saved' as const,
            approximate_count: a.approximate_count_lower_bound || a.approximate_count || 0,
          }));
          setMetaAudiences(mapped);
        }
      } catch {
        // Silently fail — user can still set targeting manually
      } finally {
        if (!cancelled) {
          setAudiencesLoading(false);
          setAudiencesFetched(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [connectionId, audiencesFetched]);

  const cpa = Number(cpaTarget) || 0;
  const recommendedBudget = cpa > 0 ? Math.round((cpa * 10) / 7) : 0;

  // Auto-fill budget when CPA changes
  useEffect(() => {
    if (recommendedBudget > 0 && isABO && !dailyBudget) {
      setDailyBudget(String(recommendedBudget));
    }
  }, [recommendedBudget]);

  const formats: { key: AdSetFormat; label: React.ReactNode; desc: string; icon: React.ElementType; recommended?: boolean }[] = [
    { key: 'flexible', label: <>Flexible (<JargonTooltip term="DCT" />)</>, desc: 'Metodología 3:2:2 — 3 imágenes, 2 textos, 2 títulos. Meta optimiza combinaciones ganadoras.', icon: Layers, recommended: isABO },
    { key: 'carousel', label: 'Carrusel', desc: 'Múltiples imágenes en swipe. 3+ fotos.', icon: ImageIcon },
    { key: 'single', label: 'Única (imagen o video)', desc: 'Un solo creativo. 1 foto O 1 video, 1 texto, 1 headline.', icon: FileImage },
    { key: 'catalog', label: 'Catálogo (DPA)', desc: 'Anuncio dinámico de productos del catálogo. Meta elige qué producto mostrar a cada persona. Acepta etiquetas {{product.name}}, {{product.price}}.', icon: ShoppingBag },
  ];

  return (
    <div className="space-y-5">
      {/* Format selector. When the campaign is in DPA mode (ADVANTAGE /
          CATALOG) only 'catalog' is valid — disable the other options so the
          user can't pick Single/Carousel/DCT by mistake, which would conflict
          with the objective set in step 1. */}
      <div>
        <Label className="text-sm font-semibold">
          Formato del Ad Set
          {adSetFormat === 'catalog' && (
            <span className="text-[10px] text-green-700 font-normal ml-2">(bloqueado: campañas Catálogo solo usan DPA)</span>
          )}
        </Label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {formats.map((f) => {
            const Icon = f.icon;
            const isActive = adSetFormat === f.key;
            const isDisabled = adSetFormat === 'catalog' && f.key !== 'catalog';
            return (
              <button
                key={f.key}
                onClick={() => !isDisabled && setAdSetFormat(f.key)}
                disabled={isDisabled}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-lg border text-center transition-all ${
                  isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                } ${isDisabled ? 'opacity-40 cursor-not-allowed hover:border-border' : ''}`}
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

      {/* A4: Photo vs Video — disponible en Única, Carrusel y DCT Flexible.
          Catálogo (DPA) queda fuera porque Meta trae los productos del
          catálogo, no tiene sentido generar. Para formatos múltiples el
          costo se multiplica (N videos × 30 créditos). */}
      {adSetFormat !== 'catalog' && (() => {
        const slots = adSetFormat === 'single' ? 1 : 3;
        const videoCredits = slots * 30;
        return (
          <div>
            <Label className="text-sm font-semibold">¿Qué quieres generar automáticamente?</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button
                type="button"
                onClick={() => setAutoMediaType('photo')}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  autoMediaType === 'photo' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                }`}
              >
                <ImageIcon className={`w-5 h-5 ${autoMediaType === 'photo' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-semibold">{slots === 1 ? 'Foto' : `${slots} fotos`}</p>
                  <p className="text-[10px] text-muted-foreground">Gemini 2.5 · {slots * 2} créditos · instantáneo</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAutoMediaType('video')}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  autoMediaType === 'video' ? 'border-green-500 bg-green-50 ring-1 ring-green-500/20' : 'border-border hover:border-primary/30'
                }`}
              >
                <Video className={`w-5 h-5 ${autoMediaType === 'video' ? 'text-green-600' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-semibold">{slots === 1 ? 'Video' : `${slots} videos`}</p>
                  <p className="text-[10px] text-muted-foreground">Veo 3.1 · {videoCredits} créditos · {slots === 1 ? '1-3 min' : `${slots}-${slots * 3} min`} · 1080p con audio</p>
                </div>
              </button>
            </div>
            {adSetFormat === 'flexible' && autoMediaType === 'video' && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
                <strong>DCT 3:2:2 con videos:</strong> 3 videos × 2 textos × 2 títulos. Costo: {videoCredits} créditos (~${(videoCredits * 0.107).toFixed(2)} USD). Cada video demora 1-3 min con Veo 3.
              </p>
            )}
            {adSetFormat === 'carousel' && autoMediaType === 'video' && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
                <strong>Carrusel de videos:</strong> 3 slides en video. Costo: {videoCredits} créditos. Cada video demora 1-3 min con Veo 3.
              </p>
            )}
          </div>
        );
      })()}

      <div>
        <Label>Nombre del Ad Set</Label>
        <div className="flex gap-2 mt-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="[Audiencia] - [Variable test]" className="flex-1" />
          <button
            type="button"
            onClick={() => {
              // Auto-generate ad set name from audience + format + date.
              // Pattern: [AudienciaCorta]-[Formato]-[MMMYY]
              const audLower = audienceDesc.toLowerCase();
              let audTag = '';
              if (selectedAudienceIds.length > 0) {
                if (audLower.includes('lookalike') || audLower.includes('similar')) audTag = 'LAL';
                else if (audLower.includes('retarg') || audLower.includes('remarketing')) audTag = 'RTG';
                else if (audLower.includes('saved') || audLower.includes('guardad')) audTag = 'SAVED';
                else audTag = audienceDesc.substring(0, 12).replace(/\s+/g, '');
              } else if (audienceDesc.trim()) {
                audTag = audienceDesc.substring(0, 12).replace(/\s+/g, '');
              } else {
                audTag = 'Broad';
              }
              const fmtTag = adSetFormat === 'flexible' ? 'DCT' : adSetFormat === 'carousel' ? 'Carrusel' : adSetFormat === 'catalog' ? 'DPA' : 'Single';
              const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
              const now = new Date();
              const dateTag = `${months[now.getMonth()]}${String(now.getFullYear()).slice(-2)}`;
              setName(`${audTag}-${fmtTag}-${dateTag}`);
            }}
            className="px-3 py-2 text-xs font-medium rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3 inline mr-1" />Sugerir
          </button>
        </div>
      </div>

      {/* Audience selector — show real Meta audiences */}
      <div>
        <Label>Audiencia de Meta</Label>
        {audiencesLoading ? (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando audiencias de Meta...
          </div>
        ) : metaAudiences.length > 0 ? (
          <div className="space-y-2 mt-2">
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border p-2 bg-muted/20">
              {metaAudiences.map((aud) => {
                const isSelected = selectedAudienceIds.includes(aud.id);
                const typeLabel = aud.type === 'custom' ? 'Personalizada'
                  : aud.type === 'lookalike' ? 'Similar'
                  : 'Guardada';
                const typeBg = aud.type === 'custom' ? 'bg-purple-500/15 text-purple-700 border-purple-500/30'
                  : aud.type === 'lookalike' ? 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#2A4F9E]/30'
                  : 'bg-gray-500/15 text-gray-600 border-gray-500/30';
                return (
                  <button
                    key={aud.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedAudienceIds(selectedAudienceIds.filter(id => id !== aud.id));
                      } else {
                        setSelectedAudienceIds([...selectedAudienceIds, aud.id]);
                      }
                      // Also update audienceDesc for display/AI context
                      const newSelected = isSelected
                        ? selectedAudienceIds.filter(id => id !== aud.id)
                        : [...selectedAudienceIds, aud.id];
                      const names = metaAudiences
                        .filter(a => newSelected.includes(a.id))
                        .map(a => a.name);
                      setAudienceDesc(names.join(', '));
                    }}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-left text-sm transition-all ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/30 ring-1 ring-primary/20'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Target className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="truncate">{aud.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {aud.approximate_count ? (
                        <span className="text-[10px] text-muted-foreground">{new Intl.NumberFormat('es-CL').format(aud.approximate_count)}</span>
                      ) : null}
                      <Badge variant="outline" className={`text-[9px] ${typeBg}`}>{typeLabel}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedAudienceIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedAudienceIds.length} audiencia(s) seleccionada(s)</p>
            )}
          </div>
        ) : (
          <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/60 text-sm text-muted-foreground">
            <p>No tienes audiencias guardadas en Meta Ads.</p>
            <p className="mt-1 text-xs">Ve a la pestaña <strong>Audiencias</strong> para crear audiencias personalizadas, similares o guardadas. También puedes continuar sin audiencia (targeting abierto).</p>
          </div>
        )}
        {/* Fallback: optional free text for extra targeting notes */}
        <Input
          value={selectedAudienceIds.length > 0 ? '' : audienceDesc}
          onChange={(e) => setAudienceDesc(e.target.value)}
          placeholder={selectedAudienceIds.length > 0 ? 'Audiencia seleccionada arriba' : 'O describe manualmente: intereses, comportamiento...'}
          className="mt-2"
          disabled={selectedAudienceIds.length > 0}
        />
      </div>

      {/* ═══════════ TARGETING SECTION ═══════════ */}
      <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-muted/10">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Segmentación detallada</Label>
        </div>

        {/* ── Gender ── */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Género</Label>
          <div className="flex gap-2 mt-1.5">
            {([
              { val: 0 as const, label: 'Todos', icon: Users },
              { val: 1 as const, label: 'Hombres', icon: Users },
              { val: 2 as const, label: 'Mujeres', icon: Users },
            ]).map((g) => (
              <button
                key={g.val}
                type="button"
                onClick={() => setTargetGender(g.val)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  targetGender === g.val
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20'
                    : 'border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Age Range ── */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Rango de edad</Label>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1">
              <Select value={String(targetAgeMin)} onValueChange={(v) => { const n = Number(v); setTargetAgeMin(n); if (n > targetAgeMax) setTargetAgeMax(n); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 48 }, (_, i) => 18 + i).map((age) => (
                    <SelectItem key={age} value={String(age)}>{age} {age === 18 ? '(min)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Select value={String(targetAgeMax)} onValueChange={(v) => { const n = Number(v); setTargetAgeMax(n); if (n < targetAgeMin) setTargetAgeMin(n); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 48 }, (_, i) => 18 + i).map((age) => (
                    <SelectItem key={age} value={String(age)}>{age}{age === 65 ? '+' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/40 rounded-full transition-all"
              style={{
                marginLeft: `${((targetAgeMin - 18) / 47) * 100}%`,
                width: `${((targetAgeMax - targetAgeMin) / 47) * 100}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {targetAgeMin === 18 && targetAgeMax === 65 ? 'Todas las edades (18-65+)' : `${targetAgeMin} - ${targetAgeMax}${targetAgeMax === 65 ? '+' : ''} años`}
          </p>
        </div>

        {/* ── Locations ── */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Ubicaciones</Label>
          {/* Quick country buttons */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {([
              { code: 'CL', flag: 'CL', label: 'Chile' },
              { code: 'MX', flag: 'MX', label: 'México' },
              { code: 'CO', flag: 'CO', label: 'Colombia' },
              { code: 'AR', flag: 'AR', label: 'Argentina' },
              { code: 'PE', flag: 'PE', label: 'Perú' },
              { code: 'US', flag: 'US', label: 'EE.UU.' },
              { code: 'ES', flag: 'ES', label: 'España' },
              { code: 'BR', flag: 'BR', label: 'Brasil' },
              { code: 'EC', flag: 'EC', label: 'Ecuador' },
              { code: 'UY', flag: 'UY', label: 'Uruguay' },
              { code: 'BO', flag: 'BO', label: 'Bolivia' },
              { code: 'PA', flag: 'PA', label: 'Panamá' },
            ]).map((c) => {
              const isSelected = targetCountries.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      const next = targetCountries.filter(cc => cc !== c.code);
                      setTargetCountries(next.length > 0 ? next : ['CL']);
                    } else {
                      setTargetCountries([...targetCountries, c.code]);
                    }
                  }}
                  className={`px-2 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {targetCountries.length > 1 && (
            <p className="text-[10px] text-primary mt-1 font-medium">{targetCountries.length} países seleccionados</p>
          )}

          {/* Location search (cities/regions via Meta API) */}
          <LocationSearch
            connectionId={connectionId}
            selectedLocations={targetLocations}
            onAdd={(loc) => {
              if (!targetLocations.find(l => l.key === loc.key)) {
                setTargetLocations([...targetLocations, loc]);
              }
            }}
            onRemove={(key) => setTargetLocations(targetLocations.filter(l => l.key !== key))}
          />
        </div>

        {/* ── Interests (Detailed Targeting) ── */}
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Intereses y comportamientos</Label>
            <InterestAISuggestButton
              clientId={clientId}
              connectionId={connectionId}
              productId={selectedProductId}
              selectedInterests={targetInterests}
              onAdd={(interest) => {
                if (!targetInterests.find(i => i.id === interest.id)) {
                  setTargetInterests([...targetInterests, interest]);
                }
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Busca intereses de Meta para segmentar tu audiencia con precisión.</p>
          <InterestSearch
            connectionId={connectionId}
            selectedInterests={targetInterests}
            onAdd={(interest) => {
              if (!targetInterests.find(i => i.id === interest.id)) {
                setTargetInterests([...targetInterests, interest]);
              }
            }}
            onRemove={(id) => setTargetInterests(targetInterests.filter(i => i.id !== id))}
            placeholder="Buscar: fitness, moda, tecnología, cocina..."
          />
        </div>

        {/* ── Exclusion Interests ── */}
        {targetInterests.length > 0 && (
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Excluir intereses</Label>
            <p className="text-[10px] text-muted-foreground mb-1.5">Personas con estos intereses NO verán tu anuncio.</p>
            <InterestSearch
              connectionId={connectionId}
              selectedInterests={targetExcludeInterests}
              onAdd={(interest) => {
                if (!targetExcludeInterests.find(i => i.id === interest.id)) {
                  setTargetExcludeInterests([...targetExcludeInterests, interest]);
                }
              }}
              onRemove={(id) => setTargetExcludeInterests(targetExcludeInterests.filter(i => i.id !== id))}
              placeholder="Excluir: competidores, temas no relevantes..."
              isExclusion
            />
          </div>
        )}

        {/* ── Live reach estimate ── */}
        <ReachEstimateBanner
          connectionId={connectionId}
          targetCountries={targetCountries}
          targetAgeMin={targetAgeMin}
          targetAgeMax={targetAgeMax}
          targetGender={targetGender}
          targetInterests={targetInterests}
          targetExcludeInterests={targetExcludeInterests}
          targetLocations={targetLocations}
          selectedAudienceIds={selectedAudienceIds}
        />
      </div>

      {/* ═══════════ Pixel + Conversion event ═══════════ */}
      {objective === 'CONVERSIONS' && (
        <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold">Pixel y evento de conversión</Label>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Pixel</Label>
            {availablePixels.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">Se usará automáticamente el primer pixel de la cuenta.</p>
            ) : availablePixels.length === 1 ? (
              <div className="mt-1.5 p-2 rounded-md border border-border/60 bg-background text-xs flex items-center gap-2">
                <span className="font-medium">{availablePixels[0].name}</span>
                <span className="text-muted-foreground text-[10px]">ID {availablePixels[0].id}</span>
              </div>
            ) : (
              <Select value={selectedPixelId} onValueChange={setSelectedPixelId}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Elige un pixel" /></SelectTrigger>
                <SelectContent>
                  {availablePixels.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.last_fired ? '' : '(sin datos)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Evento que optimizarás</Label>
            <Select value={customEventType} onValueChange={setCustomEventType}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PURCHASE">Compra (PURCHASE)</SelectItem>
                <SelectItem value="INITIATED_CHECKOUT">Checkout iniciado</SelectItem>
                <SelectItem value="ADD_TO_CART">Agregar al carrito</SelectItem>
                <SelectItem value="LEAD">Lead</SelectItem>
                <SelectItem value="COMPLETE_REGISTRATION">Registro completado</SelectItem>
                <SelectItem value="CONTACT">Contacto</SelectItem>
                <SelectItem value="SUBSCRIBE">Suscripción</SelectItem>
                <SelectItem value="VIEW_CONTENT">Ver contenido</SelectItem>
                <SelectItem value="SEARCH">Búsqueda</SelectItem>
                <SelectItem value="ADD_PAYMENT_INFO">Agregar pago</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">Meta optimizará la entrega para personas más propensas a completar este evento.</p>
          </div>
        </div>
      )}

      {/* ═══════════ Placements / Ubicaciones ═══════════ */}
      <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Ubicaciones del anuncio</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPlacementsMode('advantage')}
            className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
              placementsMode === 'advantage' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold">Advantage+ (recomendado)</span>
            </div>
            <span className="text-xs text-muted-foreground">Meta elige automáticamente dónde mostrar según la performance.</span>
          </button>
          <button
            type="button"
            onClick={() => setPlacementsMode('manual')}
            className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
              placementsMode === 'manual' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold">Manual</span>
            </div>
            <span className="text-xs text-muted-foreground">Eliges exactamente en qué plataformas y posiciones aparece.</span>
          </button>
        </div>

        {placementsMode === 'manual' && (
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Plataformas</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {([
                  { id: 'facebook', label: 'Facebook' },
                  { id: 'instagram', label: 'Instagram' },
                  { id: 'audience_network', label: 'Audience Network' },
                  { id: 'messenger', label: 'Messenger' },
                ]).map(p => {
                  const isSelected = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlatforms(isSelected
                          ? selectedPlatforms.filter(x => x !== p.id)
                          : [...selectedPlatforms, p.id]);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlatforms.includes('facebook') && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Posiciones en Facebook</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {([
                    { id: 'feed', label: 'Feed' },
                    { id: 'facebook_reels', label: 'Reels' },
                    { id: 'story', label: 'Stories' },
                    { id: 'marketplace', label: 'Marketplace' },
                    { id: 'video_feeds', label: 'Video Feeds' },
                    { id: 'search', label: 'Búsqueda' },
                    { id: 'instream_video', label: 'In-stream video' },
                    { id: 'right_hand_column', label: 'Columna derecha' },
                    { id: 'profile_feed', label: 'Feed de perfil' },
                  ]).map(p => {
                    const isSelected = fbPositions.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFbPositions(isSelected ? fbPositions.filter(x => x !== p.id) : [...fbPositions, p.id])}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedPlatforms.includes('instagram') && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Posiciones en Instagram</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {([
                    { id: 'stream', label: 'Feed' },
                    { id: 'reels', label: 'Reels' },
                    { id: 'story', label: 'Stories' },
                    { id: 'explore', label: 'Explore' },
                    { id: 'explore_home', label: 'Explore home' },
                    { id: 'profile_feed', label: 'Perfil' },
                    { id: 'shop', label: 'Shop' },
                  ]).map(p => {
                    const isSelected = igPositions.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setIgPositions(isSelected ? igPositions.filter(x => x !== p.id) : [...igPositions, p.id])}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CPA + Budget */}
      {isABO && (
        <>
          <div>
            <Label>¿Cuánto es lo máximo que pagarías por cada venta? (CLP)</Label>
            <Input type="number" value={cpaTarget} onChange={(e) => setCpaTarget(e.target.value)} placeholder="Ej: 15.000" className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">
              Esto se llama CPA (Costo Por Adquisición). Si vendes a $50.000 y tu margen es 40%, tu CPA máximo sería $20.000.
            </p>
            {recommendedBudget > 0 && (
              <p className="text-xs text-primary mt-1 font-medium">
                Steve recomienda: ${recommendedBudget.toLocaleString('es-CL')}/día por Ad Set
                <span className="text-muted-foreground font-normal"> (CPA × 10 compras ÷ 7 días = data suficiente para validar)</span>
              </p>
            )}
          </div>

          <div>
            <Label>Presupuesto diario del Ad Set (CLP)</Label>
            <div className="flex gap-2 mt-1">
              <Input type="number" min="0" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="10000" className="flex-1" />
              {recommendedBudget > 0 && dailyBudget !== String(recommendedBudget) && (
                <button
                  type="button"
                  onClick={() => setDailyBudget(String(recommendedBudget))}
                  className="px-3 py-2 text-xs font-medium rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                >
                  Aplicar ${recommendedBudget.toLocaleString('es-CL')}/día
                </button>
              )}
            </div>
            {recommendedBudget > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado: CPA ${cpa.toLocaleString('es-CL')} × 10 ÷ 7 = <span className="font-medium text-primary">${recommendedBudget.toLocaleString('es-CL')}/día</span>
              </p>
            )}
            {!recommendedBudget && (
              <p className="text-xs text-muted-foreground mt-1">
                Fórmula Tichner: CPA × 10 ÷ 7 = presupuesto/día. Ingresa tu CPA arriba para calcular.
              </p>
            )}
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
    { key: 'tofu' as const, label: 'TOFU', name: 'Captar atención', desc: 'Gente que NO te conoce. Quieres que te vean por primera vez.', example: 'Ej: "¿Sabías que...?", contenido viral, educativo', color: 'text-[#1E3A7B] border-[#2A4F9E]/30 bg-[#1E3A7B]/10' },
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
                      <img src={p.image} alt="Producto" className="w-14 h-14 rounded object-cover shrink-0" />
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

type MediaTab = 'upload' | 'ai-image' | 'ai-video' | 'gallery' | 'products' | 'url';
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
  onAddVariations,
  productContext,
  focusType,
  selectedProduct,
  isDpaCampaign,
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
  onAddVariations?: () => Promise<void>;
  productContext?: string;
  focusType: 'product' | 'broad';
  selectedProduct: ShopifyProduct | null;
  isDpaCampaign?: boolean;
}) {
  const [activeImageSlot, setActiveImageSlot] = useState(0);
  const [mediaTab, setMediaTab] = useState<MediaTab>(productContext ? 'products' : 'upload');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(productContext || '');
  // Engine selector: 'imagen' = Gemini 2.5 Flash (fast, 2 credits), 'flux' = Flux
  // Kontext/1.1 Pro via Replicate (5 credits, ~2× better realism for product shots).
  const [imageEngine, setImageEngine] = useState<'imagen' | 'flux'>('imagen');
  const [galleryAssets, setGalleryAssets] = useState<Array<{ id: string; url: string; tipo: string }>>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [loadingShopifyProducts, setLoadingShopifyProducts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadShopifyProducts = useCallback(async () => {
    setLoadingShopifyProducts(true);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .limit(1)
        .single();
      if (!conn?.id) { setLoadingShopifyProducts(false); return; }
      const { data } = await callApi('fetch-shopify-products', { body: { connectionId: conn.id } });
      if (data?.products) {
        setShopifyProducts(data.products.slice(0, 30).map((p: any) => ({
          id: p.id,
          title: p.title,
          image: p.image?.src || p.images?.[0]?.src || p.variants?.[0]?.image_url || p.image || '',
          price: Number(p.variants?.[0]?.price) || 0,
          product_type: p.product_type || '',
        })));
      }
    } catch { /* no shopify */ }
    setLoadingShopifyProducts(false);
  }, [clientId]);

  useEffect(() => { if (mediaTab === 'products') loadShopifyProducts(); }, [mediaTab, loadShopifyProducts]);

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
      // The client-assets bucket policy requires the first folder of the path
      // to equal auth.uid() — using any other string (e.g. "assets") fails RLS
      // for every non-admin user. Match the pattern used by BrandAssetUploader.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/meta-uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-assets').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('client-assets').getPublicUrl(path);
      setImageAtSlot(publicUrl);
      toast.success(`Imagen ${activeImageSlot + 1} subida`);
    } catch (err: any) { toast.error(err?.message || 'Error al procesar'); }
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
    } catch (err: any) { toast.error(err?.message || 'Error al procesar'); }
    finally { setGeneratingImage(false); }
  };

  // C7: Meta's "generate more images from one" feature. Takes the current
  // slot's image as reference and asks Gemini for N style/angle variations
  // that preserve the exact subject (product) but vary scene, lighting, and
  // composition. Results are appended as new slots (up to 10 total per Meta).
  const [generatingVariations, setGeneratingVariations] = useState(false);
  const handleGenerateVariationsFromSlot = async () => {
    const sourceUrl = images[activeImageSlot];
    if (!sourceUrl || sourceUrl.endsWith('.mp4')) {
      toast.error('Selecciona un slot con imagen primero');
      return;
    }
    const variationCount = 3;
    const remaining = 10 - images.length;
    const toGenerate = Math.min(variationCount, remaining);
    if (toGenerate <= 0) {
      toast.info('Ya tienes el máximo de 10 imágenes por anuncio');
      return;
    }

    setGeneratingVariations(true);
    const variationPrompts = [
      'Generate a VARIATION of the reference product photo: keep the product identical — exact shape, colors, labels, packaging — but change the scene, background, and lighting to a different setting (e.g., outdoor natural light instead of studio). Keep the brand aesthetic.',
      'Generate a VARIATION of the reference product photo: keep the product identical, but change the camera angle and composition (e.g., overhead flat-lay instead of front-facing) and vary the props around it.',
      'Generate a VARIATION of the reference product photo: keep the product identical, but use a different color palette in the background and lighting mood (warmer vs cooler), while preserving the brand feel.',
    ];

    let added = 0;
    for (let i = 0; i < toGenerate; i++) {
      try {
        const { data, error } = await callApi('generate-image', {
          body: {
            clientId,
            promptGeneracion: variationPrompts[i % variationPrompts.length],
            fotoBaseUrl: sourceUrl,
            engine: 'imagen',
            formato: 'square',
          },
        });
        if (error === 'NO_CREDITS') { toast.error('Sin créditos para generar más variaciones'); break; }
        if (error) continue;
        if (data?.asset_url) {
          setImages((prev) => [...prev, data.asset_url]);
          added++;
          toast.success(`Variación ${added} lista`);
        }
      } catch { /* skip */ }
    }
    setGeneratingVariations(false);
    if (added === 0) toast.error('No se pudieron generar variaciones. Intenta de nuevo.');
  };

  const canAddMoreImages = adSetFormat === 'flexible' || adSetFormat === 'carousel';
  const currentSlotIsImage = !!images[activeImageSlot] && !images[activeImageSlot].endsWith('.mp4');
  const canAddMoreTexts = adSetFormat === 'flexible';

  const MEDIA_TABS: Array<{ key: MediaTab; label: string; icon: React.ElementType }> = [
    { key: 'upload', label: 'Subir', icon: Upload },
    { key: 'products', label: 'Productos', icon: ShoppingBag },
    { key: 'ai-image', label: 'IA Imagen', icon: Sparkles },
    { key: 'ai-video', label: 'IA Video', icon: Video },
    { key: 'gallery', label: 'Galería', icon: ImageIcon },
    { key: 'url', label: 'URL', icon: LinkIcon },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {adSetFormat === 'flexible' ? 'Flexible (DCT 3:2:2)' : adSetFormat === 'carousel' ? 'Carrusel' : adSetFormat === 'catalog' ? 'Catálogo (DPA)' : 'Única (imagen o video)'}
          </Badge>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={onGenerateCopy} disabled={generating}>
              {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Steve genera copy
            </Button>
            {onAddVariations && (primaryTexts.some((t) => t.trim()) || headlines.some((h) => h.trim())) && (
              <Button variant="outline" size="sm" onClick={onAddVariations} disabled={generating} className="border-primary/30 text-primary">
                <Plus className="w-3 h-3 mr-1" />+ Variaciones
              </Button>
            )}
          </div>
        </div>
        {adSetFormat === 'flexible' && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-[#F0F4FA] dark:bg-[#0A1628]/20 border border-[#B5C8E0] dark:border-[#132448]">
            <Sparkles className="w-3.5 h-3.5 text-[#2A4F9E] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#162D5F] dark:text-[#7B9BCF] leading-relaxed">
              <strong>Metodología 3:2:2:</strong> 3 imágenes x 2 textos x 2 títulos. Meta optimiza automáticamente las combinaciones ganadoras.
            </p>
          </div>
        )}
      </div>

      {/* ---- IMAGE SLOTS ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Creativos ({images.length} {images.length === 1 ? 'imagen' : 'imágenes'})</Label>
          <div className="flex gap-1">
            {canAddMoreImages && currentSlotIsImage && images.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateVariationsFromSlot}
                disabled={generatingVariations}
                className="text-xs border-primary/30 text-primary"
                title="Genera 3 variaciones desde la imagen del slot actual (cambia fondo, ángulo y mood manteniendo el producto idéntico)"
              >
                {generatingVariations ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                3 variaciones desde esta
              </Button>
            )}
            {canAddMoreImages && (
              <Button variant="ghost" size="sm" onClick={() => setImages([...images, ''])} className="text-xs text-muted-foreground">
                <Plus className="w-3 h-3 mr-1" />Agregar
              </Button>
            )}
          </div>
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
                // Detect video by extension and render a <video> element instead
                // of <img>. Meta's carousel/single/DCT flows accept videos, and
                // the slot preview must reflect that so the user sees a poster
                // frame + play icon instead of a broken image.
                /\.(mp4|mov|webm|m4v)(\?|$)/i.test(img) ? (
                  <video src={img} muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={img} alt="Vista previa" className="w-full h-full object-cover" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              {img && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(img) && (
                <span className="absolute top-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">VIDEO</span>
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
              {img && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Clear the slot in place instead of removing it — this
                    // preserves the DCT 3:2:2 structure (3 images always) and
                    // lets the user swap any image (generated or uploaded) via
                    // any source tab (AI, upload, gallery, products, url).
                    const next = [...images];
                    next[i] = '';
                    setImages(next);
                    setActiveImageSlot(i);
                  }}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  aria-label="Vaciar slot"
                  title="Vaciar para cambiar la imagen"
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
            {/* Engine toggle: Gemini (fast, cheap) vs Flux Premium (realistic). */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImageEngine('imagen')}
                className={`flex items-center gap-2 p-2 rounded-md border text-left transition-all ${
                  imageEngine === 'imagen' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                }`}
              >
                <Zap className={`w-4 h-4 ${imageEngine === 'imagen' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold">Rápida</p>
                  <p className="text-[9px] text-muted-foreground">Gemini · 2 créd · instantáneo</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setImageEngine('flux')}
                className={`flex items-center gap-2 p-2 rounded-md border text-left transition-all ${
                  imageEngine === 'flux' ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500/20' : 'border-border hover:border-primary/30'
                }`}
              >
                <Sparkles className={`w-4 h-4 ${imageEngine === 'flux' ? 'text-purple-600' : 'text-muted-foreground'}`} />
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold">Premium</p>
                  <p className="text-[9px] text-muted-foreground">Flux · 5 créd · más fotorrealista</p>
                </div>
              </button>
            </div>
            <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={`Describe la imagen ${activeImageSlot + 1}${selectedAngle ? ` (ángulo: ${selectedAngle})` : ''}...`} rows={2} />
            <div className="flex gap-2">
              <Button onClick={handleGenerateImage} disabled={generatingImage} className="flex-1">
                {generatingImage ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando{imageEngine === 'flux' ? ' con Flux' : ''}...</> : <><Sparkles className="w-3 h-3 mr-1" />{aiPrompt.trim() ? 'Generar' : 'Auto-generar'}</>}
              </Button>
            </div>
          </div>
        )}

        {mediaTab === 'ai-video' && (
          <div className="space-y-2">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={`Describe el video ${activeImageSlot + 1}${selectedAngle ? ` (ángulo: ${selectedAngle})` : ''}. Ej: "mujer de 30 usando el producto en una cocina soleada, sonriendo a cámara"`}
              rows={3}
            />
            <div className="p-2 bg-green-50 border border-green-300 rounded text-[10px] text-green-900">
              <Sparkles className="w-3 h-3 inline mr-1 text-green-600" />
              <strong>Google Veo 3.1</strong> — 8 segundos, 1080p, con audio nativo sincronizado (voz + ambiente + música). 30 créditos por video (~$3.20 USD).
            </div>
            <Button
              onClick={async () => {
                if (!aiPrompt.trim()) { toast.error('Describe qué video quieres'); return; }
                // Cost warning — 30 credits is ~15 AI images. Let the user
                // confirm before spending since video is 15× more expensive.
                if (!window.confirm('Este video cuesta 30 créditos (~$3.20 USD, equivalente a 15 imágenes). ¿Generar ahora?')) return;

                setGeneratingImage(true);
                const aspectForVeo = aspectRatio === '16:9' ? '16:9' : '9:16'; // Veo 3.1 only supports 16:9 / 9:16
                try {
                  const { data, error } = await callApi('generate-video', {
                    body: {
                      clientId,
                      promptGeneracion: aiPrompt,
                      fotoBaseUrl: focusType === 'product' && selectedProduct?.image ? selectedProduct.image : undefined,
                      aspectRatio: aspectForVeo,
                    },
                  });
                  if (error) {
                    if (error === 'NO_CREDITS' || (typeof error === 'string' && error.includes('CREDITS'))) {
                      toast.error('Sin créditos para generar video');
                    } else {
                      toast.error(typeof error === 'string' ? error : 'Error generando video');
                    }
                    return;
                  }
                  if (data?.asset_url) {
                    setImageAtSlot(data.asset_url);
                    toast.success(`Video ${activeImageSlot + 1} listo`);
                    return;
                  }
                  if (data?.status === 'generando' && data?.prediction_id) {
                    // Client-side polling: Veo didn't finish inside the Cloud
                    // Run request budget. Poll /api/generate-video-status every
                    // 20s for up to ~3 min. Credits are refunded server-side if
                    // the generation ultimately fails.
                    toast.info('Video en proceso. Te aviso cuando esté listo — no cierres el wizard.');
                    const op = data.prediction_id as string;
                    const deadline = Date.now() + 3 * 60_000;
                    let polls = 0;
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token || '';
                    while (Date.now() < deadline) {
                      polls++;
                      await new Promise(r => setTimeout(r, 20_000));
                      const params = new URLSearchParams({ op, clientId });
                      const res = await fetch(
                        `https://steve-api-850416724643.us-central1.run.app/api/generate-video-status?${params}`,
                        { headers: { Authorization: `Bearer ${token}` } },
                      );
                      const statusData: any = await res.json().catch(() => ({}));
                      if (statusData?.status === 'listo' && statusData.asset_url) {
                        setImageAtSlot(statusData.asset_url);
                        toast.success(`Video ${activeImageSlot + 1} listo (poll ${polls})`);
                        return;
                      }
                      if (statusData?.status === 'error') {
                        toast.error(statusData.error || 'Veo falló');
                        return;
                      }
                    }
                    toast.warning('El video tarda más de lo esperado. Revisalo en unos minutos.');
                    return;
                  }
                } catch (err: any) {
                  toast.error(err?.message || 'Error');
                } finally {
                  setGeneratingImage(false);
                }
              }}
              disabled={generatingImage || !aiPrompt.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {generatingImage ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando con Veo... (1-3 min)</> : <><Video className="w-3 h-3 mr-1" />Generar video con Veo 3</>}
            </Button>
          </div>
        )}

        {mediaTab === 'gallery' && (
          <div>
            {loadingGallery ? <div className="grid grid-cols-4 gap-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded" />)}</div>
            : galleryAssets.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                {galleryAssets.map((a) => (
                  <button key={a.id} onClick={() => { setImageAtSlot(a.url); toast.success(`Imagen ${activeImageSlot + 1} seleccionada`); }} className={`aspect-square rounded overflow-hidden border-2 transition-all ${images[activeImageSlot] === a.url ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/30'}`}>
                    <img src={a.url} alt="Vista previa" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-4">No hay recursos disponibles</p>}
          </div>
        )}

        {mediaTab === 'products' && (
          <div>
            {loadingShopifyProducts ? (
              <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square rounded" />)}</div>
            ) : shopifyProducts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Haz clic en un producto para usar su foto real en el anuncio</p>
                <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
                  {shopifyProducts.filter(p => p.image).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setImageAtSlot(p.image); toast.success(`Foto de "${p.title}" aplicada en imagen ${activeImageSlot + 1}`); }}
                      className={`group relative rounded-lg border-2 overflow-hidden transition-all ${
                        images[activeImageSlot] === p.image ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <img src={p.image} alt={p.title} className="aspect-square w-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                        <p className="text-[10px] text-white truncate font-medium">{p.title}</p>
                        <p className="text-[9px] text-white/70">${p.price.toLocaleString('es-CL')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No se encontraron productos con fotos en Shopify. Conecta tu tienda o sube imágenes manualmente.
              </p>
            )}
          </div>
        )}

        {mediaTab === 'url' && (
          <Input value={images[activeImageSlot] || ''} onChange={(e) => setImageAtSlot(e.target.value)} placeholder="https://tu-imagen.com/foto.jpg" />
        )}
      </div>

      {/* DPA product tokens — Meta renders these per-product when the ad runs.
          Docs: developers.facebook.com/docs/marketing-api/advantage-catalog-ads
          Only available when the campaign objective is CATALOG (DPA). */}
      {isDpaCampaign && (
        <div className="rounded-lg border border-purple-300 bg-purple-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-purple-700" />
            <p className="text-xs font-semibold text-purple-900">Etiquetas de producto (DPA)</p>
          </div>
          <p className="text-[11px] text-purple-800">
            Meta reemplaza estas etiquetas automáticamente con los datos de cada producto del catálogo. Inserta las que quieras en títulos, textos y descripciones.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { token: '{{product.name}}', label: 'Nombre' },
              { token: '{{product.price}}', label: 'Precio' },
              { token: '{{product.current_price}}', label: 'Precio actual' },
              { token: '{{product.description}}', label: 'Descripción' },
              { token: '{{product.brand}}', label: 'Marca' },
            ].map((t) => (
              <button
                key={t.token}
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(t.token).catch(() => {});
                  toast.success(`"${t.token}" copiado — pégalo donde quieras`);
                }}
                className="px-2 py-1 rounded bg-white border border-purple-300 text-[10px] font-mono text-purple-900 hover:bg-purple-100"
                title="Click para copiar al portapapeles"
              >
                {t.label} <span className="text-purple-500">{t.token}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- HEADLINE SLOTS ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Títulos ({headlines.length})</Label>
          {canAddMoreTexts && (
            <Button variant="ghost" size="sm" onClick={() => setHeadlines([...headlines, ''])} className="text-xs text-muted-foreground">
              <Plus className="w-3 h-3 mr-1" />Agregar
            </Button>
          )}
        </div>
        {headlines.map((hl, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
            <Input value={hl} onChange={(e) => { const next = [...headlines]; next[i] = e.target.value; setHeadlines(next); }} placeholder={`Título ${i + 1}`} />
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

      {/* URL de destino (prominent) + CTA */}
      <div className="space-y-4">
        <div>
          <Label className="flex items-center gap-1">URL de destino <span className="text-red-500">*</span></Label>
          <Input
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://tu-tienda.cl/producto (requerido)"
            className={`mt-1 ${!destinationUrl.trim() ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
          />
          {!destinationUrl.trim() && (
            <p className="text-xs text-red-500 mt-1">La URL de destino es obligatoria para publicar el anuncio.</p>
          )}
        </div>
        <div>
          <Label>Botón CTA</Label>
          <Select value={cta} onValueChange={(v) => setCta(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CTA_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
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
                  <img src={img} alt="Vista previa" className="w-full h-full object-cover" />
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
// Steve Quick Config — pre-wizard shortcut that prefills every step with AI
// Goal: campaign creation in ≤2 min instead of 15-30 min.
// ---------------------------------------------------------------------------

interface SteveConfig {
  campaign?: { name?: string; objective?: Objective; budgetType?: BudgetType; dailyBudget?: number };
  adset?: {
    name?: string;
    audienceDesc?: string;
    targetCountries?: string[];
    targetAgeMin?: number;
    targetAgeMax?: number;
    targetGender?: number;
    suggestedInterests?: Array<{ name: string; reason: string }>;
    adSetFormat?: 'single' | 'carousel' | 'flexible' | 'catalog';
    autoMediaType?: 'photo' | 'video';
  };
  funnel?: { stage?: 'tofu' | 'mofu' | 'bofu'; angle?: string };
  creative?: {
    headlines?: string[];
    primaryTexts?: string[];
    descriptions?: string[];
    cta?: string;
    focusType?: 'product' | 'broad';
    suggestedProductId?: string | null;
  };
  reasoning?: string;
}

function SteveQuickConfig({
  clientId,
  onConfigured,
}: {
  clientId: string;
  onConfigured: (config: SteveConfig) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [userHint, setUserHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  // Campaign intent — drives Steve's recommendations (objective, angle, focus).
  // 4 options tuned for e-commerce: brand awareness, product sale, use cases, promo.
  const [intent, setIntent] = useState<'brand' | 'product' | 'use_cases' | 'promo'>('product');

  useEffect(() => {
    if (!expanded || products.length > 0) return;
    setLoadingProducts(true);
    (async () => {
      try {
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .limit(1)
          .maybeSingle();
        if (!conn?.id) return;
        const { data } = await callApi('fetch-shopify-products', { body: { connectionId: conn.id } });
        if (data?.products) {
          setProducts(data.products.slice(0, 12).map((p: any) => ({
            id: p.id,
            title: p.title,
            image: p.variants?.[0]?.image_url || p.image || '',
            price: Number(p.variants?.[0]?.price) || 0,
            product_type: p.product_type || '',
          })));
        }
      } catch { /* no shopify */ }
      finally { setLoadingProducts(false); }
    })();
  }, [expanded, clientId]);

  const handleConfigure = async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi('steve-configure-campaign', {
        body: {
          client_id: clientId,
          product_id: selectedProductId || undefined,
          user_hint: userHint.trim() || undefined,
          intent,
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : 'Error configurando');
      if (data?.config) onConfigured(data.config);
    } catch (err: any) {
      toast.error(err?.message || 'Steve no pudo configurar la campaña');
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-primary/40 bg-gradient-to-r from-primary/5 to-green-500/5 hover:border-primary/70 hover:from-primary/10 hover:to-green-500/10 transition-all text-left"
      >
        <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">🤖 Que Steve arme toda la campaña por ti</p>
          <p className="text-xs text-muted-foreground mt-0.5">2 minutos en lugar de 15. Elige un producto y Steve configura objetivo, audiencia, ángulo, copy y creatividades.</p>
        </div>
        <ChevronRight className="w-5 h-5 text-primary shrink-0" />
      </button>
    );
  }

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-green-500/5">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Steve configura tu campaña</h3>
          </div>
          <button onClick={() => setExpanded(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Prefiero hacerlo manual
          </button>
        </div>

        <div>
          <Label className="text-xs">¿Qué tipo de campaña querés?</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[
              { key: 'brand', label: 'Presentar marca', desc: 'Gente nueva conoce tu marca. TOFU, estilo de vida, sin producto específico.' },
              { key: 'product', label: 'Vender producto', desc: 'Promocionás un producto puntual. BOFU, conversiones, producto hero.' },
              { key: 'use_cases', label: 'Casos de uso', desc: 'Mostrás cómo lo usan tus clientes. MOFU, reviews, lifestyle.' },
              { key: 'promo', label: 'Liquidar / Promo', desc: 'Descuento, stock, urgencia. BOFU, conversiones, precio destacado.' },
            ].map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setIntent(i.key as typeof intent)}
                className={`flex flex-col items-start gap-0.5 p-2.5 rounded-md border text-left transition-all ${
                  intent === i.key ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
                }`}
              >
                <span className="text-xs font-semibold">{i.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{i.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">¿Qué producto promocionas? (opcional)</Label>
          {loadingProducts ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando productos…
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-[180px] overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedProductId('')}
                className={`flex flex-col items-center gap-1 p-2 rounded-md border text-xs transition-all ${
                  selectedProductId === '' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                }`}
              >
                <Palette className="w-5 h-5 text-muted-foreground" />
                <span>Marca general</span>
              </button>
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProductId(p.id)}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-md border text-[10px] transition-all ${
                    selectedProductId === p.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                  }`}
                >
                  {p.image ? (
                    <img src={p.image} alt={p.title} className="w-12 h-12 rounded object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-muted-foreground" /></div>
                  )}
                  <span className="truncate max-w-full leading-tight">{p.title.slice(0, 30)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No hay productos Shopify conectados. Steve armará campaña de marca.</p>
          )}
        </div>

        <div>
          <Label className="text-xs">¿Algo específico que Steve deba saber? (opcional)</Label>
          <Textarea
            value={userHint}
            onChange={(e) => setUserHint(e.target.value)}
            placeholder="Ej: 'Liquidación temporada', 'Lanzamiento nueva colección', 'Retargeting a los que abandonaron carrito'..."
            className="mt-1 text-xs min-h-[60px]"
          />
        </div>

        <Button
          onClick={handleConfigure}
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90"
          size="lg"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Steve está pensando…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> Configurar campaña con IA</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Steve llena objetivo, audiencia, ángulo y copy. Después revisas paso a paso y ajustas lo que quieras.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reach estimate banner — live audience size from Meta /delivery_estimate
// ---------------------------------------------------------------------------

function ReachEstimateBanner({
  connectionId,
  targetCountries,
  targetAgeMin, targetAgeMax, targetGender,
  targetInterests, targetExcludeInterests,
  targetLocations,
  selectedAudienceIds,
}: {
  connectionId?: string;
  targetCountries: string[];
  targetAgeMin: number; targetAgeMax: number; targetGender: 0 | 1 | 2;
  targetInterests: Array<{ id: string; name: string }>;
  targetExcludeInterests: Array<{ id: string; name: string }>;
  targetLocations: Array<{ key: string; name: string; type: string; country_name: string }>;
  selectedAudienceIds: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<{ lower: number; upper: number; ready: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const geo: Record<string, any> = {
          countries: targetCountries.length > 0 ? targetCountries : ['CL'],
        };
        if (targetLocations.length > 0) {
          const cities = targetLocations.filter(l => l.type === 'city').map(l => ({ key: l.key }));
          const regions = targetLocations.filter(l => l.type === 'region').map(l => ({ key: l.key }));
          if (cities.length > 0) geo.cities = cities;
          if (regions.length > 0) geo.regions = regions;
        }

        const targeting: Record<string, any> = {
          geo_locations: geo,
          age_min: targetAgeMin,
          age_max: targetAgeMax,
        };
        if (targetGender > 0) targeting.genders = [targetGender];
        if (selectedAudienceIds.length > 0) {
          targeting.custom_audiences = selectedAudienceIds.map(id => ({ id }));
        }
        if (targetInterests.length > 0) {
          targeting.flexible_spec = [{
            interests: targetInterests.map(i => ({ id: i.id, name: i.name })),
          }];
        }
        if (targetExcludeInterests.length > 0) {
          targeting.exclusions = {
            interests: targetExcludeInterests.map(i => ({ id: i.id, name: i.name })),
          };
        }

        const { data, error: err } = await callApi('manage-meta-campaign', {
          body: {
            action: 'reach_estimate',
            connection_id: connectionId,
            data: { targeting, optimization_goal: 'OFFSITE_CONVERSIONS' },
          },
        });
        if (err) throw new Error(typeof err === 'string' ? err : 'Estimate failed');
        setEstimate({
          lower: data?.users_lower_bound || 0,
          upper: data?.users_upper_bound || 0,
          ready: !!data?.estimate_ready,
        });
      } catch (e: any) {
        setError(e.message || 'No se pudo estimar');
      } finally {
        setLoading(false);
      }
    }, 500); // debounce 500ms

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [
    connectionId,
    targetCountries.join(','),
    targetAgeMin, targetAgeMax, targetGender,
    targetInterests.length,
    targetExcludeInterests.length,
    targetLocations.length,
    selectedAudienceIds.length,
  ]);

  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n);

  // Color coding: under 10K = red (too narrow), 10K-100K = yellow (niche), >100K = green (healthy).
  const sizeLevel = estimate && estimate.upper >= 100_000 ? 'healthy' : estimate && estimate.upper >= 10_000 ? 'niche' : estimate ? 'narrow' : 'unknown';
  const bg = sizeLevel === 'healthy' ? 'bg-green-50 border-green-300' : sizeLevel === 'niche' ? 'bg-yellow-50 border-yellow-300' : sizeLevel === 'narrow' ? 'bg-red-50 border-red-300' : 'bg-muted/30 border-border';
  const txt = sizeLevel === 'healthy' ? 'text-green-800' : sizeLevel === 'niche' ? 'text-yellow-800' : sizeLevel === 'narrow' ? 'text-red-800' : 'text-muted-foreground';

  return (
    <div className={`mt-2 p-3 rounded-lg border ${bg}`}>
      <div className="flex items-center gap-2">
        <Users className={`w-4 h-4 ${txt}`} />
        <Label className={`text-xs font-semibold ${txt}`}>Tamaño de audiencia estimado</Label>
      </div>
      {loading && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Calculando…
        </p>
      )}
      {!loading && error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
      {!loading && !error && estimate && (
        <>
          <p className={`text-lg font-bold mt-1 ${txt}`}>
            {fmt(estimate.lower)} – {fmt(estimate.upper)} <span className="text-xs font-normal">personas</span>
          </p>
          {sizeLevel === 'narrow' && (
            <p className="text-[11px] text-red-700 mt-1">⚠️ Audiencia muy chica (&lt;10K). Meta no va a poder optimizar. Amplía el targeting.</p>
          )}
          {sizeLevel === 'niche' && (
            <p className="text-[11px] text-yellow-700 mt-1">Audiencia nicho. OK para retargeting, evita para prospecting.</p>
          )}
          {sizeLevel === 'healthy' && (
            <p className="text-[11px] text-green-700 mt-1">✓ Tamaño saludable para que Meta optimice la entrega.</p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page + Instagram picker (step ad-creative)
// ---------------------------------------------------------------------------

interface BizGroup {
  businessId: string;
  businessName: string;
  pages?: Array<{ id: string; name: string; igAccountId: string | null; igAccountName: string | null }>;
}

function PageAndInstagramPicker({
  businessGroups,
  selectedPageId, setSelectedPageId,
  selectedInstagramUserId, setSelectedInstagramUserId,
  publishToInstagram, setPublishToInstagram,
  defaultPageId, defaultIgId, defaultIgName,
}: {
  businessGroups: BizGroup[];
  selectedPageId: string; setSelectedPageId: (v: string) => void;
  selectedInstagramUserId: string; setSelectedInstagramUserId: (v: string) => void;
  publishToInstagram: boolean; setPublishToInstagram: (v: boolean) => void;
  defaultPageId: string | null;
  defaultIgId: string | null;
  defaultIgName: string | null;
}) {
  // Flatten unique pages across all business groups (dedup by id)
  const allPages = (() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; igAccountId: string | null; igAccountName: string | null }> = [];
    for (const g of businessGroups || []) {
      for (const p of g.pages || []) {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      }
    }
    return out;
  })();

  const effectivePageId = selectedPageId || defaultPageId || '';
  const currentPage = allPages.find(p => p.id === effectivePageId);
  const effectiveIgId = selectedInstagramUserId || currentPage?.igAccountId || defaultIgId || '';
  const igName = currentPage?.igAccountName || defaultIgName || null;

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-primary" />
        <Label className="text-sm font-semibold">Página de Facebook e Instagram</Label>
      </div>

      {/* Page picker — single read-only display when only 1 option, dropdown otherwise */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Página de Facebook</Label>
        {allPages.length <= 1 ? (
          <div className="mt-1.5 p-2 rounded-md border border-border/60 bg-background text-xs flex items-center gap-2">
            <span className="font-medium">{currentPage?.name || 'Tu Página'}</span>
            {effectivePageId && <span className="text-muted-foreground text-[10px]">ID {effectivePageId}</span>}
          </div>
        ) : (
          <Select
            value={effectivePageId}
            onValueChange={(v) => {
              setSelectedPageId(v);
              const p = allPages.find(x => x.id === v);
              if (p?.igAccountId) setSelectedInstagramUserId(p.igAccountId);
              else setSelectedInstagramUserId('');
            }}
          >
            <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Elige una página" /></SelectTrigger>
            <SelectContent>
              {allPages.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.igAccountName ? `· IG: @${p.igAccountName}` : '(sin IG)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Instagram account */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Cuenta de Instagram</Label>
          <button
            type="button"
            onClick={() => setPublishToInstagram(!publishToInstagram)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all ${
              publishToInstagram ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {publishToInstagram ? 'Publicar en IG' : 'Solo Facebook'}
          </button>
        </div>
        {publishToInstagram ? (
          effectiveIgId ? (
            <div className="mt-1.5 p-2 rounded-md border border-border/60 bg-background text-xs flex items-center gap-2">
              <span className="font-medium">{igName ? `@${igName}` : 'Cuenta de Instagram'}</span>
              <span className="text-muted-foreground text-[10px]">ID {effectiveIgId}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5">Esta página no tiene Instagram vinculado. Conecta IG en Meta Business Suite o cambia a "Solo Facebook".</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground mt-1.5">El anuncio se publicará solo en Facebook. Quita el toggle para incluir IG.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UTM Builder (step ad-creative)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interest AI Suggest — calls /api/steve-suggest-interests and opens a panel
// with Claude-proposed interests resolved against Meta's /search adinterest.
// ---------------------------------------------------------------------------

interface SuggestedInterest {
  id: string;
  name: string;
  audience_size_lower_bound: number | null;
  audience_size_upper_bound: number | null;
  keyword_query: string;
  reason: string | null;
}

function InterestAISuggestButton({
  clientId, connectionId, productId,
  selectedInterests, onAdd,
}: {
  clientId: string;
  connectionId?: string;
  productId?: string;
  selectedInterests: Array<{ id: string; name: string }>;
  onAdd: (i: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedInterest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    if (!connectionId) { toast.error('No hay conexión Meta activa'); return; }
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const { data, error: err } = await callApi('steve-suggest-interests', {
        body: { client_id: clientId, connection_id: connectionId, product_id: productId || undefined },
      });
      if (err) throw new Error(typeof err === 'string' ? err : 'Error');
      setSuggestions(data?.interests || []);
    } catch (e: any) {
      setError(e.message || 'No se pudieron sugerir intereses');
    } finally {
      setLoading(false);
    }
  };

  const openAndFetch = () => {
    setOpen(true);
    fetchSuggestions();
  };

  const fmtAudience = (n: number | null) => {
    if (!n) return '?';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  };

  return (
    <>
      <button
        type="button"
        onClick={openAndFetch}
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
      >
        <Sparkles className="w-3 h-3" /> Sugerir con IA
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <div className="space-y-3">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Steve sugiere intereses
              </h3>
              <p className="text-xs text-muted-foreground">Basado en tu brief + producto. Cada sugerencia está resuelta contra el catálogo real de Meta.</p>
            </div>
            {loading && (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Steve está pensando…</span>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && !error && suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin sugerencias disponibles. ¿Tienes el brief completo y (opcionalmente) un producto elegido?
              </p>
            )}
            {!loading && !error && suggestions.length > 0 && (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {suggestions.map((s) => {
                  const isSelected = selectedInterests.some(i => i.id === s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isSelected}
                      onClick={() => { onAdd({ id: s.id, name: s.name }); }}
                      className={`w-full flex items-start justify-between gap-3 p-2.5 rounded-md border text-left transition-all ${
                        isSelected ? 'border-green-400 bg-green-50 opacity-60' : 'border-border hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{s.name}</span>
                          {isSelected && <span className="text-[10px] text-green-700">✓ Agregado</span>}
                        </div>
                        {s.reason && <p className="text-[11px] text-muted-foreground mt-0.5">{s.reason}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {fmtAudience(s.audience_size_lower_bound)}–{fmtAudience(s.audience_size_upper_bound)}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Destination extras — Display link (caption) + Browser add-on (Click-to-Message)
// ---------------------------------------------------------------------------

function DestinationExtras({
  displayLink, setDisplayLink,
  browserAddon, setBrowserAddon,
  destinationUrl,
}: {
  displayLink: string; setDisplayLink: (v: string) => void;
  browserAddon: 'none' | 'messenger' | 'instagram' | 'whatsapp';
  setBrowserAddon: (v: 'none' | 'messenger' | 'instagram' | 'whatsapp') => void;
  destinationUrl: string;
}) {
  // Try to extract the domain from destinationUrl as the default display link.
  const defaultDomain = (() => {
    try {
      if (!destinationUrl) return '';
      const u = new URL(destinationUrl);
      return u.hostname.replace(/^www\./, '');
    } catch { return ''; }
  })();

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
      <div className="flex items-center gap-2">
        <LinkIcon className="w-4 h-4 text-primary" />
        <Label className="text-sm font-semibold">Destino — opciones avanzadas</Label>
      </div>

      {/* Display link (caption) */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">URL visible (enlace corto)</Label>
          {!displayLink && defaultDomain && (
            <button
              type="button"
              onClick={() => setDisplayLink(defaultDomain)}
              className="text-[10px] text-primary hover:underline"
            >
              Usar {defaultDomain}
            </button>
          )}
        </div>
        <Input
          value={displayLink}
          onChange={(e) => setDisplayLink(e.target.value)}
          placeholder={defaultDomain ? `ej: ${defaultDomain}` : 'ej: tienda.com'}
          className="mt-1 h-9 text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Se muestra debajo del titular en lugar del link completo con UTMs. Meta API field: <code>caption</code>.
        </p>
      </div>

      {/* Browser add-on: Click-to-Message apps */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Complementos del navegador</Label>
        <p className="text-[10px] text-muted-foreground mb-1.5">Agrega un botón flotante al sitio web para abrir conversación.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBrowserAddon('none')}
            className={`flex items-start gap-2 p-2.5 rounded-md border text-left text-xs transition-all ${
              browserAddon === 'none' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
            }`}
          >
            <X className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Ninguno</p>
              <p className="text-[10px] text-muted-foreground">Usuario va directo al sitio web.</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setBrowserAddon('messenger')}
            className={`flex items-start gap-2 p-2.5 rounded-md border text-left text-xs transition-all ${
              browserAddon !== 'none' ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
            }`}
          >
            <Send className="w-3.5 h-3.5 mt-0.5 text-primary" />
            <div>
              <p className="font-medium">Apps de mensajes</p>
              <p className="text-[10px] text-muted-foreground">Botón Messenger/IG/WhatsApp en el sitio.</p>
            </div>
          </button>
        </div>
        {browserAddon !== 'none' && (
          <div className="mt-2 flex gap-1.5">
            {(['messenger', 'instagram', 'whatsapp'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setBrowserAddon(opt)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  browserAddon === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                {opt === 'messenger' ? 'Messenger' : opt === 'instagram' ? 'Instagram' : 'WhatsApp'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced preview — opens modal with real iframes per placement from Meta
// ---------------------------------------------------------------------------

const AD_FORMATS: Array<{ key: string; label: string; group: string }> = [
  { key: 'MOBILE_FEED_STANDARD', label: 'Feed Facebook', group: 'facebook' },
  { key: 'DESKTOP_FEED_STANDARD', label: 'Feed Facebook (desktop)', group: 'facebook' },
  { key: 'FACEBOOK_STORY_MOBILE', label: 'Story Facebook', group: 'facebook' },
  { key: 'FACEBOOK_REELS_MOBILE', label: 'Reels Facebook', group: 'facebook' },
  { key: 'MARKETPLACE_MOBILE', label: 'Marketplace', group: 'facebook' },
  { key: 'RIGHT_COLUMN_STANDARD', label: 'Columna derecha', group: 'facebook' },
  { key: 'INSTAGRAM_STANDARD', label: 'Feed Instagram', group: 'instagram' },
  { key: 'INSTAGRAM_STORY', label: 'Story Instagram', group: 'instagram' },
  { key: 'INSTAGRAM_REELS', label: 'Reels Instagram', group: 'instagram' },
  { key: 'INSTAGRAM_EXPLORE_CONTEXTUAL', label: 'Explore Instagram', group: 'instagram' },
  { key: 'INSTAGRAM_PROFILE_FEED', label: 'Feed de perfil', group: 'instagram' },
  { key: 'AUDIENCE_NETWORK_OUTSTREAM_VIDEO', label: 'Audience Network', group: 'other' },
  { key: 'MESSENGER_MOBILE_INBOX_MEDIA', label: 'Messenger', group: 'other' },
];

function AdvancedPreviewButton({
  connectionId, pageId, igUserId,
  primaryText, headline, description, imageUrl, cta, destinationUrl, displayLink,
}: {
  connectionId?: string;
  pageId: string | null; igUserId: string | null;
  primaryText: string; headline: string; description: string;
  imageUrl: string; cta: string; destinationUrl: string; displayLink: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'all' | 'facebook' | 'instagram' | 'other'>('all');
  const [error, setError] = useState<string | null>(null);

  // Meta /generatepreviews requires `link` in link_data — without it every
  // placement returns "El campo 'link' es obligatorio". We expose the missing
  // fields to the UI so the user knows what to complete before opening.
  const missingFields: string[] = [];
  if (!connectionId) missingFields.push('conexión Meta activa');
  if (!pageId) missingFields.push('Página de Facebook');
  if (!imageUrl) missingFields.push('imagen del anuncio');
  if (!primaryText) missingFields.push('texto principal');
  if (!headline) missingFields.push('titular');
  if (!destinationUrl?.trim()) missingFields.push('URL de destino');
  const canPreview = missingFields.length === 0;

  const loadPreviews = async () => {
    if (!connectionId || !pageId) return;
    setLoading(true);
    setError(null);
    try {
      const creative = {
        object_story_spec: {
          page_id: pageId,
          ...(igUserId ? { instagram_user_id: igUserId } : {}),
          link_data: {
            link: destinationUrl,
            message: primaryText,
            name: headline,
            ...(description ? { description } : {}),
            ...(displayLink ? { caption: displayLink } : {}),
            ...(imageUrl ? { picture: imageUrl } : {}),
            call_to_action: { type: cta, value: { link: destinationUrl } },
          },
        },
      };
      const { data, error: err } = await callApi('manage-meta-campaign', {
        body: {
          action: 'generate_previews',
          connection_id: connectionId,
          data: {
            creative,
            ad_formats: AD_FORMATS.map(f => f.key),
          },
        },
      });
      if (err) throw new Error(typeof err === 'string' ? err : 'Preview failed');
      // Backend returns success:false + error when ALL 13 placements failed
      // (e.g., missing ads_read scope on the SUAT or Page not in BM).
      if (data && data.success === false && data.error) {
        throw new Error(data.error);
      }
      setPreviews(data?.previews || {});
    } catch (e: any) {
      setError(e.message || 'Error al cargar previews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && Object.keys(previews).length === 0 && canPreview) loadPreviews();
  }, [open]);

  const filtered = tab === 'all' ? AD_FORMATS : AD_FORMATS.filter(f => f.group === tab);

  return (
    <>
      <div className={`flex items-center justify-between p-4 rounded-lg border ${canPreview ? 'border-primary/30 bg-primary/5' : 'border-yellow-300 bg-yellow-50'}`}>
        <div className="flex items-center gap-3">
          <Maximize2 className={`w-5 h-5 ${canPreview ? 'text-primary' : 'text-yellow-600'}`} />
          <div>
            <p className="text-sm font-semibold">Vista previa avanzada</p>
            {canPreview ? (
              <p className="text-[11px] text-muted-foreground">Revisa cómo se verá en las 13 ubicaciones reales de Meta.</p>
            ) : (
              <p className="text-[11px] text-yellow-800">
                <strong>Completa primero:</strong> {missingFields.join(', ')}.
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={!canPreview}
          className="border-primary/40"
        >
          Abrir
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="space-y-3">
            <div>
              <h3 className="font-bold text-lg">Vista previa en todos los placements</h3>
              <p className="text-xs text-muted-foreground">Ubicaciones reales de Meta renderizadas como se verán en producción.</p>
            </div>
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900">
              Si alguna ubicación muestra <strong>"no tienes acceso"</strong>, es porque tu sesión actual de Facebook no tiene permiso directo sobre esta cuenta publicitaria. El anuncio se publicará sin problema cuando lo crees — esto solo afecta la vista previa.
            </div>
            <div className="flex gap-2 border-b pb-2">
              {(['all', 'facebook', 'instagram', 'other'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded ${
                    tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t === 'all' ? 'Todos' : t === 'facebook' ? 'Facebook' : t === 'instagram' ? 'Instagram' : 'Otros'}
                </button>
              ))}
            </div>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-3 text-sm text-muted-foreground">Generando previews con Meta…</span>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && !error && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filtered.map(fmt => {
                  const iframe = previews[fmt.key];
                  return (
                    <div key={fmt.key} className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">{fmt.label}</p>
                      <div className="border rounded bg-muted/20 min-h-[320px] flex items-center justify-center overflow-hidden">
                        {iframe ? (
                          <div className="w-full h-[320px]" dangerouslySetInnerHTML={{ __html: iframe }} />
                        ) : (
                          <p className="text-xs text-muted-foreground">Sin preview</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UtmBuilder({
  destinationUrl,
  utmSource, setUtmSource,
  utmMedium, setUtmMedium,
  utmCampaign, setUtmCampaign,
  utmContent, setUtmContent,
  utmTerm, setUtmTerm,
  extraParams, setExtraParams,
}: {
  destinationUrl: string;
  utmSource: string; setUtmSource: (v: string) => void;
  utmMedium: string; setUtmMedium: (v: string) => void;
  utmCampaign: string; setUtmCampaign: (v: string) => void;
  utmContent: string; setUtmContent: (v: string) => void;
  utmTerm: string; setUtmTerm: (v: string) => void;
  extraParams: string; setExtraParams: (v: string) => void;
}) {
  const parts: string[] = [];
  if (utmSource.trim()) parts.push(`utm_source=${utmSource.trim()}`);
  if (utmMedium.trim()) parts.push(`utm_medium=${utmMedium.trim()}`);
  if (utmCampaign.trim()) parts.push(`utm_campaign=${utmCampaign.trim()}`);
  if (utmContent.trim()) parts.push(`utm_content=${utmContent.trim()}`);
  if (utmTerm.trim()) parts.push(`utm_term=${utmTerm.trim()}`);
  if (extraParams.trim()) {
    const cleaned = extraParams.trim().replace(/^[?&]+/, '');
    if (cleaned) parts.push(cleaned);
  }
  const urlTags = parts.join('&');
  const joiner = destinationUrl.includes('?') ? '&' : '?';
  const previewUrl = destinationUrl ? `${destinationUrl}${urlTags ? joiner + urlTags : ''}` : urlTags;

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
      <div className="flex items-center gap-2">
        <LinkIcon className="w-4 h-4 text-primary" />
        <Label className="text-sm font-semibold">UTMs (seguimiento)</Label>
      </div>
      <p className="text-[11px] text-muted-foreground">Meta expande los <code className="px-1 rounded bg-muted/50">{`{{macros}}`}</code> por click con el nombre real de la campaña, ad set y anuncio.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">utm_source</Label>
          <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="facebook" className="mt-1 h-9 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">utm_medium</Label>
          <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc" className="mt-1 h-9 text-xs" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs font-medium text-muted-foreground">utm_campaign</Label>
          <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="{{campaign.name}}" className="mt-1 h-9 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">utm_content</Label>
          <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="{{ad.name}}" className="mt-1 h-9 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">utm_term</Label>
          <Input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="{{adset.name}}" className="mt-1 h-9 text-xs font-mono" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs font-medium text-muted-foreground">Parámetros extra (opcional)</Label>
          <Textarea
            value={extraParams}
            onChange={(e) => setExtraParams(e.target.value)}
            placeholder="fbclid={{fbclid}}&variant=a&ref=spring_sale"
            className="mt-1 text-xs font-mono min-h-[50px]"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Cualquier key=value adicional que quieras mandar al landing (separado con &amp;). Se agrega al final.
          </p>
        </div>
      </div>

      {previewUrl && (
        <div className="pt-2">
          <Label className="text-[10px] text-muted-foreground">URL final (preview)</Label>
          <p className="text-[11px] font-mono break-all mt-1 p-2 rounded bg-background border border-border/60">{previewUrl}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advantage+ Creative toggles (step ad-creative)
// ---------------------------------------------------------------------------

function AdvantageCreativeToggles({
  visual, setVisual,
  text, setText,
  overlays, setOverlays,
  translate, setTranslate,
  personalize, setPersonalize,
}: {
  visual: boolean; setVisual: (v: boolean) => void;
  text: boolean; setText: (v: boolean) => void;
  overlays: boolean; setOverlays: (v: boolean) => void;
  translate: boolean; setTranslate: (v: boolean) => void;
  personalize: boolean; setPersonalize: (v: boolean) => void;
}) {
  const toggles: Array<{ on: boolean; set: (v: boolean) => void; label: string; desc: string }> = [
    { on: personalize, set: setPersonalize, label: 'Personalizar por persona', desc: 'Meta adapta contenido y destino según la probabilidad de respuesta de cada viewer.' },
    { on: visual, set: setVisual, label: 'Mejoras visuales', desc: 'Meta ajusta luz, contraste y recorta automático a cada ubicación.' },
    { on: text, set: setText, label: 'Optimización de texto', desc: 'Meta puede reordenar o reformatear tu copy para mejorar performance.' },
    { on: overlays, set: setOverlays, label: 'Overlays + plantillas', desc: 'Meta superpone precios o CTAs sobre la imagen en feed (útil ecommerce).' },
    { on: translate, set: setTranslate, label: 'Traducción automática', desc: 'Meta traduce el ad al idioma de cada viewer (útil LATAM multi-país).' },
  ];

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border/60 bg-muted/10">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <Label className="text-sm font-semibold">Advantage+ Creative</Label>
      </div>
      <p className="text-[11px] text-muted-foreground">Meta genera variantes automáticas de tu creativo. Activa solo las que te hagan sentido — Meta las aplica sin destruir el original.</p>
      <div className="space-y-2">
        {toggles.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => t.set(!t.on)}
            className={`w-full flex items-start justify-between gap-3 p-2.5 rounded-md border text-left transition-all ${
              t.on ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold">{t.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
            <div className={`shrink-0 w-9 h-5 rounded-full transition-all relative ${t.on ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${t.on ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignCreateWizard({ clientId, onBack, onComplete, startFrom = 'campaign' }: CampaignCreateWizardProps) {
  const {
    connectionId: ctxConnectionId,
    pageId: ctxPageId,
    pageName: ctxPageName,
    igAccountId: ctxIgAccountId,
    igAccountName: ctxIgAccountName,
    pixelId: ctxPixelId,
    businessGroups: ctxBusinessGroups,
  } = useMetaBusiness();
  const pageName = ctxPageName;
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
  const [campNameEdited, setCampNameEdited] = useState(false);
  const [budgetType, setBudgetType] = useState<BudgetType>('ABO');
  const [objective, setObjective] = useState<Objective>('CONVERSIONS');
  const [campBudget, setCampBudget] = useState('');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(tomorrow);

  // Client name for auto-naming
  const [clientBrandName, setClientBrandName] = useState('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clients').select('name').eq('id', clientId).single();
      if (data?.name) setClientBrandName(data.name.split(' ')[0]); // First word as short brand name
    })();
  }, [clientId]);

  // Ad Set fields
  const [adsetName, setAdsetName] = useState('');
  const [audienceDesc, setAudienceDesc] = useState('');
  const [adsetBudget, setAdsetBudget] = useState('');

  // Targeting fields
  const [targetCountries, setTargetCountries] = useState<string[]>(['CL']);
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(65);
  const [targetGender, setTargetGender] = useState<0 | 1 | 2>(0); // 0=all, 1=male, 2=female
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<string[]>([]);
  const [targetInterests, setTargetInterests] = useState<Array<{ id: string; name: string }>>([]);
  const [targetExcludeInterests, setTargetExcludeInterests] = useState<Array<{ id: string; name: string }>>([]);
  const [targetLocations, setTargetLocations] = useState<Array<{ key: string; name: string; type: string; country_name: string }>>([]);

  // DPA / Catalog fields
  const [catalogs, setCatalogs] = useState<Array<{ id: string; name: string; product_count: number; source?: string; product_sets: Array<{ id: string; name: string; product_count: number }> }>>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsHint, setCatalogsHint] = useState<string | null>(null);
  const [productCatalogId, setProductCatalogId] = useState('');
  const [productSetId, setProductSetId] = useState('');

  // Funnel stage
  const [funnelStage, setFunnelStage] = useState<'tofu' | 'mofu' | 'bofu'>('tofu');

  // Ad Set format + CPA
  const [adSetFormat, setAdSetFormat] = useState<AdSetFormat>('flexible');
  const [cpaTarget, setCpaTarget] = useState('');
  // A4: explicit "photo or video" preference that drives the auto-generator.
  // Default 'photo' — video costs 15× more credits (Veo 3 = 30 each vs Imagen
  // = 2). Only active when adSetFormat === 'single'. Carousel/DCT always use
  // photos (video carousels are rare and expensive).
  const [autoMediaType, setAutoMediaType] = useState<'photo' | 'video'>('photo');

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

  // Ad name — Meta shows this in Ads Manager. Auto-suggests from the first
  // headline if the user hasn't typed one yet.
  const [adName, setAdName] = useState('');
  const [adNameEdited, setAdNameEdited] = useState(false);
  useEffect(() => {
    if (adNameEdited) return;
    const firstHeadline = headlines.find(h => h.trim());
    if (firstHeadline) setAdName(firstHeadline.slice(0, 80));
  }, [headlines, adNameEdited]);

  // ═══════════ Pixel + Conversion Event (step 2) ═══════════
  const [availablePixels, setAvailablePixels] = useState<Array<{ id: string; name: string; last_fired: string | null }>>([]);
  const [selectedPixelId, setSelectedPixelId] = useState<string>('');
  const [customEventType, setCustomEventType] = useState<string>('PURCHASE');

  // ═══════════ Placements (step 2) ═══════════
  // Advantage+ Placements = omit publisher_platforms (Meta auto-selects).
  // Manual mode = user picks platforms + positions explicitly.
  const [placementsMode, setPlacementsMode] = useState<'advantage' | 'manual'>('advantage');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [fbPositions, setFbPositions] = useState<string[]>(['feed', 'facebook_reels', 'story']);
  const [igPositions, setIgPositions] = useState<string[]>(['stream', 'reels', 'story', 'explore']);
  const [anPositions, setAnPositions] = useState<string[]>(['classic']);
  const [msgrPositions, setMsgrPositions] = useState<string[]>(['story']);

  // ═══════════ Page + Instagram account (step ad-creative) ═══════════
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedInstagramUserId, setSelectedInstagramUserId] = useState<string>('');
  const [publishToInstagram, setPublishToInstagram] = useState<boolean>(true);

  // ═══════════ UTMs (step ad-creative) ═══════════
  const [utmSource, setUtmSource] = useState<string>('facebook');
  const [utmMedium, setUtmMedium] = useState<string>('cpc');
  const [utmCampaign, setUtmCampaign] = useState<string>('{{campaign.name}}');
  const [utmContent, setUtmContent] = useState<string>('{{ad.name}}');
  const [utmTerm, setUtmTerm] = useState<string>('{{adset.name}}');

  // ═══════════ Advantage+ Creative features (step ad-creative) ═══════════
  // Granular opt-in per feature (v22+ deprecated the standard_enhancements bundle).
  const [advFeatVisual, setAdvFeatVisual] = useState<boolean>(true);   // image_touchups + image_brightness_and_contrast / video_auto_crop
  const [advFeatText, setAdvFeatText] = useState<boolean>(true);       // text_optimizations + text_formatting_optimization
  const [advFeatOverlays, setAdvFeatOverlays] = useState<boolean>(false); // image_templates + add_text_overlay
  const [advFeatTranslate, setAdvFeatTranslate] = useState<boolean>(false); // text_translation + image_text_translation
  // Meta Ads Manager "Optimizar contenido para cada persona" — varies content
  // and destination per viewer. Maps to use_flexible_image_aspect_ratio + the
  // adapt_to_placement creative feature being OPT_IN.
  const [personalizeContent, setPersonalizeContent] = useState<boolean>(true);

  // Extra URL parameters (custom key=value pairs appended to url_tags,
  // in addition to the UTMs). Meta Ads Manager "Parámetros de URL".
  const [extraUrlParams, setExtraUrlParams] = useState<string>('');

  // ═══════════ URL visible (caption) + Complementos del navegador ═══════════
  // Meta Ads Manager equivalents:
  // - "Usar un enlace visible" → AdCreativeLinkData.caption (shown as display URL)
  // - "Complementos del navegador" → Click-to-Message via call_to_action.type
  const [displayLink, setDisplayLink] = useState<string>('');
  const [browserAddon, setBrowserAddon] = useState<'none' | 'messenger' | 'instagram' | 'whatsapp'>('none');

  // ═══════════ Catálogo Advantage+ vs Subida manual ═══════════
  // Meta Ads Manager: "Origen del contenido". Only relevant when we have
  // a catalog connected. Switches the creative path to product template.
  const [contentSource, setContentSource] = useState<'manual' | 'advantage_catalog'>('manual');

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

  // Load catalogs when objective is CATALOG
  useEffect(() => {
    if (objective !== 'CATALOG' || !ctxConnectionId || catalogs.length > 0) return;
    setCatalogsLoading(true);
    callApi('meta-catalogs', { body: { connection_id: ctxConnectionId } })
      .then(({ data, error }) => {
        if (data?.catalogs) setCatalogs(data.catalogs);
        if (data?.hint) setCatalogsHint(data.hint);
        if (error) toast.error('No se pudieron cargar los catálogos de productos');
      })
      .finally(() => setCatalogsLoading(false));
  }, [objective, ctxConnectionId]);

  // Load available pixels for the connected ad account (shown in step 2 when objective=CONVERSIONS).
  // manage-meta-pixel action=list returns every pixel attached to the ad account.
  useEffect(() => {
    if (!ctxConnectionId || objective !== 'CONVERSIONS') return;
    let cancelled = false;
    (async () => {
      const { data } = await callApi('manage-meta-pixel', {
        body: { action: 'list', connection_id: ctxConnectionId },
      });
      if (cancelled || !data?.pixels) return;
      setAvailablePixels(data.pixels);
      // Prefer the context pixel, else first pixel on the account
      if (!selectedPixelId) {
        setSelectedPixelId(ctxPixelId || data.pixels[0]?.id || '');
      }
    })();
    return () => { cancelled = true; };
  }, [ctxConnectionId, objective, ctxPixelId]);

  // Sync Page + IG defaults from the Meta business context whenever it changes
  // (portfolio switch). Only overwrite when the user hasn't explicitly picked one.
  useEffect(() => {
    if (ctxPageId && !selectedPageId) setSelectedPageId(ctxPageId);
    if (ctxIgAccountId && !selectedInstagramUserId) setSelectedInstagramUserId(ctxIgAccountId);
  }, [ctxPageId, ctxIgAccountId]);

  // Advantage+ Catálogo (DPA): Meta renders dynamic product ads from a catalog.
  // Requires: objective = CATALOG (OUTCOME_SALES with promoted_object.product_catalog_id),
  // placements auto, broad audience, and user-selected catalog + product_set.
  // Dynamic Media is on by default since Oct 2025 (no API flag to set).
  // Docs: developers.facebook.com/docs/marketing-api/advantage-catalog-ads
  useEffect(() => {
    if (budgetType !== 'ADVANTAGE') return;
    if (objective !== 'CATALOG') setObjective('CATALOG');
    if (placementsMode !== 'advantage') setPlacementsMode('advantage');
    if (contentSource !== 'advantage_catalog') setContentSource('advantage_catalog');
    if (selectedAudienceIds.length > 0) setSelectedAudienceIds([]);
    if (targetInterests.length > 0) setTargetInterests([]);
    if (targetExcludeInterests.length > 0) setTargetExcludeInterests([]);
  }, [budgetType]);

  // Inverse flow: user picked "Catálogo (DPA)" from the ad-set format selector
  // — that should act as a shortcut to enter Advantage+ Catálogo mode without
  // having to first switch budgetType at the top. Setting budgetType triggers
  // the effect above which takes care of the rest.
  useEffect(() => {
    if (adSetFormat === 'catalog' && budgetType !== 'ADVANTAGE') {
      setBudgetType('ADVANTAGE');
    }
    // If the user had ADVANTAGE set via the format selector and switches away
    // to single/carousel/flexible, drop back to ABO as a sensible default.
    if (adSetFormat !== 'catalog' && budgetType === 'ADVANTAGE') {
      setBudgetType('ABO');
      if (objective === 'CATALOG') setObjective('CONVERSIONS');
    }
  }, [adSetFormat]);

  // Keep format in sync when user changes budget from the Campaign step.
  // Guard prevents loop: after the change the condition becomes false.
  useEffect(() => {
    if (budgetType !== 'ADVANTAGE' && adSetFormat === 'catalog') {
      setAdSetFormat('flexible');
    }
  }, [budgetType]);

  // Auto-generate campaign name: [Marca]-[OBJ]-[Audiencia]-[MesAño]
  // Audience detection order:
  //   1) custom/lookalike/saved audience selected in step 2 → LAL / RTG / CUSTOM / SAVED
  //   2) free-text audienceDesc keywords (lookalike/similar/remarketing/custom)
  //   3) free-text audienceDesc slug (first 15 chars)
  //   4) funnelStage uppercased (only if user already chose one — skipped at step 1)
  const generateCampaignName = useCallback(() => {
    const parts: string[] = [];
    if (clientBrandName) parts.push(clientBrandName);
    const objShort: Record<string, string> = { CONVERSIONS: 'CONV', TRAFFIC: 'TRAF', AWARENESS: 'AWR', ENGAGEMENT: 'ENG', CATALOG: 'CATL' };
    parts.push(objShort[objective] || objective);

    const audLower = audienceDesc.toLowerCase();
    const audienceWasSelected = selectedAudienceIds.length > 0;
    if (audienceWasSelected) {
      // Pick a tag based on the joined audience names
      if (audLower.includes('lookalike') || audLower.includes('similar') || audLower.includes('parec')) parts.push('LAL');
      else if (audLower.includes('retarg') || audLower.includes('remarketing') || audLower.includes('rtg')) parts.push('RTG');
      else if (audLower.includes('saved') || audLower.includes('guardad')) parts.push('SAVED');
      else parts.push('AUD');
    } else if (audLower.includes('lookalike') || audLower.includes('similar')) parts.push('LAL');
    else if (audLower.includes('retarg') || audLower.includes('remarketing') || audLower.includes('custom')) parts.push('RTG');
    else if (audienceDesc.trim()) parts.push(audienceDesc.substring(0, 15).replace(/\s+/g, ''));
    // No fallback to funnelStage — avoids stamping "TOFU" before the user picks audience.

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    parts.push(`${months[now.getMonth()]}${String(now.getFullYear()).slice(-2)}`);
    return parts.join('-');
  }, [clientBrandName, objective, audienceDesc, selectedAudienceIds]);

  useEffect(() => {
    if (campNameEdited) return; // Don't overwrite manual edits
    setCampName(generateCampaignName());
  }, [objective, audienceDesc, selectedAudienceIds, clientBrandName, generateCampaignName, campNameEdited]);

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
    if (stepIndex >= steps.length - 1) return;

    // Validate BEFORE transitioning to review step
    const nextStep = steps[stepIndex + 1]?.key;
    if (nextStep === 'review') {
      // Check for issues that require going back to a previous step
      // ABO uses adset-level budget; CBO and ADVANTAGE both use campaign-level budget.
      const hasBudget = budgetType === 'ABO' ? !!adsetBudget : !!campBudget;
      const hasAudience = audienceDesc.trim() || selectedAudienceIds.length > 0;
      // Audience is OPTIONAL — broad targeting if empty
      if (!hasBudget && !existingAdsetId) {
        // Find the adset-config step index and navigate there
        const adsetStepIdx = steps.findIndex((s) => s.key === 'adset-config');
        if (adsetStepIdx >= 0) {
          toast.error('Completa: presupuesto diario. Te llevamos al paso correcto.');
          setStepIndex(adsetStepIdx);
          return;
        }
      }
      // Check for creative issues (stay on current ad-creative step)
      const isCatalog = objective === 'CATALOG' && !!productCatalogId && !!productSetId;
      if (!isCatalog) {
        const creativeIssues: string[] = [];
        if (!images.some(Boolean)) creativeIssues.push('Agrega al menos 1 imagen para el anuncio');
        if (!primaryTexts.some((t) => t.trim()) || !headlines.some((h) => h.trim())) creativeIssues.push('Genera o escribe el copy (texto + título)');
        if (!destinationUrl.trim()) creativeIssues.push('Agrega la URL de destino');
        if (creativeIssues.length > 0) {
          creativeIssues.forEach((msg) => toast.error(msg));
          return;
        }
      }
    }

    setStepIndex(stepIndex + 1);
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
        if (objective === 'CATALOG') return !!campName.trim() && !!productCatalogId && !!productSetId;
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

  // Auto-generate copy + AI image when entering ad-creative step.
  // Copy and images are now independent: if the user pre-filled copy via Steve
  // Quick Config, we still need to generate the images. Likewise if the user
  // uploaded images manually, we can still generate copy.
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (currentStep !== 'ad-creative') return;
    if (autoGenRef.current) return;
    autoGenRef.current = true;

    const hasCopy = primaryTexts.some((t) => t.trim()) && headlines.some((h) => h.trim());
    const hasImages = images.some(Boolean);
    if (hasCopy && hasImages) return; // Nothing to do — user filled everything manually.

    (async () => {
      setAutoGenerating(true);

      // Step 1: Generate copy only if missing. Otherwise use whatever is in state.
      let copyResult: { texts: string[]; headlines: string[]; descriptions: string[] } | null;
      if (!hasCopy) {
        setAutoGenProgress('Generando copies...');
        copyResult = await handleGenerateCopy();
        if (!copyResult) { setAutoGenerating(false); setAutoGenProgress(''); return; }
      } else {
        copyResult = {
          texts: primaryTexts.filter(Boolean),
          headlines: headlines.filter(Boolean),
          descriptions: descriptions.filter(Boolean),
        };
      }

      // Step 2: Generate images only if missing.
      if (hasImages) { setAutoGenerating(false); setAutoGenProgress(''); return; }

      setAutoGenProgress('Preparando brief visual...');
      try {
        // DPA pulls images from the product catalog at render time — auto-gen
        // would waste credits on imagery Meta won't use. Skip the loop and
        // return here; the user just needs copy with product tokens.
        if (adSetFormat === 'catalog') {
          setAutoGenerating(false);
          setAutoGenProgress('');
          return;
        }
        const angleValue = selectedAngle || 'beneficios';
        const productPhoto = focusType === 'product' && selectedProduct?.image
          ? selectedProduct.image : undefined;
        const productAssets = productPhoto ? [productPhoto] : [];
        const productData = selectedProduct ? {
          title: selectedProduct.title,
          product_type: selectedProduct.product_type,
          body_html: '',
        } : undefined;

        // DCT flexible → 3 distinct compositions. Carousel → 3 slides (users
        // can add more manually via the + button). Single image → 1.
        const imageCount = adSetFormat === 'flexible' || adSetFormat === 'carousel' ? 3 : 1;
        // Video auto-gen available in Single / Carousel / DCT Flexible. Each
        // Veo 3 video costs 30 credits so multi-slot video gets pricey fast
        // (3×30 = 90 credits). Confirm with the user before spending.
        let wantVideo = autoMediaType === 'video' && adSetFormat !== 'catalog';
        if (wantVideo && imageCount > 1) {
          const totalCredits = imageCount * 30;
          const confirmed = window.confirm(
            `Vas a generar ${imageCount} videos con Veo 3 (${totalCredits} créditos, ~$${(totalCredits * 0.107).toFixed(2)} USD). Cada video tarda 1-3 min, así que el wizard puede demorar ${imageCount * 2}-${imageCount * 3} min en total. ¿Continuar?`
          );
          if (!confirmed) {
            wantVideo = false;
            toast.info('OK, generando fotos en vez de videos.');
          }
        }

        for (let slot = 0; slot < imageCount; slot++) {
          const composition = pickComposition(slot);
          const variacionElegida = {
            titulo: copyResult.headlines[0] || 'Anuncio',
            texto_principal: copyResult.texts[0] || '',
            descripcion: `${copyResult.descriptions[0] || ''}. VISUAL COMPOSITION: ${composition}`,
            cta: cta || 'SHOP_NOW',
          };

          setAutoGenProgress(
            wantVideo
              ? `Generando video con Veo 3 (1-3 min)...`
              : `Generando imagen ${slot + 1} de ${imageCount}...`
          );

          const { data: briefData, error: briefErr } = await callApi('generate-brief-visual', {
            body: { clientId, formato: wantVideo ? 'video' : 'static', angulo: angleValue, variacionElegida, assetUrls: productAssets, productData },
          });

          if (briefErr || !briefData?.prompt_generacion) {
            continue;
          }

          const fotoBase = productPhoto || briefData?.foto_recomendada || undefined;

          if (wantVideo) {
            const { data: vidData, error: vidErr } = await callApi('generate-video', {
              body: {
                clientId,
                promptGeneracion: briefData.prompt_generacion,
                fotoBaseUrl: fotoBase,
                aspectRatio: '9:16',
              },
            });
            if (vidErr) {
              if (vidErr === 'NO_CREDITS' || (typeof vidErr === 'string' && vidErr.includes('CREDITS'))) {
                toast.error('Sin créditos para generar video');
              } else {
                toast.error(typeof vidErr === 'string' ? vidErr : 'Error generando video');
              }
              break;
            }
            if (vidData?.asset_url) {
              setImages((prev) => { const next = [...prev]; next[slot] = vidData.asset_url; return next; });
              toast.success('Video generado');
              continue;
            }
            if (vidData?.status === 'generando' && vidData?.prediction_id) {
              toast.info('Video en proceso — el wizard seguirá abierto mientras termina.');
              const op = vidData.prediction_id as string;
              const deadline = Date.now() + 3 * 60_000;
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token || '';
              while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 20_000));
                const params = new URLSearchParams({ op, clientId });
                const res = await fetch(
                  `https://steve-api-850416724643.us-central1.run.app/api/generate-video-status?${params}`,
                  { headers: { Authorization: `Bearer ${token}` } },
                );
                const statusData: any = await res.json().catch(() => ({}));
                if (statusData?.status === 'listo' && statusData.asset_url) {
                  setImages((prev) => { const next = [...prev]; next[slot] = statusData.asset_url; return next; });
                  toast.success('Video listo');
                  break;
                }
                if (statusData?.status === 'error') {
                  toast.error(statusData.error || 'Veo falló');
                  break;
                }
              }
            }
            continue;
          }

          const { data: imgData, error: imgErr } = await callApi('generate-image', {
            body: { clientId, promptGeneracion: briefData.prompt_generacion, fotoBaseUrl: fotoBase, engine: 'imagen', formato: 'square' },
          });

          if (imgErr) {
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
        formato: adSetFormat === 'catalog' ? 'dpa' : adSetFormat === 'carousel' ? 'carousel' : filledImages[0]?.endsWith('.mp4') ? 'video' : 'static',
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
            tipo_campana: budgetType === 'ABO' ? 'ABO Testing' : budgetType === 'ADVANTAGE' ? 'Advantage+ Shopping' : 'CBO Escalamiento',
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

      if (objective === 'TRAFFIC' && !destinationUrl?.trim()) {
        toast.error('URL de destino es obligatoria para campañas de Tráfico');
        setSubmitting(false);
        return;
      }

      const isCatalogSubmit = objective === 'CATALOG' && !!productCatalogId && !!productSetId;
      if (!isCatalogSubmit && !images.some(Boolean)) {
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

      // Build url_tags (UTM) — keep Meta macros as literal placeholders so Meta expands them per click.
      const utmParts: string[] = [];
      if (utmSource.trim()) utmParts.push(`utm_source=${utmSource.trim()}`);
      if (utmMedium.trim()) utmParts.push(`utm_medium=${utmMedium.trim()}`);
      if (utmCampaign.trim()) utmParts.push(`utm_campaign=${utmCampaign.trim()}`);
      if (utmContent.trim()) utmParts.push(`utm_content=${utmContent.trim()}`);
      if (utmTerm.trim()) utmParts.push(`utm_term=${utmTerm.trim()}`);
      // Append any extra params the user added (already in key=value&key=value form).
      if (extraUrlParams.trim()) {
        const cleaned = extraUrlParams.trim().replace(/^[?&]+/, '');
        if (cleaned) utmParts.push(cleaned);
      }
      const urlTags = utmParts.join('&');

      // Build creative_features map for Advantage+ Creative (opt-in granular, v22+).
      // Each toggle enables 1-2 real feature flags from the spec.
      const creativeFeatures: Record<string, 'OPT_IN' | 'OPT_OUT'> = {};
      creativeFeatures.image_touchups = advFeatVisual ? 'OPT_IN' : 'OPT_OUT';
      creativeFeatures.image_brightness_and_contrast = advFeatVisual ? 'OPT_IN' : 'OPT_OUT';
      creativeFeatures.video_auto_crop = advFeatVisual ? 'OPT_IN' : 'OPT_OUT';
      creativeFeatures.text_optimizations = advFeatText ? 'OPT_IN' : 'OPT_OUT';
      creativeFeatures.text_formatting_optimization = advFeatText ? 'OPT_IN' : 'OPT_OUT';
      if (advFeatOverlays) {
        creativeFeatures.image_templates = 'OPT_IN';
        creativeFeatures.add_text_overlay = 'OPT_IN';
      }
      if (advFeatTranslate) {
        creativeFeatures.text_translation = 'OPT_IN';
        creativeFeatures.image_text_translation = 'OPT_IN';
      }

      const isAdvantage = budgetType === 'ADVANTAGE';

      const submitData: Record<string, any> = {
        name,
        objective: objMap[objective],
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        // Advantage+ Shopping: Meta auto-detects this mode when the 3 automation
        // levers are all ON (bid, audience, placements). We set the flag so the
        // backend can validate the request shape and log the resulting advantage_state.
        is_advantage_sales: isAdvantage,
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
        page_id: selectedPageId || ctxPageId || undefined,
        instagram_user_id: publishToInstagram ? (selectedInstagramUserId || ctxIgAccountId || undefined) : undefined,
        ad_set_format: adSetFormat,
        images: filledImages.length > 0 ? filledImages : undefined,
        texts: filledTexts.length > 0 ? filledTexts : undefined,
        headlines: filledHeadlines.length > 0 ? filledHeadlines : undefined,
        descriptions: filledDescriptions.length > 0 ? filledDescriptions : undefined,
        // Pixel + conversion event (when objective is CONVERSIONS)
        pixel_id: objective === 'CONVERSIONS' && selectedPixelId ? selectedPixelId : undefined,
        custom_event_type: objective === 'CONVERSIONS' ? customEventType : undefined,
        // UTM tags on the ad
        url_tags: urlTags || undefined,
        // Advantage+ Creative features
        creative_features: creativeFeatures,
        // Angle + funnel stage — fed to CRITERIO R-008 (ángulo no repetido)
        // and to creative_history tracking so future campaigns can learn from variety.
        angle: selectedAngle || undefined,
        funnel_stage: funnelStage || undefined,
        // Display link shown under the headline in the ad (AdCreativeLinkData.caption).
        display_link: displayLink.trim() || undefined,
        // Browser add-on: Click-to-Message maps to specific call_to_action.type values
        // on the Meta side. Default 'none' keeps the current CTA chosen by the user.
        browser_addon: browserAddon !== 'none' ? browserAddon : undefined,
        // Content source: 'advantage_catalog' uses product catalog template creative,
        // 'manual' uses the uploaded images/text.
        content_source: contentSource,
        // Ad name — defaults to first headline on backend if empty.
        ad_name: adName.trim() || undefined,
        // Meta "Optimizar contenido para cada persona" — when true, backend
        // enables use_flexible_image_aspect_ratio on the creative and keeps
        // adapt_to_placement as OPT_IN in the creative_features_spec.
        personalize_content: personalizeContent,
      };

      // Use existing entities if selected
      if (existingCampaignId) {
        submitData.campaign_id = existingCampaignId;
      }
      if (existingAdsetId) {
        submitData.adset_id = existingAdsetId;
      }

      if (objective === 'CATALOG' && productCatalogId && productSetId) {
        submitData.product_catalog_id = productCatalogId;
        submitData.product_set_id = productSetId;
      }

      // Budget + targeting (required by Meta for new ad sets)
      if (!existingAdsetId) {
        // CLP has no cents — Meta expects smallest currency unit (1 CLP = 1)
        // ABO uses adset-level budget; CBO and ADVANTAGE both use campaign-level budget.
        const budget = budgetType === 'ABO'
          ? Number(adsetBudget)
          : Number(campBudget);
        submitData.daily_budget = budget || 10000;

        // Build targeting from wizard fields
        const geoLocations: Record<string, any> = {
          countries: targetCountries.length > 0 ? targetCountries : ['CL'],
        };
        // Add specific cities/regions from location search
        if (targetLocations.length > 0) {
          const cities = targetLocations.filter(l => l.type === 'city').map(l => ({ key: l.key }));
          const regions = targetLocations.filter(l => l.type === 'region').map(l => ({ key: l.key }));
          if (cities.length > 0) geoLocations.cities = cities;
          if (regions.length > 0) geoLocations.regions = regions;
        }

        const targetingSpec: Record<string, any> = {
          geo_locations: geoLocations,
          age_min: targetAgeMin || 18,
          age_max: targetAgeMax || 65,
        };
        if (targetGender > 0) {
          targetingSpec.genders = [targetGender];
        }
        // Include selected Meta audiences (custom/lookalike/saved) in targeting
        if (selectedAudienceIds.length > 0) {
          targetingSpec.custom_audiences = selectedAudienceIds.map(id => ({ id }));
        }
        // Include interests (detailed targeting)
        if (targetInterests.length > 0) {
          targetingSpec.flexible_spec = [{
            interests: targetInterests.map(i => ({ id: i.id, name: i.name })),
          }];
        }
        // Exclude interests
        if (targetExcludeInterests.length > 0) {
          targetingSpec.exclusions = {
            interests: targetExcludeInterests.map(i => ({ id: i.id, name: i.name })),
          };
        }
        submitData.targeting = targetingSpec;

        // Placements — only send explicit lists when the user chose "Manual".
        // Advantage+ Placements = omit these fields (Meta auto-selects).
        if (placementsMode === 'manual' && selectedPlatforms.length > 0) {
          submitData.publisher_platforms = selectedPlatforms;
          if (selectedPlatforms.includes('facebook') && fbPositions.length > 0) submitData.facebook_positions = fbPositions;
          if (selectedPlatforms.includes('instagram') && igPositions.length > 0) submitData.instagram_positions = igPositions;
          if (selectedPlatforms.includes('audience_network') && anPositions.length > 0) submitData.audience_network_positions = anPositions;
          if (selectedPlatforms.includes('messenger') && msgrPositions.length > 0) submitData.messenger_positions = msgrPositions;
        }
      }

      if (!existingCampaignId && startDate) {
        submitData.start_time = startDate;
      }

      const response = await callApi('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: ctxConnectionId,
          data: submitData,
        },
      });

      const error = response.error;
      const data = response.data as any;

      if (error) {
        // Handle CRITERIO structured errors with proper message
        if (typeof error === 'object' && (error as any)?.failed_rules) {
          const e = error as any;
          const topIssues = (e.failed_rules || []).slice(0, 3).map((r: any) => r.details || r.rule_id).join('; ');
          throw new Error(`CRITERIO rechazó (score ${e.score}%): ${topIssues}`);
        }
        throw typeof error === 'string' ? new Error(error) : error;
      }

      // Save creative to ad_creatives library
      try {
        const objLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
        const anguloText = selectedAngle || `${objLabel} — ${audienceDesc?.substring(0, 80) || 'Campaña directa'}`;
        await supabase.from('ad_creatives').insert({
          client_id: clientId,
          funnel: funnelStage,
          formato: adSetFormat === 'catalog' ? 'dpa' : adSetFormat === 'carousel' ? 'carousel' : filledImages[0]?.endsWith('.mp4') ? 'video' : 'static',
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

      if (data?.partial === true) {
        // Safety net: si algún 207 residual llega, mostrar warning con errores específicos
        const errors = [data.adset_error, data.creative_error, data.ad_error].filter(Boolean);
        const errorMsg = errors.join('. ') || 'Error parcial al crear la campaña';
        toast.warning(`Campaña incompleta: ${errorMsg}`);
      } else {
        toast.success('Campaña creada como pausada en Meta. Activa cuando estés listo.');
      }
      onComplete?.();
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Error desconocido';
      console.error('[CampaignCreateWizard] Publish error:', msg, err);
      toast.error(`Error al crear campaña: ${msg}`);
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
        <Button variant="ghost" size="icon" aria-label="Volver" onClick={wizardStarted ? () => { if (stepIndex === 0) { setWizardStarted(false); } else { goPrev(); } } : handleLeaveAttempt} className="h-8 w-8">
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

      {/* Pre-wizard: Level selector + "Steve configura todo" shortcut */}
      {!wizardStarted && (
        <>
          <SteveQuickConfig
            clientId={clientId}
            onConfigured={(config) => {
              // Apply Steve's configuration to all wizard states
              if (config.campaign) {
                if (config.campaign.name) { setCampName(config.campaign.name); setCampNameEdited(true); }
                if (config.campaign.objective) setObjective(config.campaign.objective);
                if (config.campaign.budgetType) setBudgetType(config.campaign.budgetType);
                if (config.campaign.dailyBudget) setCampBudget(String(config.campaign.dailyBudget));
              }
              if (config.adset) {
                if (config.adset.name) setAdsetName(config.adset.name);
                if (config.adset.audienceDesc) setAudienceDesc(config.adset.audienceDesc);
                if (Array.isArray(config.adset.targetCountries)) setTargetCountries(config.adset.targetCountries);
                if (typeof config.adset.targetAgeMin === 'number') setTargetAgeMin(config.adset.targetAgeMin);
                if (typeof config.adset.targetAgeMax === 'number') setTargetAgeMax(config.adset.targetAgeMax);
                if (typeof config.adset.targetGender === 'number') setTargetGender(config.adset.targetGender as 0 | 1 | 2);
                // Apply format + media choice recommended by Steve. When the
                // campaign is CATALOG/ADVANTAGE, Steve returns adSetFormat='catalog'
                // which propagates through the useEffect that enforces DPA config.
                if (config.adset.adSetFormat) setAdSetFormat(config.adset.adSetFormat as AdSetFormat);
                if (config.adset.autoMediaType === 'video' || config.adset.autoMediaType === 'photo') {
                  setAutoMediaType(config.adset.autoMediaType);
                }
              }
              if (config.funnel) {
                if (config.funnel.stage) setFunnelStage(config.funnel.stage);
                if (config.funnel.angle) setSelectedAngle(config.funnel.angle);
              }
              if (config.creative) {
                if (Array.isArray(config.creative.headlines) && config.creative.headlines.length > 0) setHeadlines(config.creative.headlines);
                if (Array.isArray(config.creative.primaryTexts) && config.creative.primaryTexts.length > 0) setPrimaryTexts(config.creative.primaryTexts);
                if (Array.isArray(config.creative.descriptions) && config.creative.descriptions.length > 0) setDescriptions(config.creative.descriptions);
                if (config.creative.cta) setCta(config.creative.cta);
                if (config.creative.focusType) setFocusType(config.creative.focusType);
                // Hero product suggestion (only when user didn't pre-select one)
                if (config.creative.suggestedProductId) {
                  supabase.from('shopify_products').select('id, title, image_url, product_type').eq('id', config.creative.suggestedProductId).maybeSingle()
                    .then(({ data }: any) => {
                      if (data) {
                        setSelectedProduct({
                          id: data.id,
                          title: data.title,
                          image: data.image_url || '',
                          price: 0,
                          product_type: data.product_type || '',
                        });
                      }
                    });
                }
              }
              // Start the wizard — user lands on step 1 with everything prefilled.
              setWizardStarted(true);
              toast.success('Steve configuró todo. Revisa cada paso y ajusta lo que quieras.');
            }}
          />
          <LevelSelector
            level={level}
            setLevel={setLevel}
            onStart={() => setWizardStarted(true)}
          />
        </>
      )}

      {/* Wizard: Steps */}
      {wizardStarted && (
        <>
          {/* Step indicator */}
          <StepIndicator
            steps={steps}
            currentIndex={stepIndex}
            onStepClick={(i) => { if (i < stepIndex) setStepIndex(i); }}
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
                          onNameEdited={() => setCampNameEdited(true)}
                          onSuggestName={() => { setCampNameEdited(false); return generateCampaignName(); }}
                          budgetType={budgetType} setBudgetType={setBudgetType}
                          objective={objective} setObjective={setObjective}
                          dailyBudget={campBudget} setDailyBudget={setCampBudget}
                          startDate={startDate} setStartDate={setStartDate}
                          cpaTarget={cpaTarget}
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
                          autoMediaType={autoMediaType} setAutoMediaType={setAutoMediaType}
                          cpaTarget={cpaTarget} setCpaTarget={setCpaTarget}
                          targetCountries={targetCountries} setTargetCountries={setTargetCountries}
                          targetAgeMin={targetAgeMin} setTargetAgeMin={setTargetAgeMin}
                          targetAgeMax={targetAgeMax} setTargetAgeMax={setTargetAgeMax}
                          targetGender={targetGender} setTargetGender={setTargetGender}
                          connectionId={ctxConnectionId}
                          selectedAudienceIds={selectedAudienceIds} setSelectedAudienceIds={setSelectedAudienceIds}
                          targetInterests={targetInterests} setTargetInterests={setTargetInterests}
                          targetExcludeInterests={targetExcludeInterests} setTargetExcludeInterests={setTargetExcludeInterests}
                          targetLocations={targetLocations} setTargetLocations={setTargetLocations}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* CAMPAIGN CONFIG step (Flow A only) */}
              {currentStep === 'campaign-config' && (
                <>
                  <CampaignForm
                    name={campName} setName={setCampName}
                    onNameEdited={() => setCampNameEdited(true)}
                    onSuggestName={() => { setCampNameEdited(false); return generateCampaignName(); }}
                    budgetType={budgetType} setBudgetType={setBudgetType}
                    objective={objective} setObjective={setObjective}
                    dailyBudget={campBudget} setDailyBudget={setCampBudget}
                    startDate={startDate} setStartDate={setStartDate}
                    cpaTarget={cpaTarget}
                  />
                  {objective === 'CATALOG' && (
                    <div className="space-y-4 mt-5 p-4 rounded-lg border border-primary/20 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        <Label className="font-semibold">Origen del contenido</Label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setContentSource('manual')}
                          className={`flex flex-col items-start gap-1 p-3 rounded-md border text-left transition-all ${
                            contentSource === 'manual' ? 'border-primary bg-background' : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <FileImage className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold">Subida manual</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">Tú defines las imágenes y textos del anuncio.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setContentSource('advantage_catalog')}
                          className={`flex flex-col items-start gap-1 p-3 rounded-md border text-left transition-all ${
                            contentSource === 'advantage_catalog' ? 'border-primary bg-background ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-xs font-semibold">Anuncios de Catálogo Advantage+</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">Meta genera ads dinámicos usando cada producto del catálogo.</span>
                        </button>
                      </div>

                      {contentSource === 'advantage_catalog' && (
                        <div className="p-2 rounded-md border border-green-300 bg-green-50 text-[11px] text-green-900">
                          <strong>Modo Advantage+ Catálogo:</strong> Meta va a crear variantes automáticas mostrando distintos productos a cada persona según intención de compra. Skipearás los pasos de ángulo y imágenes.
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1 border-t">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        <Label className="font-semibold text-sm">Catálogo y Product Set</Label>
                      </div>
                      {catalogsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cargando catálogos...
                        </div>
                      ) : catalogs.length === 0 ? (
                        <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 space-y-1">
                          <p className="font-medium">No se encontraron catálogos accesibles.</p>
                          {catalogsHint ? (
                            <p className="text-xs">{catalogsHint}</p>
                          ) : (
                            <p className="text-xs">Verifica en Business Settings → Cuentas publicitarias → Catálogos que el catálogo esté asignado a esta cuenta publicitaria.</p>
                          )}
                        </div>
                      ) : (
                        <>
                          {catalogsHint && (
                            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                              {catalogsHint}
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Catálogo</Label>
                            <Select value={productCatalogId} onValueChange={(v) => { setProductCatalogId(v); setProductSetId(''); }}>
                              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un catálogo" /></SelectTrigger>
                              <SelectContent>
                                {catalogs.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name} ({cat.product_count} productos){cat.source && cat.source !== 'ad_account' ? ` · ${cat.source === 'owned' ? 'BM propio' : 'compartido'}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {productCatalogId && (() => {
                            const selectedCatalog = catalogs.find((c) => c.id === productCatalogId);
                            const sets = selectedCatalog?.product_sets || [];
                            return sets.length > 0 ? (
                              <div>
                                <Label className="text-xs">Set de productos</Label>
                                <Select value={productSetId} onValueChange={setProductSetId}>
                                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un set" /></SelectTrigger>
                                  <SelectContent>
                                    {sets.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name} ({s.product_count} productos)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-1">Meta mostrará automáticamente los productos más relevantes a cada persona.</p>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Este catálogo no tiene sets de productos configurados.</p>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ADSET CONFIG step (Flow A and B) */}
              {currentStep === 'adset-config' && (
                <AdSetForm
                  name={adsetName} setName={setAdsetName}
                  audienceDesc={audienceDesc} setAudienceDesc={setAudienceDesc}
                  dailyBudget={adsetBudget} setDailyBudget={setAdsetBudget}
                  isABO={budgetType === 'ABO'}
                  adSetFormat={adSetFormat} setAdSetFormat={setAdSetFormat}
                  autoMediaType={autoMediaType} setAutoMediaType={setAutoMediaType}
                  cpaTarget={cpaTarget} setCpaTarget={setCpaTarget}
                  targetCountries={targetCountries} setTargetCountries={setTargetCountries}
                  targetAgeMin={targetAgeMin} setTargetAgeMin={setTargetAgeMin}
                  targetAgeMax={targetAgeMax} setTargetAgeMax={setTargetAgeMax}
                  targetGender={targetGender} setTargetGender={setTargetGender}
                  connectionId={ctxConnectionId}
                  selectedAudienceIds={selectedAudienceIds} setSelectedAudienceIds={setSelectedAudienceIds}
                  targetInterests={targetInterests} setTargetInterests={setTargetInterests}
                  targetExcludeInterests={targetExcludeInterests} setTargetExcludeInterests={setTargetExcludeInterests}
                  targetLocations={targetLocations} setTargetLocations={setTargetLocations}
                  clientId={clientId}
                  selectedProductId={selectedProduct?.id}
                  objective={objective}
                  availablePixels={availablePixels}
                  selectedPixelId={selectedPixelId} setSelectedPixelId={setSelectedPixelId}
                  customEventType={customEventType} setCustomEventType={setCustomEventType}
                  placementsMode={placementsMode} setPlacementsMode={setPlacementsMode}
                  selectedPlatforms={selectedPlatforms} setSelectedPlatforms={setSelectedPlatforms}
                  fbPositions={fbPositions} setFbPositions={setFbPositions}
                  igPositions={igPositions} setIgPositions={setIgPositions}
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
                <div className="relative space-y-6">
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
                    isDpaCampaign={objective === 'CATALOG'}
                    onAddVariations={async () => {
                      // Generate 2 more variations and APPEND (not replace) to existing arrays.
                      // Uses a different instruction so Claude gives genuinely different angles.
                      const { data, error } = await callApi('generate-meta-copy', {
                        body: {
                          client_id: clientId,
                          instruction: [
                            `Genera 2 VARIACIONES ADICIONALES de copy para Meta Ads, con enfoques DISTINTOS a:`,
                            `- Textos existentes: ${primaryTexts.filter(Boolean).join(' / ')}`,
                            `- Titulares existentes: ${headlines.filter(Boolean).join(' / ')}`,
                            `Objetivo: ${objective}. Funnel: ${funnelStage}. Ángulo: ${selectedAngle || 'variado'}.`,
                            `Cada variación debe usar un ángulo creativo diferente (call out, bold statement, review, beneficio directo, pregunta, etc).`,
                            `Responde SOLO con JSON: {"texts":["t1","t2"],"headlines":["h1","h2"],"descriptions":["d1","d2"]}`,
                          ].join('\n'),
                        },
                      });
                      if (error) { toast.error(typeof error === 'string' ? error : 'Error'); return; }
                      try {
                        const raw = data?.copy || data?.text || '';
                        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
                        if (Array.isArray(parsed.texts)) setPrimaryTexts(prev => [...prev.filter(Boolean), ...parsed.texts]);
                        if (Array.isArray(parsed.headlines)) setHeadlines(prev => [...prev.filter(Boolean), ...parsed.headlines]);
                        if (Array.isArray(parsed.descriptions)) setDescriptions(prev => [...prev.filter(Boolean), ...parsed.descriptions]);
                        toast.success(`Steve sumó ${parsed.texts?.length || 0} variaciones más`);
                      } catch {
                        toast.error('Steve no devolvió JSON válido');
                      }
                    }}
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

                <div className="p-4 rounded-lg border border-border/60 bg-muted/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileImage className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-semibold">Nombre del anuncio</Label>
                  </div>
                  <Input
                    value={adName}
                    onChange={(e) => { setAdName(e.target.value); setAdNameEdited(true); }}
                    placeholder={headlines[0] || 'Ej: Razas Pet - Nacuttus - Abr26'}
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Así aparece en Meta Ads Manager. Si no lo editas, Steve usa el primer titular.
                  </p>
                </div>

                <PageAndInstagramPicker
                  businessGroups={ctxBusinessGroups}
                  selectedPageId={selectedPageId}
                  setSelectedPageId={setSelectedPageId}
                  selectedInstagramUserId={selectedInstagramUserId}
                  setSelectedInstagramUserId={setSelectedInstagramUserId}
                  publishToInstagram={publishToInstagram}
                  setPublishToInstagram={setPublishToInstagram}
                  defaultPageId={ctxPageId}
                  defaultIgId={ctxIgAccountId}
                  defaultIgName={ctxIgAccountName}
                />

                <DestinationExtras
                  displayLink={displayLink} setDisplayLink={setDisplayLink}
                  browserAddon={browserAddon} setBrowserAddon={setBrowserAddon}
                  destinationUrl={destinationUrl}
                />

                <UtmBuilder
                  destinationUrl={destinationUrl}
                  utmSource={utmSource} setUtmSource={setUtmSource}
                  utmMedium={utmMedium} setUtmMedium={setUtmMedium}
                  utmCampaign={utmCampaign} setUtmCampaign={setUtmCampaign}
                  utmContent={utmContent} setUtmContent={setUtmContent}
                  utmTerm={utmTerm} setUtmTerm={setUtmTerm}
                  extraParams={extraUrlParams} setExtraParams={setExtraUrlParams}
                />

                <AdvancedPreviewButton
                  connectionId={ctxConnectionId}
                  pageId={selectedPageId || ctxPageId || null}
                  igUserId={publishToInstagram ? (selectedInstagramUserId || ctxIgAccountId || null) : null}
                  primaryText={primaryTexts[0] || ''}
                  headline={headlines[0] || ''}
                  description={descriptions[0] || ''}
                  imageUrl={images[0] || ''}
                  cta={cta}
                  destinationUrl={destinationUrl}
                  displayLink={displayLink}
                />

                <AdvantageCreativeToggles
                  visual={advFeatVisual} setVisual={setAdvFeatVisual}
                  text={advFeatText} setText={setAdvFeatText}
                  overlays={advFeatOverlays} setOverlays={setAdvFeatOverlays}
                  translate={advFeatTranslate} setTranslate={setAdvFeatTranslate}
                  personalize={personalizeContent} setPersonalize={setPersonalizeContent}
                />
                </div>
              )}

              {/* REVIEW step */}
              {currentStep === 'review' && (() => {
                // Rebuild UTM preview for display
                const utmParts: string[] = [];
                if (utmSource.trim()) utmParts.push(`utm_source=${utmSource.trim()}`);
                if (utmMedium.trim()) utmParts.push(`utm_medium=${utmMedium.trim()}`);
                if (utmCampaign.trim()) utmParts.push(`utm_campaign=${utmCampaign.trim()}`);
                if (utmContent.trim()) utmParts.push(`utm_content=${utmContent.trim()}`);
                if (utmTerm.trim()) utmParts.push(`utm_term=${utmTerm.trim()}`);
                const urlTagsPreview = utmParts.join('&');
                const pixelName = (availablePixels.find(p => p.id === selectedPixelId)?.name) || (selectedPixelId ? `Pixel ${selectedPixelId}` : undefined);
                const allPages = (ctxBusinessGroups || []).flatMap(g => g.pages || []);
                const currentPage = allPages.find(p => p.id === (selectedPageId || ctxPageId));
                return (
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
                    pixelName={pixelName}
                    customEventType={customEventType}
                    placementsMode={placementsMode}
                    selectedPlatforms={selectedPlatforms}
                    fbPositions={fbPositions}
                    igPositions={igPositions}
                    pageLabel={currentPage?.name || pageName || undefined}
                    igLabel={currentPage?.igAccountName || ctxIgAccountName || undefined}
                    publishToInstagram={publishToInstagram}
                    urlTagsPreview={urlTagsPreview}
                    advFeatVisual={advFeatVisual}
                    advFeatText={advFeatText}
                    advFeatOverlays={advFeatOverlays}
                    advFeatTranslate={advFeatTranslate}
                    isAdvantageSales={budgetType === 'ADVANTAGE'}
                    onPublish={handleSubmit}
                    onSaveDraft={handleSaveDraft}
                    submitting={submitting}
                    savingDraft={savingDraft}
                  />
                );
              })()}
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
                <Button onClick={handleSubmit} disabled={submitting || !canProceed()} size="lg" className="bg-green-600 hover:bg-green-700">
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
