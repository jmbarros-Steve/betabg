import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Pause, Play, Wand2, Settings2, Users, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';

interface EditCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID de la conexión Meta activa */
  connectionId: string;
  /** Snapshot de la campaña tal como vive hoy en el frontend */
  campaign: {
    campaign_id: string;
    campaign_name: string;
    status: string;
    daily_budget: number;
  };
  /** Callback al cerrar exitosamente para que el manager refresque */
  onSaved?: () => void;
  /** Callback para abrir el wizard con un ad para crear variación */
  onCreateVariation?: (adId: string) => void;
}

type Tab = 'campaign' | 'adsets' | 'ads';

interface AdSet {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | string;
  daily_budget: number | null;
  end_time: string | null;
}

interface Ad {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | string;
  thumbnail_url: string | null;
}

export function EditCampaignDialog({
  open,
  onOpenChange,
  connectionId,
  campaign,
  onSaved,
  onCreateVariation,
}: EditCampaignDialogProps) {
  const [tab, setTab] = useState<Tab>('campaign');

  // ── Tab Campaña ──
  const [name, setName] = useState(campaign.campaign_name);
  const [budget, setBudget] = useState(String(campaign.daily_budget || 0));
  const [active, setActive] = useState(campaign.status === 'ACTIVE');
  const [endDate, setEndDate] = useState(''); // YYYY-MM-DD
  const [savingCampaign, setSavingCampaign] = useState(false);

  // ── Tab Ad Sets ──
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [savingAdset, setSavingAdset] = useState<string | null>(null);

  // ── Tab Ads ──
  const [ads, setAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [togglingAd, setTogglingAd] = useState<string | null>(null);

  // Reset state al abrir con nueva campaña
  useEffect(() => {
    if (open) {
      setTab('campaign');
      setName(campaign.campaign_name);
      setBudget(String(campaign.daily_budget || 0));
      setActive(campaign.status === 'ACTIVE');
      setEndDate('');
      setAdsets([]);
      setAds([]);
    }
  }, [open, campaign.campaign_id, campaign.campaign_name, campaign.daily_budget, campaign.status]);

  // ── Fetchers ──

  const loadAdsets = useCallback(async () => {
    setLoadingAdsets(true);
    try {
      const { data, error } = await callApi<{ adsets: AdSet[] }>('edit-meta-campaign', {
        body: { action: 'list_adsets', connection_id: connectionId, campaign_id: campaign.campaign_id },
        timeoutMs: 20_000,
      });
      if (error) {
        toast.error(`Error al cargar ad sets: ${error}`);
        return;
      }
      setAdsets(data?.adsets || []);
    } catch (e: any) {
      toast.error(e?.message || 'Error al cargar ad sets');
    } finally {
      setLoadingAdsets(false);
    }
  }, [connectionId, campaign.campaign_id]);

  const loadAds = useCallback(async () => {
    setLoadingAds(true);
    try {
      const { data, error } = await callApi<{ ads: Ad[] }>('edit-meta-campaign', {
        body: { action: 'list_ads', connection_id: connectionId, campaign_id: campaign.campaign_id },
        timeoutMs: 20_000,
      });
      if (error) {
        toast.error(`Error al cargar ads: ${error}`);
        return;
      }
      setAds(data?.ads || []);
    } catch (e: any) {
      toast.error(e?.message || 'Error al cargar ads');
    } finally {
      setLoadingAds(false);
    }
  }, [connectionId, campaign.campaign_id]);

  useEffect(() => {
    if (!open) return;
    if (tab === 'adsets' && adsets.length === 0 && !loadingAdsets) loadAdsets();
    if (tab === 'ads' && ads.length === 0 && !loadingAds) loadAds();
  }, [tab, open, adsets.length, ads.length, loadingAdsets, loadingAds, loadAdsets, loadAds]);

  // ── Save handlers ──

  async function saveCampaign() {
    setSavingCampaign(true);
    const changes: Record<string, any> = {};
    if (name.trim() && name.trim() !== campaign.campaign_name) changes.name = name.trim();
    const budgetNum = Number(budget);
    if (budgetNum > 0 && budgetNum !== campaign.daily_budget) changes.daily_budget = budgetNum;
    const newStatus = active ? 'ACTIVE' : 'PAUSED';
    if (newStatus !== campaign.status) changes.status = newStatus;
    if (endDate) changes.end_time = `${endDate}T23:59:59-0300`;

    if (Object.keys(changes).length === 0) {
      toast.info('No hay cambios para guardar');
      setSavingCampaign(false);
      return;
    }

    try {
      const { error } = await callApi('edit-meta-campaign', {
        body: {
          action: 'update_campaign',
          connection_id: connectionId,
          campaign_id: campaign.campaign_id,
          data: changes,
        },
      });
      if (error) {
        toast.error(`Meta rechazó el cambio: ${error}`);
        return;
      }
      toast.success('Campaña actualizada en Meta');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSavingCampaign(false);
    }
  }

  async function saveAdset(adset: AdSet, changes: Partial<AdSet>) {
    setSavingAdset(adset.id);
    const payload: Record<string, any> = {};
    if (changes.name && changes.name !== adset.name) payload.name = changes.name;
    if (changes.daily_budget !== undefined && changes.daily_budget !== adset.daily_budget) {
      payload.daily_budget = changes.daily_budget;
    }
    if (changes.status && changes.status !== adset.status) payload.status = changes.status;

    if (Object.keys(payload).length === 0) {
      setSavingAdset(null);
      return;
    }

    try {
      const { error } = await callApi('edit-meta-campaign', {
        body: { action: 'update_adset', connection_id: connectionId, adset_id: adset.id, data: payload },
      });
      if (error) {
        toast.error(`Error: ${error}`);
        return;
      }
      // Optimistic update local
      setAdsets((prev) => prev.map((a) => (a.id === adset.id ? { ...a, ...changes } : a)));
      toast.success('Ad set actualizado');
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar ad set');
    } finally {
      setSavingAdset(null);
    }
  }

  async function toggleAd(ad: Ad) {
    setTogglingAd(ad.id);
    const newStatus = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const { error } = await callApi('edit-meta-campaign', {
        body: {
          action: 'update_ad_status',
          connection_id: connectionId,
          ad_id: ad.id,
          data: { status: newStatus },
        },
      });
      if (error) {
        toast.error(`Error: ${error}`);
        return;
      }
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, status: newStatus } : a)));
      toast.success(`Ad ${newStatus === 'ACTIVE' ? 'activado' : 'pausado'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al cambiar estado del ad');
    } finally {
      setTogglingAd(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Editar campaña activa
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cambios se aplican directo en Meta. Edición de creativos requiere crear una nueva variación.
          </p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          {([
            { key: 'campaign', label: 'Campaña', icon: Settings2 },
            { key: 'adsets', label: 'Ad Sets', icon: Users },
            { key: 'ads', label: 'Ads', icon: ImageIcon },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* TAB CAMPAÑA */}
        {tab === 'campaign' && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name">Nombre de campaña</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-budget">Presupuesto diario (CLP)</Label>
                <Input
                  id="edit-budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="10000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-end-date">Fecha de fin (opcional)</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20">
              <div>
                <Label className="text-sm font-medium">Estado de la campaña</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {active ? 'La campaña está corriendo y consumiendo presupuesto.' : 'Pausada — no consume presupuesto.'}
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#1E3A7B]/5 border border-[#2A4F9E]/20">
              <AlertCircle className="w-4 h-4 text-[#2A4F9E] shrink-0 mt-0.5" />
              <p className="text-xs text-[#162D5F] leading-relaxed">
                Para cambiar el objetivo (CONVERSIONS → TRAFFIC, etc.) tenés que crear una nueva campaña — Meta no lo permite editar después de publicada.
              </p>
            </div>
          </div>
        )}

        {/* TAB AD SETS */}
        {tab === 'adsets' && (
          <div className="space-y-3 py-2">
            {loadingAdsets ? (
              <>
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </>
            ) : adsets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin ad sets en esta campaña.
              </p>
            ) : (
              adsets.map((adset) => (
                <AdsetEditCard
                  key={adset.id}
                  adset={adset}
                  saving={savingAdset === adset.id}
                  onSave={(changes) => saveAdset(adset, changes)}
                />
              ))
            )}
          </div>
        )}

        {/* TAB ADS */}
        {tab === 'ads' && (
          <div className="space-y-2 py-2">
            {loadingAds ? (
              <>
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </>
            ) : ads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin ads en esta campaña.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Para cambiar imagen, copy o headline tenés que crear una variación nueva — Meta no permite editar el creativo de un ad existente.
                </p>
                {ads.map((ad) => (
                  <div
                    key={ad.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      ad.status === 'ACTIVE'
                        ? 'border-green-500/30 bg-green-500/[0.04]'
                        : 'border-border bg-muted/20'
                    }`}
                  >
                    <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0">
                      {ad.thumbnail_url ? (
                        <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={ad.name}>
                        {ad.name || 'Sin nombre'}
                      </p>
                      <Badge
                        className={`text-[10px] mt-1 ${
                          ad.status === 'ACTIVE'
                            ? 'bg-green-500/10 text-green-700 border-green-500/30'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {ad.status === 'ACTIVE' ? 'Activo' : 'Pausado'}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAd(ad)}
                      disabled={togglingAd === ad.id}
                      className="h-8 text-xs"
                    >
                      {togglingAd === ad.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : ad.status === 'ACTIVE' ? (
                        <><Pause className="w-3.5 h-3.5 mr-1" />Pausar</>
                      ) : (
                        <><Play className="w-3.5 h-3.5 mr-1" />Activar</>
                      )}
                    </Button>
                    {onCreateVariation && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCreateVariation(ad.id)}
                        className="h-8 text-xs"
                        title="Crear ad nuevo basado en este creativo"
                      >
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                        Variar
                      </Button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savingCampaign}>
            Cerrar
          </Button>
          {tab === 'campaign' && (
            <Button onClick={saveCampaign} disabled={savingCampaign}>
              {savingCampaign ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AdsetEditCard — fila editable inline para un ad set
// ---------------------------------------------------------------------------

function AdsetEditCard({
  adset,
  saving,
  onSave,
}: {
  adset: AdSet;
  saving: boolean;
  onSave: (changes: Partial<AdSet>) => void;
}) {
  const [name, setName] = useState(adset.name);
  const [budget, setBudget] = useState(String(adset.daily_budget || 0));
  const [active, setActive] = useState(adset.status === 'ACTIVE');

  const dirty =
    name !== adset.name ||
    Number(budget) !== adset.daily_budget ||
    (active ? 'ACTIVE' : 'PAUSED') !== adset.status;

  return (
    <div className="p-3 rounded-lg border border-border/60 bg-background space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 h-8 text-sm"
          placeholder="Nombre del ad set"
        />
        <Switch
          checked={active}
          onCheckedChange={setActive}
          aria-label={active ? 'Pausar' : 'Activar'}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground shrink-0">Presupuesto diario</Label>
        <Input
          type="number"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="h-8 text-sm w-32"
        />
        <span className="text-xs text-muted-foreground">CLP</span>
        <Button
          size="sm"
          className="ml-auto h-8 text-xs"
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              name,
              daily_budget: Number(budget),
              status: active ? 'ACTIVE' : 'PAUSED',
            })
          }
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
