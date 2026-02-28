import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Lightbulb,
  Loader2,
  DollarSign,
  Target,
  Eye,
  Users,
  Sparkles,
  CalendarDays,
  Zap,
} from 'lucide-react';

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

const OBJECTIVES: { value: Objective; label: string; desc: string }[] = [
  { value: 'CONVERSIONS', label: 'Conversiones', desc: 'Ventas, leads, registros' },
  { value: 'TRAFFIC', label: 'Trafico', desc: 'Visitas al sitio web' },
  { value: 'AWARENESS', label: 'Reconocimiento', desc: 'Alcance y awareness de marca' },
  { value: 'ENGAGEMENT', label: 'Interaccion', desc: 'Likes, comentarios, compartidos' },
  { value: 'CATALOG', label: 'Catalogo', desc: 'Dynamic Product Ads desde Shopify' },
];

const CTA_OPTIONS = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'CONTACT_US', 'GET_OFFER', 'BOOK_NOW'];

// ---------------------------------------------------------------------------
// Steve tip helper
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
// Start Level Selector
// ---------------------------------------------------------------------------

function LevelSelector({ level, setLevel }: { level: StartLevel; setLevel: (l: StartLevel) => void }) {
  const levels: { key: StartLevel; icon: React.ElementType; label: string; desc: string }[] = [
    { key: 'campaign', icon: Megaphone, label: 'Campana', desc: 'Empieza creando la campana (arriba hacia abajo)' },
    { key: 'adset', icon: FolderOpen, label: 'Ad Set', desc: 'Empieza con el conjunto de anuncios (audiencia + presupuesto)' },
    { key: 'ad', icon: FileImage, label: 'Anuncio', desc: 'Empieza con el creativo y luego asignalo' },
  ];

  return (
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
      <SteveTip>
        {budgetType === 'ABO'
          ? 'ABO (Ad Budget Optimization): Presupuesto por cada Ad Set. Ideal para TESTING — controlas cuanto gasta cada ad set.'
          : 'CBO (Campaign Budget Optimization): Meta distribuye el presupuesto. Ideal para ESCALAR ganadores — Meta optimiza automaticamente.'}
      </SteveTip>

      <div>
        <Label>Nombre de la campana</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Mi Campana - ${today}`} className="mt-1" />
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
          <p className="text-xs text-muted-foreground mt-1">Meta distribuira este presupuesto entre los Ad Sets automaticamente.</p>
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
      <SteveTip>
        Cada Ad Set debe tener 1 solo ad para testear variables aisladas. Si pones multiples ads en un Ad Set, Meta distribuye el presupuesto desigualmente y no sabes cual funciono.
      </SteveTip>

      <div>
        <Label>Nombre del Ad Set</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="[Audiencia] - [Variable test]" className="mt-1" />
      </div>

      <div>
        <Label>Audiencia / Segmento</Label>
        <Textarea value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Describe la audiencia: demographics, intereses, comportamiento..." rows={3} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Puedes crear audiencias detalladas en la seccion Audiencias.</p>
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
// Ad Form
// ---------------------------------------------------------------------------

function AdForm({
  headline, setHeadline,
  primaryText, setPrimaryText,
  description, setDescription,
  imageUrl, setImageUrl,
  cta, setCta,
  destinationUrl, setDestinationUrl,
  generating,
  onGenerateCopy,
}: {
  headline: string; setHeadline: (v: string) => void;
  primaryText: string; setPrimaryText: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  imageUrl: string; setImageUrl: (v: string) => void;
  cta: string; setCta: (v: string) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  generating: boolean;
  onGenerateCopy: () => void;
}) {
  return (
    <div className="space-y-5">
      <SteveTip>
        Steve genera copy basado en tu brief. Puedes editar todo. El copy debe hablar al dolor/deseo del buyer persona y tener un CTA claro.
      </SteveTip>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onGenerateCopy} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Steve genera copy
        </Button>
      </div>

      <div>
        <Label>Imagen / Creativo (URL)</Label>
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="mt-1" />
        {imageUrl && (
          <div className="mt-2 w-32 h-32 rounded-lg bg-muted overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div>
        <Label>Texto principal (Primary Text)</Label>
        <Textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} placeholder="El texto principal del anuncio..." rows={4} className="mt-1" />
        <p className="text-[11px] text-muted-foreground mt-1">{primaryText.length}/125 caracteres recomendados</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Headline</Label>
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Titulo del anuncio" className="mt-1" />
        </div>
        <div>
          <Label>Descripcion</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripcion corta" className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>CTA (Call to Action)</Label>
          <Select value={cta} onValueChange={setCta}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CTA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>URL de destino</Label>
          <Input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://tu-tienda.com" className="mt-1" />
        </div>
      </div>

      {/* Mini preview */}
      {(primaryText || headline || imageUrl) && (
        <Card className="border-primary/20 bg-muted/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <CardTitle className="text-xs">Preview</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {imageUrl && <div className="aspect-video rounded bg-muted overflow-hidden max-w-xs"><img src={imageUrl} alt="" className="w-full h-full object-cover" /></div>}
            {headline && <p className="text-sm font-semibold">{headline}</p>}
            {primaryText && <p className="text-xs text-muted-foreground line-clamp-3">{primaryText}</p>}
            {description && <p className="text-xs text-muted-foreground/70">{description}</p>}
            {cta && <Badge variant="outline" className="text-[10px]">{cta.replace(/_/g, ' ')}</Badge>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignCreateWizard({ clientId, onBack, onComplete, startFrom = 'campaign' }: CampaignCreateWizardProps) {
  const [level, setLevel] = useState<StartLevel>(startFrom);
  const [submitting, setSubmitting] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);

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

  // Ad fields
  const [headline, setHeadline] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [cta, setCta] = useState('SHOP_NOW');
  const [destinationUrl, setDestinationUrl] = useState('');

  const handleGenerateCopy = async () => {
    setGeneratingCopy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-meta-copy', {
        body: {
          client_id: clientId,
          instruction: `Genera copy para un anuncio de Meta Ads. Objetivo: ${objective}. Audiencia: ${audienceDesc || 'amplia'}. Responde SOLO con JSON: {"primary_text":"...","headline":"...","description":"..."}`,
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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: conns } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1);

      if (!conns || conns.length === 0) {
        toast.error('No hay conexion Meta Ads activa');
        return;
      }

      const connectionId = conns[0].id;
      const name = campName || `Campana - ${new Date().toISOString().split('T')[0]}`;
      const objMap: Record<Objective, string> = {
        CONVERSIONS: 'OUTCOME_SALES',
        TRAFFIC: 'OUTCOME_TRAFFIC',
        AWARENESS: 'OUTCOME_AWARENESS',
        ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
        CATALOG: 'OUTCOME_SALES',
      };

      const budget = budgetType === 'CBO'
        ? Number(campBudget) * 100
        : Number(adsetBudget) * 100;

      const { error } = await supabase.functions.invoke('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: connectionId,
          data: {
            name,
            objective: objMap[objective],
            status: 'PAUSED',
            daily_budget: budget || 1000000,
            billing_event: 'IMPRESSIONS',
            optimization_goal: objective === 'TRAFFIC' ? 'LINK_CLICKS' : 'OFFSITE_CONVERSIONS',
            adset_name: adsetName || `${name} - Ad Set 1`,
            start_time: startDate || undefined,
          },
        },
      });

      if (error) throw error;

      toast.success(`Campana "${name}" creada como ${budgetType}. Estado: PAUSED.`);
      onComplete?.();
    } catch (err) {
      console.error('[CampaignCreateWizard] Submit error:', err);
      toast.error('Error al crear campana');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Crear Campana</h2>
          <p className="text-muted-foreground text-sm">Elige desde donde empezar: Campana, Ad Set o Anuncio</p>
        </div>
      </div>

      {/* Level selector */}
      <LevelSelector level={level} setLevel={setLevel} />

      {/* Forms based on level */}
      <div className="space-y-6">
        {/* Campaign form — always shown if level is campaign, or later for other levels */}
        {(level === 'campaign' || level === 'adset' || level === 'ad') && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Campana</CardTitle>
              </div>
              {level !== 'campaign' && <CardDescription className="text-xs">Steve necesita una campana para asignar tu {level === 'adset' ? 'Ad Set' : 'Anuncio'}</CardDescription>}
            </CardHeader>
            <CardContent>
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

        {/* Ad Set form */}
        {(level === 'adset' || level === 'ad' || level === 'campaign') && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-orange-500" />
                <CardTitle className="text-base">Conjunto de Anuncios (Ad Set)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <AdSetForm
                name={adsetName} setName={setAdsetName}
                audienceDesc={audienceDesc} setAudienceDesc={setAudienceDesc}
                dailyBudget={adsetBudget} setDailyBudget={setAdsetBudget}
                isABO={budgetType === 'ABO'}
              />
            </CardContent>
          </Card>
        )}

        {/* Ad form */}
        {(level === 'ad' || level === 'campaign' || level === 'adset') && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-pink-500" />
                <CardTitle className="text-base">Anuncio (Ad)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <AdForm
                headline={headline} setHeadline={setHeadline}
                primaryText={primaryText} setPrimaryText={setPrimaryText}
                description={description} setDescription={setDescription}
                imageUrl={imageUrl} setImageUrl={setImageUrl}
                cta={cta} setCta={setCta}
                destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
                generating={generatingCopy}
                onGenerateCopy={handleGenerateCopy}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={submitting} size="lg">
          {submitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando...</>
          ) : (
            <><Megaphone className="w-4 h-4 mr-2" />Crear Campana</>
          )}
        </Button>
      </div>
    </div>
  );
}
