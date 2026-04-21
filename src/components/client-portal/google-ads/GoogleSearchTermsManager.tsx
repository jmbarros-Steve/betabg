import { useState, useEffect, useCallback, useRef } from 'react';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Check, X, Plus, Ban, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';

interface Suggestion {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  ad_group_id: string;
  ad_group_name: string | null;
  search_term: string;
  matched_keyword: string | null;
  matched_keyword_match_type: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  cost_micros: number;
  ctr: number;
  suggestion_type: 'add_keyword' | 'add_negative_campaign' | 'add_negative_adgroup';
  suggested_match_type: string;
  suggestion_reason: string | null;
  status: string;
  created_at: string;
}

interface Props {
  connectionId: string;
  clientId: string;
}

const suggestionTypeMeta: Record<string, { label: string; icon: any; color: string }> = {
  add_keyword:           { label: 'Agregar como keyword',        icon: TrendingUp, color: 'bg-green-500/10 text-green-700' },
  add_negative_adgroup:  { label: 'Negative (ad group)',         icon: Ban,        color: 'bg-red-500/10 text-red-600' },
  add_negative_campaign: { label: 'Negative (campaña)',          icon: Ban,        color: 'bg-red-500/10 text-red-600' },
};

export default function GoogleSearchTermsManager({ connectionId, clientId }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'applied' | 'rejected' | 'failed'>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [lastCronRun, setLastCronRun] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchSuggestions = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      // Leemos directo de Supabase con RLS (más eficiente que pasar por backend)
      const { data, error } = await supabase
        .from('search_terms_suggestions')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', statusFilter)
        .order('cost_micros', { ascending: false })
        .limit(500);
      if (error) {
        // Si la tabla no existe aún, no crasheamos
        if (error.code === '42P01') {
          toast.warning('La tabla search_terms_suggestions aún no fue creada. Ejecutá la migración.');
          setSuggestions([]);
          setLoading(false);
          return;
        }
        toast.error('Error cargando sugerencias: ' + error.message);
        setLoading(false);
        return;
      }
      setSuggestions(data || []);
      if (data && data.length > 0) {
        setLastCronRun(data[0].created_at);
      }
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [clientId, statusFilter]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  const visibleSuggestions = typeFilter
    ? suggestions.filter(s => s.suggestion_type === typeFilter)
    : suggestions;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === visibleSuggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleSuggestions.map(s => s.id)));
    }
  };

  const applyOne = async (sug: Suggestion) => {
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'apply_suggestion',
        connection_id: connectionId,
        data: { client_id: clientId, suggestion_id: sug.id },
      },
    });
    if (error) {
      toast.error(`Error aplicando "${sug.search_term}": ` + error);
      return false;
    }
    return true;
  };

  const rejectOne = async (sug: Suggestion) => {
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'reject_suggestion',
        connection_id: connectionId,
        data: { client_id: clientId, suggestion_id: sug.id },
      },
    });
    if (error) {
      toast.error(`Error rechazando "${sug.search_term}": ` + error);
      return false;
    }
    return true;
  };

  const handleApplySelected = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      const sug = suggestions.find(s => s.id === id);
      if (!sug) continue;
      const applied = await applyOne(sug);
      if (applied) ok++; else fail++;
    }
    setBatchLoading(false);
    if (ok > 0) toast.success(`${ok} sugerencia(s) aplicada(s)${fail > 0 ? `, ${fail} fallaron` : ''}`);
    else if (fail > 0) toast.error(`${fail} fallaron`);
    await fetchSuggestions();
  };

  const handleRejectSelected = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      const sug = suggestions.find(s => s.id === id);
      if (!sug) continue;
      const rejected = await rejectOne(sug);
      if (rejected) ok++; else fail++;
    }
    setBatchLoading(false);
    if (ok > 0) toast.success(`${ok} sugerencia(s) rechazada(s)${fail > 0 ? `, ${fail} fallaron` : ''}`);
    await fetchSuggestions();
  };

  // Agrupar por suggestion_type para counts del header
  const counts = {
    total: suggestions.length,
    add_keyword: suggestions.filter(s => s.suggestion_type === 'add_keyword').length,
    negative: suggestions.filter(s => s.suggestion_type.startsWith('add_negative')).length,
  };

  const allSelected = visibleSuggestions.length > 0 && selectedIds.size === visibleSuggestions.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Sugerencias Steve · {counts.total} total
            {counts.add_keyword > 0 && <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-700">{counts.add_keyword} keywords</Badge>}
            {counts.negative > 0 && <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-600">{counts.negative} negatives</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">
            Cron analiza search_term_view cada 3 días y sugiere acciones. Revisá y aprobá antes de aplicar a Google Ads.
          </p>
          {lastCronRun && (
            <p className="text-[11px] text-muted-foreground/70">
              Última sugerencia: {new Date(lastCronRun).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="pending">Pendientes</option>
            <option value="applied">Aplicadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="failed">Fallidas</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">Todos los tipos</option>
            <option value="add_keyword">Agregar keyword</option>
            <option value="add_negative_adgroup">Negative ad group</option>
            <option value="add_negative_campaign">Negative campaña</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* Batch actions */}
      {statusFilter === 'pending' && visibleSuggestions.length > 0 && (
        <div className="flex items-center gap-2 border rounded-md p-2 bg-muted/20">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={selectAll}
            className="ml-2"
          />
          <span className="text-sm">
            {selectedIds.size > 0 ? `${selectedIds.size} seleccionada(s)` : 'Seleccionar todas'}
          </span>
          {selectedIds.size > 0 && (
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={handleRejectSelected} disabled={batchLoading}>
                {batchLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                Rechazar seleccionadas
              </Button>
              <Button size="sm" onClick={handleApplySelected} disabled={batchLoading}>
                {batchLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                Aplicar seleccionadas ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">
            {statusFilter === 'pending' ? 'Sin sugerencias pendientes' : `Sin sugerencias ${statusFilter}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {statusFilter === 'pending'
              ? 'El cron corre cada 3 días. Si recién conectaste, esperá al próximo ciclo.'
              : 'Cambiá el filtro arriba para ver otras.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleSuggestions.map(sug => {
            const meta = suggestionTypeMeta[sug.suggestion_type] || { label: sug.suggestion_type, icon: AlertCircle, color: '' };
            const MetaIcon = meta.icon;
            const cost = sug.cost_micros / 1_000_000;
            return (
              <Card key={sug.id} className="p-3">
                <div className="flex items-start gap-3">
                  {statusFilter === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sug.id)}
                      onChange={() => toggleSelect(sug.id)}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={meta.color}>
                        <MetaIcon className="w-3 h-3 mr-1" />
                        {meta.label}
                      </Badge>
                      <span className="font-medium truncate">"{sug.search_term}"</span>
                      <Badge variant="outline" className="text-[10px]">
                        sugerido {sug.suggested_match_type}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-xs text-muted-foreground">
                      <div><span className="font-medium">Campaña:</span> {sug.campaign_name || sug.campaign_id}</div>
                      <div><span className="font-medium">Ad Group:</span> {sug.ad_group_name || sug.ad_group_id}</div>
                      <div><span className="font-medium">Matched:</span> {sug.matched_keyword ? `${sug.matched_keyword} (${sug.matched_keyword_match_type})` : '—'}</div>
                      <div><span className="font-medium">Impr/Clicks/Conv:</span> {sug.impressions}/{sug.clicks}/{sug.conversions}</div>
                      <div><span className="font-medium">Gastado:</span> {cost.toFixed(2)} ({sug.ctr}% CTR)</div>
                    </div>
                    {sug.suggestion_reason && (
                      <p className="text-xs text-muted-foreground/80 italic mt-1.5">💡 {sug.suggestion_reason}</p>
                    )}
                  </div>
                  {statusFilter === 'pending' && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7" onClick={async () => { await rejectOne(sug); await fetchSuggestions(); }}>
                        <X className="w-3 h-3" />
                      </Button>
                      <Button size="sm" className="h-7" onClick={async () => { const ok = await applyOne(sug); if (ok) { toast.success('Aplicada'); await fetchSuggestions(); } }}>
                        <Check className="w-3 h-3 mr-1" />
                        Aplicar
                      </Button>
                    </div>
                  )}
                  {statusFilter === 'applied' && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700">
                      <Check className="w-3 h-3 mr-1" /> Aplicada
                    </Badge>
                  )}
                  {statusFilter === 'rejected' && (
                    <Badge variant="outline" className="bg-gray-500/10 text-gray-600">
                      Rechazada
                    </Badge>
                  )}
                  {statusFilter === 'failed' && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600">
                      Falló
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
