import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Megaphone, Plus, Check } from 'lucide-react';

interface CampaignOption {
  campaign_id: string;
  campaign_name: string;
  status: 'ACTIVE' | 'PAUSED';
  spend_30d: number;
  objective: string;
}

interface CampaignSelectorProps {
  connectionId: string;
  selectedCampaignId: string | null;
  onSelect: (id: string, name: string) => void;
  onCreateNew: () => void;
  isCreatingNew: boolean;
}

export default function CampaignSelector({
  connectionId,
  selectedCampaignId,
  onSelect,
  onCreateNew,
  isCreatingNew,
}: CampaignSelectorProps) {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { data: metrics, error } = await supabase
        .from('campaign_metrics')
        .select('campaign_id, campaign_name, spend, impressions, metric_date')
        .eq('connection_id', connectionId)
        .gte('metric_date', thirtyDaysAgo)
        .order('metric_date', { ascending: false });

      if (error) throw error;

      const map = new Map<string, CampaignOption>();
      for (const m of metrics || []) {
        const existing = map.get(m.campaign_id);
        if (existing) {
          existing.spend_30d += Number(m.spend) || 0;
        } else {
          map.set(m.campaign_id, {
            campaign_id: m.campaign_id,
            campaign_name: m.campaign_name,
            status: 'ACTIVE',
            spend_30d: Number(m.spend) || 0,
            objective: '',
          });
        }
      }

      // Infer paused: no data in last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
      for (const [cid, c] of map) {
        const recent = (metrics || []).filter(
          (m) => m.campaign_id === cid && m.metric_date >= threeDaysAgo,
        );
        if (recent.length === 0) c.status = 'PAUSED';
      }

      setCampaigns(Array.from(map.values()).sort((a, b) => b.spend_30d - a.spend_30d));
    } catch (err) {
      console.error('[CampaignSelector] Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const fmtCLP = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona una campaña existente o crea una nueva para tu Ad Set.
      </p>

      {/* Create new option */}
      <button
        onClick={onCreateNew}
        className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed text-left transition-all ${
          isCreatingNew
            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
            : 'border-border hover:border-primary/30'
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isCreatingNew ? 'bg-primary/10' : 'bg-muted'
        }`}>
          <Plus className={`w-5 h-5 ${isCreatingNew ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <p className="text-sm font-semibold">Crear nueva campaña</p>
          <p className="text-xs text-muted-foreground">Configura nombre, objetivo y presupuesto</p>
        </div>
        {isCreatingNew && <Check className="w-5 h-5 text-primary ml-auto" />}
      </button>

      {/* Existing campaigns */}
      {campaigns.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o elige una existente</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {campaigns.map((c) => {
              const isSelected = selectedCampaignId === c.campaign_id && !isCreatingNew;
              return (
                <button
                  key={c.campaign_id}
                  onClick={() => onSelect(c.campaign_id, c.campaign_name)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <Megaphone className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.campaign_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Gasto 30d: {fmtCLP(c.spend_30d)}
                    </p>
                  </div>
                  <Badge
                    variant={c.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {c.status}
                  </Badge>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {campaigns.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No se encontraron campañas activas. Crea una nueva arriba.
        </p>
      )}
    </div>
  );
}
