import { useState, useEffect, useCallback, useRef } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ShoppingCart, Plus, RefreshCw, Loader2, Sparkles, TrendingUp, Package,
  ChevronRight, ChevronDown, X, Edit, Trash2, AlertCircle, Tag, Ban,
} from 'lucide-react';

interface Props {
  connectionId: string;
  clientId: string;
}

interface ShoppingCampaign {
  id: string;
  name: string;
  status: string;
  merchant_id: string | null;
  feed_label: string | null;
  campaign_priority: number;
  bidding_strategy_type: string;
  budget: number;
  clicks: number;
  impressions: number;
  cost_micros: number;
  conversions: number;
  conversions_value: number;
  ctr: number;
  roas: number;
}

interface ProductGroup {
  criterion_id: string;
  resource_name: string;
  parent_resource_name: string | null;
  type: string; // SUBDIVISION | UNIT
  status: string;
  negative: boolean;
  cpc_bid_micros: number;
  dimension: string | null;
  value: string | null;
  extra: Record<string, any>;
  metrics: {
    clicks: number;
    impressions: number;
    cost_micros: number;
    conversions: number;
    conversions_value: number;
    ctr: number;
    avg_cpc: number;
    roas: number;
  };
}

interface ShoppingProduct {
  item_id: string;
  title: string;
  brand: string | null;
  price: number;
  currency_code: string;
  status: string;
  availability: string;
  channel: string;
  image_link: string | null;
  category_level1: string | null;
  product_type_level1: string | null;
  custom_attribute0: string | null;
}

const statusBadge = (s: string) => {
  if (s === 'ENABLED') return 'bg-green-500/10 text-green-600 border-green-500/20';
  if (s === 'PAUSED') return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
};

const DIMENSION_LABELS: Record<string, string> = {
  product_brand: 'Marca',
  product_type: 'Tipo de producto',
  product_condition: 'Condición',
  product_channel: 'Canal',
  product_custom_attribute: 'Etiqueta custom',
  product_item_id: 'SKU',
  product_bidding_category: 'Categoría Google',
};

export default function GoogleShoppingManager({ connectionId, clientId }: Props) {
  const [campaigns, setCampaigns] = useState<ShoppingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adGroups, setAdGroups] = useState<Record<string, any[]>>({});
  const [productGroups, setProductGroups] = useState<Record<string, ProductGroup[]>>({});
  const [products, setProducts] = useState<Record<string, ShoppingProduct[]>>({});
  const [productsSummary, setProductsSummary] = useState<Record<string, Record<string, number>>>({});
  const [metricsByDim, setMetricsByDim] = useState<Record<string, any[]>>({});
  const [metricsDim, setMetricsDim] = useState('brand');
  const [expandedDetailLoading, setExpandedDetailLoading] = useState<Record<string, boolean>>({});
  const fetchingRef = useRef(false);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [merchantCenters, setMerchantCenters] = useState<Array<{ id: string; name?: string; feed_label?: string }>>([]);
  const [mcLoading, setMcLoading] = useState(false);
  const [wizardData, setWizardData] = useState({
    name: '',
    daily_budget: '',
    merchant_center_id: '',
    feed_label: '',
    enable_local_inventory_ads: false,
    campaign_priority: 0,
    bid_strategy: 'MAXIMIZE_CLICKS',
    target_roas: '',
    ad_group_name: 'Ad Group 1',
    ad_group_cpc_bid: '',
  });

  // Bid edit dialog
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidDialogPG, setBidDialogPG] = useState<ProductGroup | null>(null);
  const [bidDialogValue, setBidDialogValue] = useState('');
  const [bidDialogLoading, setBidDialogLoading] = useState(false);

  // Subdivision dialog
  const [subdivOpen, setSubdivOpen] = useState(false);
  const [subdivAgId, setSubdivAgId] = useState<string | null>(null);
  const [subdivParent, setSubdivParent] = useState<string | null>(null);
  const [subdivDimension, setSubdivDimension] = useState<string>('product_brand');
  const [subdivEntries, setSubdivEntries] = useState<Array<{ value: string; cpc: string }>>([{ value: '', cpc: '0.50' }]);
  const [subdivCatchCpc, setSubdivCatchCpc] = useState('0.40');
  const [subdivLoading, setSubdivLoading] = useState(false);
  const [subdivSteveLoading, setSubdivSteveLoading] = useState(false);

  // Negative dialog
  const [negOpen, setNegOpen] = useState(false);
  const [negAgId, setNegAgId] = useState<string | null>(null);
  const [negParent, setNegParent] = useState<string | null>(null);
  const [negDimension, setNegDimension] = useState('product_brand');
  const [negValue, setNegValue] = useState('');
  const [negLoading, setNegLoading] = useState(false);

  // Remove confirm dialog (con listado de children en cascade si es SUBDIVISION)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ resource: string; agId: string; label: string; cascadeChildren: string[] } | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const fetchCampaigns = useCallback(async (opts?: { silent?: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (!opts?.silent) setLoading(true);
      setRefreshing(true);
      const { data, error } = await callApi('manage-google-shopping', {
        body: { action: 'list_shopping_campaigns', connection_id: connectionId },
      });
      setRefreshing(false);
      if (error) {
        if (!opts?.silent) toast.error('Error cargando Shopping: ' + error);
        setLoading(false);
        return;
      }
      setCampaigns(data?.campaigns || []);
      setLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [connectionId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const fetchCampaignDetail = async (campaignId: string) => {
    setExpandedDetailLoading(p => ({ ...p, [campaignId]: true }));
    try {
      // Ad groups
      const agRes = await callApi('manage-google-shopping', {
        body: { action: 'list_shopping_ad_groups', connection_id: connectionId, campaign_id: campaignId },
      });
      const ags = agRes.data?.ad_groups || [];
      setAdGroups(p => ({ ...p, [campaignId]: ags }));

      // Product groups para cada ad group
      const pgMap: Record<string, ProductGroup[]> = {};
      await Promise.all(ags.map(async (ag: any) => {
        const pgRes = await callApi('manage-google-shopping', {
          body: { action: 'list_product_groups', connection_id: connectionId, ad_group_id: ag.id },
        });
        pgMap[ag.id] = pgRes.data?.product_groups || [];
      }));
      setProductGroups(p => ({ ...p, ...pgMap }));

      // Products del feed (si la campaña tiene merchant_id)
      const camp = campaigns.find(c => c.id === campaignId);
      if (camp?.merchant_id) {
        const prodRes = await callApi('manage-google-shopping', {
          body: { action: 'list_shopping_products', connection_id: connectionId, data: { merchant_center_id: camp.merchant_id, limit: 100 } },
        });
        setProducts(p => ({ ...p, [campaignId]: prodRes.data?.products || [] }));
        setProductsSummary(p => ({ ...p, [campaignId]: prodRes.data?.summary || {} }));
      }

      // Métricas por dimensión
      const metRes = await callApi('manage-google-shopping', {
        body: { action: 'list_shopping_metrics_by_dimension', connection_id: connectionId, data: { campaign_id: campaignId, dimension: metricsDim, limit: 20 } },
      });
      setMetricsByDim(p => ({ ...p, [campaignId]: metRes.data?.rows || [] }));
    } finally {
      setExpandedDetailLoading(p => ({ ...p, [campaignId]: false }));
    }
  };

  const toggleExpand = (campaignId: string) => {
    if (expandedId === campaignId) {
      setExpandedId(null);
    } else {
      setExpandedId(campaignId);
      if (!adGroups[campaignId]) fetchCampaignDetail(campaignId);
    }
  };

  // ── Wizard ──────────────────────────────────────────────────────────
  const openWizard = async () => {
    setWizardOpen(true);
    setWizardStep(1);
    setWizardData({
      name: '', daily_budget: '', merchant_center_id: '', feed_label: '',
      enable_local_inventory_ads: false, campaign_priority: 0,
      bid_strategy: 'MAXIMIZE_CLICKS', target_roas: '',
      ad_group_name: 'Ad Group 1', ad_group_cpc_bid: '',
    });
    // Cargar Merchant Centers linkeados
    setMcLoading(true);
    const { data } = await callApi('manage-google-campaign', {
      body: { action: 'list_merchant_centers', connection_id: connectionId },
    });
    setMerchantCenters(data?.merchant_centers || []);
    setMcLoading(false);
  };

  const submitWizard = async () => {
    if (!wizardData.name.trim() || !wizardData.daily_budget || !wizardData.merchant_center_id) {
      toast.error('Nombre, presupuesto y Merchant Center son requeridos');
      return;
    }
    setWizardLoading(true);
    try {
      const payload: Record<string, any> = {
        name: wizardData.name.trim(),
        daily_budget: Number(wizardData.daily_budget),
        merchant_center_id: wizardData.merchant_center_id,
        feed_label: wizardData.feed_label || undefined,
        enable_local_inventory_ads: wizardData.enable_local_inventory_ads || undefined,
        campaign_priority: wizardData.campaign_priority,
        bid_strategy: wizardData.bid_strategy,
        ad_group_name: wizardData.ad_group_name,
      };
      const roasNum = Number(wizardData.target_roas);
      if (roasNum > 0 && wizardData.bid_strategy === 'MAXIMIZE_CONVERSION_VALUE') {
        payload.target_roas = roasNum;
      }
      const cpcNum = Number(wizardData.ad_group_cpc_bid);
      if (cpcNum > 0) payload.ad_group_cpc_bid_micros = Math.round(cpcNum * 1_000_000);

      const { data, error } = await callApi('manage-google-shopping', {
        body: { action: 'create_shopping_campaign', connection_id: connectionId, data: payload },
      });
      if (error) { toast.error('Error creando campaña: ' + error); return; }

      toast.success(data?.message || `Campaña Shopping "${wizardData.name}" creada`);
      setWizardOpen(false);
      await fetchCampaigns();
    } finally {
      setWizardLoading(false);
    }
  };

  // ── Product group actions ───────────────────────────────────────────
  const openBidDialog = (pg: ProductGroup) => {
    setBidDialogPG(pg);
    setBidDialogValue((pg.cpc_bid_micros / 1_000_000).toFixed(2));
    setBidDialogOpen(true);
  };
  const submitBidUpdate = async () => {
    if (!bidDialogPG) return;
    const bidNum = Number(bidDialogValue);
    if (!bidNum || bidNum <= 0) { toast.error('CPC debe ser > 0'); return; }
    setBidDialogLoading(true);
    try {
      const { error } = await callApi('manage-google-shopping', {
        body: { action: 'update_product_group_bid', connection_id: connectionId, data: { criterion_resource_name: bidDialogPG.resource_name, cpc_bid_micros: Math.round(bidNum * 1_000_000) } },
      });
      if (error) { toast.error('Error: ' + error); return; }
      toast.success('Bid actualizado');
      setBidDialogOpen(false);
      if (expandedId) fetchCampaignDetail(expandedId);
    } finally {
      setBidDialogLoading(false);
    }
  };

  const openSubdivDialog = (agId: string, parentResource: string | null) => {
    setSubdivAgId(agId);
    setSubdivParent(parentResource);
    setSubdivDimension('product_brand');
    setSubdivEntries([{ value: '', cpc: '0.50' }]);
    setSubdivCatchCpc('0.40');
    setSubdivOpen(true);
  };

  const steveSuggestSubdiv = async () => {
    const camp = expandedId ? campaigns.find(c => c.id === expandedId) : null;
    if (!camp) return;
    setSubdivSteveLoading(true);
    try {
      const { data, error } = await callApi('manage-google-shopping', {
        body: { action: 'suggest_shopping_structure', connection_id: connectionId, data: { campaign_id: camp.id, client_id: clientId } },
      });
      if (error) { toast.error('Steve: ' + error); return; }
      const sugg = data?.suggested_subdivisions || [];
      if (sugg.length === 0 || (sugg.length === 1 && sugg[0].value?.startsWith('(Steve'))) {
        toast.warning(data?.reasoning || 'Sin datos suficientes');
        return;
      }
      setSubdivDimension(data.dimension || 'product_brand');
      setSubdivEntries(sugg.map((s: any) => ({
        value: String(s.value || ''),
        cpc: ((Number(s.cpc_bid_micros) || 500_000) / 1_000_000).toFixed(2),
      })));
      if (data.catch_all_cpc_bid_micros) {
        setSubdivCatchCpc((data.catch_all_cpc_bid_micros / 1_000_000).toFixed(2));
      }
      toast.success(`Steve sugirió ${sugg.length} subdivisiones con ${data.dimension}`);
    } finally {
      setSubdivSteveLoading(false);
    }
  };

  const submitSubdiv = async () => {
    if (!subdivAgId) return;
    const entries = subdivEntries.filter(e => e.value.trim());
    if (entries.length === 0) { toast.error('Agregá al menos 1 subdivisión'); return; }

    const catchBid = Math.round(Number(subdivCatchCpc) * 1_000_000);
    if (!catchBid || catchBid <= 0) { toast.error('CPC catch-all inválido'); return; }

    setSubdivLoading(true);
    try {
      const subdivisions = entries.map(e => ({
        value: e.value.trim(),
        cpc_bid_micros: Math.round(Number(e.cpc) * 1_000_000),
      }));
      const { error } = await callApi('manage-google-shopping', {
        body: {
          action: 'add_product_group_subdivision',
          connection_id: connectionId,
          ad_group_id: subdivAgId,
          data: {
            parent_criterion_resource_name: subdivParent,
            dimension: subdivDimension,
            subdivisions,
            catch_all_cpc_bid_micros: catchBid,
          },
        },
      });
      if (error) { toast.error('Error: ' + error); return; }
      toast.success(`Subdivisión creada con ${entries.length} valores`);
      setSubdivOpen(false);
      if (expandedId) fetchCampaignDetail(expandedId);
    } finally {
      setSubdivLoading(false);
    }
  };

  const openNegDialog = (agId: string, parentResource: string) => {
    setNegAgId(agId);
    setNegParent(parentResource);
    setNegDimension('product_brand');
    setNegValue('');
    setNegOpen(true);
  };

  const submitNeg = async () => {
    if (!negAgId || !negParent || !negValue.trim()) { toast.error('Valor requerido'); return; }
    setNegLoading(true);
    try {
      const { error } = await callApi('manage-google-shopping', {
        body: {
          action: 'add_negative_product_group',
          connection_id: connectionId,
          ad_group_id: negAgId,
          data: { parent_criterion_resource_name: negParent, dimension: negDimension, value: negValue.trim() },
        },
      });
      if (error) { toast.error('Error: ' + error); return; }
      toast.success('Exclusión agregada');
      setNegOpen(false);
      if (expandedId) fetchCampaignDetail(expandedId);
    } finally {
      setNegLoading(false);
    }
  };

  const openRemoveDialog = (agId: string, node: ProductGroup) => {
    const pgs = productGroups[agId] || [];
    // Encontrar children recursivos para mostrar el alcance del cascade
    const cascadeLabels: string[] = [];
    const collectChildren = (parentResource: string) => {
      for (const pg of pgs) {
        if (pg.parent_resource_name === parentResource) {
          const label = pg.dimension === null
            ? 'Everything else'
            : `${DIMENSION_LABELS[pg.dimension] || pg.dimension}: ${pg.value}`;
          cascadeLabels.push(label);
          if (pg.type === 'SUBDIVISION') collectChildren(pg.resource_name);
        }
      }
    };
    if (node.type === 'SUBDIVISION') collectChildren(node.resource_name);
    const nodeLabel = node.dimension === null
      ? 'All products'
      : `${DIMENSION_LABELS[node.dimension] || node.dimension}: ${node.value}`;
    setRemoveTarget({ resource: node.resource_name, agId, label: nodeLabel, cascadeChildren: cascadeLabels });
    setRemoveDialogOpen(true);
  };

  const confirmRemovePG = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      const { error } = await callApi('manage-google-shopping', {
        body: { action: 'remove_product_group', connection_id: connectionId, data: { criterion_resource_name: removeTarget.resource } },
      });
      if (error) { toast.error('Error: ' + error); return; }
      toast.success('Product group removido');
      setRemoveDialogOpen(false);
      if (expandedId) fetchCampaignDetail(expandedId);
    } finally {
      setRemoveLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────

  const renderProductGroupTree = (agId: string) => {
    const pgs = productGroups[agId] || [];
    if (pgs.length === 0) {
      return (
        <div className="p-3 text-center text-xs text-muted-foreground border border-dashed rounded">
          Sin product groups. Google debería haber creado "All products" automáticamente.
        </div>
      );
    }

    // Build tree
    const byResource = new Map<string, ProductGroup>();
    const childrenBy = new Map<string | null, ProductGroup[]>();
    for (const pg of pgs) {
      byResource.set(pg.resource_name, pg);
      const parent = pg.parent_resource_name;
      if (!childrenBy.has(parent)) childrenBy.set(parent, []);
      childrenBy.get(parent)!.push(pg);
    }
    const roots = childrenBy.get(null) || [];

    const renderNode = (node: ProductGroup, depth = 0) => {
      const kids = childrenBy.get(node.resource_name) || [];
      const label = node.dimension === null
        ? (depth === 0 ? 'All products' : 'Everything else')
        : `${DIMENSION_LABELS[node.dimension] || node.dimension}: ${node.value}`;
      const m = node.metrics;
      return (
        <div key={node.criterion_id} style={{ marginLeft: depth * 16 }} className="border-l-2 border-border pl-2 py-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium flex items-center gap-1">
              {node.negative && <Ban className="w-3 h-3 text-red-500" />}
              {node.type === 'SUBDIVISION' ? '📁' : '📄'} {label}
            </span>
            <Badge variant="outline" className="text-[10px]">{node.type}</Badge>
            {node.type === 'UNIT' && !node.negative && (
              <span className="text-[10px] text-muted-foreground">
                Bid: ${(node.cpc_bid_micros / 1_000_000).toFixed(2)}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {m.clicks}c · ${(m.cost_micros / 1_000_000).toFixed(2)} · ROAS {m.roas.toFixed(1)}x
            </span>
            {node.type === 'UNIT' && !node.negative && (
              <>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openBidDialog(node)} title="Editar bid">
                  <Edit className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openSubdivDialog(agId, node.resource_name)} title="Subdividir">
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </>
            )}
            {node.type === 'SUBDIVISION' && (
              <>
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => openNegDialog(agId, node.resource_name)} title="Excluir producto">
                  <Ban className="w-3 h-3" />
                </Button>
              </>
            )}
            {depth > 0 && (
              <Button size="sm" variant="ghost" className="h-6 px-1 text-red-500" onClick={() => openRemoveDialog(agId, node)} title="Eliminar">
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
          {kids.map(k => renderNode(k, depth + 1))}
        </div>
      );
    };

    return <div className="space-y-0">{roots.map(r => renderNode(r, 0))}</div>;
  };

  const campaignTotal = campaigns.length;

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-primary" />
            {campaignTotal} Campaña{campaignTotal !== 1 ? 's' : ''} Shopping
          </h3>
          <p className="text-xs text-muted-foreground">Product groups + feed del Merchant Center + Steve sugiere estructura con ROAS</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchCampaigns()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
          <Button size="sm" onClick={openWizard}>
            <Plus className="w-4 h-4 mr-1" />
            Nueva campaña Shopping
          </Button>
        </div>
      </div>

      {/* Lista de campañas */}
      {campaigns.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No hay campañas Shopping. Creá una para empezar.
        </Card>
      ) : campaigns.map(camp => {
        const expanded = expandedId === camp.id;
        const detailLoading = expandedDetailLoading[camp.id];
        return (
          <Card key={camp.id} className="overflow-hidden">
            <button
              className="w-full p-3 flex items-center gap-3 hover:bg-muted/30 transition text-left"
              onClick={() => toggleExpand(camp.id)}
            >
              {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{camp.name}</span>
                  <Badge variant="outline" className={`text-[10px] ${statusBadge(camp.status)}`}>{camp.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">Priority {camp.campaign_priority}</Badge>
                  {camp.merchant_id && <Badge variant="outline" className="text-[10px]">MC {camp.merchant_id}</Badge>}
                  {camp.feed_label && <Badge variant="outline" className="text-[10px]">Feed {camp.feed_label}</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Budget ${camp.budget.toFixed(2)}/día · {camp.bidding_strategy_type}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs text-right shrink-0">
                <div><div className="text-muted-foreground text-[10px]">Clicks</div><div className="font-medium">{camp.clicks}</div></div>
                <div><div className="text-muted-foreground text-[10px]">Costo</div><div className="font-medium">${(camp.cost_micros / 1_000_000).toFixed(2)}</div></div>
                <div><div className="text-muted-foreground text-[10px]">Conv</div><div className="font-medium">{camp.conversions.toFixed(1)}</div></div>
                <div><div className="text-muted-foreground text-[10px]">ROAS</div><div className={`font-medium ${camp.roas >= 2 ? 'text-green-600' : camp.roas >= 1 ? 'text-yellow-600' : 'text-red-500'}`}>{camp.roas.toFixed(1)}x</div></div>
              </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t p-4 space-y-4 bg-muted/10">
                {detailLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Cargando detalle...
                  </div>
                )}

                {/* Ad Groups + Product Groups */}
                {(adGroups[camp.id] || []).map((ag: any) => (
                  <Card key={ag.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-primary" />
                          {ag.name}
                          <Badge variant="outline" className="text-[10px]">{ag.type}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {ag.clicks}c · ${(ag.cost_micros / 1_000_000).toFixed(2)} · ROAS {ag.roas.toFixed(1)}x
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={async () => {
                        // Abrir dialog primero (set state síncrono), después Steve
                        openSubdivDialog(ag.id, null);
                        setTimeout(() => steveSuggestSubdiv(), 0);
                      }}>
                        <Sparkles className="w-3 h-3 text-primary" />
                        Steve sugiere estructura
                      </Button>
                    </div>
                    <div className="mt-2">
                      <div className="text-[11px] font-medium text-muted-foreground mb-1">Product Groups</div>
                      {renderProductGroupTree(ag.id)}
                    </div>
                  </Card>
                ))}

                {/* Productos del feed */}
                {products[camp.id] && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-primary" />
                        Productos del feed ({(products[camp.id] || []).length})
                      </div>
                      <div className="flex gap-1">
                        {Object.entries(productsSummary[camp.id] || {}).map(([status, count]) => (
                          <Badge key={status} variant="outline" className={`text-[10px] ${status === 'ELIGIBLE' ? 'bg-green-500/10 text-green-600' : status.includes('NOT') ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                            {status}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {(productsSummary[camp.id]?.NOT_ELIGIBLE || 0) > 0 && (
                      <div className="text-xs text-red-600 flex items-center gap-1 mb-2">
                        <AlertCircle className="w-3 h-3" />
                        Productos rechazados — revisá en Merchant Center
                      </div>
                    )}
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {(products[camp.id] || []).slice(0, 50).map(p => (
                        <div key={p.item_id} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded">
                          {p.image_link && <img src={p.image_link} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{p.title}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {p.brand && `${p.brand} · `}SKU {p.item_id}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium">${p.price.toFixed(2)} {p.currency_code}</div>
                            <Badge variant="outline" className={`text-[9px] ${p.status === 'ELIGIBLE' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Métricas por dimensión */}
                {metricsByDim[camp.id] && metricsByDim[camp.id].length > 0 && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        Métricas por dimensión
                      </div>
                      <select
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                        value={metricsDim}
                        onChange={async e => {
                          setMetricsDim(e.target.value);
                          const metRes = await callApi('manage-google-shopping', {
                            body: { action: 'list_shopping_metrics_by_dimension', connection_id: connectionId, data: { campaign_id: camp.id, dimension: e.target.value, limit: 20 } },
                          });
                          setMetricsByDim(p => ({ ...p, [camp.id]: metRes.data?.rows || [] }));
                        }}
                      >
                        <option value="brand">Por marca</option>
                        <option value="product_type_l1">Por tipo</option>
                        <option value="category_l1">Por categoría Google</option>
                        <option value="item_id">Por SKU</option>
                        <option value="channel">Por canal</option>
                      </select>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="text-left text-[10px] text-muted-foreground border-b">
                          <tr><th className="pb-1">Valor</th><th className="text-right pb-1">Clicks</th><th className="text-right pb-1">Costo</th><th className="text-right pb-1">Conv</th><th className="text-right pb-1">ROAS</th></tr>
                        </thead>
                        <tbody>
                          {(metricsByDim[camp.id] || []).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-1 truncate max-w-[160px]">{r.value}</td>
                              <td className="text-right">{r.clicks}</td>
                              <td className="text-right">${(r.cost_micros / 1_000_000).toFixed(2)}</td>
                              <td className="text-right">{r.conversions.toFixed(1)}</td>
                              <td className={`text-right font-medium ${r.roas >= 2 ? 'text-green-600' : r.roas >= 1 ? 'text-yellow-600' : 'text-red-500'}`}>{r.roas.toFixed(1)}x</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={o => { if (!wizardLoading) setWizardOpen(o); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva campaña Shopping — Paso {wizardStep}/3</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {wizardStep === 1 && (
              <>
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input value={wizardData.name} onChange={e => setWizardData(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Shopping - Zapatillas" maxLength={128} />
                </div>
                <div className="space-y-1">
                  <Label>Presupuesto diario (USD)</Label>
                  <Input type="number" step="0.01" min="0" value={wizardData.daily_budget} onChange={e => setWizardData(p => ({ ...p, daily_budget: e.target.value }))} placeholder="Ej: 20.00" />
                </div>
              </>
            )}
            {wizardStep === 2 && (
              <>
                <div className="space-y-1">
                  <Label>Merchant Center linkeado</Label>
                  {mcLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : merchantCenters.length === 0 ? (
                    <div className="text-xs text-red-600 border border-red-500/30 bg-red-500/5 p-2 rounded">
                      No hay Merchant Centers linkeados. Linkealo primero desde Google Ads → Settings → Linked accounts.
                    </div>
                  ) : (
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={wizardData.merchant_center_id}
                      onChange={e => setWizardData(p => ({ ...p, merchant_center_id: e.target.value }))}
                    >
                      <option value="">Elegí un Merchant Center...</option>
                      {merchantCenters.map(mc => (
                        <option key={mc.id} value={mc.id}>
                          {mc.name || `MC ${mc.id}`} {mc.feed_label ? `(${mc.feed_label})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Feed label (opcional — si tu feed usa labels multi-país)</Label>
                  <Input value={wizardData.feed_label} onChange={e => setWizardData(p => ({ ...p, feed_label: e.target.value }))} placeholder="Ej: MX" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prioridad de campaña</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={wizardData.campaign_priority}
                    onChange={e => setWizardData(p => ({ ...p, campaign_priority: Number(e.target.value) }))}
                  >
                    <option value={0}>Baja (0) — default</option>
                    <option value={1}>Media (1)</option>
                    <option value={2}>Alta (2)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">Si tenés overlap con otra Shopping, la de mayor prioridad gana el ad slot.</p>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={wizardData.enable_local_inventory_ads} onChange={e => setWizardData(p => ({ ...p, enable_local_inventory_ads: e.target.checked }))} />
                  Habilitar Local Inventory Ads (necesita configuración en Merchant Center)
                </label>
              </>
            )}
            {wizardStep === 3 && (
              <>
                <div className="space-y-1">
                  <Label>Estrategia de puja</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={wizardData.bid_strategy}
                    onChange={e => setWizardData(p => ({ ...p, bid_strategy: e.target.value }))}
                  >
                    <option value="MAXIMIZE_CLICKS">Maximizar clics</option>
                    <option value="MAXIMIZE_CONVERSION_VALUE">Maximizar valor (ROAS opcional)</option>
                    <option value="MANUAL_CPC">CPC manual</option>
                  </select>
                </div>
                {wizardData.bid_strategy === 'MAXIMIZE_CONVERSION_VALUE' && (
                  <div className="space-y-1">
                    <Label className="text-xs">ROAS objetivo (opcional)</Label>
                    <Input type="number" step="0.1" min="0" value={wizardData.target_roas} onChange={e => setWizardData(p => ({ ...p, target_roas: e.target.value }))} placeholder="Ej: 4" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Nombre del ad group</Label>
                  <Input value={wizardData.ad_group_name} onChange={e => setWizardData(p => ({ ...p, ad_group_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPC inicial del ad group (USD, opcional)</Label>
                  <Input type="number" step="0.01" min="0" value={wizardData.ad_group_cpc_bid} onChange={e => setWizardData(p => ({ ...p, ad_group_cpc_bid: e.target.value }))} placeholder="Ej: 0.50" />
                  <p className="text-[11px] text-muted-foreground">Solo aplica si bid strategy es MANUAL_CPC.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {wizardStep > 1 && (
              <Button variant="outline" onClick={() => setWizardStep(s => s - 1)} disabled={wizardLoading}>Atrás</Button>
            )}
            {wizardStep < 3 ? (
              <Button
                onClick={() => setWizardStep(s => s + 1)}
                disabled={
                  (wizardStep === 1 && (!wizardData.name.trim() || !wizardData.daily_budget)) ||
                  (wizardStep === 2 && !wizardData.merchant_center_id)
                }
              >Siguiente</Button>
            ) : (
              <Button onClick={submitWizard} disabled={wizardLoading}>
                {wizardLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Crear campaña
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit bid dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={o => { if (!bidDialogLoading) setBidDialogOpen(o); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Editar CPC</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {bidDialogPG?.dimension ? `${DIMENSION_LABELS[bidDialogPG.dimension]}: ${bidDialogPG.value}` : 'All products'}
            </p>
            <Label className="text-xs">CPC (USD)</Label>
            <Input type="number" step="0.01" min="0" value={bidDialogValue} onChange={e => setBidDialogValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidDialogOpen(false)} disabled={bidDialogLoading}>Cancelar</Button>
            <Button onClick={submitBidUpdate} disabled={bidDialogLoading}>
              {bidDialogLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subdivision dialog */}
      <Dialog open={subdivOpen} onOpenChange={o => { if (!subdivLoading) setSubdivOpen(o); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Subdividir product group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={steveSuggestSubdiv} disabled={subdivSteveLoading}>
                {subdivSteveLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-primary" />}
                {subdivSteveLoading ? 'Analizando feed...' : 'Steve sugiere basado en ROAS'}
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dimensión</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={subdivDimension}
                onChange={e => setSubdivDimension(e.target.value)}
              >
                <option value="product_brand">Marca</option>
                <option value="product_type">Tipo de producto (level 1)</option>
                <option value="product_condition">Condición (new/used/refurbished)</option>
                <option value="product_channel">Canal (online/local)</option>
                <option value="product_item_id">SKU específico</option>
                <option value="product_custom_attribute">Etiqueta custom</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valores a subdividir</Label>
              {subdivEntries.map((e, i) => (
                <div key={i} className="flex gap-1">
                  <Input value={e.value} onChange={ev => setSubdivEntries(p => p.map((x, j) => j === i ? { ...x, value: ev.target.value } : x))} placeholder="Valor (ej. Nike)" className="flex-1" />
                  <Input type="number" step="0.01" min="0" value={e.cpc} onChange={ev => setSubdivEntries(p => p.map((x, j) => j === i ? { ...x, cpc: ev.target.value } : x))} placeholder="CPC" className="w-24" />
                  <Button size="sm" variant="ghost" className="h-10 px-2" onClick={() => setSubdivEntries(p => p.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSubdivEntries(p => [...p, { value: '', cpc: '0.50' }])}>
                <Plus className="w-3 h-3 mr-1" /> Agregar valor
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPC "Everything else" (catch-all)</Label>
              <Input type="number" step="0.01" min="0" value={subdivCatchCpc} onChange={e => setSubdivCatchCpc(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                ⚠️ Convertir un UNIT en SUBDIVISION requiere remover el parent y recrearlo. Los bids previos se resetean.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubdivOpen(false)} disabled={subdivLoading}>Cancelar</Button>
            <Button onClick={submitSubdiv} disabled={subdivLoading}>
              {subdivLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear subdivisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negative dialog */}
      <Dialog open={negOpen} onOpenChange={o => { if (!negLoading) setNegOpen(o); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Excluir producto del ad group</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Dimensión</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={negDimension} onChange={e => setNegDimension(e.target.value)}>
                <option value="product_brand">Marca</option>
                <option value="product_type">Tipo de producto</option>
                <option value="product_item_id">SKU</option>
                <option value="product_condition">Condición</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor a excluir</Label>
              <Input value={negValue} onChange={e => setNegValue(e.target.value)} placeholder="Ej: BadBrand" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNegOpen(false)} disabled={negLoading}>Cancelar</Button>
            <Button onClick={submitNeg} disabled={negLoading}>
              {negLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog (con listado de children en cascade) */}
      <Dialog open={removeDialogOpen} onOpenChange={o => { if (!removeLoading) setRemoveDialogOpen(o); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Eliminar product group</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Vas a eliminar: <strong>{removeTarget?.label}</strong>
            </p>
            {removeTarget && removeTarget.cascadeChildren.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs">
                <p className="font-medium text-red-600 dark:text-red-400 mb-1">
                  ⚠️ En cascade también se borran {removeTarget.cascadeChildren.length} items:
                </p>
                <ul className="list-disc ml-4 max-h-[180px] overflow-y-auto space-y-0.5">
                  {removeTarget.cascadeChildren.slice(0, 20).map((l, i) => <li key={i}>{l}</li>)}
                  {removeTarget.cascadeChildren.length > 20 && (
                    <li className="text-muted-foreground">... y {removeTarget.cascadeChildren.length - 20} más</li>
                  )}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Esta acción no se puede deshacer. Si borrás el último UNIT del tree, el ad group deja de publicar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)} disabled={removeLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmRemovePG} disabled={removeLoading}>
              {removeLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
