import { useState, useEffect, useMemo, useCallback } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Megaphone,
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pause,
  Play,
  Copy,
  Archive,
  BarChart3,
  Pencil,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  CalendarDays,
  Filter,
  X,
  ChevronUp,
  ChevronDown,
  Eye,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';
import { EditCampaignDialog } from './EditCampaignDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
type CampaignObjective = 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT';
type OptimizationGoal = 'LANDING_PAGE_VIEWS' | 'PURCHASES' | 'ADD_TO_CART';
type Placement = 'FEED' | 'STORIES' | 'REELS' | 'AUDIENCE_NETWORK';

type SortField =
  | 'campaign_name'
  | 'status'
  | 'daily_budget'
  | 'spend'
  | 'roas'
  | 'cpa'
  | 'ctr'
  | 'cpm'
  | 'conversions';
type SortDirection = 'asc' | 'desc';

interface CampaignRow {
  campaign_id: string;
  campaign_name: string;
  status: CampaignStatus;
  daily_budget: number;
  objective: CampaignObjective;
  spend_30d: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  conversions: number;
  impressions: number;
  clicks: number;
  revenue: number;
  start_date: string | null;
  end_date: string | null;
  placements: Placement[];
  optimization_goal: OptimizationGoal;
}

interface CampaignFormData {
  campaign_name: string;
  objective: CampaignObjective;
  daily_budget: string;
  start_date: string;
  end_date: string;
  placements: Placement[];
  optimization_goal: OptimizationGoal;
}

interface MetaCampaignManagerProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: 'Activa',
    className: 'bg-green-500/15 text-green-700 border-green-500/30',
  },
  PAUSED: {
    label: 'Pausada',
    className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  },
  COMPLETED: {
    label: 'Completada',
    className: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
  },
  ARCHIVED: {
    label: 'Archivada',
    className: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
  },
};

const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  CONVERSIONS: 'Conversiones',
  TRAFFIC: 'Tráfico',
  AWARENESS: 'Reconocimiento',
  ENGAGEMENT: 'Interacción',
};

const OPTIMIZATION_LABELS: Record<OptimizationGoal, string> = {
  LANDING_PAGE_VIEWS: 'Vistas a página de destino',
  PURCHASES: 'Compras',
  ADD_TO_CART: 'Agregar al carrito',
};

const PLACEMENT_LABELS: Record<Placement, string> = {
  FEED: 'Feed',
  STORIES: 'Stories',
  REELS: 'Reels',
  AUDIENCE_NETWORK: 'Audience Network',
};

const ALL_PLACEMENTS: Placement[] = ['FEED', 'STORIES', 'REELS', 'AUDIENCE_NETWORK'];

const EMPTY_FORM: CampaignFormData = {
  campaign_name: '',
  objective: 'CONVERSIONS',
  daily_budget: '',
  start_date: '',
  end_date: '',
  placements: ['FEED', 'STORIES', 'REELS'],
  optimization_goal: 'PURCHASES',
};

// ---------------------------------------------------------------------------
// Formatters (CLP - Chilean Pesos, es-CL locale)
// ---------------------------------------------------------------------------

const formatCLP = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;

const formatRoas = (value: number): string =>
  `${new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}x`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CampaignStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.COMPLETED;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function SortIcon({
  field,
  currentField,
  direction,
}: {
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
}) {
  if (field !== currentField) {
    return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  }
  return direction === 'asc' ? (
    <ArrowUp className="w-3 h-3 ml-1" />
  ) : (
    <ArrowDown className="w-3 h-3 ml-1" />
  );
}

/** Budget allocation bar chart (horizontal stacked bars) */
function BudgetAllocationChart({
  campaigns,
  totalBudget,
}: {
  campaigns: CampaignRow[];
  totalBudget: number;
}) {
  const activeCampaigns = campaigns
    .filter((c) => c.status === 'ACTIVE' && c.daily_budget > 0)
    .sort((a, b) => b.daily_budget - a.daily_budget);

  if (activeCampaigns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Sin campañas activas con presupuesto asignado.
      </p>
    );
  }

  const COLORS = [
    'bg-[#2A4F9E]',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-yellow-500',
    'bg-red-500',
  ];

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-6 rounded-full overflow-hidden bg-muted">
        {activeCampaigns.map((c, i) => {
          const pct = totalBudget > 0 ? (c.daily_budget / totalBudget) * 100 : 0;
          if (pct < 1) return null;
          return (
            <div
              key={c.campaign_id}
              className={`${COLORS[i % COLORS.length]} transition-all duration-300`}
              style={{ width: `${pct}%` }}
              title={`${c.campaign_name} — Presupuesto: ${formatCLP(c.daily_budget)}/día (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {activeCampaigns.slice(0, 8).map((c, i) => (
          <div key={c.campaign_id} className="flex items-center gap-1.5 text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLORS[i % COLORS.length]}`}
              aria-hidden="true"
            />
            <span className="text-muted-foreground truncate max-w-[140px]">
              {c.campaign_name}
            </span>
            <span className="font-medium">{formatCLP(c.daily_budget)}/día</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MetaCampaignManager({ clientId }: MetaCampaignManagerProps) {
  const { connectionId: ctxConnectionId, lastSyncAt } = useMetaBusiness();

  // ----- State -----
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  // Nuevo dialog "Editar campaña activa" con tabs (Campaña / Ad Sets / Ads).
  // Reemplaza el dialog legacy de edit que solo permitía cambiar nombre/budget.
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaEditCampaign, setMetaEditCampaign] = useState<CampaignRow | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);

  // Form state
  const [formData, setFormData] = useState<CampaignFormData>({ ...EMPTY_FORM });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Quick budget adjustment
  const [budgetAmount, setBudgetAmount] = useState('');

  // Action loading states keyed by campaign_id
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Bulk selection
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Quick-view sheet
  const [quickViewCampaign, setQuickViewCampaign] = useState<CampaignRow | null>(null);

  // ----- Data fetching -----
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use connectionId from MetaBusinessContext
      if (!ctxConnectionId) {
        setCampaigns([]);
        setConnectionIds([]);
        setLoading(false);
        return;
      }
      const connIds = [ctxConnectionId];
      setConnectionIds(connIds);

      // 2. Fetch last 30 days of campaign_metrics
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [metricsRes, creativesRes] = await Promise.all([
        supabase
          .from('campaign_metrics')
          .select('*')
          .in('connection_id', connIds)
          .gte('metric_date', thirtyDaysAgo)
          .order('metric_date', { ascending: false }),
        supabase
          .from('ad_creatives')
          .select('id, client_id, estado, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      if (metricsRes.error) throw metricsRes.error;
      if (creativesRes.error) throw creativesRes.error;

      const metricsData = metricsRes.data || [];

      // 3. Aggregate metrics by campaign_id
      const campaignMap = new Map<string, CampaignRow>();

      for (const m of metricsData) {
        const existing = campaignMap.get(m.campaign_id);
        if (existing) {
          existing.spend_30d += Number(m.spend) || 0;
          existing.conversions += Number(m.conversions) || 0;
          existing.revenue += Number(m.conversion_value) || 0;
          existing.clicks += Number(m.clicks) || 0;
          existing.impressions += Number(m.impressions) || 0;
          // Use the most recent campaign_status if available
          if (m.campaign_status) {
            existing.status = m.campaign_status as CampaignStatus;
          }
        } else {
          campaignMap.set(m.campaign_id, {
            campaign_id: m.campaign_id,
            campaign_name: m.campaign_name,
            status: (m.campaign_status as CampaignStatus) || 'ACTIVE' as CampaignStatus,
            daily_budget: 0,
            objective: 'CONVERSIONS' as CampaignObjective,
            spend_30d: Number(m.spend) || 0,
            roas: 0,
            cpa: 0,
            ctr: 0,
            cpm: 0,
            conversions: Number(m.conversions) || 0,
            impressions: Number(m.impressions) || 0,
            clicks: Number(m.clicks) || 0,
            revenue: Number(m.conversion_value) || 0,
            start_date: null,
            end_date: null,
            placements: ['FEED', 'STORIES', 'REELS'],
            optimization_goal: 'PURCHASES' as OptimizationGoal,
          });
        }
      }

      // 4. Compute derived metrics for each campaign
      for (const [, c] of campaignMap) {
        c.roas = c.spend_30d > 0 ? c.revenue / c.spend_30d : 0;
        c.cpa = c.conversions > 0 ? c.spend_30d / c.conversions : 0;
        c.ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
        c.cpm = c.impressions > 0 ? (c.spend_30d / c.impressions) * 1000 : 0;
        // Infer daily budget from average daily spend
        const uniqueDays = new Set(
          metricsData
            .filter((m) => m.campaign_id === c.campaign_id)
            .map((m) => m.metric_date),
        );
        const daysActive = uniqueDays.size || 1;
        c.daily_budget = Math.round(c.spend_30d / daysActive);

        // Only infer status when campaign_status was not available from API
        if (c.status === ('ACTIVE' as CampaignStatus)) {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
          const recentDays = Array.from(uniqueDays).filter((d) => d >= threeDaysAgo);
          if (recentDays.length === 0 && daysActive > 0) {
            c.status = 'PAUSED';
          }
        }

        // Find date range
        const dates = Array.from(uniqueDays).sort();
        if (dates.length > 0) {
          c.start_date = dates[0];
          c.end_date = dates[dates.length - 1];
        }
      }

      setCampaigns(Array.from(campaignMap.values()));
    } catch (err: any) {
      // Error handled by toast
      toast.error(err?.message || 'Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  }, [clientId, lastSyncAt, ctxConnectionId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Listen for sync events
  useEffect(() => {
    const handler = () => fetchCampaigns();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [fetchCampaigns]);

  // ----- Filtering and sorting -----
  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns];

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((c) =>
        c.campaign_name.toLowerCase().includes(query),
      );
    }

    // Date range filter
    if (dateFrom) {
      result = result.filter(
        (c) => c.start_date && c.start_date >= dateFrom,
      );
    }
    if (dateTo) {
      result = result.filter(
        (c) => c.end_date && c.end_date <= dateTo,
      );
    }

    // Sorting
    result.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'campaign_name':
          aVal = a.campaign_name.toLowerCase();
          bVal = b.campaign_name.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'daily_budget':
          aVal = a.daily_budget;
          bVal = b.daily_budget;
          break;
        case 'spend':
          aVal = a.spend_30d;
          bVal = b.spend_30d;
          break;
        case 'roas':
          aVal = a.roas;
          bVal = b.roas;
          break;
        case 'cpa':
          aVal = a.cpa;
          bVal = b.cpa;
          break;
        case 'ctr':
          aVal = a.ctr;
          bVal = b.ctr;
          break;
        case 'conversions':
          aVal = a.conversions;
          bVal = b.conversions;
          break;
        default:
          aVal = a.spend_30d;
          bVal = b.spend_30d;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [campaigns, statusFilter, searchQuery, dateFrom, dateTo, sortField, sortDirection]);

  // ----- Budget summary -----
  const budgetSummary = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'ACTIVE');
    const totalDaily = active.reduce((sum, c) => sum + c.daily_budget, 0);
    const totalSpend30d = active.reduce((sum, c) => sum + c.spend_30d, 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
    const totalSpendAll = campaigns.reduce((sum, c) => sum + c.spend_30d, 0);
    const avgCpa = totalConversions > 0 ? totalSpendAll / totalConversions : 0;
    return { totalDaily, totalSpend30d, activeCount: active.length, totalConversions, avgCpa };
  }, [campaigns]);

  // ----- Handlers -----

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleToggleStatus = async (campaign: CampaignRow) => {
    const newStatus: CampaignStatus =
      campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: true }));
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: newStatus === 'ACTIVE' ? 'resume' : 'pause',
          campaign_id: campaign.campaign_id,
          connection_id: connectionIds[0],
        },
      });

      if (fnErr) throw new Error(fnErr);

      // Optimistic update
      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaign_id === campaign.campaign_id
            ? { ...c, status: newStatus }
            : c,
        ),
      );
      toast.success(
        newStatus === 'ACTIVE'
          ? `Campaña "${campaign.campaign_name}" reanudada`
          : `Campaña "${campaign.campaign_name}" pausada`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Error al cambiar estado de la campaña');
    } finally {
      setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: false }));
    }
  };

  const handleDuplicate = async (campaign: CampaignRow) => {
    setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: true }));
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: 'duplicate',
          campaign_id: campaign.campaign_id,
          connection_id: connectionIds[0],
          data: { new_name: `${campaign.campaign_name} (Copia)` },
        },
      });

      if (fnErr) throw new Error(fnErr);

      toast.success(`Campaña duplicada: "${campaign.campaign_name} (Copia)"`);
      await fetchCampaigns();
    } catch (err: any) {
      toast.error(err?.message || 'Error al duplicar la campaña');
    } finally {
      setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: false }));
    }
  };

  const handleArchive = async (campaign: CampaignRow) => {
    setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: true }));
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: 'archive',
          campaign_id: campaign.campaign_id,
          connection_id: connectionIds[0],
        },
      });

      if (fnErr) throw new Error(fnErr);

      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaign_id === campaign.campaign_id
            ? { ...c, status: 'ARCHIVED' as CampaignStatus }
            : c,
        ),
      );
      toast.success(`Campaña "${campaign.campaign_name}" archivada`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al archivar la campaña');
    } finally {
      setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: false }));
    }
  };

  const handleCreateCampaign = async () => {
    if (!formData.campaign_name.trim()) {
      toast.error('Ingresa un nombre para la campaña');
      return;
    }
    if (!formData.daily_budget || Number(formData.daily_budget) <= 0) {
      toast.error('Ingresa un presupuesto diario válido');
      return;
    }
    if (!formData.start_date) {
      toast.error('Selecciona una fecha de inicio');
      return;
    }
    if (formData.placements.length === 0) {
      toast.error('Selecciona al menos una ubicación');
      return;
    }

    setFormSubmitting(true);
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: connectionIds[0],
          data: {
            name: formData.campaign_name.trim(),
            objective: `OUTCOME_${formData.objective}`,
            status: 'PAUSED',
            daily_budget: Number(formData.daily_budget),
            billing_event: 'IMPRESSIONS',
            optimization_goal: formData.optimization_goal === 'PURCHASES' ? 'OFFSITE_CONVERSIONS'
              : formData.optimization_goal === 'ADD_TO_CART' ? 'OFFSITE_CONVERSIONS'
              : 'LINK_CLICKS',
            start_time: formData.start_date,
            end_time: formData.end_date || undefined,
            adset_name: `${formData.campaign_name.trim()} - Ad Set`,
          },
        },
      });

      if (fnErr) throw new Error(fnErr);

      toast.success(`Campaña "${formData.campaign_name}" creada exitosamente`);
      setCreateDialogOpen(false);
      setFormData({ ...EMPTY_FORM });
      await fetchCampaigns();
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear la campaña');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditCampaign = async () => {
    if (!selectedCampaign) return;
    if (!formData.campaign_name.trim()) {
      toast.error('Ingresa un nombre para la campaña');
      return;
    }
    if (!formData.daily_budget || Number(formData.daily_budget) <= 0) {
      toast.error('Ingresa un presupuesto diario válido');
      return;
    }

    setFormSubmitting(true);
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: 'update',
          campaign_id: selectedCampaign.campaign_id,
          connection_id: connectionIds[0],
          data: {
            name: formData.campaign_name.trim(),
            daily_budget: Number(formData.daily_budget),
          },
        },
      });

      if (fnErr) throw new Error(fnErr);

      toast.success(`Campaña "${formData.campaign_name}" actualizada`);
      setEditDialogOpen(false);
      setSelectedCampaign(null);
      setFormData({ ...EMPTY_FORM });
      await fetchCampaigns();
    } catch (err: any) {
      toast.error(err?.message || 'Error al actualizar la campaña');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleQuickBudgetAdjust = async (
    campaign: CampaignRow,
    adjustment: 'plus10' | 'minus10' | 'set',
    specificAmount?: number,
  ) => {
    let newBudget: number;
    if (adjustment === 'plus10') {
      newBudget = Math.round(campaign.daily_budget * 1.1);
    } else if (adjustment === 'minus10') {
      newBudget = Math.max(1000, Math.round(campaign.daily_budget * 0.9));
    } else {
      newBudget = specificAmount || campaign.daily_budget;
    }

    setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: true }));
    try {
      const { error: fnErr } = await callApi('manage-meta-campaign', {
        body: {
          action: 'update_budget',
          campaign_id: campaign.campaign_id,
          connection_id: connectionIds[0],
          data: { daily_budget: newBudget },
        },
      });

      if (fnErr) throw new Error(fnErr);

      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaign_id === campaign.campaign_id
            ? { ...c, daily_budget: newBudget }
            : c,
        ),
      );
      toast.success(
        `Presupuesto actualizado a ${formatCLP(newBudget)}/día`,
      );
      setBudgetDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Error al ajustar presupuesto');
    } finally {
      setActionLoading((prev) => ({ ...prev, [campaign.campaign_id]: false }));
    }
  };

  const openEditDialog = (campaign: CampaignRow) => {
    // Nuevo dialog tabs (Campaña/Ad sets/Ads) — el legacy queda detrás de
    // editDialogOpen pero ya no se abre desde el botón Editar de la fila.
    setMetaEditCampaign(campaign);
    setMetaEditOpen(true);
  };

  const openBudgetDialog = (campaign: CampaignRow) => {
    setSelectedCampaign(campaign);
    setBudgetAmount(String(campaign.daily_budget));
    setBudgetDialogOpen(true);
  };

  const openAnalyticsDialog = (campaign: CampaignRow) => {
    setSelectedCampaign(campaign);
    setAnalyticsDialogOpen(true);
  };

  const togglePlacement = (placement: Placement) => {
    setFormData((prev) => ({
      ...prev,
      placements: prev.placements.includes(placement)
        ? prev.placements.filter((p) => p !== placement)
        : [...prev.placements, placement],
    }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== 'ALL' ||
    dateFrom !== '' ||
    dateTo !== '';

  // ----- Bulk selection handlers -----

  const toggleSelectCampaign = (campaignId: string) => {
    setSelectedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCampaigns.size === filteredCampaigns.length) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(filteredCampaigns.map((c) => c.campaign_id)));
    }
  };

  const handleBulkAction = async (action: 'pause' | 'resume' | 'archive') => {
    if (selectedCampaigns.size === 0 || !connectionIds[0]) return;
    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;
    const succeededIds = new Set<string>();

    for (const campaignId of selectedCampaigns) {
      try {
        const apiAction = action === 'archive' ? 'archive' : action === 'pause' ? 'pause' : 'resume';
        const { error: fnErr } = await callApi('manage-meta-campaign', {
          body: {
            action: apiAction,
            campaign_id: campaignId,
            connection_id: connectionIds[0],
          },
        });
        if (fnErr) throw new Error(fnErr);
        successCount++;
        succeededIds.add(campaignId);
      } catch {
        errorCount++;
      }
    }

    // Only update status for campaigns that actually succeeded
    const newStatus: CampaignStatus = action === 'pause' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : 'ARCHIVED';
    if (succeededIds.size > 0) {
      setCampaigns((prev) =>
        prev.map((c) =>
          succeededIds.has(c.campaign_id) ? { ...c, status: newStatus } : c,
        ),
      );
    }

    setSelectedCampaigns(new Set());
    setBulkActionLoading(false);

    const actionLabel = action === 'pause' ? 'pausadas' : action === 'resume' ? 'reanudadas' : 'archivadas';
    if (successCount > 0) toast.success(`${successCount} campaña(s) ${actionLabel}`);
    if (errorCount > 0) toast.error(`${errorCount} campaña(s) con error`);
  };

  // Determine bulk action options based on selected campaigns' statuses
  const selectedCampaignRows = filteredCampaigns.filter((c) => selectedCampaigns.has(c.campaign_id));
  const hasActiveSelected = selectedCampaignRows.some((c) => c.status === 'ACTIVE');
  const hasPausedSelected = selectedCampaignRows.some((c) => c.status === 'PAUSED');
  const hasNonArchivedSelected = selectedCampaignRows.some((c) => c.status !== 'ARCHIVED');

  // ----- Rendering -----

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-3" />
          <h3 className="text-lg font-semibold mb-2">Error al cargar campañas</h3>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button variant="outline" onClick={fetchCampaigns}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No Meta connection
  if (connectionIds.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin conexión a Meta Ads</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Conecta tu cuenta de Meta Ads desde la sección de{' '}
            <strong>Conexiones</strong> para gestionar campañas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Gestor de Campañas
          </h2>
          <p className="text-muted-foreground text-sm">
            {campaigns.length} campaña{campaigns.length !== 1 ? 's' : ''} encontrada
            {campaigns.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => {
          setFormData({ ...EMPTY_FORM });
          setCreateDialogOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Campaña
        </Button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Budget Summary Cards */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <Card className="border bg-gradient-to-br from-[#F0F4FA]0/8 to-transparent border-[#2A4F9E]/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                Presupuesto Diario Total
              </span>
              <div className="p-2.5 rounded-xl bg-[#1E3A7B]/10">
                <DollarSign className="w-5 h-5 text-[#2A4F9E]" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight mb-1">
              {formatCLP(budgetSummary.totalDaily)}
            </p>
            <p className="text-sm text-muted-foreground">
              {budgetSummary.activeCount} campaña{budgetSummary.activeCount !== 1 ? 's' : ''} activa{budgetSummary.activeCount !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-red-500/8 to-transparent border-red-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                Gasto últimos 30 días
              </span>
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <TrendingUp className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight mb-1">
              {formatCLP(budgetSummary.totalSpend30d)}
            </p>
            <p className="text-sm text-muted-foreground">
              Campañas activas
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-green-500/8 to-transparent border-green-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                Presupuesto Mensual Est.
              </span>
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <CalendarDays className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight mb-1">
              {formatCLP(budgetSummary.totalDaily * 30)}
            </p>
            <p className="text-sm text-muted-foreground">
              Proyección a 30 días
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-purple-500/8 to-transparent border-purple-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                Ventas (30 días)
              </span>
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Megaphone className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight mb-1">
              {formatNumber(budgetSummary.totalConversions)}
            </p>
            <p className="text-sm text-muted-foreground">
              Total de todas las campañas
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-gradient-to-br from-orange-500/8 to-transparent border-orange-500/15">
          <CardContent className="pt-6 pb-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-sm font-medium text-muted-foreground block">
                  Costo por Venta
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  Lo que pagas por cada venta
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-orange-500/10">
                <TrendingDown className="w-5 h-5 text-orange-500" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight mb-1">
              {budgetSummary.avgCpa > 0 ? formatCLP(budgetSummary.avgCpa) : '$0'}
            </p>
            <p className="text-sm text-muted-foreground">
              Promedio general
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Budget Allocation Chart */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Distribución de Presupuesto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetAllocationChart
            campaigns={campaigns}
            totalBudget={budgetSummary.totalDaily}
          />
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Filters */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Buscar
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar campaña..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            {/* Status filter */}
            <div className="w-full md:w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Estado
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as CampaignStatus | 'ALL')
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Activa</SelectItem>
                  <SelectItem value="PAUSED">Pausada</SelectItem>
                  <SelectItem value="COMPLETED">Completada</SelectItem>
                  <SelectItem value="ARCHIVED">Archivada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date from */}
            <div className="w-full md:w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Desde
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Date to */}
            <div className="w-full md:w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">
                Hasta
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Campaigns Table */}
      {/* ----------------------------------------------------------------- */}
      {filteredCampaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Filter className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">
              {campaigns.length === 0
                ? 'Sin campañas'
                : 'Sin resultados'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {campaigns.length === 0
                ? 'Crea tu primera campaña para comenzar.'
                : 'Intenta ajustar los filtros para encontrar campañas.'}
            </p>
            {campaigns.length === 0 && (
              <Button
                className="mt-4"
                onClick={() => {
                  setFormData({ ...EMPTY_FORM });
                  setCreateDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear Campaña
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted backdrop-blur-sm">
                  <tr className="border-b-2 border-border">
                    {/* Checkbox Select All */}
                    <th className="py-3 px-3 w-10">
                      <Checkbox
                        checked={filteredCampaigns.length > 0 && selectedCampaigns.size === filteredCampaigns.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleccionar todas"
                      />
                    </th>
                    {/* Campaign Name */}
                    <th className="text-left py-3 px-4">
                      <button
                        className="flex items-center text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors"
                        onClick={() => handleSort('campaign_name')}
                      >
                        Campaña
                        <SortIcon
                          field="campaign_name"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* Status */}
                    <th className="text-center py-3 px-3">
                      <button
                        className="flex items-center justify-center text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('status')}
                      >
                        Estado
                        <SortIcon
                          field="status"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* Daily Budget */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('daily_budget')}
                      >
                        Presupuesto/Día
                        <SortIcon
                          field="daily_budget"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* Spend 30d */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('spend')}
                      >
                        Gasto 30d
                        <SortIcon
                          field="spend"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* ROAS */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('roas')}
                      >
                        <JargonTooltip term="ROAS" />
                        <SortIcon
                          field="roas"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* CPA */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('cpa')}
                      >
                        Costo/Venta
                        <SortIcon
                          field="cpa"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* CTR */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('ctr')}
                      >
                        Tasa Clics
                        <SortIcon
                          field="ctr"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* CPM */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('cpm')}
                      >
                        <JargonTooltip term="CPM" />
                        <SortIcon
                          field="cpm"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* Conversions */}
                    <th className="text-right py-3 px-3">
                      <button
                        className="flex items-center justify-end text-xs uppercase tracking-wider font-bold text-foreground hover:text-foreground transition-colors w-full"
                        onClick={() => handleSort('conversions')}
                      >
                        Ventas
                        <SortIcon
                          field="conversions"
                          currentField={sortField}
                          direction={sortDirection}
                        />
                      </button>
                    </th>

                    {/* Actions */}
                    <th className="text-center py-3 px-4">
                      <span className="text-xs uppercase tracking-wider font-bold text-foreground">
                        Acciones
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((campaign, idx) => {
                    const isLoading = actionLoading[campaign.campaign_id];
                    return (
                      <tr
                        key={campaign.campaign_id}
                        className={`
                          border-b border-border/30 last:border-0
                          hover:bg-muted/50 transition-colors
                          ${idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/15'}
                          ${isLoading ? 'opacity-60 pointer-events-none' : ''}
                        `}
                      >
                        {/* Checkbox */}
                        <td className="py-4 px-3">
                          <Checkbox
                            checked={selectedCampaigns.has(campaign.campaign_id)}
                            onCheckedChange={() => toggleSelectCampaign(campaign.campaign_id)}
                            aria-label={`Seleccionar ${campaign.campaign_name}`}
                          />
                        </td>
                        {/* Campaign Name */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <button
                              className="font-medium text-sm truncate max-w-[280px] text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                              onClick={() => setQuickViewCampaign(campaign)}
                              title="Ver detalle rápido"
                            >
                              {campaign.campaign_name}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {OBJECTIVE_LABELS[campaign.objective]}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-3 text-center">
                          <StatusBadge status={campaign.status} />
                        </td>

                        {/* Daily Budget */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">Presupuesto/Día</span>
                          <span className="font-medium">{formatCLP(campaign.daily_budget)}</span>
                        </td>

                        {/* Spend 30d */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">Gasto 30d</span>
                          <span className="font-medium">{formatCLP(campaign.spend_30d)}</span>
                        </td>

                        {/* ROAS */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">ROAS</span>
                          <span
                            className={`text-base font-medium ${
                              campaign.roas >= 3
                                ? 'text-green-600'
                                : campaign.roas >= 2
                                  ? 'text-yellow-600'
                                  : campaign.roas > 0
                                    ? 'text-red-500'
                                    : 'text-muted-foreground'
                            }`}
                          >
                            {campaign.roas > 0
                              ? formatRoas(campaign.roas)
                              : '--'}
                          </span>
                        </td>

                        {/* CPA */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">CPA</span>
                          <span>{campaign.cpa > 0 ? formatCLP(campaign.cpa) : '--'}</span>
                        </td>

                        {/* CTR */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">CTR</span>
                          <span>{campaign.ctr > 0 ? formatPercent(campaign.ctr) : '--'}</span>
                        </td>

                        {/* CPM */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">CPM</span>
                          <span>{campaign.cpm > 0 ? formatCLP(campaign.cpm) : '--'}</span>
                        </td>

                        {/* Conversions */}
                        <td className="py-4 px-3 text-right">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">Ventas</span>
                          <span className="font-medium">{formatNumber(campaign.conversions)}</span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Pause/Resume */}
                            {campaign.status !== 'ARCHIVED' &&
                              campaign.status !== 'COMPLETED' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleToggleStatus(campaign)}
                                  aria-label={
                                    campaign.status === 'ACTIVE'
                                      ? 'Pausar campaña'
                                      : 'Reanudar campaña'
                                  }
                                  title={
                                    campaign.status === 'ACTIVE'
                                      ? 'Pausar'
                                      : 'Reanudar'
                                  }
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : campaign.status === 'ACTIVE' ? (
                                    <Pause className="w-3.5 h-3.5" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              )}

                            {/* Edit */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(campaign)}
                              aria-label="Editar campaña"
                              title="Editar"
                              disabled={isLoading}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>

                            {/* Budget */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openBudgetDialog(campaign)}
                              aria-label="Ajustar presupuesto"
                              title="Ajustar presupuesto"
                              disabled={isLoading}
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                            </Button>

                            {/* Duplicate */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDuplicate(campaign)}
                              aria-label="Duplicar campaña"
                              title="Duplicar"
                              disabled={isLoading}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>

                            {/* Analytics */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openAnalyticsDialog(campaign)}
                              aria-label="Ver analítica"
                              title="Ver analítica"
                              disabled={isLoading}
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                            </Button>

                            {/* Archive */}
                            {campaign.status !== 'ARCHIVED' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleArchive(campaign)}
                                aria-label="Archivar campaña"
                                title="Archivar"
                                disabled={isLoading}
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Bulk Actions Floating Bar */}
      {/* ----------------------------------------------------------------- */}
      {selectedCampaigns.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border-2 border-primary/30 shadow-2xl rounded-xl px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">
            {selectedCampaigns.size} campaña{selectedCampaigns.size !== 1 ? 's' : ''} seleccionada{selectedCampaigns.size !== 1 ? 's' : ''}
          </span>
          <div className="h-5 w-px bg-border" />
          {hasActiveSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('pause')}
              disabled={bulkActionLoading}
            >
              {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />}
              Pausar ({selectedCampaignRows.filter((c) => c.status === 'ACTIVE').length})
            </Button>
          )}
          {hasPausedSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('resume')}
              disabled={bulkActionLoading}
            >
              {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              Reactivar ({selectedCampaignRows.filter((c) => c.status === 'PAUSED').length})
            </Button>
          )}
          {hasNonArchivedSelected && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => handleBulkAction('archive')}
              disabled={bulkActionLoading}
            >
              {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
              Archivar ({selectedCampaignRows.filter((c) => c.status !== 'ARCHIVED').length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCampaigns(new Set())}
            disabled={bulkActionLoading}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Quick-View Sheet */}
      {/* ----------------------------------------------------------------- */}
      <Sheet open={!!quickViewCampaign} onOpenChange={(open) => !open && setQuickViewCampaign(null)}>
        <SheetContent className="sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">Detalle Rápido</SheetTitle>
          </SheetHeader>
          {quickViewCampaign && (
            <div className="space-y-6 mt-4">
              {/* Name & Status */}
              <div>
                <h3 className="text-base font-semibold mb-2">{quickViewCampaign.campaign_name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={quickViewCampaign.status} />
                  <Badge variant="secondary" className="text-xs">
                    {OBJECTIVE_LABELS[quickViewCampaign.objective]}
                  </Badge>
                </div>
              </div>

              {/* Key Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Presupuesto/Día</p>
                  <p className="text-lg font-bold">{formatCLP(quickViewCampaign.daily_budget)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Optimización</p>
                  <p className="text-sm font-medium">{OPTIMIZATION_LABELS[quickViewCampaign.optimization_goal]}</p>
                </div>
              </div>

              {/* Period */}
              {(quickViewCampaign.start_date || quickViewCampaign.end_date) && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Periodo:</span>{' '}
                  <span className="font-medium">
                    {quickViewCampaign.start_date || '?'} — {quickViewCampaign.end_date || 'En curso'}
                  </span>
                </div>
              )}

              {/* Placements */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Ubicaciones</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickViewCampaign.placements.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {PLACEMENT_LABELS[p]}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Metrics Table */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Métricas (últimos 30 días)</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2.5 px-3 text-muted-foreground">Gasto</td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatCLP(quickViewCampaign.spend_30d)}</td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2.5 px-3 text-muted-foreground">Ingresos</td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatCLP(quickViewCampaign.revenue)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 px-3 text-muted-foreground">ROAS</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${
                          quickViewCampaign.roas >= 3 ? 'text-green-600' : quickViewCampaign.roas >= 2 ? 'text-yellow-600' : quickViewCampaign.roas > 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}>
                          {quickViewCampaign.roas > 0 ? formatRoas(quickViewCampaign.roas) : '--'}
                        </td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2.5 px-3 text-muted-foreground">CPA</td>
                        <td className="py-2.5 px-3 text-right font-medium">{quickViewCampaign.cpa > 0 ? formatCLP(quickViewCampaign.cpa) : '--'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 px-3 text-muted-foreground">CTR</td>
                        <td className="py-2.5 px-3 text-right font-medium">{quickViewCampaign.ctr > 0 ? formatPercent(quickViewCampaign.ctr) : '--'}</td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2.5 px-3 text-muted-foreground">Impresiones</td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatNumber(quickViewCampaign.impressions)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 px-3 text-muted-foreground">Clics</td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatNumber(quickViewCampaign.clicks)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground">Conversiones</td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatNumber(quickViewCampaign.conversions)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    openEditDialog(quickViewCampaign);
                    setQuickViewCampaign(null);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    openBudgetDialog(quickViewCampaign);
                    setQuickViewCampaign(null);
                  }}
                >
                  <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                  Presupuesto
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    openAnalyticsDialog(quickViewCampaign);
                    setQuickViewCampaign(null);
                  }}
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  Analítica
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ================================================================= */}
      {/* CREATE CAMPAIGN DIALOG */}
      {/* ================================================================= */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Campaña</DialogTitle>
          </DialogHeader>

          <CampaignForm
            formData={formData}
            setFormData={setFormData}
            togglePlacement={togglePlacement}
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={formSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCampaign} disabled={formSubmitting}>
              {formSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Campaña'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* EDIT CAMPAIGN DIALOG */}
      {/* ================================================================= */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Campaña</DialogTitle>
          </DialogHeader>

          <CampaignForm
            formData={formData}
            setFormData={setFormData}
            togglePlacement={togglePlacement}
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setSelectedCampaign(null);
              }}
              disabled={formSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleEditCampaign} disabled={formSubmitting}>
              {formSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* BUDGET ADJUSTMENT DIALOG */}
      {/* ================================================================= */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Ajustar Presupuesto</DialogTitle>
          </DialogHeader>

          {selectedCampaign && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">
                  {selectedCampaign.campaign_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Presupuesto actual:{' '}
                  <span className="font-medium text-foreground">
                    {formatCLP(selectedCampaign.daily_budget)}/día
                  </span>
                </p>
              </div>

              {/* Quick adjust buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex flex-col items-center justify-center gap-0.5"
                  onClick={() =>
                    handleQuickBudgetAdjust(selectedCampaign, 'plus10')
                  }
                  disabled={actionLoading[selectedCampaign.campaign_id]}
                >
                  <div className="flex items-center gap-1">
                    <ChevronUp className="w-4 h-4 text-green-600" />
                    <span className="text-green-600 font-semibold">+10%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatCLP(Math.round(selectedCampaign.daily_budget * 1.1))}
                    /día
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex flex-col items-center justify-center gap-0.5"
                  onClick={() =>
                    handleQuickBudgetAdjust(selectedCampaign, 'minus10')
                  }
                  disabled={actionLoading[selectedCampaign.campaign_id]}
                >
                  <div className="flex items-center gap-1">
                    <ChevronDown className="w-4 h-4 text-red-500" />
                    <span className="text-red-500 font-semibold">-10%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatCLP(
                      Math.max(
                        1000,
                        Math.round(selectedCampaign.daily_budget * 0.9),
                      ),
                    )}
                    /día
                  </span>
                </Button>
              </div>

              {/* Specific amount */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Monto específico (CLP/día)
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    min="1000"
                    step="1000"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="Ej: 50000"
                    className="h-9"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() =>
                      handleQuickBudgetAdjust(
                        selectedCampaign,
                        'set',
                        Number(budgetAmount),
                      )
                    }
                    disabled={
                      !budgetAmount ||
                      Number(budgetAmount) <= 0 ||
                      actionLoading[selectedCampaign.campaign_id]
                    }
                  >
                    {actionLoading[selectedCampaign.campaign_id] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Aplicar'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* ANALYTICS DIALOG */}
      {/* ================================================================= */}
      <Dialog open={analyticsDialogOpen} onOpenChange={setAnalyticsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Analítica de Campaña</DialogTitle>
          </DialogHeader>

          {selectedCampaign && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-base">
                  {selectedCampaign.campaign_name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selectedCampaign.status} />
                  <span className="text-xs text-muted-foreground">
                    {OBJECTIVE_LABELS[selectedCampaign.objective]}
                  </span>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Gasto
                  </p>
                  <p className="text-lg font-bold">
                    {formatCLP(selectedCampaign.spend_30d)}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    <JargonTooltip term="ROAS" />
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      selectedCampaign.roas >= 3
                        ? 'text-green-600'
                        : selectedCampaign.roas >= 2
                          ? 'text-yellow-600'
                          : 'text-red-500'
                    }`}
                  >
                    {selectedCampaign.roas > 0
                      ? formatRoas(selectedCampaign.roas)
                      : '--'}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Costo/Venta
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 -mt-0.5 mb-1">
                    Lo que pagas por cada venta
                  </p>
                  <p className="text-lg font-bold">
                    {selectedCampaign.cpa > 0
                      ? formatCLP(selectedCampaign.cpa)
                      : '$0'}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    <JargonTooltip term="CTR" />
                  </p>
                  <p className="text-lg font-bold">
                    {selectedCampaign.ctr > 0
                      ? formatPercent(selectedCampaign.ctr)
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Detail breakdown */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Desglose Detallado
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impresiones</span>
                    <span className="font-medium">
                      {formatNumber(selectedCampaign.impressions)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clics</span>
                    <span className="font-medium">
                      {formatNumber(selectedCampaign.clicks)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversiones</span>
                    <span className="font-medium">
                      {formatNumber(selectedCampaign.conversions)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos</span>
                    <span className="font-medium">
                      {formatCLP(selectedCampaign.revenue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Presupuesto/Día
                    </span>
                    <span className="font-medium">
                      {formatCLP(selectedCampaign.daily_budget)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <JargonTooltip term="CPC" label="CPC Prom." className="text-muted-foreground" />
                    <span className="font-medium">
                      {selectedCampaign.clicks > 0
                        ? formatCLP(
                            Math.round(
                              selectedCampaign.spend_30d /
                                selectedCampaign.clicks,
                            ),
                          )
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <JargonTooltip term="CPM" className="text-muted-foreground" />
                    <span className="font-medium">
                      {selectedCampaign.impressions > 0
                        ? formatCLP(
                            Math.round(
                              (selectedCampaign.spend_30d /
                                selectedCampaign.impressions) *
                                1000,
                            ),
                          )
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tasa de Conversión</span>
                    <span className="font-medium">
                      {selectedCampaign.clicks > 0
                        ? formatPercent(
                            (selectedCampaign.conversions /
                              selectedCampaign.clicks) *
                              100,
                          )
                        : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Placements */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Ubicaciones
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCampaign.placements.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {PLACEMENT_LABELS[p]}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Period */}
              {(selectedCampaign.start_date || selectedCampaign.end_date) && (
                <div className="text-xs text-muted-foreground">
                  Periodo: {selectedCampaign.start_date || '?'} -{' '}
                  {selectedCampaign.end_date || 'En curso'}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAnalyticsDialogOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar campaña activa — nuevo dialog con tabs Campaña/Ad sets/Ads */}
      {metaEditCampaign && ctxConnectionId && (
        <EditCampaignDialog
          open={metaEditOpen}
          onOpenChange={(o) => {
            setMetaEditOpen(o);
            if (!o) setMetaEditCampaign(null);
          }}
          connectionId={ctxConnectionId}
          campaign={{
            campaign_id: metaEditCampaign.campaign_id,
            campaign_name: metaEditCampaign.campaign_name,
            status: metaEditCampaign.status,
            daily_budget: metaEditCampaign.daily_budget,
          }}
          onSaved={() => {
            // Refrescar la lista de campañas para reflejar el cambio
            fetchCampaigns();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign Form (reused by Create and Edit)
// ---------------------------------------------------------------------------

function CampaignForm({
  formData,
  setFormData,
  togglePlacement,
}: {
  formData: CampaignFormData;
  setFormData: React.Dispatch<React.SetStateAction<CampaignFormData>>;
  togglePlacement: (placement: Placement) => void;
}) {
  return (
    <div className="space-y-4 py-2">
      {/* Campaign name */}
      <div>
        <Label htmlFor="campaign-name">Nombre de la campaña</Label>
        <Input
          id="campaign-name"
          value={formData.campaign_name}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              campaign_name: e.target.value,
            }))
          }
          placeholder="Ej: Promo Verano 2026"
          className="mt-1"
        />
      </div>

      {/* Objective */}
      <div>
        <Label>Objetivo</Label>
        <Select
          value={formData.objective}
          onValueChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              objective: v as CampaignObjective,
            }))
          }
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(OBJECTIVE_LABELS) as [
                CampaignObjective,
                string,
              ][]
            ).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Daily budget */}
      <div>
        <Label htmlFor="daily-budget">Presupuesto diario (CLP)</Label>
        <Input
          id="daily-budget"
          type="number"
          min="1000"
          step="1000"
          value={formData.daily_budget}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              daily_budget: e.target.value,
            }))
          }
          placeholder="Ej: 50000"
          className="mt-1"
        />
        {formData.daily_budget && Number(formData.daily_budget) > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Estimado mensual: {formatCLP(Number(formData.daily_budget) * 30)}
          </p>
        )}
      </div>

      {/* Schedule */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="start-date">Fecha de inicio</Label>
          <Input
            id="start-date"
            type="date"
            value={formData.start_date}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                start_date: e.target.value,
              }))
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="end-date">
            Fecha de fin{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </Label>
          <Input
            id="end-date"
            type="date"
            value={formData.end_date}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                end_date: e.target.value,
              }))
            }
            className="mt-1"
          />
        </div>
      </div>

      {/* Placements */}
      <div>
        <Label>Ubicaciones</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {ALL_PLACEMENTS.map((p) => {
            const isSelected = formData.placements.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlacement(p)}
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  }
                `}
              >
                {PLACEMENT_LABELS[p]}
              </button>
            );
          })}
        </div>
        {formData.placements.length === 0 && (
          <p className="text-xs text-destructive mt-1">
            Selecciona al menos una ubicación
          </p>
        )}
      </div>

      {/* Optimization goal */}
      <div>
        <Label>Objetivo de optimización</Label>
        <Select
          value={formData.optimization_goal}
          onValueChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              optimization_goal: v as OptimizationGoal,
            }))
          }
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(OPTIMIZATION_LABELS) as [
                OptimizationGoal,
                string,
              ][]
            ).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
