import { useState, useEffect } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import SteveRecommendation from './SteveRecommendation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  pmaxCampaigns: Array<{ id: string; name: string }>;
  /** Si viene seteado, la campaña queda fija y el select se oculta. */
  preselectedCampaignId?: string;
  /** Callback tras creación exitosa (útil para refrescar listas en el parent). */
  onCreated?: (result: { campaign_id: string; name: string }) => void;
}

interface NewGroup {
  name: string;
  campaign_id: string;
  final_url: string;
  business_name: string;
  headlines: string;
  long_headlines: string;
  descriptions: string;
}

const EMPTY: NewGroup = {
  name: '', campaign_id: '', final_url: '', business_name: '',
  headlines: '', long_headlines: '', descriptions: '',
};

export default function CreateAssetGroupDialog({
  open,
  onOpenChange,
  connectionId,
  pmaxCampaigns,
  preselectedCampaignId,
  onCreated,
}: Props) {
  const [newGroup, setNewGroup] = useState<NewGroup>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Cuando se abre el dialog, inicializar campaign_id con el preseleccionado si existe.
  useEffect(() => {
    if (open) {
      setNewGroup({ ...EMPTY, campaign_id: preselectedCampaignId || '' });
    }
  }, [open, preselectedCampaignId]);

  const handleApplyRecommendation = (rec: any) => {
    if (rec?.headlines) {
      setNewGroup(prev => ({
        ...prev,
        headlines: rec.headlines.join('\n'),
        long_headlines: rec.long_headlines?.join('\n') || prev.long_headlines,
        descriptions: rec.descriptions?.join('\n') || prev.descriptions,
      }));
      toast.success('Sugerencias de Steve aplicadas');
    }
  };

  const handleCreate = async () => {
    if (!newGroup.name || !newGroup.campaign_id || !newGroup.final_url) {
      toast.error('Nombre, campana y URL final son requeridos');
      return;
    }

    setLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'create_asset_group',
        connection_id: connectionId,
        campaign_id: newGroup.campaign_id,
        data: {
          name: newGroup.name,
          final_urls: [newGroup.final_url],
          business_name: newGroup.business_name || undefined,
          headlines: newGroup.headlines ? newGroup.headlines.split('\n').filter(Boolean) : undefined,
          long_headlines: newGroup.long_headlines ? newGroup.long_headlines.split('\n').filter(Boolean) : undefined,
          descriptions: newGroup.descriptions ? newGroup.descriptions.split('\n').filter(Boolean) : undefined,
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error('Error creando grupo de recursos: ' + error);
      return;
    }

    toast.success('Grupo de recursos creado — sincronizando con Google (puede tardar unos minutos)');
    onCreated?.({ campaign_id: newGroup.campaign_id, name: newGroup.name });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Grupo de recursos PMAX</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={newGroup.name}
              onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Mi Grupo de recursos"
            />
          </div>

          {!preselectedCampaignId && (
            <div className="space-y-2">
              <Label>Campana PMAX *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={newGroup.campaign_id}
                onChange={e => setNewGroup(prev => ({ ...prev, campaign_id: e.target.value }))}
              >
                <option value="">Seleccionar campana...</option>
                {pmaxCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label>URL Final *</Label>
            <Input
              value={newGroup.final_url}
              onChange={e => setNewGroup(prev => ({ ...prev, final_url: e.target.value }))}
              placeholder="https://mitienda.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Nombre del negocio</Label>
            <Input
              value={newGroup.business_name}
              onChange={e => setNewGroup(prev => ({ ...prev, business_name: e.target.value }))}
              placeholder="Mi Empresa"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Headlines (1 por linea, max 30 chars)</Label>
              <SteveRecommendation
                connectionId={connectionId}
                recommendationType="pmax_assets"
                context={newGroup.business_name || newGroup.final_url}
                onApply={handleApplyRecommendation}
              />
            </div>
            <Textarea
              value={newGroup.headlines}
              onChange={e => setNewGroup(prev => ({ ...prev, headlines: e.target.value }))}
              placeholder="Headline 1&#10;Headline 2&#10;Headline 3"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Headlines largos (1 por linea, max 90 chars)</Label>
            <Textarea
              value={newGroup.long_headlines}
              onChange={e => setNewGroup(prev => ({ ...prev, long_headlines: e.target.value }))}
              placeholder="Headline largo 1&#10;Headline largo 2"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Descripciones (1 por linea, max 90 chars)</Label>
            <Textarea
              value={newGroup.descriptions}
              onChange={e => setNewGroup(prev => ({ ...prev, descriptions: e.target.value }))}
              placeholder="Descripcion 1&#10;Descripcion 2"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
