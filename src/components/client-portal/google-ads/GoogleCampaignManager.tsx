import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pause,
  Play,
  DollarSign,
  Search,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  Plus,
  Settings,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Trash2,
  CalendarIcon,
  Upload,
  X,
  Globe,
  Link2,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import SteveRecommendation from './SteveRecommendation';
import CreateAssetGroupDialog from './CreateAssetGroupDialog';

// ─── Types ───────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel_type: string;
  bidding_strategy: string;
  daily_budget_micros: number;
  daily_budget_currency: number;
  daily_budget_clp: number;
  currency: string;
}

interface AdGroup {
  id: string;
  name: string;
  status: string;
  type: string;
  cpc_bid_micros: number;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
}

interface GoogleCampaignManagerProps {
  connectionId: string;
  clientId: string;
}

type SortKey = 'name' | 'status' | 'channel_type' | 'daily_budget_clp';

// ─── Constants ───────────────────────────────────────────────────────

const channelLabels: Record<string, string> = {
  SEARCH: 'Search',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Video',
  PERFORMANCE_MAX: 'PMax',
  SMART: 'Smart',
  LOCAL: 'Local',
  DISCOVERY: 'Discovery',
  DEMAND_GEN: 'Demand Gen',
};

const statusColors: Record<string, string> = {
  ENABLED: 'bg-green-500/10 text-green-500 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  REMOVED: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const bidStrategies = [
  { value: 'MAXIMIZE_CONVERSIONS', label: 'Maximizar conversiones' },
  { value: 'MAXIMIZE_CLICKS', label: 'Maximizar clics' },
  { value: 'TARGET_CPA', label: 'CPA objetivo' },
  { value: 'TARGET_ROAS', label: 'ROAS objetivo' },
  { value: 'MANUAL_CPC', label: 'CPC manual' },
  { value: 'MAXIMIZE_CONVERSION_VALUE', label: 'Maximizar valor' },
];

const locationOptions = [
  { id: '2152', label: 'Chile' },
  { id: '2032', label: 'Argentina' },
  { id: '2484', label: 'Mexico' },
  { id: '2170', label: 'Colombia' },
  { id: '2604', label: 'Peru' },
  { id: '2724', label: 'Espana' },
  { id: '2840', label: 'Estados Unidos' },
  { id: '2076', label: 'Brasil' },
];

const languageOptions = [
  { id: '1003', label: 'Espanol' },
  { id: '1000', label: 'Ingles' },
  { id: '1014', label: 'Portugues' },
  { id: '1002', label: 'Frances' },
  { id: '1001', label: 'Aleman' },
];

// ─── AssetLineEditor ─────────────────────────────────────────────────

function AssetLineEditor({
  label,
  items,
  maxLength,
  maxItems,
  minItems,
  onChange,
}: {
  label: string;
  items: string[];
  maxLength: number;
  maxItems: number;
  minItems: number;
  onChange: (items: string[]) => void;
}) {
  const validCount = items.filter(i => i.trim()).length;

  const updateItem = (index: number, value: string) => {
    const next = [...items];
    next[index] = value.slice(0, maxLength);
    onChange(next);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    if (items.length >= maxItems) return;
    onChange([...items, '']);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label} <span className="text-muted-foreground font-normal">(min {minItems}, max {maxItems})</span></Label>
        <span className={`text-xs ${validCount < minItems ? 'text-red-500' : 'text-muted-foreground'}`}>
          {validCount}/{maxItems}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const len = item.length;
          const nearLimit = len > maxLength * 0.8;
          const overLimit = len > maxLength;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex-1 relative">
                <Input
                  value={item}
                  onChange={e => updateItem(i, e.target.value)}
                  placeholder={`${label} ${i + 1}`}
                  maxLength={maxLength}
                  className={overLimit ? 'border-red-300 focus-visible:ring-red-300' : ''}
                />
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none ${
                  overLimit ? 'text-red-500' : nearLimit ? 'text-yellow-500' : 'text-muted-foreground/50'
                }`}>
                  {len}/{maxLength}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      {items.length < maxItems && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={addItem}>
          <Plus className="w-3 h-3 mr-1" />
          Agregar {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

// ─── CTA Options ────────────────────────────────────────────────────

const ctaOptions = [
  { value: '', label: 'Automatico (Google elige)' },
  { value: 'LEARN_MORE', label: 'Mas informacion' },
  { value: 'SHOP_NOW', label: 'Comprar ahora' },
  { value: 'SIGN_UP', label: 'Registrarse' },
  { value: 'SUBSCRIBE', label: 'Suscribirse' },
  { value: 'GET_QUOTE', label: 'Obtener cotizacion' },
  { value: 'CONTACT_US', label: 'Contactanos' },
  { value: 'BOOK_NOW', label: 'Reservar ahora' },
  { value: 'APPLY_NOW', label: 'Solicitar ahora' },
];

// ─── fileToBase64 ───────────────────────────────────────────────────

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ─── ImageUploadZone ────────────────────────────────────────────────

// Aspect ratio + dimension requirements per Google Ads PMAX
const IMAGE_SPECS: Record<string, { ratio: number; tolerance: number; minW: number; minH: number; label: string }> = {
  'landscape':       { ratio: 1.91, tolerance: 0.15, minW: 600,  minH: 314, label: 'Landscape (1.91:1, min 600x314)' },
  'cuadrada':        { ratio: 1.0,  tolerance: 0.05, minW: 300,  minH: 300, label: 'Cuadrada (1:1, min 300x300)' },
  'logo':            { ratio: 1.0,  tolerance: 0.05, minW: 128,  minH: 128, label: 'Logo (1:1, min 128x128)' },
  'portrait':        { ratio: 0.8,  tolerance: 0.05, minW: 480,  minH: 600, label: 'Portrait (4:5, min 480x600)' },
  'logo landscape':  { ratio: 4.0,  tolerance: 0.3,  minW: 512,  minH: 128, label: 'Logo Landscape (4:1, min 512x128)' },
};

function validateImageDimensions(file: File, zoneLabel: string): Promise<string | null> {
  return new Promise(resolve => {
    const spec = IMAGE_SPECS[zoneLabel.toLowerCase()];
    if (!spec) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      URL.revokeObjectURL(img.src);
      if (w < spec.minW || h < spec.minH) {
        resolve(`${file.name}: muy chica (${w}x${h}), minimo ${spec.minW}x${spec.minH}`);
        return;
      }
      const actualRatio = w / h;
      if (Math.abs(actualRatio - spec.ratio) > spec.tolerance) {
        resolve(`${file.name}: aspect ratio incorrecto (${actualRatio.toFixed(2)}), necesita ~${spec.ratio} — ${spec.label}`);
        return;
      }
      resolve(null);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null); };
    img.src = URL.createObjectURL(file);
  });
}

function ImageUploadZone({
  label,
  files,
  onChange,
  maxFiles,
  minFiles = 0,
  aspectHint,
  required = false,
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles: number;
  minFiles?: number;
  aspectHint: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
        toast.error(`${f.name}: solo PNG, JPG o WebP`);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name}: maximo 5MB`);
        continue;
      }
      // Validate dimensions and aspect ratio
      const dimError = await validateImageDimensions(f, label);
      if (dimError) {
        toast.error(dimError);
        continue;
      }
      valid.push(f);
    }
    const combined = [...files, ...valid].slice(0, maxFiles);
    onChange(combined);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
          <span className="text-muted-foreground font-normal ml-1">({aspectHint})</span>
        </Label>
        <span className={`text-xs ${files.length < minFiles ? 'text-red-500' : 'text-muted-foreground'}`}>
          {files.length}/{maxFiles}
        </span>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-md border overflow-hidden">
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length < maxFiles && (
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Click o arrastra imagenes</p>
          <p className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP — max 5MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
}

// ─── YouTubeInput ───────────────────────────────────────────────────

function YouTubeInput({
  urls,
  onChange,
  maxItems = 5,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  maxItems?: number;
}) {
  const [inputValue, setInputValue] = useState('');

  const parseYouTubeId = (input: string): string | null => {
    const trimmed = input.trim();
    const watchMatch = trimmed.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    return null;
  };

  const addVideo = () => {
    const id = parseYouTubeId(inputValue);
    if (!id) {
      toast.error('URL o ID de YouTube no valido');
      return;
    }
    if (urls.includes(id)) {
      toast.error('Este video ya fue agregado');
      return;
    }
    if (urls.length >= maxItems) return;
    onChange([...urls, id]);
    setInputValue('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Videos de YouTube <span className="text-muted-foreground font-normal">(opcional, max {maxItems})</span></Label>
        <span className="text-xs text-muted-foreground">{urls.length}/{maxItems}</span>
      </div>

      {urls.length > 0 && (
        <div className="space-y-2">
          {urls.map((id, i) => (
            <div key={id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
              <img
                src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
                alt={`Video ${i + 1}`}
                className="w-24 h-14 rounded object-cover"
              />
              <span className="text-xs text-muted-foreground flex-1 truncate">{id}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {urls.length < maxItems && (
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="URL de YouTube o ID del video"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVideo(); } }}
          />
          <Button variant="outline" size="sm" onClick={addVideo} disabled={!inputValue.trim()}>
            <Plus className="w-3 h-3 mr-1" />
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export default function GoogleCampaignManager({ connectionId, clientId }: GoogleCampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [hasWriteAccess, setHasWriteAccess] = useState<boolean | null>(null);

  // Budget dialog
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetCampaign, setBudgetCampaign] = useState<Campaign | null>(null);
  const [newBudget, setNewBudget] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

  // Settings panel
  const [settingsCampaign, setSettingsCampaign] = useState<Campaign | null>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Ad groups
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [adGroups, setAdGroups] = useState<Record<string, AdGroup[]>>({});
  const [adGroupsLoading, setAdGroupsLoading] = useState<Record<string, boolean>>({});

  // Asset groups (PMAX) — vista jerárquica inline dentro de la tabla de campañas
  const [assetGroupsByCampaign, setAssetGroupsByCampaign] = useState<Record<string, Array<{ id: string; name: string; status: string; ad_strength: string }>>>({});
  const [assetGroupsLoading, setAssetGroupsLoading] = useState<Record<string, boolean>>({});
  const [assetGroupActionLoading, setAssetGroupActionLoading] = useState<Record<string, boolean>>({});
  const [createAgOpen, setCreateAgOpen] = useState(false);
  const [createAgCampaignId, setCreateAgCampaignId] = useState<string>('');

  // Delete asset group dialog (reemplaza window.confirm)
  const [deleteAgTarget, setDeleteAgTarget] = useState<{ campaignId: string; id: string; name: string } | null>(null);
  const [deleteAgLoading, setDeleteAgLoading] = useState(false);

  // Delete campaign dialog (reemplaza window.confirm)
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState<Campaign | null>(null);
  const [deleteCampaignLoading, setDeleteCampaignLoading] = useState(false);

  // Create ad group dialog
  const [createAdGroupOpen, setCreateAdGroupOpen] = useState(false);
  const [createAdGroupCampaignId, setCreateAdGroupCampaignId] = useState<string | null>(null);
  const [newAdGroupName, setNewAdGroupName] = useState('');
  const [newAdGroupBid, setNewAdGroupBid] = useState('');
  const [createAdGroupLoading, setCreateAdGroupLoading] = useState(false);

  // Create campaign wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardProgress, setWizardProgress] = useState('');
  const [wizardData, setWizardData] = useState({
    name: '',
    channel_type: 'SEARCH',
    daily_budget: '',
    bid_strategy: 'MAXIMIZE_CONVERSIONS',
    target_google_search: true,
    target_search_network: true,
    target_content_network: false,
    start_date: '',
    end_date: '',
    ad_group_name: 'Ad Group 1',
    ad_group_cpc_bid_micros: '',
    // PMAX
    final_urls: '',
    business_name: '',
    headlines: [''] as string[],
    long_headlines: [''] as string[],
    descriptions: [''] as string[],
    // Images
    images_landscape: [] as File[],
    images_square: [] as File[],
    images_logo: [] as File[],
    images_portrait: [] as File[],
    images_landscape_logo: [] as File[],
    // Videos + extras
    youtube_urls: [] as string[],
    call_to_action: '',
    display_url_path1: '',
    display_url_path2: '',
    // Sitelinks
    sitelinks: [] as Array<{ text: string; url: string; description1: string; description2: string }>,
    // Targeting
    locations: [] as string[],
    languages: [] as string[],
    search_themes: '' as string,
    url_expansion_opt_out: false,
    // Shopping / Merchant Center
    merchant_center_id: '',
    // Acquisition mode: '' (default) | 'BID_HIGHER' (prioriza nuevos) | 'TARGET_ALL_EQUALLY' | 'BID_ONLY'
    acquisition_mode: '' as string,
    // Audience signal generado con AI (demografia)
    // Audience signals — hasta 5. Cada item es un spec: AI-gen demographics, Audience existente o UserList existente.
    audience_signals: [] as Array<{
      name?: string;
      description?: string;
      age_ranges?: string[];
      genders?: string[];
      parental_statuses?: string[];
      income_ranges?: string[];
      reasoning?: string;
      existing_audience_resource?: string;
      existing_user_list_resource?: string;
      existing_label?: string; // texto humano para preview
      kind: 'ai' | 'audience' | 'user_list'; // discriminador
    }>,
    // User intent — prompt libre que alimenta a TODOS los AI recomendadores
    user_intent: '' as string,
    // Productos del Merchant Center seleccionados (SKUs) — solo los que van a la campaña
    selected_product_ids: [] as string[],
  });
  const [budgetOptions, setBudgetOptions] = useState<any>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [merchantCenters, setMerchantCenters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [merchantLoading, setMerchantLoading] = useState(false);

  // AI image generation
  const [aiImageLoading, setAiImageLoading] = useState<Record<string, boolean>>({});
  const [aiImagePreviews, setAiImagePreviews] = useState<Record<string, string>>({});
  const [searchThemesAiLoading, setSearchThemesAiLoading] = useState(false);
  const [prevAdImageUrls, setPrevAdImageUrls] = useState<string[]>([]);
  const [audienceAiLoading, setAudienceAiLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; title: string; image_url?: string | null; price?: number | null; sku?: string | null; category?: string | null; product_type?: string | null; availability?: string | null; status?: string | null }>>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [productAiLoading, setProductAiLoading] = useState(false);
  const [savedAudiences, setSavedAudiences] = useState<Array<{ resource_name: string; name: string; kind: 'audience' | 'user_list'; description?: string | null; type?: string; size?: string | null }>>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [hasCustomerMatch, setHasCustomerMatch] = useState<boolean | null>(null);

  // ─── Fetch campaigns ──────────────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callApi('manage-google-campaign', {
      body: { action: 'list_details', connection_id: connectionId },
    });

    if (error) {
      toast.error('Error cargando campanas: ' + error);
      setLoading(false);
      return;
    }

    setCampaigns(data?.campaigns || []);
    setLoading(false);
  }, [connectionId]);

  useEffect(() => {
    fetchCampaigns();
    // Check write access
    callApi('manage-google-campaign', {
      body: { action: 'check_write_access', connection_id: connectionId },
    }).then(({ data }) => {
      setHasWriteAccess(data?.has_write_access ?? true);
    });
  }, [fetchCampaigns, connectionId]);

  // Pre-fetch audiences + user_lists del account al abrir el wizard PMAX
  // Necesario para mostrar advertencia de Customer Match ANTES de que el user elija acquisition_mode.
  useEffect(() => {
    if (!wizardOpen || wizardData.channel_type !== 'PERFORMANCE_MAX') return;
    if (hasCustomerMatch !== null) return; // ya se chequeó esta sesión
    let cancelled = false;
    (async () => {
      try {
        const { data } = await callApi('manage-google-campaign', {
          body: { action: 'list_audiences', connection_id: connectionId },
        });
        if (cancelled) return;
        const aud = Array.isArray(data?.audiences) ? data.audiences : [];
        const uls = Array.isArray(data?.user_lists) ? data.user_lists : [];
        setSavedAudiences([...aud, ...uls]);
        setHasCustomerMatch(!!data?.has_customer_match);
      } catch (err) {
        console.warn('[GoogleCampaignManager] audiences prefetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, wizardData.channel_type, connectionId, hasCustomerMatch]);

  // Pre-fetch ads Google anteriores del cliente (image assets) al abrir el wizard PMAX
  // Se usan como referencia visual para que las imagenes AI sean coherentes con la marca
  useEffect(() => {
    if (!wizardOpen || wizardData.channel_type !== 'PERFORMANCE_MAX') return;
    if (prevAdImageUrls.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await callApi('manage-google-campaign', {
          body: { action: 'list_image_assets', connection_id: connectionId, data: { limit: 10 } },
        });
        if (cancelled) return;
        if (error) {
          console.warn('[GoogleCampaignManager] list_image_assets error:', error);
          toast.info('No se pudieron cargar anuncios anteriores de Google (permiso limitado). Las imágenes AI usarán solo logo y producto como referencia.');
          return;
        }
        const assets: Array<{ url?: string }> = data?.assets || [];
        const urls = assets.map(a => a.url).filter((u): u is string => typeof u === 'string' && u.length > 0);
        if (urls.length > 0) setPrevAdImageUrls(urls.slice(0, 5));
      } catch (err) {
        console.warn('[GoogleCampaignManager] Failed to prefetch prev ad images:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, wizardData.channel_type, connectionId, prevAdImageUrls.length]);

  // Auto-cargar logo del brief en Step 4 (PMAX) si el slot está vacío
  useEffect(() => {
    if (!wizardOpen || wizardStep !== 4) return;
    if (wizardData.channel_type !== 'PERFORMANCE_MAX') return;
    if (wizardData.images_logo.length > 0) return;
    if (!clientId) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: assetRow } = await supabase
          .from('client_assets')
          .select('url, nombre')
          .eq('client_id', clientId)
          .eq('tipo', 'logo')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || !assetRow?.url) return;
        const resp = await fetch(assetRow.url, { signal: AbortSignal.timeout(15_000) });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const filename = assetRow.nombre || 'logo-brief.png';
        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        if (cancelled) return;
        setWizardData(prev => prev.images_logo.length > 0 ? prev : { ...prev, images_logo: [file] });
        toast.success('Logo del brief cargado automáticamente');
      } catch (err) {
        console.warn('[GoogleCampaignManager] Auto-load logo failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, wizardStep, wizardData.channel_type, wizardData.images_logo.length, clientId]);

  // ─── Handlers ──────────────────────────────────────────────────────

  const handlePauseResume = async (campaign: Campaign) => {
    const action = campaign.status === 'ENABLED' ? 'pause' : 'resume';
    const label = action === 'pause' ? 'Pausando' : 'Reanudando';

    setActionLoading(prev => ({ ...prev, [campaign.id]: true }));

    // Optimistic update
    setCampaigns(prev =>
      prev.map(c =>
        c.id === campaign.id
          ? { ...c, status: action === 'pause' ? 'PAUSED' : 'ENABLED' }
          : c
      )
    );

    const { error } = await callApi('manage-google-campaign', {
      body: { action, connection_id: connectionId, campaign_id: campaign.id },
    });

    setActionLoading(prev => ({ ...prev, [campaign.id]: false }));

    if (error) {
      toast.error(`Error ${label.toLowerCase()}: ${error}`);
      setCampaigns(prev =>
        prev.map(c =>
          c.id === campaign.id ? { ...c, status: campaign.status } : c
        )
      );
      return;
    }

    toast.success(`Campana ${action === 'pause' ? 'pausada' : 'reanudada'}`);
  };

  const handleRemoveCampaign = (campaign: Campaign) => {
    // Abre el Dialog de confirmación — la acción real corre en confirmRemoveCampaign.
    setDeleteCampaignTarget(campaign);
  };

  const confirmRemoveCampaign = async () => {
    const campaign = deleteCampaignTarget;
    if (!campaign) return;

    setDeleteCampaignLoading(true);
    setActionLoading(prev => ({ ...prev, [campaign.id]: true }));

    const { error } = await callApi('manage-google-campaign', {
      body: { action: 'remove', connection_id: connectionId, campaign_id: campaign.id },
    });

    setActionLoading(prev => ({ ...prev, [campaign.id]: false }));
    setDeleteCampaignLoading(false);

    if (error) {
      toast.error(`Error eliminando campaña: ${error}`);
      return;
    }

    toast.success(`Campaña "${campaign.name}" eliminada`);
    // Remover del estado local — ya no debería aparecer en futuros fetches (filtro status != REMOVED).
    setCampaigns(prev => prev.filter(c => c.id !== campaign.id));
    if (expandedCampaign === campaign.id) setExpandedCampaign(null);
    setDeleteCampaignTarget(null);
  };

  const openBudgetDialog = (campaign: Campaign) => {
    setBudgetCampaign(campaign);
    setNewBudget(campaign.daily_budget_currency.toString());
    setBudgetDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!budgetCampaign || !newBudget) return;
    const parsedBudget = Number(newBudget);
    if (isNaN(parsedBudget) || parsedBudget <= 0) {
      toast.error('El presupuesto debe ser un numero positivo');
      return;
    }

    setBudgetSaving(true);
    try {
      const { error } = await callApi('manage-google-campaign', {
        body: {
          action: 'update_budget',
          connection_id: connectionId,
          campaign_id: budgetCampaign.id,
          data: { daily_budget: parsedBudget },
        },
      });

      if (error) {
        toast.error('Error actualizando presupuesto: ' + error);
        return;
      }

      toast.success('Presupuesto actualizado');
      setBudgetDialogOpen(false);
      fetchCampaigns();
    } finally {
      setBudgetSaving(false);
    }
  };

  // Settings
  const openSettings = async (campaign: Campaign) => {
    setSettingsCampaign(campaign);
    setSettingsLoading(true);

    const { data, error } = await callApi('manage-google-campaign', {
      body: { action: 'get_settings', connection_id: connectionId, campaign_id: campaign.id },
    });

    setSettingsLoading(false);

    if (error) {
      toast.error('Error cargando settings: ' + error);
      setSettingsCampaign(null);
      return;
    }

    // Surface warnings del backend (ej: schedule query falló)
    const warns = (data as any)?.warnings;
    if (Array.isArray(warns)) {
      warns.forEach((w: string) => toast.warning(w));
    }

    const s = data?.settings || {};
    // Extraer IDs desde los recursos geoTargetConstants/{id} y languageConstants/{id}
    const locationIds = Array.isArray(s.locations)
      ? s.locations
          .filter((l: any) => !l.negative)
          .map((l: any) => String(l.geo_target_constant || '').split('/').pop())
          .filter(Boolean)
      : [];
    const languageIds = Array.isArray(s.languages)
      ? s.languages.map((l: any) => String(l.language_constant || '').split('/').pop()).filter(Boolean)
      : [];
    setSettingsData({
      ...s,
      // UI-friendly: target_cpa en moneda account (no micros)
      target_cpa_micros: s.target_cpa_micros ? Number(s.target_cpa_micros) / 1_000_000 : '',
      target_roas: s.target_roas ? Number(s.target_roas) : '',
      selected_location_ids: locationIds,
      selected_language_ids: languageIds,
      __originalLocationIds: locationIds,
      __originalLanguageIds: languageIds,
    });
  };

  const handleSaveSettings = async () => {
    if (!settingsCampaign || !settingsData) return;

    // Validación frontend: TARGET_CPA y TARGET_ROAS requieren valor > 0.
    const bidType = settingsData.bidding_strategy_type;
    if (bidType === 'TARGET_CPA') {
      const cpa = Number(settingsData.target_cpa_micros);
      if (!Number.isFinite(cpa) || cpa <= 0) {
        toast.error('CPA objetivo requerido (> 0) para estrategia CPA objetivo');
        return;
      }
    }
    if (bidType === 'TARGET_ROAS') {
      const roas = Number(settingsData.target_roas);
      if (!Number.isFinite(roas) || roas <= 0) {
        toast.error('ROAS objetivo requerido (> 0) para estrategia ROAS objetivo');
        return;
      }
    }

    setSettingsSaving(true);

    // Construir payload update_settings solo con campos que aplican según bid strategy.
    // network_settings solo es editable en SEARCH (PMAX/SHOPPING/DISPLAY los rechaza).
    const isSearch = settingsData.channel_type === 'SEARCH';
    const settingsPayload: Record<string, any> = {
      status: settingsData.status,
      bidding_strategy_type: bidType,
      start_date: settingsData.start_date || undefined,
      end_date: settingsData.end_date === '' ? null : settingsData.end_date,
    };
    if (isSearch) {
      settingsPayload.network_settings = {
        target_google_search: settingsData.target_google_search,
        target_search_network: settingsData.target_search_network,
        target_content_network: settingsData.target_content_network,
        target_partner_search_network: settingsData.target_partner_search_network,
      };
    }
    if (bidType === 'TARGET_CPA' || bidType === 'MAXIMIZE_CONVERSIONS') {
      if (settingsData.target_cpa_micros !== undefined && settingsData.target_cpa_micros !== '') {
        settingsPayload.target_cpa_micros = Math.round(Number(settingsData.target_cpa_micros) * 1_000_000);
      }
    }
    if (bidType === 'TARGET_ROAS' || bidType === 'MAXIMIZE_CONVERSION_VALUE') {
      if (settingsData.target_roas !== undefined && settingsData.target_roas !== '') {
        settingsPayload.target_roas = Number(settingsData.target_roas);
      }
    }
    if (bidType === 'MANUAL_CPC') {
      settingsPayload.enhanced_cpc_enabled = !!settingsData.enhanced_cpc_enabled;
    }

    // Best-effort sequential saves. Tracking qué quedó guardado vs falló
    // para reportar al user un toast claro en vez de "error" genérico.
    const results: Array<{ step: string; ok: boolean; error?: string }> = [];

    const { error: settingsError } = await callApi('manage-google-campaign', {
      body: {
        action: 'update_settings',
        connection_id: connectionId,
        campaign_id: settingsCampaign.id,
        data: settingsPayload,
      },
    });
    results.push({ step: 'Configuración', ok: !settingsError, error: settingsError || undefined });

    // Locations + Languages via update_criteria (diff-apply).
    // Intentamos ambos aunque uno falle, para que el user vea el estado completo.
    const originalLocationIds: string[] = settingsData.__originalLocationIds || [];
    const originalLanguageIds: string[] = settingsData.__originalLanguageIds || [];
    const desiredLocationIds: string[] = settingsData.selected_location_ids || [];
    const desiredLanguageIds: string[] = settingsData.selected_language_ids || [];
    const locationsChanged =
      originalLocationIds.length !== desiredLocationIds.length ||
      originalLocationIds.some(id => !desiredLocationIds.includes(id));
    const languagesChanged =
      originalLanguageIds.length !== desiredLanguageIds.length ||
      originalLanguageIds.some(id => !desiredLanguageIds.includes(id));

    if (locationsChanged) {
      const { error } = await callApi('manage-google-campaign', {
        body: {
          action: 'update_criteria',
          connection_id: connectionId,
          campaign_id: settingsCampaign.id,
          data: { criterion_type: 'LOCATION', ids: desiredLocationIds },
        },
      });
      results.push({ step: 'Ubicaciones', ok: !error, error: error || undefined });
    }
    if (languagesChanged) {
      const { error } = await callApi('manage-google-campaign', {
        body: {
          action: 'update_criteria',
          connection_id: connectionId,
          campaign_id: settingsCampaign.id,
          data: { criterion_type: 'LANGUAGE', ids: desiredLanguageIds },
        },
      });
      results.push({ step: 'Idiomas', ok: !error, error: error || undefined });
    }

    setSettingsSaving(false);

    // Reportar resultado granular
    const failed = results.filter(r => !r.ok);
    const succeeded = results.filter(r => r.ok);
    if (failed.length === 0) {
      toast.success('Configuración actualizada');
      setSettingsCampaign(null);
      fetchCampaigns();
      return;
    }
    if (succeeded.length === 0) {
      toast.error(`Error: ${failed.map(f => `${f.step} (${f.error})`).join(', ')}`);
      return;
    }
    // Algunos OK, algunos fallaron — dejar el dialog abierto para retry del user.
    toast.warning(
      `Guardado parcial — OK: ${succeeded.map(s => s.step).join(', ')}. Falló: ${failed.map(f => `${f.step} (${f.error})`).join(', ')}`,
      { duration: 10_000 }
    );
    fetchCampaigns();
  };

  // Toggle expansión — branch por tipo: PMAX → asset groups, el resto → ad groups
  const toggleAdGroups = async (campaignId: string) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      return;
    }

    setExpandedCampaign(campaignId);

    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) {
      // Race: campaigns se limpió entre el click y el handler.
      setExpandedCampaign(null);
      return;
    }
    const isPmax = campaign.channel_type === 'PERFORMANCE_MAX';

    if (isPmax) {
      // PMAX: pedir asset groups ya filtrados server-side por campaign_id (GAQL).
      if (!assetGroupsByCampaign[campaignId]) {
        setAssetGroupsLoading(prev => ({ ...prev, [campaignId]: true }));
        const { data, error } = await callApi('manage-google-pmax', {
          body: { action: 'list_asset_groups', connection_id: connectionId, campaign_id: campaignId },
        });
        setAssetGroupsLoading(prev => ({ ...prev, [campaignId]: false }));

        if (error) {
          toast.error('Error cargando asset groups: ' + error);
          return;
        }
        setAssetGroupsByCampaign(prev => ({ ...prev, [campaignId]: data?.asset_groups || [] }));
      }
      return;
    }

    // No-PMAX: lógica original de ad_groups
    if (!adGroups[campaignId]) {
      setAdGroupsLoading(prev => ({ ...prev, [campaignId]: true }));
      const { data, error } = await callApi('manage-google-campaign', {
        body: { action: 'list_ad_groups', connection_id: connectionId, campaign_id: campaignId },
      });
      setAdGroupsLoading(prev => ({ ...prev, [campaignId]: false }));

      if (error) {
        toast.error('Error cargando ad groups: ' + error);
        return;
      }
      setAdGroups(prev => ({ ...prev, [campaignId]: data?.ad_groups || [] }));
    }
  };

  // Acciones sobre asset groups PMAX (pause / delete) desde la sub-row de Campañas.
  // El backend acepta status: ENABLED/PAUSED/REMOVED via update_asset_group.
  const refreshAssetGroupsForCampaign = async (campaignId: string) => {
    const { data, error } = await callApi('manage-google-pmax', {
      body: { action: 'list_asset_groups', connection_id: connectionId, campaign_id: campaignId },
    });
    if (error) return;
    setAssetGroupsByCampaign(prev => ({ ...prev, [campaignId]: data?.asset_groups || [] }));
  };

  const handleAssetGroupToggleStatus = async (campaignId: string, ag: { id: string; status: string; name: string }) => {
    const nextStatus = ag.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    setAssetGroupActionLoading(prev => ({ ...prev, [ag.id]: true }));
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'update_asset_group',
        connection_id: connectionId,
        asset_group_id: ag.id,
        data: { status: nextStatus },
      },
    });
    setAssetGroupActionLoading(prev => ({ ...prev, [ag.id]: false }));
    if (error) { toast.error('Error: ' + error); return; }
    toast.success(nextStatus === 'PAUSED' ? 'Grupo de recursos pausado' : 'Grupo de recursos activado');
    await refreshAssetGroupsForCampaign(campaignId);
  };

  const handleAssetGroupDelete = (campaignId: string, ag: { id: string; name: string }) => {
    setDeleteAgTarget({ campaignId, id: ag.id, name: ag.name });
  };

  const confirmAssetGroupDelete = async () => {
    if (!deleteAgTarget) return;
    const { campaignId, id, name } = deleteAgTarget;
    setDeleteAgLoading(true);
    setAssetGroupActionLoading(prev => ({ ...prev, [id]: true }));
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'remove_asset_group',
        connection_id: connectionId,
        asset_group_id: id,
      },
    });
    setAssetGroupActionLoading(prev => ({ ...prev, [id]: false }));
    setDeleteAgLoading(false);
    if (error) {
      toast.error(`Error eliminando "${name}": ` + error);
      return;
    }
    toast.success('Grupo de recursos eliminado');
    setDeleteAgTarget(null);
    await refreshAssetGroupsForCampaign(campaignId);
  };

  const handleAdGroupPauseResume = async (ag: AdGroup) => {
    const action = ag.status === 'ENABLED' ? 'pause_ad_group' : 'enable_ad_group';

    const { error } = await callApi('manage-google-campaign', {
      body: { action, connection_id: connectionId, ad_group_id: ag.id },
    });

    if (error) {
      toast.error('Error: ' + error);
      return;
    }

    toast.success(`Ad group ${action === 'pause_ad_group' ? 'pausado' : 'activado'}`);
    // Refresh
    setAdGroups(prev => {
      const copy = { ...prev };
      delete copy[expandedCampaign!];
      return copy;
    });
    if (expandedCampaign) toggleAdGroups(expandedCampaign);
  };

  const handleCreateAdGroup = async () => {
    if (!createAdGroupCampaignId || !newAdGroupName) return;

    setCreateAdGroupLoading(true);
    const { error } = await callApi('manage-google-campaign', {
      body: {
        action: 'create_ad_group',
        connection_id: connectionId,
        campaign_id: createAdGroupCampaignId,
        data: {
          name: newAdGroupName,
          cpc_bid_micros: newAdGroupBid ? Math.round(Number(newAdGroupBid) * 1_000_000) : undefined,
        },
      },
    });

    setCreateAdGroupLoading(false);

    if (error) {
      toast.error('Error creando ad group: ' + error);
      return;
    }

    toast.success('Ad group creado');
    setCreateAdGroupOpen(false);
    setNewAdGroupName('');
    setNewAdGroupBid('');

    // Refresh
    setAdGroups(prev => {
      const copy = { ...prev };
      delete copy[createAdGroupCampaignId!];
      return copy;
    });
    if (expandedCampaign === createAdGroupCampaignId) {
      toggleAdGroups(createAdGroupCampaignId);
    }
  };

  // Create campaign wizard
  const handleCreateCampaign = async () => {
    if (!wizardData.name || !wizardData.daily_budget) {
      toast.error('Nombre y presupuesto son requeridos');
      return;
    }

    setWizardLoading(true);
    setWizardProgress('Creando campana...');

    const payload: Record<string, any> = {
      name: wizardData.name,
      daily_budget: Number(wizardData.daily_budget),
      channel_type: wizardData.channel_type,
      bid_strategy: wizardData.bid_strategy,
      target_google_search: wizardData.target_google_search,
      target_search_network: wizardData.target_search_network,
      target_content_network: wizardData.target_content_network,
      start_date: wizardData.start_date || undefined,
      end_date: wizardData.end_date || undefined,
      ad_group_name: wizardData.ad_group_name || 'Ad Group 1',
    };

    // Location targeting
    if (wizardData.locations.length > 0) {
      payload.locations = wizardData.locations;
    }

    // Language targeting
    if (wizardData.languages.length > 0) {
      payload.languages = wizardData.languages;
    }

    if (wizardData.ad_group_cpc_bid_micros) {
      payload.ad_group_cpc_bid_micros = Math.round(Number(wizardData.ad_group_cpc_bid_micros) * 1_000_000);
    }

    // PMAX-specific
    if (wizardData.channel_type === 'PERFORMANCE_MAX') {
      payload.final_urls = wizardData.final_urls ? [wizardData.final_urls] : [];
      payload.business_name = wizardData.business_name || undefined;
      payload.headlines = wizardData.headlines.filter(h => h.trim());
      payload.long_headlines = wizardData.long_headlines.filter(h => h.trim());
      payload.descriptions = wizardData.descriptions.filter(d => d.trim());
      if (wizardData.call_to_action) payload.call_to_action = wizardData.call_to_action;
      if (wizardData.display_url_path1) payload.display_url_path1 = wizardData.display_url_path1;
      if (wizardData.display_url_path2) payload.display_url_path2 = wizardData.display_url_path2;
      if (wizardData.url_expansion_opt_out) payload.url_expansion_opt_out = true;
      if (wizardData.merchant_center_id) payload.merchant_center_id = wizardData.merchant_center_id;

      // Sitelinks
      const validSitelinks = wizardData.sitelinks.filter(sl => sl.text.trim() && sl.url.trim());
      if (validSitelinks.length > 0) payload.sitelinks = validSitelinks;

      // Search themes: split por \n (newline) para preservar comas dentro de themes legítimos.
      // Fallback a coma si el user pegó una lista comma-separated (retrocompat).
      if (wizardData.search_themes) {
        const raw = wizardData.search_themes;
        const separator = raw.includes('\n') ? '\n' : ',';
        payload.search_themes = raw.split(separator).map(t => t.trim()).filter(Boolean);
      }

      // Acquisition mode (Capa 1: clientes nuevos vs todos)
      if (wizardData.acquisition_mode) {
        payload.acquisition_mode = wizardData.acquisition_mode;
      }

      // Audience signals (array de hasta 5)
      if (wizardData.audience_signals.length > 0) {
        payload.audience_signals = wizardData.audience_signals;
      }

      // Productos seleccionados (PMAX Shopping) — Google Ads filtra a este subset
      if (wizardData.selected_product_ids.length > 0) {
        payload.selected_product_ids = wizardData.selected_product_ids;
      }

      // Convert images to base64 for single-batch creation (Google requires all assets together)
      setWizardProgress('Procesando imagenes...');
      const imageAssets: Array<{ data: string; field_type: string; name: string }> = [];
      const allFiles = [
        ...wizardData.images_landscape.map(f => ({ file: f, field_type: 'MARKETING_IMAGE' })),
        ...wizardData.images_square.map(f => ({ file: f, field_type: 'SQUARE_MARKETING_IMAGE' })),
        ...wizardData.images_logo.map(f => ({ file: f, field_type: 'LOGO' })),
        ...wizardData.images_portrait.map(f => ({ file: f, field_type: 'PORTRAIT_MARKETING_IMAGE' })),
        ...wizardData.images_landscape_logo.map(f => ({ file: f, field_type: 'LANDSCAPE_LOGO' })),
      ];
      for (const { file, field_type } of allFiles) {
        try {
          const data = await fileToBase64(file);
          imageAssets.push({ data, field_type, name: file.name });
        } catch {
          toast.error(`Error procesando ${file.name}`);
        }
      }
      if (imageAssets.length > 0) payload.image_assets = imageAssets;
      if (wizardData.youtube_urls.length > 0) payload.youtube_video_ids = wizardData.youtube_urls;

      setWizardProgress('Creando campana con assets...');
    }

    // Shopping
    if (wizardData.channel_type === 'SHOPPING') {
      payload.merchant_center_id = wizardData.merchant_center_id || undefined;
    }

    const { data: createResp, error } = await callApi('manage-google-campaign', {
      body: {
        action: 'create_campaign',
        connection_id: connectionId,
        data: payload,
      },
    });

    if (error) {
      toast.error('Error creando campana: ' + error);
      setWizardLoading(false);
      setWizardProgress('');
      return;
    }

    toast.success('Campana creada en estado PAUSADA');
    const warnings = Array.isArray(createResp?.warnings) ? createResp.warnings : [];
    for (const w of warnings) {
      if (typeof w === 'string' && w.trim()) toast.warning(w, { duration: 10_000 });
    }

    setWizardLoading(false);
    setWizardProgress('');
    setWizardOpen(false);
    setWizardStep(1);
    setWizardData({
      name: '', channel_type: 'SEARCH', daily_budget: '', bid_strategy: 'MAXIMIZE_CONVERSIONS',
      target_google_search: true, target_search_network: true, target_content_network: false,
      start_date: '', end_date: '', ad_group_name: 'Ad Group 1', ad_group_cpc_bid_micros: '',
      final_urls: '', business_name: '', headlines: [''], long_headlines: [''], descriptions: [''],
      images_landscape: [], images_square: [], images_logo: [],
      images_portrait: [], images_landscape_logo: [],
      youtube_urls: [], call_to_action: '', display_url_path1: '', display_url_path2: '',
      sitelinks: [], locations: [], languages: [],
      search_themes: '', url_expansion_opt_out: false,
      merchant_center_id: '',
      acquisition_mode: '', audience_signals: [],
      user_intent: '', selected_product_ids: [],
    });
    setBudgetOptions(null);
    fetchCampaigns();
  };

  const fetchBudgetRecommendation = async () => {
    setBudgetLoading(true);
    setBudgetOptions(null);
    const themesSeparator = wizardData.search_themes.includes('\n') ? '\n' : ',';
    const themes = wizardData.search_themes
      ? wizardData.search_themes.split(themesSeparator).map(t => t.trim()).filter(Boolean)
      : [];
    const { data, error } = await callApi('manage-google-campaign', {
      body: {
        action: 'get_budget_recommendation',
        connection_id: connectionId,
        data: { channel_type: wizardData.channel_type, search_themes: themes, client_id: clientId, user_intent: wizardData.user_intent },
      },
    });
    setBudgetLoading(false);
    if (error) {
      toast.error('Error obteniendo recomendacion: ' + error);
      return;
    }
    setBudgetOptions(data?.options || null);
  };

  const fetchMerchantCenters = async () => {
    setMerchantLoading(true);
    const { data, error } = await callApi('manage-google-campaign', {
      body: { action: 'list_merchant_centers', connection_id: connectionId },
    });
    setMerchantLoading(false);
    if (error) {
      toast.error('Error cargando Merchant Centers: ' + error);
      return;
    }
    setMerchantCenters(data?.merchant_centers || []);
  };

  const handleApplyRecommendation = (rec: any) => {
    if (rec?.bid_strategy) {
      const newBudget = rec.daily_budget ? String(rec.daily_budget) : null;
      setWizardData(prev => {
        const prevBudget = prev.daily_budget;
        const budgetToApply = newBudget || prevBudget;
        if (newBudget && prevBudget && newBudget !== prevBudget) {
          toast.info(`Budget ajustado: $${prevBudget} → $${newBudget} (bid strategy ${rec.bid_strategy})`, { duration: 6_000 });
        } else {
          toast.success(`Steve aplicó: ${rec.bid_strategy}${budgetToApply ? ` con presupuesto $${budgetToApply}` : ''}`);
        }
        return { ...prev, bid_strategy: rec.bid_strategy, daily_budget: budgetToApply };
      });
    }
  };

  const handleApplyPmaxRecommendation = (rec: any) => {
    if (rec?.headlines || rec?.long_headlines || rec?.descriptions) {
      setWizardData(prev => ({
        ...prev,
        headlines: rec.headlines?.length
          ? rec.headlines.slice(0, 15).map((h: string) => h.slice(0, 30))
          : prev.headlines,
        long_headlines: rec.long_headlines?.length
          ? rec.long_headlines.slice(0, 5).map((h: string) => h.slice(0, 90))
          : prev.long_headlines,
        descriptions: rec.descriptions?.length
          ? rec.descriptions.slice(0, 5).map((d: string) => d.slice(0, 90))
          : prev.descriptions,
      }));
      toast.success('Assets de Steve aplicados (basados en tu brief)');
    }
  };

  const handleApplyCampaignName = (rec: any) => {
    if (rec?.name) {
      setWizardData(prev => ({ ...prev, name: rec.name.slice(0, 128) }));
      toast.success('Nombre de campaña aplicado');
    }
  };

  const handleApplyTargeting = (rec: any) => {
    const validLocationIds = locationOptions.map(l => l.id);
    const validLanguageIds = languageOptions.map(l => l.id);
    const newLocations = (rec?.locations || [])
      .map((l: any) => l.id)
      .filter((id: string) => validLocationIds.includes(id));
    const newLanguages = (rec?.languages || [])
      .map((l: any) => l.id)
      .filter((id: string) => validLanguageIds.includes(id));
    if (newLocations.length > 0 || newLanguages.length > 0) {
      setWizardData(prev => ({
        ...prev,
        locations: newLocations.length > 0 ? newLocations : prev.locations,
        languages: newLanguages.length > 0 ? newLanguages : prev.languages,
      }));
      toast.success('Segmentación de Steve aplicada');
    }
  };

  const handleApplyCtaSitelinks = (rec: any) => {
    const updates: Partial<typeof wizardData> = {};
    if (rec?.call_to_action) {
      updates.call_to_action = rec.call_to_action;
    }
    if (rec?.sitelinks?.length) {
      const baseUrl = wizardData.final_urls || '';
      updates.sitelinks = rec.sitelinks.slice(0, 20).map((sl: any) => ({
        text: (sl.text || '').slice(0, 25),
        url: sl.url?.startsWith('http') ? sl.url : (baseUrl + (sl.url || '')),
        description1: (sl.description1 || '').slice(0, 35),
        description2: (sl.description2 || '').slice(0, 35),
      }));
    }
    if (Object.keys(updates).length > 0) {
      setWizardData(prev => ({ ...prev, ...updates }));
      toast.success('CTA y sitelinks de Steve aplicados');
    }
  };

  const generateAiImage = async (format: string, fieldKey: string) => {
    setAiImageLoading(prev => ({ ...prev, [fieldKey]: true }));
    setAiImagePreviews(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });

    const formatPrompts: Record<string, string> = {
      landscape: `Foto publicitaria horizontal panorámica de producto para banner de Google Ads. Negocio: ${wizardData.business_name || 'marca'}. Aspecto ratio 1.91:1, 1200x628px.`,
      square: `Foto publicitaria cuadrada de producto para Google Ads. Negocio: ${wizardData.business_name || 'marca'}. Aspecto ratio 1:1, 1200x1200px.`,
      portrait: `Foto publicitaria vertical de producto para Google Ads móvil. Negocio: ${wizardData.business_name || 'marca'}. Aspecto ratio 4:5, 960x1200px.`,
      logo: `Logo de la marca ${wizardData.business_name || ''}, fondo transparente o blanco, centrado, 1200x1200px, crisp, high-resolution.`,
      landscape_logo: `Logo horizontal de la marca ${wizardData.business_name || ''}, fondo blanco o transparente, 1200x300px, wide format.`,
    };

    // Priorizar imágenes de productos seleccionados (catalog MC enriched con Shopify image_url)
    // Si no hay, caer a prev ads de Google como referencia de estilo.
    const selectedProductImages = catalogProducts
      .filter(p => wizardData.selected_product_ids.includes(p.id) && p.image_url)
      .slice(0, 2)
      .map(p => p.image_url as string);
    const refUrls = selectedProductImages.length > 0
      ? selectedProductImages
      : prevAdImageUrls.slice(0, 2);

    try {
      const { data, error } = await callApi('generate-image', {
        body: {
          clientId,
          promptGeneracion: formatPrompts[format] || formatPrompts.landscape,
          formato: format,
          engine: 'imagen',
          referenceImageUrls: refUrls,
          userIntent: wizardData.user_intent,
        },
      });

      if (error || !data?.asset_url) {
        toast.error('Error generando imagen: ' + (error || 'sin URL'));
        setAiImageLoading(prev => ({ ...prev, [fieldKey]: false }));
        return;
      }

      setAiImagePreviews(prev => ({ ...prev, [fieldKey]: data.asset_url }));
    } catch (err: any) {
      toast.error('Error generando imagen: ' + err.message);
    }
    setAiImageLoading(prev => ({ ...prev, [fieldKey]: false }));
  };

  const acceptAiImage = async (fieldKey: string, wizardField: keyof typeof wizardData) => {
    const url = aiImagePreviews[fieldKey];
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const fileName = `ai-${fieldKey}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      setWizardData(prev => ({
        ...prev,
        [wizardField]: [...(prev[wizardField] as File[]), file],
      }));
      setAiImagePreviews(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
      toast.success('Imagen AI agregada');
    } catch {
      toast.error('Error descargando imagen generada');
    }
  };

  const generateAllAiImages = async () => {
    const formats = [
      { format: 'landscape', key: 'ai_landscape', field: 'images_landscape' as const },
      { format: 'square', key: 'ai_square', field: 'images_square' as const },
      { format: 'portrait', key: 'ai_portrait', field: 'images_portrait' as const },
    ];
    await Promise.all(formats.map(f => generateAiImage(f.format, f.key)));
  };

  const loadCatalogProducts = async () => {
    setCatalogLoading(true);
    try {
      const { data, error } = await callApi('manage-google-campaign', {
        body: {
          action: 'list_catalog_products',
          connection_id: connectionId,
          data: { merchant_center_id: wizardData.merchant_center_id || undefined },
        },
      });
      if (error) { toast.error('Error cargando productos: ' + error); return; }
      const products = Array.isArray(data?.products) ? data.products : [];
      const source = data?.source || 'unknown';
      setCatalogProducts(products);
      if (products.length === 0) {
        toast.info('No hay productos en el catálogo (el Merchant Center está vacío o no linkeado)');
      } else {
        toast.success(`${products.length} producto(s) cargados desde ${source === 'merchant_center' ? 'Merchant Center' : 'Shopify (fallback)'}`);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setCatalogLoading(false);
    }
  };

  const generateAiProductSelection = async () => {
    if (catalogProducts.length === 0) {
      toast.info('Cargá los productos primero');
      return;
    }
    setProductAiLoading(true);
    try {
      const { data, error } = await callApi('manage-google-campaign', {
        body: {
          action: 'get_recommendations',
          connection_id: connectionId,
          client_id: clientId,
          data: {
            recommendation_type: 'product_selection',
            user_intent: wizardData.user_intent,
            products: catalogProducts.map(p => ({
              id: p.id,
              title: p.title,
              price: p.price,
              category: p.category,
              product_type: p.product_type,
              availability: p.availability,
            })),
          },
        },
      });
      if (error) { toast.error('Error: ' + error); return; }
      const rec = data?.recommendation;
      if (!rec || rec.parse_error) { toast.error('Respuesta AI invalida'); return; }
      const ids: string[] = Array.isArray(rec.selected_product_ids) ? rec.selected_product_ids.map(String) : [];
      setWizardData(prev => ({ ...prev, selected_product_ids: ids }));
      // no-op marker
      const cats = Array.isArray(rec.selected_categories) ? rec.selected_categories.filter((c: any) => typeof c === 'string') : [];
      const catsPart = cats.length > 0 ? ` · Categorías: ${cats.slice(0, 4).join(', ')}${cats.length > 4 ? '…' : ''}` : '';
      toast.success(`${ids.length} producto(s) sugerido(s) por AI${rec.ids_dropped ? ` (${rec.ids_dropped} inválidos descartados)` : ''}${catsPart}`);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setProductAiLoading(false);
    }
  };

  const toggleProduct = (id: string) => {
    setWizardData(prev => {
      const has = prev.selected_product_ids.includes(id);
      if (!has && prev.selected_product_ids.length >= 500) {
        toast.warning('Máximo 500 SKUs por campaña PMAX. Quitá alguno para agregar otro.');
        return prev;
      }
      return { ...prev, selected_product_ids: has ? prev.selected_product_ids.filter(x => x !== id) : [...prev.selected_product_ids, id] };
    });
  };

  const loadSavedAudiences = async () => {
    setAudiencesLoading(true);
    try {
      const { data, error } = await callApi('manage-google-campaign', {
        body: { action: 'list_audiences', connection_id: connectionId },
      });
      if (error) { toast.error('Error cargando audiencias: ' + error); return; }
      const aud = Array.isArray(data?.audiences) ? data.audiences : [];
      const uls = Array.isArray(data?.user_lists) ? data.user_lists : [];
      setSavedAudiences([...aud, ...uls]);
      setHasCustomerMatch(!!data?.has_customer_match);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAudiencesLoading(false);
    }
  };

  // Limpia nombres auto-generados por Google (AssetGroupPersona_281481..._2023-12-21T21:00...) → "AssetGroup #281481..."
  const prettyAudienceName = (raw: string): string => {
    if (!raw) return '(sin nombre)';
    const m = raw.match(/^AssetGroupPersona_(\d+)_\d{4}-\d{2}-\d{2}T/);
    if (m) return `Asset Group #${m[1].slice(-6)}`;
    // Tambien saca timestamps tipo _2023-12-21T... al final
    return raw.replace(/_\d{4}-\d{2}-\d{2}T[\d:.Z]+$/, '');
  };

  const toggleExistingAudience = (aud: { resource_name: string; name: string; kind: 'audience' | 'user_list' }) => {
    setWizardData(prev => {
      const matching = prev.audience_signals.find(s =>
        (s.kind !== 'ai') && (s.existing_audience_resource === aud.resource_name || s.existing_user_list_resource === aud.resource_name)
      );
      if (matching) {
        return { ...prev, audience_signals: prev.audience_signals.filter(s => s !== matching) };
      }
      if (prev.audience_signals.length >= 5) {
        toast.warning('Máximo 5 audience signals por campaña');
        return prev;
      }
      return {
        ...prev,
        audience_signals: [...prev.audience_signals, {
          kind: aud.kind,
          existing_audience_resource: aud.kind === 'audience' ? aud.resource_name : undefined,
          existing_user_list_resource: aud.kind === 'user_list' ? aud.resource_name : undefined,
          existing_label: prettyAudienceName(aud.name),
          name: aud.name,
        }],
      };
    });
  };

  const removeAudienceSignal = (idx: number) => {
    setWizardData(prev => ({ ...prev, audience_signals: prev.audience_signals.filter((_, i) => i !== idx) }));
  };

  const generateAiAudienceSignal = async () => {
    setAudienceAiLoading(true);
    try {
      const { data, error } = await callApi('manage-google-campaign', {
        body: {
          action: 'get_recommendations',
          connection_id: connectionId,
          client_id: clientId,
          data: {
            recommendation_type: 'audience_signals',
            channel_type: wizardData.channel_type,
            context: `Negocio: ${wizardData.business_name || 'Sin nombre'}. URL: ${wizardData.final_urls || 'Sin URL'}`,
            user_intent: wizardData.user_intent,
          },
        },
      });
      if (error) {
        toast.error('Error generando audience signal: ' + error);
        return;
      }
      const rec = data?.recommendation;
      if (!rec || rec.parse_error) {
        toast.error('Respuesta AI invalida');
        return;
      }
      setWizardData(prev => {
        // Reemplazar si ya existía un AI-generated signal (solo 1 AI permitido), dejando los existentes
        const withoutAi = prev.audience_signals.filter(s => s.kind !== 'ai');
        if (withoutAi.length >= 5) {
          toast.warning('Máximo 5 audience signals por campaña — quitá una para generar nueva con AI');
          return prev;
        }
        return {
          ...prev,
          audience_signals: [...withoutAi, {
            kind: 'ai',
            name: rec.name,
            description: rec.description,
            age_ranges: Array.isArray(rec.age_ranges) ? rec.age_ranges : [],
            genders: Array.isArray(rec.genders) ? rec.genders : [],
            parental_statuses: Array.isArray(rec.parental_statuses) ? rec.parental_statuses : [],
            income_ranges: Array.isArray(rec.income_ranges) ? rec.income_ranges : [],
            reasoning: rec.reasoning,
          }],
        };
      });
      toast.success('Audience signal AI generado y agregado');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAudienceAiLoading(false);
    }
  };

  const generateAiSearchThemes = async () => {
    setSearchThemesAiLoading(true);
    try {
      const { data, error } = await callApi('manage-google-campaign', {
        body: {
          action: 'get_recommendations',
          connection_id: connectionId,
          client_id: clientId,
          data: {
            recommendation_type: 'search_themes',
            channel_type: wizardData.channel_type,
            context: `URL: ${wizardData.final_urls || 'Sin URL'}, Negocio: ${wizardData.business_name || 'Sin nombre'}`,
            user_intent: wizardData.user_intent,
          },
        },
      });

      if (error) {
        toast.error('Error generando search themes: ' + error);
        return;
      }

      const themes: string[] = data?.recommendation?.search_themes || [];
      if (!themes.length) {
        toast.error('No se pudieron generar search themes');
        return;
      }
      const applied = themes.slice(0, 25);
      setWizardData(prev => ({ ...prev, search_themes: applied.join(', ') }));
      toast.success(`${applied.length} search themes sugeridos por AI`);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSearchThemesAiLoading(false);
    }
  };

  // Wizard step helpers
  const isPmax = wizardData.channel_type === 'PERFORMANCE_MAX';
  const totalSteps = isPmax ? 6 : 3;

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!wizardData.name.trim() && !!wizardData.daily_budget && Number(wizardData.daily_budget) > 0;
      case 2:
        if (isPmax) return !!wizardData.final_urls.trim() && !!wizardData.business_name.trim();
        if (wizardData.channel_type === 'SHOPPING') return !!wizardData.merchant_center_id.trim();
        return true;
      case 3:
        if (isPmax) {
          const validHeadlines = wizardData.headlines.filter(h => h.trim()).length;
          const validLongHeadlines = wizardData.long_headlines.filter(h => h.trim()).length;
          const validDescriptions = wizardData.descriptions.filter(d => d.trim()).length;
          return validHeadlines >= 3 && validLongHeadlines >= 1 && validDescriptions >= 2;
        }
        return true;
      case 4: // Images PMAX
        return wizardData.images_landscape.length >= 1
          && wizardData.images_square.length >= 1
          && wizardData.images_logo.length >= 1;
      case 5: // Videos + extras — todo opcional
        return true;
      default:
        return true;
    }
  };

  // ─── Sorting / Filtering ──────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filteredCampaigns = campaigns
    .filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Write access warning */}
      {hasWriteAccess === false && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-yellow-700">
            <AlertCircle className="w-4 h-4" />
            Esta cuenta tiene acceso de solo lectura. Contacta al administrador para habilitar permisos de escritura.
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campana..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="ENABLED">Activas</SelectItem>
            <SelectItem value="PAUSED">Pausadas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchCampaigns}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refrescar
        </Button>
        {hasWriteAccess !== false && (
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Crear Campana
          </Button>
        )}
      </div>

      {/* Campaigns table */}
      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {campaigns.length === 0
              ? 'No se encontraron campanas en esta cuenta'
              : 'Ninguna campana coincide con los filtros'}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-8 p-3" />
                <th className="text-left p-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-primary" onClick={() => handleSort('name')}>
                    Nombre <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left p-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-primary" onClick={() => handleSort('status')}>
                    Estado <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left p-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-primary" onClick={() => handleSort('channel_type')}>
                    Canal <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right p-3 font-medium">
                  <button className="flex items-center gap-1 ml-auto hover:text-primary" onClick={() => handleSort('daily_budget_clp')}>
                    Budget Diario <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map(campaign => (
                <Fragment key={campaign.id}>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <button onClick={() => toggleAdGroups(campaign.id)} title={campaign.channel_type === 'PERFORMANCE_MAX' ? 'Ver asset groups' : 'Ver ad groups'}>
                        {expandedCampaign === campaign.id
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        }
                      </button>
                    </td>
                    <td className="p-3 font-medium max-w-[300px] truncate" title={campaign.name}>
                      {campaign.name}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={statusColors[campaign.status] || ''}>
                        {campaign.status === 'ENABLED' ? 'Activa' : campaign.status === 'PAUSED' ? 'Pausada' : campaign.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {channelLabels[campaign.channel_type] || campaign.channel_type}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${campaign.daily_budget_clp.toLocaleString('es-CL')} CLP
                      {campaign.currency !== 'CLP' && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({campaign.currency} {campaign.daily_budget_currency.toLocaleString()})
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {hasWriteAccess !== false && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={actionLoading[campaign.id]}
                              onClick={() => handlePauseResume(campaign)}
                              title={campaign.status === 'ENABLED' ? 'Pausar' : 'Reanudar'}
                            >
                              {actionLoading[campaign.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : campaign.status === 'ENABLED' ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openBudgetDialog(campaign)}
                              title="Editar presupuesto"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openSettings(campaign)}
                              title="Configuracion"
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              disabled={actionLoading[campaign.id]}
                              onClick={() => handleRemoveCampaign(campaign)}
                              title="Eliminar campaña"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Asset Groups sub-row (PMAX) */}
                  {expandedCampaign === campaign.id && campaign.channel_type === 'PERFORMANCE_MAX' && (
                    <tr key={`${campaign.id}-pmax`}>
                      <td colSpan={6} className="bg-muted/20 px-6 py-3">
                        {assetGroupsLoading[campaign.id] ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando asset groups...
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Grupos de recursos ({(assetGroupsByCampaign[campaign.id] || []).length})
                              </span>
                              {hasWriteAccess !== false && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setCreateAgCampaignId(campaign.id);
                                    setCreateAgOpen(true);
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Crear Grupo de recursos
                                </Button>
                              )}
                            </div>
                            {(assetGroupsByCampaign[campaign.id] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Sin grupos de recursos. Creá uno con el botón de arriba.
                              </p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-1 font-medium">Nombre</th>
                                    <th className="text-left py-1 font-medium">Estado</th>
                                    <th className="text-left py-1 font-medium">Calidad (Google)</th>
                                    {hasWriteAccess !== false && (
                                      <th className="text-right py-1 font-medium">Acc</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(assetGroupsByCampaign[campaign.id] || []).map(ag => {
                                    const strengthClass =
                                      ag.ad_strength === 'EXCELLENT' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                      ag.ad_strength === 'GOOD' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                      ag.ad_strength === 'AVERAGE' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                      ag.ad_strength === 'POOR' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                                      'bg-gray-500/10 text-gray-500 border-gray-500/20';
                                    const strengthLabel =
                                      ag.ad_strength === 'EXCELLENT' ? 'Excelente' :
                                      ag.ad_strength === 'GOOD' ? 'Buena' :
                                      ag.ad_strength === 'AVERAGE' ? 'Promedio' :
                                      ag.ad_strength === 'POOR' ? 'Pobre' :
                                      'Sin datos';
                                    const actionLoading = !!assetGroupActionLoading[ag.id];
                                    return (
                                      <tr key={ag.id} className="border-b last:border-0">
                                        <td className="py-1.5 truncate max-w-[300px]" title={ag.name}>{ag.name}</td>
                                        <td className="py-1.5">
                                          <Badge variant="outline" className={`text-[10px] ${statusColors[ag.status] || ''}`}>
                                            {ag.status === 'ENABLED' ? 'Activo' : ag.status}
                                          </Badge>
                                        </td>
                                        <td className="py-1.5">
                                          <Badge variant="outline" className={`text-[10px] ${strengthClass}`}>
                                            {strengthLabel}
                                          </Badge>
                                        </td>
                                        {hasWriteAccess !== false && (
                                          <td className="py-1.5 text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                disabled={actionLoading}
                                                onClick={() => handleAssetGroupToggleStatus(campaign.id, ag)}
                                                title={ag.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                                              >
                                                {actionLoading ? (
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : ag.status === 'ENABLED' ? (
                                                  <Pause className="w-3.5 h-3.5" />
                                                ) : (
                                                  <Play className="w-3.5 h-3.5" />
                                                )}
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                                disabled={actionLoading}
                                                onClick={() => handleAssetGroupDelete(campaign.id, ag)}
                                                title="Eliminar"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                            <p className="text-[11px] text-muted-foreground pt-1">
                              Para editar assets (headlines, imágenes, etc.) andá a la tab <span className="font-medium">Grupos de recursos PMAX</span>.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* Ad Groups sub-row */}
                  {expandedCampaign === campaign.id && campaign.channel_type !== 'PERFORMANCE_MAX' && (
                    <tr key={`${campaign.id}-ag`}>
                      <td colSpan={6} className="bg-muted/20 px-6 py-3">
                        {adGroupsLoading[campaign.id] ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando ad groups...
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Ad Groups ({adGroups[campaign.id]?.length || 0})
                              </span>
                              {hasWriteAccess !== false && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setCreateAdGroupCampaignId(campaign.id);
                                    setCreateAdGroupOpen(true);
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Crear Ad Group
                                </Button>
                              )}
                            </div>
                            {(adGroups[campaign.id] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin ad groups</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-1 font-medium">Nombre</th>
                                    <th className="text-left py-1 font-medium">Estado</th>
                                    <th className="text-right py-1 font-medium">CPC Bid</th>
                                    <th className="text-right py-1 font-medium">Impr</th>
                                    <th className="text-right py-1 font-medium">Clicks</th>
                                    <th className="text-right py-1 font-medium">Conv</th>
                                    {hasWriteAccess !== false && (
                                      <th className="text-right py-1 font-medium">Acc</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(adGroups[campaign.id] || []).map(ag => (
                                    <tr key={ag.id} className="border-b last:border-0">
                                      <td className="py-1.5 truncate max-w-[200px]">{ag.name}</td>
                                      <td className="py-1.5">
                                        <Badge variant="outline" className={`text-[10px] ${statusColors[ag.status] || ''}`}>
                                          {ag.status === 'ENABLED' ? 'Activo' : 'Pausado'}
                                        </Badge>
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">
                                        {ag.cpc_bid_micros ? `$${(ag.cpc_bid_micros / 1_000_000).toFixed(2)}` : '-'}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">{ag.impressions.toLocaleString()}</td>
                                      <td className="py-1.5 text-right tabular-nums">{ag.clicks.toLocaleString()}</td>
                                      <td className="py-1.5 text-right tabular-nums">{ag.conversions.toFixed(1)}</td>
                                      {hasWriteAccess !== false && (
                                        <td className="py-1.5 text-right">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleAdGroupPauseResume(ag)}
                                            title={ag.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                                          >
                                            {ag.status === 'ENABLED' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                          </Button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filteredCampaigns.length} campana{filteredCampaigns.length !== 1 ? 's' : ''}
        {statusFilter !== 'ALL' && ` (${statusFilter === 'ENABLED' ? 'activas' : 'pausadas'})`}
      </p>

      {/* ─── Budget Dialog ──────────────────────────────────────────── */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Presupuesto Diario</DialogTitle>
          </DialogHeader>
          {budgetCampaign && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground truncate">{budgetCampaign.name}</p>
              <div className="space-y-2">
                <Label>Nuevo presupuesto diario ({budgetCampaign.currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={newBudget}
                  onChange={e => setNewBudget(e.target.value)}
                  placeholder="Ej: 10000"
                />
                <p className="text-xs text-muted-foreground">
                  Presupuesto actual: {budgetCampaign.currency} {budgetCampaign.daily_budget_currency.toLocaleString()}
                  {budgetCampaign.currency !== 'CLP' && ` (~$${budgetCampaign.daily_budget_clp.toLocaleString('es-CL')} CLP)`}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveBudget} disabled={budgetSaving}>
              {budgetSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Settings Dialog ────────────────────────────────────────── */}
      <Dialog open={!!settingsCampaign} onOpenChange={(open) => { if (!open && !settingsSaving) setSettingsCampaign(null); }}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de Campaña</DialogTitle>
          </DialogHeader>
          {settingsLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando...
            </div>
          ) : settingsData ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground truncate">{settingsCampaign?.name}</p>

              {/* Estado */}
              <div className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <Label className="text-sm">Estado de la campaña</Label>
                  <p className="text-xs text-muted-foreground">Activar o pausar</p>
                </div>
                <Switch
                  checked={settingsData.status === 'ENABLED'}
                  onCheckedChange={val => setSettingsData((p: any) => ({ ...p, status: val ? 'ENABLED' : 'PAUSED' }))}
                />
              </div>

              {/* Bid strategy + targets */}
              <div className="space-y-2">
                <Label>Estrategia de puja</Label>
                <Select
                  value={settingsData.bidding_strategy_type || ''}
                  onValueChange={v => setSettingsData((p: any) => ({ ...p, bidding_strategy_type: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar estrategia" /></SelectTrigger>
                  <SelectContent>
                    {bidStrategies.map(bs => (
                      <SelectItem key={bs.value} value={bs.value}>{bs.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(settingsData.bidding_strategy_type === 'TARGET_CPA' ||
                  settingsData.bidding_strategy_type === 'MAXIMIZE_CONVERSIONS') && (
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">CPA objetivo {settingsData.bidding_strategy_type === 'MAXIMIZE_CONVERSIONS' ? '(opcional)' : ''}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settingsData.target_cpa_micros ?? ''}
                      onChange={e => setSettingsData((p: any) => ({ ...p, target_cpa_micros: e.target.value }))}
                      placeholder="Ej: 15.00 (moneda de la cuenta)"
                    />
                  </div>
                )}
                {(settingsData.bidding_strategy_type === 'TARGET_ROAS' ||
                  settingsData.bidding_strategy_type === 'MAXIMIZE_CONVERSION_VALUE') && (
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">ROAS objetivo {settingsData.bidding_strategy_type === 'MAXIMIZE_CONVERSION_VALUE' ? '(opcional)' : ''}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settingsData.target_roas ?? ''}
                      onChange={e => setSettingsData((p: any) => ({ ...p, target_roas: e.target.value }))}
                      placeholder="Ej: 4.0 (4x retorno)"
                    />
                  </div>
                )}
                {settingsData.bidding_strategy_type === 'MANUAL_CPC' && (
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Enhanced CPC</Label>
                    <Switch
                      checked={!!settingsData.enhanced_cpc_enabled}
                      onCheckedChange={val => setSettingsData((p: any) => ({ ...p, enhanced_cpc_enabled: val }))}
                    />
                  </div>
                )}
              </div>

              {/* Networks: solo SEARCH los acepta todos. PMAX/SHOPPING/DISPLAY son read-only. */}
              {(() => {
                const channel = settingsData.channel_type || '';
                const canEdit = channel === 'SEARCH';
                if (!canEdit) {
                  return (
                    <div className="space-y-2">
                      <Label>Redes</Label>
                      <div className="rounded-md border border-muted bg-muted/20 p-3 text-xs text-muted-foreground">
                        Las redes de {channel || 'esta campaña'} son automáticas y no se pueden editar desde acá.
                        {channel === 'PERFORMANCE_MAX' && ' PMAX combina Search + Display + YouTube + Gmail + Shopping según optimización de Google.'}
                        {channel === 'SHOPPING' && ' Shopping aparece en Search + la pestaña Shopping.'}
                        {channel === 'DISPLAY' && ' Display aparece en la Red de Display de Google.'}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    <Label>Redes</Label>
                    <div className="space-y-2 border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Google Search</span>
                        <Switch
                          checked={settingsData.target_google_search ?? true}
                          onCheckedChange={val => setSettingsData((p: any) => ({ ...p, target_google_search: val }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Red de búsqueda (partners)</span>
                        <Switch
                          checked={settingsData.target_search_network ?? true}
                          onCheckedChange={val => setSettingsData((p: any) => ({ ...p, target_search_network: val }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Red de display</span>
                        <Switch
                          checked={settingsData.target_content_network ?? false}
                          onCheckedChange={val => setSettingsData((p: any) => ({ ...p, target_content_network: val }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Partner search network</span>
                        <Switch
                          checked={settingsData.target_partner_search_network ?? false}
                          onCheckedChange={val => setSettingsData((p: any) => ({ ...p, target_partner_search_network: val }))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Ubicaciones */}
              <div className="space-y-2">
                <Label>Ubicaciones</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                  {locationOptions.map(loc => {
                    const selected = (settingsData.selected_location_ids || []).includes(loc.id);
                    return (
                      <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={e => {
                            setSettingsData((p: any) => {
                              const ids: string[] = p.selected_location_ids || [];
                              const next = e.target.checked ? [...ids, loc.id] : ids.filter(i => i !== loc.id);
                              return { ...p, selected_location_ids: next };
                            });
                          }}
                        />
                        {loc.label}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Agrega o quita países. Se aplica al guardar.</p>
              </div>

              {/* Idiomas */}
              <div className="space-y-2">
                <Label>Idiomas</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                  {languageOptions.map(lang => {
                    const selected = (settingsData.selected_language_ids || []).includes(lang.id);
                    return (
                      <label key={lang.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={e => {
                            setSettingsData((p: any) => {
                              const ids: string[] = p.selected_language_ids || [];
                              const next = e.target.checked ? [...ids, lang.id] : ids.filter(i => i !== lang.id);
                              return { ...p, selected_language_ids: next };
                            });
                          }}
                        />
                        {lang.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fecha de inicio</Label>
                  <Input
                    type="date"
                    value={settingsData.start_date || ''}
                    onChange={e => setSettingsData((p: any) => ({ ...p, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha de fin (opcional)</Label>
                  <Input
                    type="date"
                    value={settingsData.end_date || ''}
                    onChange={e => setSettingsData((p: any) => ({ ...p, end_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsCampaign(null)} disabled={settingsSaving}>Cancelar</Button>
            <Button onClick={handleSaveSettings} disabled={settingsSaving}>
              {settingsSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Ad Group Dialog ─────────────────────────────────── */}
      <Dialog open={createAdGroupOpen} onOpenChange={setCreateAdGroupOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Crear Ad Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={newAdGroupName}
                onChange={e => setNewAdGroupName(e.target.value)}
                placeholder="Mi Ad Group"
              />
            </div>
            <div className="space-y-2">
              <Label>CPC Bid (moneda de la cuenta, opcional)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newAdGroupBid}
                onChange={e => setNewAdGroupBid(e.target.value)}
                placeholder="Ej: 1.50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateAdGroupOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateAdGroup} disabled={createAdGroupLoading || !newAdGroupName}>
              {createAdGroupLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Campaign Wizard ─────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={(open) => { setWizardOpen(open); if (!open) setWizardStep(1); }}>
        <DialogContent className="sm:max-w-[1024px] w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              Crear Campana — Paso {wizardStep} de {totalSteps}
            </DialogTitle>
            {/* Progress bar */}
            <div className="flex gap-1 mt-2">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i + 1 <= wizardStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </DialogHeader>

          {/* Step 1: Basic */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Label className="text-primary">¿Qué quieres de esta campaña? <span className="font-normal text-muted-foreground">(Steve alinea todo a partir de acá)</span></Label>
                <textarea
                  className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={wizardData.user_intent}
                  onChange={e => setWizardData(prev => ({ ...prev, user_intent: e.target.value }))}
                  placeholder="Ej: Campaña de retargeting para alimentos naturales, target dueños de perros grandes en Santiago, tono premium, busco escalar ventas del último trimestre"
                  maxLength={800}
                />
                <p className="text-xs text-muted-foreground">
                  Este prompt alimenta a Steve para: nombre de campaña, targeting, presupuesto, headlines, search themes, audience signal, imágenes y selección de productos.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Tipo de campaña *</Label>
                {/* Select nativo para evitar conflicto de Radix Portal con el overflow-y-auto del Dialog */}
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={wizardData.channel_type}
                  onChange={e => setWizardData(prev => {
                    // Al cambiar channel_type, limpiar assets específicos del canal anterior
                    // (ej: PMAX→SEARCH pierde images, SEARCH→PMAX no tiene, pero si PMAX→SHOPPING
                    // tampoco mantiene las mismas assets). Evita estado stale al ir/volver.
                    const next = { ...prev, channel_type: e.target.value };
                    if (prev.channel_type === 'PERFORMANCE_MAX' && e.target.value !== 'PERFORMANCE_MAX') {
                      return {
                        ...next,
                        images_landscape: [],
                        images_square: [],
                        images_portrait: [],
                        images_logo: [],
                        images_landscape_logo: [],
                        youtube_urls: [],
                        search_themes: '',
                        audience_signals: [],
                        call_to_action: '',
                      };
                    }
                    return next;
                  })}
                >
                  <option value="SEARCH">Search</option>
                  <option value="PERFORMANCE_MAX">Performance Max</option>
                  <option value="SHOPPING">Shopping</option>
                  <option value="DISPLAY">Display</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Steve usa el tipo para el prefijo del nombre (PMAX-, Search-, Shopping-...) y para adaptar sus sugerencias.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Nombre de la campaña *</Label>
                <Input
                  value={wizardData.name}
                  onChange={e => setWizardData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={`Mi Campaña ${wizardData.channel_type === 'PERFORMANCE_MAX' ? 'PMAX' : wizardData.channel_type === 'SHOPPING' ? 'Shopping' : wizardData.channel_type === 'DISPLAY' ? 'Display' : 'Search'}`}
                  maxLength={128}
                />
                <SteveRecommendation
                  connectionId={connectionId}
                  recommendationType="campaign_name"
                  clientId={clientId}
                  userIntent={wizardData.user_intent}
                  channelType={wizardData.channel_type}
                  onApply={handleApplyCampaignName}
                />
              </div>

              <div className="space-y-2">
                <Label>Presupuesto diario *</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={wizardData.daily_budget}
                  onChange={e => setWizardData(prev => ({ ...prev, daily_budget: e.target.value }))}
                  placeholder="Monto en moneda de la cuenta"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={fetchBudgetRecommendation}
                  disabled={budgetLoading}
                >
                  {budgetLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  Ver presupuesto recomendado
                </Button>
                {budgetOptions && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {(['low', 'recommended', 'high'] as const).map(level => {
                      const opt = budgetOptions[level];
                      if (!opt?.daily_budget) return null;
                      return (
                        <button
                          key={level}
                          className={`p-2 rounded-lg border text-left text-xs hover:border-primary transition-colors ${
                            wizardData.daily_budget === String(opt.daily_budget)
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                          onClick={() => setWizardData(prev => ({ ...prev, daily_budget: String(opt.daily_budget) }))}
                        >
                          <p className="font-medium capitalize">{level === 'low' ? 'Bajo' : level === 'recommended' ? 'Recomendado' : 'Alto'}</p>
                          <p className="text-base font-bold">${opt.daily_budget}</p>
                          {opt.estimated_clicks > 0 && (
                            <p className="text-muted-foreground">~{opt.estimated_clicks} clics/dia</p>
                          )}
                          {opt.reasoning && (
                            <p className="text-muted-foreground mt-1">{opt.reasoning}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Config */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Estrategia & Presupuesto
                </div>
              <div className="space-y-2">
                <Label>Estrategia de puja</Label>
                {/* Select nativo: Radix Portal falla dentro del Dialog con overflow-y-auto del wizard */}
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={wizardData.bid_strategy}
                  onChange={e => setWizardData(prev => ({ ...prev, bid_strategy: e.target.value }))}
                >
                  {bidStrategies.map(bs => (
                    <option key={bs.value} value={bs.value}>{bs.label}</option>
                  ))}
                </select>
                <SteveRecommendation
                  connectionId={connectionId}
                  clientId={clientId}
                  userIntent={wizardData.user_intent}
                  recommendationType="campaign_setup"
                  channelType={wizardData.channel_type}
                  context={wizardData.daily_budget ? `El usuario ya eligió un presupuesto diario de $${wizardData.daily_budget}. Respetá ese número como base; solo ajustalo (±20%) si la bid_strategy lo exige, y justificá el cambio en el reasoning.` : undefined}
                  onApply={handleApplyRecommendation}
                />
              </div>
              </div>

              {wizardData.channel_type === 'SEARCH' && (
                <div className="space-y-3">
                  <Label>Redes</Label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Google Search</span>
                      <Switch
                        checked={wizardData.target_google_search}
                        onCheckedChange={val => setWizardData(prev => ({ ...prev, target_google_search: val }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Red de busqueda</span>
                      <Switch
                        checked={wizardData.target_search_network}
                        onCheckedChange={val => setWizardData(prev => ({ ...prev, target_search_network: val }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Red de display</span>
                      <Switch
                        checked={wizardData.target_content_network}
                        onCheckedChange={val => setWizardData(prev => ({ ...prev, target_content_network: val }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {wizardData.channel_type === 'SHOPPING' && (
                <div className="space-y-2">
                  <Label>Merchant Center ID *</Label>
                  <Input
                    value={wizardData.merchant_center_id}
                    onChange={e => setWizardData(prev => ({ ...prev, merchant_center_id: e.target.value }))}
                    placeholder="123456789"
                  />
                  <p className="text-xs text-muted-foreground">
                    El Merchant Center debe estar vinculado a tu cuenta Google Ads.
                  </p>
                </div>
              )}

              {/* Merchant Center for PMAX (optional — enables Shopping ads) */}
              {isPmax && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    Merchant Center <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <select
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={wizardData.merchant_center_id}
                      onChange={e => setWizardData(prev => ({ ...prev, merchant_center_id: e.target.value }))}
                    >
                      <option value="">Sin Merchant Center</option>
                      {merchantCenters.map(mc => (
                        <option key={mc.id} value={mc.id}>{mc.name} ({mc.id})</option>
                      ))}
                    </select>
                    <Button variant="outline" size="sm" onClick={fetchMerchantCenters} disabled={merchantLoading}>
                      {merchantLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vincula Merchant Center para habilitar Shopping ads dentro de PMAX.
                  </p>
                </div>
              )}

              {/* Product selection panel — solo si hay MC linkeado */}
              {isPmax && wizardData.merchant_center_id && (
                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Label>Productos del catálogo <span className="text-muted-foreground font-normal">({catalogProducts.length} cargados, {wizardData.selected_product_ids.length} seleccionados)</span></Label>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={loadCatalogProducts} disabled={catalogLoading}>
                        {catalogLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {catalogProducts.length > 0 ? 'Recargar' : 'Cargar'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={generateAiProductSelection} disabled={productAiLoading || catalogProducts.length === 0}>
                        {productAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Sugerir con AI
                      </Button>
                    </div>
                  </div>
                  {catalogProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Cargá los productos del catálogo para que la campaña apunte solo a un subset.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs">
                        <button type="button" className="underline text-primary" onClick={() => setWizardData(prev => ({ ...prev, selected_product_ids: catalogProducts.map(p => p.id) }))}>Todos</button>
                        <span className="text-muted-foreground">·</span>
                        <button type="button" className="underline text-primary" onClick={() => setWizardData(prev => ({ ...prev, selected_product_ids: [] }))}>Ninguno</button>
                      </div>
                      <div className="max-h-80 overflow-y-auto rounded border border-border bg-background p-2 space-y-2">
                        {(() => {
                          // Group by product_type or category
                          const groups = new Map<string, typeof catalogProducts>();
                          for (const p of catalogProducts) {
                            const key = (p.product_type || p.category || 'Sin categoría').trim() || 'Sin categoría';
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(p);
                          }
                          return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([categoria, items]) => {
                            const ids = items.map(p => p.id);
                            const allSelected = ids.every(id => wizardData.selected_product_ids.includes(id));
                            const someSelected = ids.some(id => wizardData.selected_product_ids.includes(id));
                            const toggleCategory = () => {
                              setWizardData(prev => {
                                if (allSelected) {
                                  return { ...prev, selected_product_ids: prev.selected_product_ids.filter(x => !ids.includes(x)) };
                                } else {
                                  const merged = Array.from(new Set([...prev.selected_product_ids, ...ids])).slice(0, 500);
                                  return { ...prev, selected_product_ids: merged };
                                }
                              });
                            };
                            return (
                              <details key={categoria} open className="rounded border border-border/50 bg-muted/20">
                                <summary className="flex items-center gap-2 text-xs font-medium cursor-pointer p-1.5 hover:bg-muted/40 rounded">
                                  <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                                    onChange={toggleCategory}
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span className="flex-1 truncate">{categoria}</span>
                                  <span className="text-muted-foreground font-normal">{items.filter(p => wizardData.selected_product_ids.includes(p.id)).length}/{items.length}</span>
                                </summary>
                                <div className="px-1 py-1 space-y-0.5">
                                  {items.map(p => {
                                    const checked = wizardData.selected_product_ids.includes(p.id);
                                    return (
                                      <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 rounded p-1 pl-5">
                                        <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} />
                                        {p.image_url && <img src={p.image_url} alt="" className="w-6 h-6 object-cover rounded" />}
                                        <span className="flex-1 truncate">{p.title}</span>
                                        {p.price && <span className="text-muted-foreground shrink-0">${p.price}</span>}
                                      </label>
                                    );
                                  })}
                                </div>
                              </details>
                            );
                          });
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Si seleccionás algunos, Google SOLO promocionará esos SKUs. Si dejás la lista vacía, usará todo el catálogo.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* AI Targeting recommendation */}
              <SteveRecommendation
                connectionId={connectionId}
                recommendationType="targeting"
                clientId={clientId}
                userIntent={wizardData.user_intent}
                channelType={wizardData.channel_type}
                onApply={handleApplyTargeting}
              />

              {/* Location Targeting */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Segmentacion geografica <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {locationOptions.map(loc => {
                    const selected = wizardData.locations.includes(loc.id);
                    return (
                      <button
                        key={loc.id}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                        }`}
                        onClick={() => {
                          setWizardData(prev => ({
                            ...prev,
                            locations: selected
                              ? prev.locations.filter(id => id !== loc.id)
                              : [...prev.locations, loc.id],
                          }));
                        }}
                      >
                        {loc.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {wizardData.locations.length === 0 ? 'Sin seleccion = todos los paises' : `${wizardData.locations.length} pais(es) seleccionado(s)`}
                </p>
              </div>

              {/* Language Targeting */}
              <div className="space-y-2">
                <Label>Idiomas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {languageOptions.map(lang => {
                    const selected = wizardData.languages.includes(lang.id);
                    return (
                      <button
                        key={lang.id}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                        }`}
                        onClick={() => {
                          setWizardData(prev => ({
                            ...prev,
                            languages: selected
                              ? prev.languages.filter(id => id !== lang.id)
                              : [...prev.languages, lang.id],
                          }));
                        }}
                      >
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {wizardData.languages.length === 0 ? 'Sin seleccion = todos los idiomas' : `${wizardData.languages.length} idioma(s)`}
                </p>
              </div>

              {isPmax && (
                <>
                  <div className="space-y-2">
                    <Label>URL Final *</Label>
                    <Input
                      value={wizardData.final_urls}
                      onChange={e => setWizardData(prev => ({ ...prev, final_urls: e.target.value }))}
                      placeholder="https://mitienda.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre del negocio *</Label>
                    <Input
                      value={wizardData.business_name}
                      onChange={e => setWizardData(prev => ({ ...prev, business_name: e.target.value }))}
                      placeholder="Mi Empresa"
                      maxLength={25}
                    />
                    <p className="text-xs text-muted-foreground">{wizardData.business_name.length}/25</p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Fecha inicio <span className="text-muted-foreground font-normal">(opc.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={wizardData.start_date ? `${wizardData.start_date.slice(0,4)}-${wizardData.start_date.slice(4,6)}-${wizardData.start_date.slice(6,8)}` : ''}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => {
                      const val = e.target.value;
                      setWizardData(prev => ({ ...prev, start_date: val ? val.replace(/-/g, '') : '' }));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Fecha fin <span className="text-muted-foreground font-normal">(opc.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={wizardData.end_date ? `${wizardData.end_date.slice(0,4)}-${wizardData.end_date.slice(4,6)}-${wizardData.end_date.slice(6,8)}` : ''}
                    min={wizardData.start_date
                      ? `${wizardData.start_date.slice(0,4)}-${wizardData.start_date.slice(4,6)}-${wizardData.start_date.slice(6,8)}`
                      : new Date().toISOString().split('T')[0]
                    }
                    onChange={e => {
                      const val = e.target.value;
                      setWizardData(prev => ({ ...prev, end_date: val ? val.replace(/-/g, '') : '' }));
                    }}
                  />
                </div>
              </div>

              {/* Search Themes (audience signals for PMAX) */}
              {isPmax && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Search Themes <span className="text-muted-foreground font-normal">(senales de audiencia, opcional)</span></Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5 h-7"
                      onClick={generateAiSearchThemes}
                      disabled={searchThemesAiLoading}
                    >
                      {searchThemesAiLoading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Sparkles className="w-3 h-3" />
                      }
                      Sugerir con AI
                    </Button>
                  </div>
                  <Textarea
                    value={wizardData.search_themes}
                    onChange={e => setWizardData(prev => ({ ...prev, search_themes: e.target.value }))}
                    placeholder={`Uno por línea — ej:\ncomida para perros, gatos\nalimento natural sin químicos\nproductos para mascotas en Santiago`}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uno por línea (max 25). Los themes pueden contener comas. Google los usa como punto de partida, no como restricciones.
                  </p>
                </div>
              )}

              {/* URL Expansion toggle (PMAX) */}
              {isPmax && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Expansion de URL final</Label>
                    <p className="text-xs text-muted-foreground">Permite a Google mostrar anuncios en URLs similares</p>
                  </div>
                  <Switch
                    checked={!wizardData.url_expansion_opt_out}
                    onCheckedChange={val => setWizardData(prev => ({ ...prev, url_expansion_opt_out: !val }))}
                  />
                </div>
              )}

              {/* Capa 1: Acquisition mode — Clientes nuevos vs todos (PMAX) */}
              {isPmax && (
                <div className="space-y-2">
                  <Label>Adquisicion de clientes</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={wizardData.acquisition_mode || 'BID_ONLY'}
                    onChange={e => setWizardData(prev => ({ ...prev, acquisition_mode: e.target.value }))}
                  >
                    <option value="BID_ONLY">Sin prioridad (todos por igual)</option>
                    <option value="BID_HIGHER">Priorizar clientes nuevos (pujar mas alto)</option>
                    <option value="TARGET_ALL_EQUALLY">Clientes nuevos y antiguos por igual (explicito)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Google deduce quien es "nuevo" via Customer Match lists o conversion actions marcadas como first-time.
                  </p>
                </div>
              )}

              {/* Capa 2: Audience Signals (PMAX) — múltiples: AI demográfica + audiencias/listas existentes (max 5) */}
              {isPmax && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Label>Audience Signals <span className="text-muted-foreground font-normal">(opcional, hasta 5)</span></Label>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 h-7"
                        onClick={loadSavedAudiences}
                        disabled={audiencesLoading}
                      >
                        {audiencesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {savedAudiences.length > 0 ? 'Recargar' : 'Listar guardadas'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 h-7"
                        onClick={generateAiAudienceSignal}
                        disabled={audienceAiLoading}
                      >
                        {audienceAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Generar con AI
                      </Button>
                    </div>
                  </div>

                  {/* Lista multi-select de audiencias guardadas */}
                  {savedAudiences.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded border border-border bg-background p-2 space-y-1">
                      {savedAudiences.filter(a => a.kind === 'audience').length > 0 && (
                        <div className="text-xs font-medium text-muted-foreground px-1 pt-1 flex items-center gap-1.5">
                          <Target className="w-3 h-3" /> Audiencias guardadas
                        </div>
                      )}
                      {savedAudiences.filter(a => a.kind === 'audience').map(a => {
                        const checked = wizardData.audience_signals.some(s => s.existing_audience_resource === a.resource_name);
                        const pretty = prettyAudienceName(a.name);
                        return (
                          <label key={a.resource_name} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded p-1" title={a.name}>
                            <input type="checkbox" checked={checked} onChange={() => toggleExistingAudience(a)} className="shrink-0" />
                            <span className="flex-1 truncate">{pretty}</span>
                          </label>
                        );
                      })}
                      {savedAudiences.filter(a => a.kind === 'user_list').length > 0 && (
                        <div className="text-xs font-medium text-muted-foreground px-1 pt-2 flex items-center gap-1.5">
                          <Users className="w-3 h-3" /> Listas (Customer Match / remarketing)
                        </div>
                      )}
                      {savedAudiences.filter(a => a.kind === 'user_list').map(a => {
                        const checked = wizardData.audience_signals.some(s => s.existing_user_list_resource === a.resource_name);
                        const pretty = prettyAudienceName(a.name);
                        return (
                          <label key={a.resource_name} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded p-1" title={a.name}>
                            <input type="checkbox" checked={checked} onChange={() => toggleExistingAudience(a)} className="shrink-0" />
                            <span className="flex-1 truncate">{pretty}</span>
                            {a.size && <span className="text-muted-foreground shrink-0 text-[10px]">{a.size}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Preview de signals seleccionados */}
                  {wizardData.audience_signals.length > 0 ? (
                    <div className="space-y-1.5">
                      {wizardData.audience_signals.map((s, idx) => (
                        <div key={idx} className="rounded-md border border-border bg-muted/30 p-2 text-xs flex items-start gap-2 min-w-0">
                          <div className="flex-1 space-y-0.5 min-w-0">
                            {s.existing_label ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Badge variant="outline" className="text-[10px] h-4 gap-1 shrink-0">
                                  {s.kind === 'user_list' ? <Users className="w-2.5 h-2.5" /> : <Target className="w-2.5 h-2.5" />}
                                  {s.kind === 'user_list' ? 'Lista' : 'Audiencia'}
                                </Badge>
                                <span className="truncate" title={s.name}>{s.existing_label}</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px] h-4 gap-1 shrink-0">
                                    <Sparkles className="w-2.5 h-2.5" /> AI
                                  </Badge>
                                  <span className="font-medium truncate">{s.name || 'Audiencia AI'}</span>
                                </div>
                                {s.description && <div className="text-muted-foreground break-words">{s.description}</div>}
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {(s.age_ranges || []).map(a => <Badge key={a} variant="secondary" className="text-[10px] h-4">{a.replace('AGE_RANGE_', '').replace('_', '-')}</Badge>)}
                                  {(s.genders || []).map(g => <Badge key={g} variant="secondary" className="text-[10px] h-4">{g}</Badge>)}
                                  {(s.parental_statuses || []).map(p => <Badge key={p} variant="secondary" className="text-[10px] h-4">{p.replace('_', ' ')}</Badge>)}
                                  {(s.income_ranges || []).map(i => <Badge key={i} variant="secondary" className="text-[10px] h-4">{i.replace('INCOME_RANGE_', 'Ingreso ').replace('_', '-')}</Badge>)}
                                </div>
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            className="text-xs text-destructive shrink-0 hover:bg-destructive/10 rounded w-5 h-5 flex items-center justify-center"
                            onClick={() => removeAudienceSignal(idx)}
                            title="Quitar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sin audience signals. Podés generar con AI, elegir varias guardadas, o ambas (hasta 5).
                    </p>
                  )}

                  {hasCustomerMatch === false && (wizardData.acquisition_mode === 'BID_HIGHER' || wizardData.acquisition_mode === 'TARGET_ALL_EQUALLY') && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="break-words space-y-1">
                        <p>
                          El account no tiene Customer Match activa. El modo "<strong>{wizardData.acquisition_mode === 'BID_HIGHER' ? 'Priorizar nuevos' : 'Nuevos y antiguos'}</strong>" se degradará a "Sin prioridad" al crear la campaña.
                        </p>
                        <a
                          href="https://ads.google.com/aw/audiences"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline font-medium hover:no-underline"
                        >
                          Crear lista de clientes en Google Ads →
                        </a>
                        <p className="text-[11px] opacity-80">
                          Después de crear la lista, esperá 24-48h a que Google la procese y volvé a crear la campaña.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3 PMAX: Assets */}
          {wizardStep === 3 && isPmax && (
            <div className="space-y-5">
              {/* Headlines */}
              <AssetLineEditor
                label="Headlines"
                items={wizardData.headlines}
                maxLength={30}
                maxItems={15}
                minItems={3}
                onChange={headlines => setWizardData(prev => ({ ...prev, headlines }))}
              />
              {/* Long Headlines */}
              <AssetLineEditor
                label="Long Headlines"
                items={wizardData.long_headlines}
                maxLength={90}
                maxItems={5}
                minItems={1}
                onChange={long_headlines => setWizardData(prev => ({ ...prev, long_headlines }))}
              />
              {/* Descriptions */}
              <AssetLineEditor
                label="Descripciones"
                items={wizardData.descriptions}
                maxLength={90}
                maxItems={5}
                minItems={2}
                onChange={descriptions => setWizardData(prev => ({ ...prev, descriptions }))}
              />
              <SteveRecommendation
                connectionId={connectionId}
                recommendationType="pmax_assets"
                channelType="PERFORMANCE_MAX"
                clientId={clientId}
                userIntent={wizardData.user_intent}
                context={`Negocio: ${wizardData.business_name || 'Sin nombre'}, URL: ${wizardData.final_urls || 'Sin URL'}`}
                onApply={handleApplyPmaxRecommendation}
              />
            </div>
          )}

          {/* Step 4 PMAX: Images */}
          {wizardStep === 4 && isPmax && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Sube las imagenes para tu campana PMAX. Google requiere al menos 1 landscape, 1 cuadrada y 1 logo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 shrink-0"
                  onClick={generateAllAiImages}
                  disabled={aiImageLoading.ai_landscape || aiImageLoading.ai_square || aiImageLoading.ai_portrait}
                >
                  {(aiImageLoading.ai_landscape || aiImageLoading.ai_square || aiImageLoading.ai_portrait)
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />
                  }
                  Generar todas con AI
                </Button>
              </div>

              <ImageUploadZone
                label="Landscape"
                files={wizardData.images_landscape}
                onChange={files => setWizardData(prev => ({ ...prev, images_landscape: files }))}
                maxFiles={20}
                minFiles={1}
                aspectHint="1.91:1 — rec. 1200x628"
                required
              />
              {/* AI generate for landscape */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-blue-500 gap-1"
                  onClick={() => generateAiImage('landscape', 'ai_landscape')}
                  disabled={aiImageLoading.ai_landscape}
                >
                  {aiImageLoading.ai_landscape ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Generar con AI
                </Button>
                {aiImagePreviews.ai_landscape && (
                  <div className="flex items-center gap-2">
                    <img src={aiImagePreviews.ai_landscape} alt="AI preview" className="w-20 h-12 rounded border object-cover" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acceptAiImage('ai_landscape', 'images_landscape')}>Usar</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => generateAiImage('landscape', 'ai_landscape')}>Regenerar</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiImagePreviews(p => { const n = { ...p }; delete n.ai_landscape; return n; })}><X className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>

              <ImageUploadZone
                label="Cuadrada"
                files={wizardData.images_square}
                onChange={files => setWizardData(prev => ({ ...prev, images_square: files }))}
                maxFiles={20}
                minFiles={1}
                aspectHint="1:1 — rec. 1200x1200"
                required
              />
              {/* AI generate for square */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-blue-500 gap-1"
                  onClick={() => generateAiImage('square', 'ai_square')}
                  disabled={aiImageLoading.ai_square}
                >
                  {aiImageLoading.ai_square ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Generar con AI
                </Button>
                {aiImagePreviews.ai_square && (
                  <div className="flex items-center gap-2">
                    <img src={aiImagePreviews.ai_square} alt="AI preview" className="w-14 h-14 rounded border object-cover" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acceptAiImage('ai_square', 'images_square')}>Usar</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => generateAiImage('square', 'ai_square')}>Regenerar</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiImagePreviews(p => { const n = { ...p }; delete n.ai_square; return n; })}><X className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>

              <ImageUploadZone
                label="Logo"
                files={wizardData.images_logo}
                onChange={files => setWizardData(prev => ({ ...prev, images_logo: files }))}
                maxFiles={5}
                minFiles={1}
                aspectHint="1:1 — min 128x128"
                required
              />
              {/* AI generate for logo (Gemini con brand reference) */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-blue-500 gap-1"
                  onClick={() => generateAiImage('logo', 'ai_logo')}
                  disabled={aiImageLoading.ai_logo}
                >
                  {aiImageLoading.ai_logo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Generar con AI
                </Button>
                {aiImagePreviews.ai_logo && (
                  <div className="flex items-center gap-2">
                    <img src={aiImagePreviews.ai_logo} alt="AI preview" className="w-14 h-14 rounded border object-cover" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acceptAiImage('ai_logo', 'images_logo')}>Usar</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => generateAiImage('logo', 'ai_logo')}>Regenerar</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiImagePreviews(p => { const n = { ...p }; delete n.ai_logo; return n; })}><X className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
              <details className="border rounded-lg">
                <summary className="p-3 text-sm font-medium cursor-pointer hover:bg-muted/30">
                  Imagenes opcionales (Portrait + Logo Landscape)
                </summary>
                <div className="px-3 pb-3 space-y-4">
                  <ImageUploadZone
                    label="Portrait"
                    files={wizardData.images_portrait}
                    onChange={files => setWizardData(prev => ({ ...prev, images_portrait: files }))}
                    maxFiles={20}
                    aspectHint="4:5 — rec. 960x1200"
                  />
                  {/* AI generate for portrait */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-blue-500 gap-1"
                      onClick={() => generateAiImage('portrait', 'ai_portrait')}
                      disabled={aiImageLoading.ai_portrait}
                    >
                      {aiImageLoading.ai_portrait ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generar con AI
                    </Button>
                    {aiImagePreviews.ai_portrait && (
                      <div className="flex items-center gap-2">
                        <img src={aiImagePreviews.ai_portrait} alt="AI preview" className="w-12 h-16 rounded border object-cover" />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acceptAiImage('ai_portrait', 'images_portrait')}>Usar</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => generateAiImage('portrait', 'ai_portrait')}>Regenerar</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiImagePreviews(p => { const n = { ...p }; delete n.ai_portrait; return n; })}><X className="w-3 h-3" /></Button>
                      </div>
                    )}
                  </div>
                  <ImageUploadZone
                    label="Logo Landscape"
                    files={wizardData.images_landscape_logo}
                    onChange={files => setWizardData(prev => ({ ...prev, images_landscape_logo: files }))}
                    maxFiles={5}
                    aspectHint="4:1 — rec. 1200x300"
                  />
                  {/* AI generate for landscape_logo — backend hace letterbox automático si hay brand logo */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-blue-500 gap-1"
                      onClick={() => generateAiImage('landscape_logo', 'ai_landscape_logo')}
                      disabled={aiImageLoading.ai_landscape_logo}
                      title="Si el cliente tiene logo, Steve lo adapta automáticamente a 1200x300 sin costo"
                    >
                      {aiImageLoading.ai_landscape_logo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generar con AI
                    </Button>
                    {aiImagePreviews.ai_landscape_logo && (
                      <div className="flex items-center gap-2">
                        <img src={aiImagePreviews.ai_landscape_logo} alt="AI preview" className="w-24 h-6 rounded border object-contain bg-muted/20" />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => acceptAiImage('ai_landscape_logo', 'images_landscape_logo')}>Usar</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => generateAiImage('landscape_logo', 'ai_landscape_logo')}>Regenerar</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiImagePreviews(p => { const n = { ...p }; delete n.ai_landscape_logo; return n; })}><X className="w-3 h-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Step 5 PMAX: Videos, Sitelinks & Extras */}
          {wizardStep === 5 && isPmax && (
            <div className="space-y-5">
              <YouTubeInput
                urls={wizardData.youtube_urls}
                onChange={urls => setWizardData(prev => ({ ...prev, youtube_urls: urls }))}
              />
              <SteveRecommendation
                connectionId={connectionId}
                recommendationType="cta_sitelinks"
                clientId={clientId}
                userIntent={wizardData.user_intent}
                channelType="PERFORMANCE_MAX"
                context={`URL: ${wizardData.final_urls || 'Sin URL'}, Negocio: ${wizardData.business_name || 'Sin nombre'}`}
                onApply={handleApplyCtaSitelinks}
              />
              <div className="space-y-2">
                <Label>Call to Action <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={wizardData.call_to_action}
                  onChange={e => setWizardData(prev => ({ ...prev, call_to_action: e.target.value }))}
                >
                  {ctaOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Display URL Path <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground whitespace-nowrap truncate max-w-[150px]">
                    {wizardData.final_urls || 'tudominio.com'} /
                  </span>
                  <Input
                    value={wizardData.display_url_path1}
                    onChange={e => setWizardData(prev => ({ ...prev, display_url_path1: e.target.value.slice(0, 15) }))}
                    placeholder="path1"
                    maxLength={15}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">/</span>
                  <Input
                    value={wizardData.display_url_path2}
                    onChange={e => setWizardData(prev => ({ ...prev, display_url_path2: e.target.value.slice(0, 15) }))}
                    placeholder="path2"
                    maxLength={15}
                    className="w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Max 15 caracteres por segmento</p>
              </div>

              {/* Sitelinks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Sitelinks <span className="text-muted-foreground font-normal">(vinculos de sitio, opcional)</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">{wizardData.sitelinks.length}/20</span>
                </div>
                {wizardData.sitelinks.map((sl, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Sitelink {i + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                        onClick={() => setWizardData(prev => ({
                          ...prev,
                          sitelinks: prev.sitelinks.filter((_, idx) => idx !== i),
                        }))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={sl.text}
                        onChange={e => {
                          const next = [...wizardData.sitelinks];
                          next[i] = { ...next[i], text: e.target.value.slice(0, 25) };
                          setWizardData(prev => ({ ...prev, sitelinks: next }));
                        }}
                        placeholder="Texto del link (25 chars)"
                        maxLength={25}
                      />
                      <Input
                        value={sl.url}
                        onChange={e => {
                          const next = [...wizardData.sitelinks];
                          next[i] = { ...next[i], url: e.target.value };
                          setWizardData(prev => ({ ...prev, sitelinks: next }));
                        }}
                        placeholder="https://ejemplo.com/pagina"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={sl.description1}
                        onChange={e => {
                          const next = [...wizardData.sitelinks];
                          next[i] = { ...next[i], description1: e.target.value.slice(0, 35) };
                          setWizardData(prev => ({ ...prev, sitelinks: next }));
                        }}
                        placeholder="Descripcion 1 (35 chars)"
                        maxLength={35}
                      />
                      <Input
                        value={sl.description2}
                        onChange={e => {
                          const next = [...wizardData.sitelinks];
                          next[i] = { ...next[i], description2: e.target.value.slice(0, 35) };
                          setWizardData(prev => ({ ...prev, sitelinks: next }));
                        }}
                        placeholder="Descripcion 2 (35 chars)"
                        maxLength={35}
                      />
                    </div>
                  </div>
                ))}
                {wizardData.sitelinks.length < 20 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setWizardData(prev => ({
                      ...prev,
                      sitelinks: [...prev.sitelinks, { text: '', url: '', description1: '', description2: '' }],
                    }))}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Agregar sitelink
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 3 SEARCH: Ad Group */}
          {wizardStep === 3 && wizardData.channel_type === 'SEARCH' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre del Ad Group</Label>
                <Input
                  value={wizardData.ad_group_name}
                  onChange={e => setWizardData(prev => ({ ...prev, ad_group_name: e.target.value }))}
                  placeholder="Ad Group 1"
                />
              </div>
              <div className="space-y-2">
                <Label>CPC Bid (opcional, moneda de la cuenta)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={wizardData.ad_group_cpc_bid_micros}
                  onChange={e => setWizardData(prev => ({ ...prev, ad_group_cpc_bid_micros: e.target.value }))}
                  placeholder="Ej: 1.50"
                />
              </div>
            </div>
          )}

          {/* Preview step — last step for all types */}
          {wizardStep === totalSteps && (
            <div className="space-y-4">
              <Card className="bg-muted/30">
                <CardContent className="py-4 space-y-3 text-sm">
                  <p className="font-medium text-base">Resumen de campana</p>
                  <div className="grid grid-cols-2 gap-2">
                    <p className="text-muted-foreground">Nombre</p>
                    <p className="font-medium">{wizardData.name || '-'}</p>
                    <p className="text-muted-foreground">Tipo</p>
                    <p><Badge variant="outline">{channelLabels[wizardData.channel_type] || wizardData.channel_type}</Badge></p>
                    <p className="text-muted-foreground">Presupuesto</p>
                    <p className="font-medium">${wizardData.daily_budget || '0'}/dia</p>
                    <p className="text-muted-foreground">Estrategia</p>
                    <p className="font-medium">{bidStrategies.find(b => b.value === wizardData.bid_strategy)?.label || wizardData.bid_strategy}</p>
                    {wizardData.start_date && (
                      <>
                        <p className="text-muted-foreground">Inicio</p>
                        <p>{wizardData.start_date.slice(0,4)}-{wizardData.start_date.slice(4,6)}-{wizardData.start_date.slice(6,8)}</p>
                      </>
                    )}
                    {wizardData.end_date && (
                      <>
                        <p className="text-muted-foreground">Fin</p>
                        <p>{wizardData.end_date.slice(0,4)}-{wizardData.end_date.slice(4,6)}-{wizardData.end_date.slice(6,8)}</p>
                      </>
                    )}
                    {wizardData.locations.length > 0 && (
                      <>
                        <p className="text-muted-foreground">Paises</p>
                        <p>{wizardData.locations.map(id => locationOptions.find(l => l.id === id)?.label).filter(Boolean).join(', ')}</p>
                      </>
                    )}
                    {wizardData.languages.length > 0 && (
                      <>
                        <p className="text-muted-foreground">Idiomas</p>
                        <p>{wizardData.languages.map(id => languageOptions.find(l => l.id === id)?.label).filter(Boolean).join(', ')}</p>
                      </>
                    )}
                  </div>

                  {isPmax && (
                    <div className="border-t pt-3 mt-3 space-y-3">
                      <p className="font-medium">Assets PMAX</p>

                      {/* Text assets */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Headlines ({wizardData.headlines.filter(h => h.trim()).length})</p>
                        <div className="flex flex-wrap gap-1">
                          {wizardData.headlines.filter(h => h.trim()).map((h, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Long Headlines ({wizardData.long_headlines.filter(h => h.trim()).length})</p>
                        <div className="flex flex-wrap gap-1">
                          {wizardData.long_headlines.filter(h => h.trim()).map((h, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Descripciones ({wizardData.descriptions.filter(d => d.trim()).length})</p>
                        <div className="flex flex-wrap gap-1">
                          {wizardData.descriptions.filter(d => d.trim()).map((d, i) => (
                            <Badge key={i} variant="secondary" className="text-xs max-w-[200px] truncate">{d}</Badge>
                          ))}
                        </div>
                      </div>

                      {/* Image thumbnails */}
                      {(wizardData.images_landscape.length > 0 || wizardData.images_square.length > 0 || wizardData.images_logo.length > 0) && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Imagenes ({wizardData.images_landscape.length + wizardData.images_square.length + wizardData.images_logo.length + wizardData.images_portrait.length + wizardData.images_landscape_logo.length} total)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {[...wizardData.images_landscape, ...wizardData.images_square, ...wizardData.images_logo, ...wizardData.images_portrait, ...wizardData.images_landscape_logo].map((file, i) => (
                              <img
                                key={i}
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="w-12 h-12 rounded border object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* YouTube videos */}
                      {wizardData.youtube_urls.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Videos ({wizardData.youtube_urls.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {wizardData.youtube_urls.map((id, i) => (
                              <img
                                key={i}
                                src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
                                alt={`Video ${i + 1}`}
                                className="w-20 h-12 rounded border object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CTA + Display URL */}
                      {(wizardData.call_to_action || wizardData.display_url_path1 || wizardData.display_url_path2) && (
                        <div className="flex flex-wrap gap-2">
                          {wizardData.call_to_action && (
                            <Badge variant="outline" className="text-xs">
                              CTA: {ctaOptions.find(o => o.value === wizardData.call_to_action)?.label || wizardData.call_to_action}
                            </Badge>
                          )}
                          {(wizardData.display_url_path1 || wizardData.display_url_path2) && (
                            <Badge variant="outline" className="text-xs">
                              URL: /{wizardData.display_url_path1}{wizardData.display_url_path2 ? `/${wizardData.display_url_path2}` : ''}
                            </Badge>
                          )}
                        </div>
                      )}

                      {wizardData.business_name && (
                        <p className="text-xs">Negocio: <strong>{wizardData.business_name}</strong></p>
                      )}
                      {wizardData.final_urls && (
                        <p className="text-xs">URL: <strong>{wizardData.final_urls}</strong></p>
                      )}
                      {wizardData.merchant_center_id && (
                        <p className="text-xs">Merchant Center: <strong>{wizardData.merchant_center_id}</strong></p>
                      )}
                      {wizardData.search_themes && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Search Themes</p>
                          <p className="text-xs">{wizardData.search_themes}</p>
                        </div>
                      )}
                      {wizardData.url_expansion_opt_out && (
                        <Badge variant="outline" className="text-xs">URL Expansion: Desactivada</Badge>
                      )}
                      {wizardData.sitelinks.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Sitelinks ({wizardData.sitelinks.filter(s => s.text.trim()).length})</p>
                          <div className="flex flex-wrap gap-1">
                            {wizardData.sitelinks.filter(s => s.text.trim()).map((sl, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{sl.text}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">La campana se creara en estado PAUSADA.</p>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {wizardStep > 1 && !wizardLoading && (
              <Button variant="outline" onClick={() => setWizardStep(s => s - 1)}>
                Atras
              </Button>
            )}
            <div className="flex-1">
              {wizardLoading && wizardProgress && (
                <p className="text-xs text-muted-foreground animate-pulse">{wizardProgress}</p>
              )}
            </div>
            {wizardStep < totalSteps ? (
              <Button
                onClick={() => setWizardStep(s => s + 1)}
                disabled={!isStepValid(wizardStep)}
              >
                Siguiente
              </Button>
            ) : (
              <Button onClick={handleCreateCampaign} disabled={wizardLoading}>
                {wizardLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Crear Campana
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crear Grupo de recursos (PMAX) desde la sub-row de una campaña */}
      <CreateAssetGroupDialog
        open={createAgOpen}
        onOpenChange={setCreateAgOpen}
        connectionId={connectionId}
        pmaxCampaigns={campaigns.filter(c => c.channel_type === 'PERFORMANCE_MAX').map(c => ({ id: c.id, name: c.name }))}
        preselectedCampaignId={createAgCampaignId}
        onCreated={({ campaign_id }) => {
          // Refresh asset groups del campaign_id creado para mostrar el nuevo AG inline.
          refreshAssetGroupsForCampaign(campaign_id);
        }}
      />

      {/* Eliminar Campaña — reemplaza window.confirm */}
      <Dialog open={!!deleteCampaignTarget} onOpenChange={(open) => { if (!open && !deleteCampaignLoading) setDeleteCampaignTarget(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Eliminar campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              ¿Seguro que quieres eliminar <strong>"{deleteCampaignTarget?.name}"</strong>?
            </p>
            <p className="text-xs text-muted-foreground">
              Google Ads la marcará como REMOVED. El historial de métricas se mantiene,
              pero la campaña deja de aparecer en tu lista.
            </p>
            {deleteCampaignTarget?.channel_type === 'PERFORMANCE_MAX' && (assetGroupsByCampaign[deleteCampaignTarget.id]?.length || 0) > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ Esta campaña PMAX tiene {assetGroupsByCampaign[deleteCampaignTarget.id]?.length} grupo
                {(assetGroupsByCampaign[deleteCampaignTarget.id]?.length || 0) !== 1 ? 's' : ''} de recursos que quedarán inaccesibles.
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">Esta acción no se puede deshacer desde Steve.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCampaignTarget(null)} disabled={deleteCampaignLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmRemoveCampaign} disabled={deleteCampaignLoading}>
              {deleteCampaignLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar Grupo de recursos (PMAX) — reemplaza window.confirm */}
      <Dialog open={!!deleteAgTarget} onOpenChange={(open) => { if (!open && !deleteAgLoading) setDeleteAgTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Eliminar grupo de recursos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              ¿Seguro que quieres eliminar <strong>"{deleteAgTarget?.name}"</strong>?
            </p>
            <p className="text-xs text-muted-foreground">
              Google Ads lo marcará como removido y quedará oculto del panel. Esta acción no se puede deshacer.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAgTarget(null)} disabled={deleteAgLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmAssetGroupDelete} disabled={deleteAgLoading}>
              {deleteAgLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
