import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Plus, Globe, Target, Search, Brain, Trash2,
  TrendingUp, AlertCircle, CheckCircle2, Clock, ExternalLink,
} from 'lucide-react';

interface Props { clientId: string; }

type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

interface CompetitorRow {
  id: string;
  client_id: string;
  competitor_name: string;
  competitor_url: string;
  ig_handle: string | null;
  industry: string | null;
  is_active: boolean;
  last_analyzed_at: string | null;
  analysis_status: AnalysisStatus;
  created_at: string;
}

const STATUS_BADGE: Record<AnalysisStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'Pendiente',  cls: 'bg-muted text-muted-foreground border-border',          icon: Clock },
  running:   { label: 'En curso',   cls: 'bg-primary/10 text-primary border-primary/30',          icon: Loader2 },
  completed: { label: 'Listo',      cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400', icon: CheckCircle2 },
  failed:    { label: 'Falló',      cls: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400', icon: AlertCircle },
};

export function CompetitorIntelligenceView({ clientId }: Props) {
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newIg, setNewIg] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchRows = async () => {
    // Cast to `any` because `competitor_intelligence` (and friends) live in a
    // migration applied AFTER `src/integrations/supabase/types.ts` was last
    // auto-generated. Re-running gen would overwrite manual fixes elsewhere.
    const { data, error } = await (supabase as any)
      .from('competitor_intelligence')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('No pude cargar competidores: ' + error.message);
      return;
    }
    setRows((data || []) as CompetitorRow[]);
  };

  useEffect(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [clientId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error('Nombre y URL son obligatorios');
      return;
    }
    setAdding(true);
    const { error } = await (supabase as any).from('competitor_intelligence').insert({
      client_id: clientId,
      competitor_name: newName.trim(),
      competitor_url: newUrl.trim(),
      ig_handle: newIg.trim() || null,
    });
    setAdding(false);
    if (error) {
      toast.error('No se pudo guardar: ' + error.message);
      return;
    }
    setNewName(''); setNewUrl(''); setNewIg('');
    setAddOpen(false);
    toast.success('Competidor agregado');
    fetchRows();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Borrar este competidor y todo su análisis?')) return;
    const { error } = await (supabase as any).from('competitor_intelligence').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Eliminado');
    fetchRows();
  };

  const runEndpoint = async (
    id: string,
    endpoint: 'scrape-paid-ads' | 'scrape-seo' | 'web-crawl' | 'generate-scorecard',
    extraBody: Record<string, unknown> = {},
  ) => {
    setRunning((p) => ({ ...p, [id]: endpoint }));
    const row = rows.find((r) => r.id === id);
    const body: Record<string, unknown> = {
      intelligence_id: id,
      ...extraBody,
    };
    if (endpoint === 'web-crawl' && row) body.url = row.competitor_url;
    if (endpoint === 'generate-scorecard') {
      body.client_id = clientId;
      body.intelligence_ids = [id];
    }
    const timeoutMs = endpoint === 'generate-scorecard' ? 180000 : 240000;
    const { data, error } = await callApi(`competitor/${endpoint}`, { body, timeoutMs });
    setRunning((p) => ({ ...p, [id]: null }));
    if (error) {
      toast.error(`${endpoint} falló: ${error}`);
      return;
    }
    toast.success(`${endpoint} completado`);
    fetchRows();
    return data;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inteligencia de Competencia</h2>
          <p className="text-sm text-muted-foreground">Análisis profundo: ads, SEO, web y scorecard AI vs tu marca.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Agregar competidor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo competidor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Nombre *</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Razas Pet" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">URL del sitio *</label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.razaspet.cl" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Handle Instagram <span className="text-muted-foreground">(opcional)</span></label>
                <Input value={newIg} onChange={(e) => setNewIg(e.target.value)} placeholder="razaspetshop" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button onClick={handleAdd} disabled={adding}>
                {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aún no agregaste competidores. Empieza con uno y dispara los análisis.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const Status = STATUS_BADGE[r.analysis_status] ?? STATUS_BADGE.pending;
            const isRunning = !!running[r.id];
            return (
              <Card key={r.id} className={selected === r.id ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{r.competitor_name}</CardTitle>
                      <CardDescription className="truncate flex items-center gap-1 mt-1">
                        <Globe className="w-3 h-3 shrink-0" />
                        <a href={r.competitor_url} target="_blank" rel="noreferrer" className="hover:underline truncate">
                          {r.competitor_url.replace(/^https?:\/\//, '')}
                        </a>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                      </CardDescription>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)} aria-label="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Badge variant="outline" className={`mt-2 w-fit ${Status.cls}`}>
                    <Status.icon className={`w-3 h-3 mr-1 ${r.analysis_status === 'running' ? 'animate-spin' : ''}`} />
                    {Status.label}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" disabled={isRunning} onClick={() => runEndpoint(r.id, 'scrape-paid-ads')}>
                      {running[r.id] === 'scrape-paid-ads' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3 mr-1" />}
                      Paid ads
                    </Button>
                    <Button size="sm" variant="outline" disabled={isRunning} onClick={() => runEndpoint(r.id, 'scrape-seo')}>
                      {running[r.id] === 'scrape-seo' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                      SEO
                    </Button>
                    <Button size="sm" variant="outline" disabled={isRunning} onClick={() => runEndpoint(r.id, 'web-crawl')}>
                      {running[r.id] === 'web-crawl' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3 mr-1" />}
                      Web crawl
                    </Button>
                    <Button size="sm" disabled={isRunning} onClick={() => runEndpoint(r.id, 'generate-scorecard')}>
                      {running[r.id] === 'generate-scorecard' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                      Scorecard
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" className="w-full" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {selected === r.id ? 'Ocultar' : 'Ver detalle'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selected && <CompetitorDetail clientId={clientId} intelId={selected} />}
    </div>
  );
}

function CompetitorDetail({ clientId, intelId }: { clientId: string; intelId: string }) {
  const [paid, setPaid] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [scorecard, setScorecard] = useState<any | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const sb = supabase as any;
    Promise.all([
      sb.from('competitor_paid_ads').select('*').eq('intelligence_id', intelId).limit(50),
      sb.from('competitor_seo_keywords').select('*').eq('intelligence_id', intelId).limit(100),
      sb.from('competitor_scorecards').select('*').eq('client_id', clientId)
        .contains('competitor_intelligence_ids', [intelId])
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('competitor_action_plans').select('*').eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(20),
    ])
      .then(([p, k, s, a]) => {
        setPaid(p.data || []);
        setKeywords(k.data || []);
        setScorecard(s.data || null);
        setActions(a.data || []);
      })
      .finally(() => setLoading(false));
  }, [clientId, intelId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <Card className="mt-2">
      <CardHeader><CardTitle className="text-base">Detalle del análisis</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="paid">
          <TabsList>
            <TabsTrigger value="paid">Paid ads ({paid.length})</TabsTrigger>
            <TabsTrigger value="seo">SEO ({keywords.length})</TabsTrigger>
            <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
            <TabsTrigger value="plan">Plan ({actions.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="paid" className="pt-3">
            {paid.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ads detectados todavía. Corre "Paid ads".</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {paid.map((a) => (
                  <div key={a.id} className="p-2 border rounded text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{a.platform}</Badge>
                      <Badge variant="outline">{a.creative_type}</Badge>
                      <span className="text-muted-foreground text-xs">{a.days_running}d activo</span>
                    </div>
                    {a.copy_text && <p className="line-clamp-2">{a.copy_text}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="seo" className="pt-3">
            {keywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin keywords. Corre "SEO".</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th>Keyword</th><th>Pos</th><th>Volume</th></tr>
                  </thead>
                  <tbody>
                    {keywords.slice(0, 30).map((k) => (
                      <tr key={k.id} className="border-t"><td className="py-1">{k.keyword}</td><td>{k.position}</td><td>{k.search_volume ?? '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="scorecard" className="pt-3">
            {!scorecard ? (
              <p className="text-sm text-muted-foreground">Sin scorecard. Corre "Scorecard" cuando tengas datos.</p>
            ) : (
              <pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto">{JSON.stringify(scorecard.scorecard_data ?? scorecard, null, 2)}</pre>
            )}
          </TabsContent>
          <TabsContent value="plan" className="pt-3">
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin plan. Corre "Scorecard" para generar plan 30/60/90.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {actions.map((a) => (
                  <div key={a.id} className="p-2 border rounded text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{a.period_days}d</Badge>
                      <Badge variant="outline">{a.priority}</Badge>
                      <Badge variant="outline">{a.category}</Badge>
                    </div>
                    <p className="font-medium">{a.title}</p>
                    {a.description && <p className="text-muted-foreground text-xs mt-1">{a.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CompetitorIntelligenceView;
