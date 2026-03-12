import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderOpen, Plus, Check } from 'lucide-react';

interface AdSetOption {
  id: string;
  name: string;
  status: string;
  daily_budget: number;
  spend: number;
}

interface AdSetSelectorProps {
  connectionId: string;
  campaignId: string;
  selectedAdsetId: string | null;
  onSelect: (id: string, name: string) => void;
  onCreateNew: () => void;
  isCreatingNew: boolean;
}

export default function AdSetSelector({
  connectionId,
  campaignId,
  selectedAdsetId,
  onSelect,
  onCreateNew,
  isCreatingNew,
}: AdSetSelectorProps) {
  const [adsets, setAdsets] = useState<AdSetOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdSets = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const { data, error } = await callApi('fetch-campaign-adsets', {
        body: {
          connection_id: connectionId,
          campaign_id: campaignId,
          platform: 'meta',
        },
      });

      if (error) throw error;

      const items: AdSetOption[] = (data?.ad_sets || []).map((as: any) => ({
        id: as.id,
        name: as.name,
        status: as.status || 'UNKNOWN',
        daily_budget: Number(as.daily_budget) || 0,
        spend: Number(as.spend) || 0,
      }));

      setAdsets(items);
    } catch {
      // Error handled by toast
    } finally {
      setLoading(false);
    }
  }, [connectionId, campaignId]);

  useEffect(() => {
    fetchAdSets();
  }, [fetchAdSets]);

  const fmtCLP = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona un Ad Set existente o crea uno nuevo para tu anuncio.
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
          <p className="text-sm font-semibold">Crear nuevo Ad Set</p>
          <p className="text-xs text-muted-foreground">Configura audiencia y presupuesto</p>
        </div>
        {isCreatingNew && <Check className="w-5 h-5 text-primary ml-auto" />}
      </button>

      {/* Existing ad sets */}
      {adsets.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o elige uno existente</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {adsets.map((as) => {
              const isSelected = selectedAdsetId === as.id && !isCreatingNew;
              return (
                <button
                  key={as.id}
                  onClick={() => onSelect(as.id, as.name)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <FolderOpen className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{as.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {as.daily_budget > 0 ? `Budget: ${fmtCLP(as.daily_budget / 100)}/día` : ''}
                      {as.spend > 0 ? ` · Gasto: ${fmtCLP(as.spend)}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant={as.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {as.status}
                  </Badge>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {adsets.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Esta campaña no tiene Ad Sets. Crea uno nuevo arriba.
        </p>
      )}
    </div>
  );
}
