import { useState, useEffect, useMemo } from 'react';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlapPair {
  adset_a: { id: string; name: string };
  adset_b: { id: string; name: string };
  overlap_pct: number;
  overlap_details: string[];
}

interface CampaignOption {
  campaign_id: string;
  campaign_name: string;
}

interface AudienceOverlapViewerProps {
  clientId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function overlapColor(pct: number): string {
  if (pct > 30) return 'bg-red-500';
  if (pct > 15) return 'bg-yellow-500';
  return 'bg-green-500';
}

function overlapTextColor(pct: number): string {
  if (pct > 30) return 'text-red-600';
  if (pct > 15) return 'text-yellow-600';
  return 'text-green-600';
}

function overlapBg(pct: number): string {
  if (pct > 30) return 'bg-red-500/15 border-red-500/30';
  if (pct > 15) return 'bg-yellow-500/15 border-yellow-500/30';
  return 'bg-green-500/10 border-green-500/20';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudienceOverlapViewer({ clientId }: AudienceOverlapViewerProps) {
  const { connectionId } = useMetaBusiness();
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [overlaps, setOverlaps] = useState<OverlapPair[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [threshold, setThreshold] = useState(15);

  // Fetch campaigns for the dropdown
  useEffect(() => {
    if (!connectionId) return;
    (async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data } = await supabase
        .from('campaign_metrics')
        .select('campaign_id, campaign_name')
        .eq('connection_id', connectionId)
        .gte('metric_date', thirtyDaysAgo);
      if (data) {
        const unique = new Map<string, string>();
        for (const row of data) {
          if (!unique.has(row.campaign_id)) unique.set(row.campaign_id, row.campaign_name);
        }
        setCampaigns(Array.from(unique, ([campaign_id, campaign_name]) => ({ campaign_id, campaign_name })));
      }
    })();
  }, [connectionId]);

  const filteredOverlaps = useMemo(
    () => overlaps.filter((o) => o.overlap_pct >= threshold),
    [overlaps, threshold],
  );

  // Collect unique ad set names for matrix
  const adsetNames = useMemo(() => {
    const names = new Set<string>();
    for (const o of overlaps) {
      names.add(o.adset_a.name);
      names.add(o.adset_b.name);
    }
    return Array.from(names);
  }, [overlaps]);

  // Build lookup: "nameA|nameB" → overlap_pct
  const overlapLookup = useMemo(() => {
    const map = new Map<string, OverlapPair>();
    for (const o of overlaps) {
      map.set(`${o.adset_a.name}|${o.adset_b.name}`, o);
      map.set(`${o.adset_b.name}|${o.adset_a.name}`, o);
    }
    return map;
  }, [overlaps]);

  const handleAnalyze = async () => {
    if (!selectedCampaignId) {
      toast.error('Selecciona una campaña');
      return;
    }

    setLoading(true);
    setMessage(null);
    setOverlaps([]);
    setHasAnalyzed(false);

    try {
      const { data, error } = await callApi('detect-audience-overlap', {
        body: { client_id: clientId, campaign_id: selectedCampaignId },
      });

      if (error) throw new Error(error);

      setOverlaps(data?.overlaps || []);
      setMessage(data?.message || null);
      setHasAnalyzed(true);
    } catch (err: any) {
      toast.error(err?.message || 'Error al analizar overlap');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Campaign selector + Analyze */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs text-muted-foreground mb-1 block">
                Campaña a analizar
              </label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecciona una campaña..." />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAnalyze} disabled={loading || !selectedCampaignId} className="h-9">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analizando...
                </>
              ) : (
                'Analizar Overlap'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Message (e.g. "need 2+ ad sets") */}
      {message && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Info className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {hasAnalyzed && !message && (
        <>
          {/* Threshold slider */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Umbral: <span className="font-medium text-foreground">{threshold}%</span>
            </span>
            <Slider
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1 max-w-xs"
            />
          </div>

          {/* Heatmap matrix */}
          {adsetNames.length >= 2 && (
            <Card>
              <CardContent className="pt-5 pb-4 overflow-x-auto">
                <p className="text-sm font-medium mb-3">Matriz de Overlap</p>
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `120px repeat(${adsetNames.length}, 1fr)`,
                  }}
                >
                  {/* Header row */}
                  <div />
                  {adsetNames.map((name) => (
                    <div
                      key={name}
                      className="text-[10px] font-medium text-muted-foreground truncate text-center px-1"
                      title={name}
                    >
                      {name.length > 15 ? name.slice(0, 15) + '…' : name}
                    </div>
                  ))}

                  {/* Data rows */}
                  {adsetNames.map((rowName) => (
                    <>
                      <div
                        key={`label-${rowName}`}
                        className="text-[10px] font-medium text-muted-foreground truncate flex items-center"
                        title={rowName}
                      >
                        {rowName.length > 18 ? rowName.slice(0, 18) + '…' : rowName}
                      </div>
                      {adsetNames.map((colName) => {
                        if (rowName === colName) {
                          return (
                            <div
                              key={`${rowName}-${colName}`}
                              className="aspect-square bg-muted/50 rounded flex items-center justify-center text-[9px] text-muted-foreground"
                            >
                              —
                            </div>
                          );
                        }
                        const pair = overlapLookup.get(`${rowName}|${colName}`);
                        const pct = pair?.overlap_pct ?? 0;
                        return (
                          <div
                            key={`${rowName}-${colName}`}
                            className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold border cursor-default transition-colors ${
                              pct >= threshold && pct > 0 ? overlapBg(pct) : 'bg-muted/30 border-transparent'
                            }`}
                            title={
                              pair
                                ? `${rowName} ↔ ${colName}: ${pct}%\n${pair.overlap_details.join('\n')}`
                                : `${rowName} ↔ ${colName}: 0%`
                            }
                          >
                            <span className={pct >= threshold && pct > 0 ? overlapTextColor(pct) : 'text-muted-foreground/50'}>
                              {pct > 0 ? `${pct}%` : '0'}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-green-500" />
                    <span className="text-muted-foreground">&lt;15% Bajo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-yellow-500" />
                    <span className="text-muted-foreground">15-30% Medio</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-500" />
                    <span className="text-muted-foreground">&gt;30% Alto</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detail list */}
          {filteredOverlaps.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {filteredOverlaps.length} par{filteredOverlaps.length !== 1 ? 'es' : ''} con overlap &ge; {threshold}%
              </p>
              {filteredOverlaps
                .sort((a, b) => b.overlap_pct - a.overlap_pct)
                .map((o) => (
                  <Card key={`${o.adset_a.id}-${o.adset_b.id}`} className="border">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{o.adset_a.name}</span>
                            <span className="text-xs text-muted-foreground">↔</span>
                            <span className="text-sm font-medium truncate">{o.adset_b.name}</span>
                          </div>
                          {o.overlap_details.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                              {o.overlap_details.map((d, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />
                                  {d}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <Badge className={`shrink-0 ${overlapBg(o.overlap_pct)} ${overlapTextColor(o.overlap_pct)}`}>
                          {o.overlap_pct}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          ) : hasAnalyzed && overlaps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm font-medium">Sin overlap significativo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No se detectaron ad sets con overlap mayor a 30% en esta campaña.
                </p>
              </CardContent>
            </Card>
          ) : hasAnalyzed && filteredOverlaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Ningún par supera el umbral de {threshold}%. Ajusta el slider para ver más.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
