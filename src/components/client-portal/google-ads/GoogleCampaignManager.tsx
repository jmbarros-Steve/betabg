import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';

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

interface GoogleCampaignManagerProps {
  connectionId: string;
  clientId: string;
}

type SortKey = 'name' | 'status' | 'channel_type' | 'daily_budget_clp';

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

export default function GoogleCampaignManager({ connectionId, clientId }: GoogleCampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Budget dialog
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetCampaign, setBudgetCampaign] = useState<Campaign | null>(null);
  const [newBudget, setNewBudget] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

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
  }, [fetchCampaigns]);

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
      // Revert optimistic update
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

    const { error } = await callApi('manage-google-campaign', {
      body: {
        action: 'update_budget',
        connection_id: connectionId,
        campaign_id: budgetCampaign.id,
        data: { daily_budget: parsedBudget },
      },
    });

    setBudgetSaving(false);

    if (error) {
      toast.error('Error actualizando presupuesto: ' + error);
      return;
    }

    toast.success('Presupuesto actualizado');
    setBudgetDialogOpen(false);
    fetchCampaigns();
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  // Filter and sort
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
                <tr key={campaign.id} className="border-b last:border-0 hover:bg-muted/30">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filteredCampaigns.length} campana{filteredCampaigns.length !== 1 ? 's' : ''}
        {statusFilter !== 'ALL' && ` (${statusFilter === 'ENABLED' ? 'activas' : 'pausadas'})`}
      </p>

      {/* Budget Dialog */}
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
    </div>
  );
}
