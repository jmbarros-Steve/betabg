import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
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
} from 'lucide-react';
import SteveRecommendation from './SteveRecommendation';

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
    next[index] = value;
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
  const [wizardData, setWizardData] = useState({
    name: '',
    channel_type: 'SEARCH',
    daily_budget: '',
    bid_strategy: 'MAXIMIZE_CONVERSIONS',
    target_google_search: true,
    target_search_network: true,
    target_content_network: false,
    start_date: '',
    ad_group_name: 'Ad Group 1',
    ad_group_cpc_bid_micros: '',
    // PMAX
    final_urls: '',
    business_name: '',
    headlines: [''] as string[],
    long_headlines: [''] as string[],
    descriptions: [''] as string[],
    // Shopping
    merchant_center_id: '',
  });

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

    setSettingsData(data?.settings || {});
  };

  const handleSaveSettings = async () => {
    if (!settingsCampaign || !settingsData) return;
    setSettingsSaving(true);

    const { error } = await callApi('manage-google-campaign', {
      body: {
        action: 'update_settings',
        connection_id: connectionId,
        campaign_id: settingsCampaign.id,
        data: {
          bidding_strategy_type: settingsData.bidding_strategy_type,
          network_settings: {
            target_google_search: settingsData.target_google_search,
            target_search_network: settingsData.target_search_network,
            target_content_network: settingsData.target_content_network,
          },
        },
      },
    });

    setSettingsSaving(false);

    if (error) {
      toast.error('Error guardando settings: ' + error);
      return;
    }

    toast.success('Configuracion actualizada');
    setSettingsCampaign(null);
    fetchCampaigns();
  };

  // Ad Groups
  const toggleAdGroups = async (campaignId: string) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      return;
    }

    setExpandedCampaign(campaignId);

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

    const payload: Record<string, any> = {
      name: wizardData.name,
      daily_budget: Number(wizardData.daily_budget),
      channel_type: wizardData.channel_type,
      bid_strategy: wizardData.bid_strategy,
      target_google_search: wizardData.target_google_search,
      target_search_network: wizardData.target_search_network,
      target_content_network: wizardData.target_content_network,
      start_date: wizardData.start_date || undefined,
      ad_group_name: wizardData.ad_group_name || 'Ad Group 1',
    };

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
    }

    // Shopping
    if (wizardData.channel_type === 'SHOPPING') {
      payload.merchant_center_id = wizardData.merchant_center_id || undefined;
    }

    const { error } = await callApi('manage-google-campaign', {
      body: {
        action: 'create_campaign',
        connection_id: connectionId,
        data: payload,
      },
    });

    setWizardLoading(false);

    if (error) {
      toast.error('Error creando campana: ' + error);
      return;
    }

    toast.success('Campana creada en estado PAUSADA');
    setWizardOpen(false);
    setWizardStep(1);
    setWizardData({
      name: '', channel_type: 'SEARCH', daily_budget: '', bid_strategy: 'MAXIMIZE_CONVERSIONS',
      target_google_search: true, target_search_network: true, target_content_network: false,
      start_date: '', ad_group_name: 'Ad Group 1', ad_group_cpc_bid_micros: '',
      final_urls: '', business_name: '', headlines: [''], long_headlines: [''], descriptions: [''], merchant_center_id: '',
    });
    fetchCampaigns();
  };

  const handleApplyRecommendation = (rec: any) => {
    if (rec?.bid_strategy) {
      setWizardData(prev => ({
        ...prev,
        bid_strategy: rec.bid_strategy,
        daily_budget: rec.daily_budget ? String(rec.daily_budget) : prev.daily_budget,
      }));
      toast.success('Sugerencia de Steve aplicada');
    }
  };

  const handleApplyPmaxRecommendation = (rec: any) => {
    if (rec?.headlines || rec?.long_headlines || rec?.descriptions) {
      setWizardData(prev => ({
        ...prev,
        headlines: rec.headlines?.length ? rec.headlines : prev.headlines,
        long_headlines: rec.long_headlines?.length ? rec.long_headlines : prev.long_headlines,
        descriptions: rec.descriptions?.length ? rec.descriptions : prev.descriptions,
      }));
      toast.success('Assets de Steve aplicados');
    }
  };

  // Wizard step helpers
  const isPmax = wizardData.channel_type === 'PERFORMANCE_MAX';
  const totalSteps = isPmax ? 4 : 3;

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
                <>
                  <tr key={campaign.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      {campaign.channel_type !== 'PERFORMANCE_MAX' && (
                        <button onClick={() => toggleAdGroups(campaign.id)}>
                          {expandedCampaign === campaign.id
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                      )}
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

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
                </>
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
      <Dialog open={!!settingsCampaign} onOpenChange={() => setSettingsCampaign(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configuracion de Campana</DialogTitle>
          </DialogHeader>
          {settingsLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando...
            </div>
          ) : settingsData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground truncate">{settingsCampaign?.name}</p>

              <div className="space-y-2">
                <Label>Estrategia de puja</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={settingsData.bidding_strategy_type || ''}
                  onChange={e => setSettingsData((p: any) => ({ ...p, bidding_strategy_type: e.target.value }))}
                >
                  {bidStrategies.map(bs => (
                    <option key={bs.value} value={bs.value}>{bs.label}</option>
                  ))}
                </select>
              </div>

              {settingsData.channel_type === 'SEARCH' && (
                <div className="space-y-3">
                  <Label>Redes</Label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Google Search</span>
                      <Switch
                        checked={settingsData.target_google_search ?? true}
                        onCheckedChange={val => setSettingsData((p: any) => ({ ...p, target_google_search: val }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Red de busqueda</span>
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
                  </div>
                </div>
              )}

              {settingsData.start_date && (
                <p className="text-xs text-muted-foreground">
                  Inicio: {settingsData.start_date} {settingsData.end_date ? `| Fin: ${settingsData.end_date}` : ''}
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsCampaign(null)}>Cancelar</Button>
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
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
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
              <div className="space-y-2">
                <Label>Nombre de la campana *</Label>
                <Input
                  value={wizardData.name}
                  onChange={e => setWizardData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Mi Campana Search"
                  maxLength={128}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de campana</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={wizardData.channel_type}
                  onChange={e => setWizardData(prev => ({ ...prev, channel_type: e.target.value }))}
                >
                  <option value="SEARCH">Search</option>
                  <option value="PERFORMANCE_MAX">Performance Max</option>
                  <option value="SHOPPING">Shopping</option>
                  <option value="DISPLAY">Display</option>
                </select>
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
              </div>
            </div>
          )}

          {/* Step 2: Config */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Estrategia de puja</Label>
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
                  recommendationType="campaign_setup"
                  channelType={wizardData.channel_type}
                  onApply={handleApplyRecommendation}
                />
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

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Fecha de inicio (opcional)
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
                maxItems={4}
                minItems={2}
                onChange={descriptions => setWizardData(prev => ({ ...prev, descriptions }))}
              />
              <SteveRecommendation
                connectionId={connectionId}
                recommendationType="pmax_assets"
                channelType="PERFORMANCE_MAX"
                context={`Negocio: ${wizardData.business_name || 'Sin nombre'}, URL: ${wizardData.final_urls || 'Sin URL'}`}
                onApply={handleApplyPmaxRecommendation}
              />
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
                  </div>

                  {isPmax && (
                    <div className="border-t pt-3 mt-3 space-y-2">
                      <p className="font-medium">Assets PMAX</p>
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
                      {wizardData.business_name && (
                        <p className="text-xs">Negocio: <strong>{wizardData.business_name}</strong></p>
                      )}
                      {wizardData.final_urls && (
                        <p className="text-xs">URL: <strong>{wizardData.final_urls}</strong></p>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">La campana se creara en estado PAUSADA.</p>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {wizardStep > 1 && (
              <Button variant="outline" onClick={() => setWizardStep(s => s - 1)}>
                Atras
              </Button>
            )}
            <div className="flex-1" />
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
    </div>
  );
}
