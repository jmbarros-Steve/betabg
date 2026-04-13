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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { RefreshCw, Loader2, Plus, Play, Pause, Target, Zap, CheckCircle2, XCircle } from 'lucide-react';

interface ConversionAction {
  id: string;
  name: string;
  type: string;
  status: string;
  category: string;
  include_in_conversions: boolean;
  click_through_lookback_days: number;
  view_through_lookback_days: number;
  counting_type: string;
  default_value: number;
  always_use_default_value: boolean;
  tag_snippets: any[];
  conversions_30d: number;
  value_30d: number;
}

interface GoogleConversionSetupProps {
  connectionId: string;
  clientId: string;
}

const typeLabels: Record<string, string> = {
  WEBPAGE: 'Pagina Web',
  PURCHASE: 'Compra',
  LEAD: 'Lead',
  PAGE_VIEW: 'Vista de Pagina',
  SIGN_UP: 'Registro',
  ADD_TO_CART: 'Agregar al Carro',
  BEGIN_CHECKOUT: 'Inicio Checkout',
  SUBSCRIBE_PAID: 'Suscripcion',
  PHONE_CALL_LEAD: 'Llamada',
  IMPORTED_LEAD: 'Lead Importado',
  CONTACT: 'Contacto',
  STORE_VISIT: 'Visita Tienda',
  STORE_SALE: 'Venta Tienda',
  UPLOAD_CLICKS: 'Upload Clicks',
  GOOGLE_ANALYTICS_4_CUSTOM: 'GA4 Custom',
  GOOGLE_ANALYTICS_4_PURCHASE: 'GA4 Purchase',
  GOOGLE_HOSTED: 'Google Hosted',
  STORE_VISITS: 'Visitas Tienda',
  SMART_CAMPAIGN_AD_CLICKS_TO_CALL: 'Smart - Click to Call',
  SMART_CAMPAIGN_MAP_CLICKS_TO_CALL: 'Smart - Map Call',
  SMART_CAMPAIGN_MAP_DIRECTIONS: 'Smart - Directions',
  SMART_CAMPAIGN_TRACKED_CALLS: 'Smart - Tracked Calls',
  ANDROID_INSTALLS_ALL_OTHER_APPS: 'Android Install',
};

const categoryLabels: Record<string, string> = {
  PURCHASE: 'Compra',
  LEAD: 'Lead',
  DOWNLOAD: 'Descarga',
  SIGN_UP: 'Registro',
  ADD_TO_CART: 'Al Carro',
  BEGIN_CHECKOUT: 'Checkout',
  PAGE_VIEW: 'Vista Pagina',
  DEFAULT: 'Default',
  CONTACT: 'Contacto',
  SUBMIT_LEAD_FORM: 'Formulario',
  BOOK_APPOINTMENT: 'Cita',
  GET_DIRECTIONS: 'Direcciones',
  ENGAGEMENT: 'Engagement',
  STORE_VISIT: 'Visita Tienda',
  PHONE_CALL_LEAD: 'Llamada',
};

const statusColors: Record<string, string> = {
  ENABLED: 'bg-green-500/10 text-green-500 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  HIDDEN: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const PRESETS = [
  { label: 'Compra e-commerce', type: 'WEBPAGE', category: 'PURCHASE', counting_type: 'MANY_PER_CLICK', lookback: 30 },
  { label: 'Lead / Formulario', type: 'WEBPAGE', category: 'LEAD', counting_type: 'ONE_PER_CLICK', lookback: 30 },
  { label: 'Registro', type: 'WEBPAGE', category: 'SIGN_UP', counting_type: 'ONE_PER_CLICK', lookback: 30 },
  { label: 'Agregar al Carro', type: 'WEBPAGE', category: 'ADD_TO_CART', counting_type: 'MANY_PER_CLICK', lookback: 7 },
];

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export default function GoogleConversionSetup({ connectionId, clientId }: GoogleConversionSetupProps) {
  const [conversions, setConversions] = useState<ConversionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '', type: 'WEBPAGE', category: 'PURCHASE',
    counting_type: 'ONE_PER_CLICK', lookback: '30', default_value: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchConversions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callApi('manage-google-conversions', {
      body: { action: 'list', connection_id: connectionId },
    });
    if (error) { toast.error('Error cargando conversiones: ' + error); setLoading(false); return; }
    setConversions(data?.conversions || []);
    setLoading(false);
  }, [connectionId]);

  useEffect(() => { fetchConversions(); }, [fetchConversions]);

  const handleToggle = async (conv: ConversionAction) => {
    const newStatus = conv.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    setActionLoading(prev => ({ ...prev, [conv.id]: true }));

    setConversions(prev => prev.map(c => c.id === conv.id ? { ...c, status: newStatus } : c));

    const { error } = await callApi('manage-google-conversions', {
      body: {
        action: 'update', connection_id: connectionId,
        data: { conversion_action_id: conv.id, status: newStatus },
      },
    });

    setActionLoading(prev => ({ ...prev, [conv.id]: false }));
    if (error) {
      toast.error('Error: ' + error);
      setConversions(prev => prev.map(c => c.id === conv.id ? { ...c, status: conv.status } : c));
      return;
    }
    toast.success(`Conversion ${newStatus === 'PAUSED' ? 'pausada' : 'activada'}`);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) { toast.error('Nombre requerido'); return; }
    const defaultVal = formData.default_value ? Number(formData.default_value) : undefined;
    if (defaultVal !== undefined && (!Number.isFinite(defaultVal) || defaultVal < 0)) {
      toast.error('El valor default debe ser un numero positivo'); return;
    }
    setCreating(true);

    const { error } = await callApi('manage-google-conversions', {
      body: {
        action: 'create', connection_id: connectionId,
        data: {
          name: formData.name,
          type: formData.type,
          category: formData.category,
          counting_type: formData.counting_type,
          click_through_lookback_days: Number(formData.lookback),
          view_through_lookback_days: 1,
          default_value: defaultVal,
        },
      },
    });

    setCreating(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('Conversion action creada');
    setCreateOpen(false);
    setFormData({ name: '', type: 'WEBPAGE', category: 'PURCHASE', counting_type: 'ONE_PER_CLICK', lookback: '30', default_value: '' });
    fetchConversions();
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setFormData({
      name: preset.label,
      type: preset.type,
      category: preset.category,
      counting_type: preset.counting_type,
      lookback: preset.lookback.toString(),
      default_value: '',
    });
    setCreateOpen(true);
  };

  // Summary stats
  const totalConversions = conversions.reduce((sum, c) => sum + (c.conversions_30d || 0), 0);
  const totalValue = conversions.reduce((sum, c) => sum + (c.value_30d || 0), 0);
  const activeCount = conversions.filter(c => c.status === 'ENABLED').length;
  const includedCount = conversions.filter(c => c.include_in_conversions).length;

  if (loading && conversions.length === 0) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Conversion Actions</h3>
          <Badge variant="secondary">{conversions.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchConversions}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Crear
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {conversions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{totalConversions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Conversiones (30d)</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Valor total (30d)</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{activeCount}/{conversions.length}</p>
            <p className="text-xs text-muted-foreground">Activas</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{includedCount}</p>
            <p className="text-xs text-muted-foreground">En Smart Bidding</p>
          </div>
        </div>
      )}

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset, i) => (
          <Button key={i} variant="outline" size="sm" onClick={() => applyPreset(preset)} className="text-xs">
            <Zap className="w-3 h-3 mr-1" /> {preset.label}
          </Button>
        ))}
      </div>

      {/* Conversion cards */}
      {conversions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No se encontraron conversion actions
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {conversions.map(conv => (
            <Card key={conv.id} className={conv.conversions_30d > 0 ? 'border-green-500/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" title={conv.name}>{conv.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="outline" className={statusColors[conv.status] || ''}>
                        {conv.status === 'ENABLED' ? 'Activa' : conv.status === 'PAUSED' ? 'Pausada' : conv.status}
                      </Badge>
                      <Badge variant="outline">{typeLabels[conv.type] || conv.type}</Badge>
                      {conv.category && <Badge variant="outline">{categoryLabels[conv.category] || conv.category}</Badge>}
                      {conv.include_in_conversions ? (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> Bidding
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                          <XCircle className="w-3 h-3 mr-0.5" /> No bidding
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" disabled={actionLoading[conv.id]} onClick={() => handleToggle(conv)}>
                    {actionLoading[conv.id] ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      conv.status === 'ENABLED' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                  <div>Conteo: <span className="text-foreground">{conv.counting_type === 'ONE_PER_CLICK' ? '1 por click' : 'Todos'}</span></div>
                  <div>Lookback: <span className="text-foreground">{conv.click_through_lookback_days}d</span></div>
                  <div>Conversiones (30d): <span className={`font-medium ${conv.conversions_30d > 0 ? 'text-green-500' : 'text-foreground'}`}>{(conv.conversions_30d ?? 0).toLocaleString()}</span></div>
                  <div>Valor (30d): <span className={`font-medium ${conv.value_30d > 0 ? 'text-green-500' : 'text-foreground'}`}>${(conv.value_30d ?? 0).toLocaleString()}</span></div>
                  {conv.default_value > 0 && (
                    <div className="col-span-2">Valor default: <span className="text-foreground">${conv.default_value.toLocaleString()}</span></div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Crear Conversion Action</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input placeholder="Ej: Compra Website" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select className={selectClass} value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}>
                <option value="WEBPAGE">Pagina Web</option>
                <option value="UPLOAD_CLICKS">Upload Clicks</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <select className={selectClass} value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}>
                <option value="PURCHASE">Compra</option>
                <option value="LEAD">Lead</option>
                <option value="SIGN_UP">Registro</option>
                <option value="ADD_TO_CART">Agregar al Carro</option>
                <option value="BEGIN_CHECKOUT">Inicio Checkout</option>
                <option value="PAGE_VIEW">Vista de Pagina</option>
                <option value="DOWNLOAD">Descarga</option>
                <option value="DEFAULT">Otro</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Conteo</Label>
              <select className={selectClass} value={formData.counting_type} onChange={e => setFormData(p => ({ ...p, counting_type: e.target.value }))}>
                <option value="ONE_PER_CLICK">Una por click (leads)</option>
                <option value="MANY_PER_CLICK">Todas (compras)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Ventana de Lookback (dias)</Label>
              <select className={selectClass} value={formData.lookback} onChange={e => setFormData(p => ({ ...p, lookback: e.target.value }))}>
                <option value="7">7 dias</option>
                <option value="14">14 dias</option>
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Valor Default (CLP, opcional)</Label>
              <Input type="number" min="0" placeholder="Ej: 50000" value={formData.default_value} onChange={e => setFormData(p => ({ ...p, default_value: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
