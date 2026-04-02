import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Search, CheckCircle2, XCircle, Clock, Loader2, RefreshCw,
  ExternalLink, Link2, ChevronDown, ChevronUp, Sparkles,
  Filter, Layers, BarChart3, Zap, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────

interface InsightEntry {
  id: string;
  titulo: string;
  contenido: string;
  categoria: string;
  approval_status: string;
  activo: boolean;
  confidence: number | null;
  source_explanation: string | null;
  sources_urls: string[] | null;
  insight_group_id: string | null;
  created_at: string | null;
  swarm_run_id: string | null;
  orden: number;
}

interface SwarmRun {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  questions: string[] | null;
  insights_generated: number | null;
  total_sources: number | null;
  error_message: string | null;
}

// ─── Category Colors ──────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  meta_ads: 'bg-blue-500/15 text-blue-700 border-blue-300',
  google_ads: 'bg-red-500/15 text-red-700 border-red-300',
  klaviyo: 'bg-pink-500/15 text-pink-700 border-pink-300',
  shopify: 'bg-green-500/15 text-green-700 border-green-300',
  anuncios: 'bg-yellow-500/15 text-yellow-700 border-yellow-300',
  analisis: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
  cross_channel: 'bg-purple-500/15 text-purple-700 border-purple-300',
  sales_learning: 'bg-cyan-500/15 text-cyan-700 border-cyan-300',
  brief: 'bg-indigo-500/15 text-indigo-700 border-indigo-300',
  prospecting: 'bg-teal-500/15 text-teal-700 border-teal-300',
  seo: 'bg-lime-500/15 text-lime-700 border-lime-300',
};

const ALL_CATEGORIES = [
  'meta_ads', 'google_ads', 'klaviyo', 'shopify', 'anuncios',
  'analisis', 'cross_channel', 'sales_learning', 'brief', 'prospecting', 'seo',
];

function getCategoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] || 'bg-slate-500/15 text-slate-700 border-slate-300';
}

function getConfidenceColor(c: number): string {
  if (c >= 8) return 'text-green-600';
  if (c >= 5) return 'text-yellow-600';
  return 'text-red-500';
}

function getConfidenceBarColor(c: number): string {
  if (c >= 8) return 'bg-green-500';
  if (c >= 5) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ─── Component ────────────────────────────────────────────────────

export function InsightApprovalPanel() {
  const [insights, setInsights] = useState<InsightEntry[]>([]);
  const [swarmRuns, setSwarmRuns] = useState<SwarmRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState('pending');
  const [processing, setProcessing] = useState(false);
  const [detailInsight, setDetailInsight] = useState<InsightEntry | null>(null);
  const [multiCatInsight, setMultiCatInsight] = useState<InsightEntry | null>(null);
  const [extraCategories, setExtraCategories] = useState<Set<string>>(new Set());

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: kData }, { data: sData }] = await Promise.all([
        supabase
          .from('steve_knowledge')
          .select('id, titulo, contenido, categoria, approval_status, activo, confidence, source_explanation, sources_urls, insight_group_id, created_at, swarm_run_id, orden')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('swarm_runs')
          .select('id, status, started_at, completed_at, questions, insights_generated, total_sources, error_message')
          .order('started_at', { ascending: false })
          .limit(20),
      ]);
      setInsights(kData || []);
      setSwarmRuns(sData || []);
    } catch (err) {
      toast.error('Error cargando datos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Derived data ───
  const pending = insights.filter(i => i.approval_status === 'pending');
  const approved = insights.filter(i => i.approval_status === 'approved');
  const rejected = insights.filter(i => i.approval_status === 'rejected');

  const groupMap = new Map<string, InsightEntry[]>();
  insights.forEach(i => {
    if (!i.insight_group_id) return;
    const arr = groupMap.get(i.insight_group_id) || [];
    arr.push(i);
    groupMap.set(i.insight_group_id, arr);
  });

  const categories = [...new Set(insights.map(i => i.categoria))].sort();

  function filterByStatus(status: string) {
    let list = insights.filter(i => i.approval_status === status);
    if (categoryFilter !== 'all') list = list.filter(i => i.categoria === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        (i.titulo || '').toLowerCase().includes(q) ||
        (i.contenido || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  // ─── Selection ───
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(status: string) {
    const ids = filterByStatus(status).map(i => i.id);
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ─── Approve / Reject ───
  async function approveIds(ids: string[]) {
    setProcessing(true);
    try {
      // Get group IDs from selected
      const selected = insights.filter(i => ids.includes(i.id));
      const groupIds = [...new Set(selected.map(i => i.insight_group_id).filter(Boolean))] as string[];

      // Approve selected
      const { error } = await supabase
        .from('steve_knowledge')
        .update({ approval_status: 'approved', orden: 90 })
        .in('id', ids);

      if (error) throw error;

      // Approve siblings
      for (const gid of groupIds) {
        await supabase
          .from('steve_knowledge')
          .update({ approval_status: 'approved', orden: 90 })
          .eq('insight_group_id', gid)
          .eq('approval_status', 'pending');
      }

      const siblingCount = groupIds.length > 0
        ? insights.filter(i => i.insight_group_id && groupIds.includes(i.insight_group_id) && !ids.includes(i.id)).length
        : 0;

      toast.success(`${ids.length} aprobados${siblingCount > 0 ? ` + ${siblingCount} siblings` : ''}`);
      clearSelection();
      await fetchData();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setProcessing(false);
  }

  async function rejectIds(ids: string[]) {
    setProcessing(true);
    try {
      const selected = insights.filter(i => ids.includes(i.id));
      const groupIds = [...new Set(selected.map(i => i.insight_group_id).filter(Boolean))] as string[];

      const { error } = await supabase
        .from('steve_knowledge')
        .update({ approval_status: 'rejected', activo: false })
        .in('id', ids);

      if (error) throw error;

      for (const gid of groupIds) {
        await supabase
          .from('steve_knowledge')
          .update({ approval_status: 'rejected', activo: false })
          .eq('insight_group_id', gid)
          .eq('approval_status', 'pending');
      }

      toast.success(`${ids.length} rechazados`);
      clearSelection();
      await fetchData();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setProcessing(false);
  }

  async function approveAll() {
    const ids = filterByStatus('pending').map(i => i.id);
    if (ids.length === 0) return;
    await approveIds(ids);
  }

  async function rejectAll() {
    const ids = filterByStatus('pending').map(i => i.id);
    if (ids.length === 0) return;
    await rejectIds(ids);
  }

  // ─── Multi-category approve ───
  function openMultiCat(insight: InsightEntry) {
    setMultiCatInsight(insight);
    setExtraCategories(new Set());
  }

  function toggleExtraCat(cat: string) {
    setExtraCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function approveWithMultiCat() {
    if (!multiCatInsight) return;
    setProcessing(true);
    try {
      const insight = multiCatInsight;
      const extras = [...extraCategories];
      const groupId = insight.insight_group_id || crypto.randomUUID();

      // If we're adding extra categories, set group ID on the original row
      if (extras.length > 0 && !insight.insight_group_id) {
        await supabase
          .from('steve_knowledge')
          .update({ insight_group_id: groupId })
          .eq('id', insight.id);
      }

      // Create new rows for extra categories
      for (const cat of extras) {
        await supabase.from('steve_knowledge').insert({
          categoria: cat,
          titulo: insight.titulo,
          contenido: insight.contenido,
          activo: true,
          orden: 90,
          approval_status: 'approved',
          source_explanation: insight.source_explanation || '',
          confidence: insight.confidence || 5,
          sources_urls: insight.sources_urls || [],
          swarm_run_id: insight.swarm_run_id,
          insight_group_id: groupId,
          industria: 'general',
        });
      }

      // Approve original + all siblings
      await supabase
        .from('steve_knowledge')
        .update({ approval_status: 'approved', orden: 90 })
        .eq('id', insight.id);

      if (groupId) {
        await supabase
          .from('steve_knowledge')
          .update({ approval_status: 'approved', orden: 90 })
          .eq('insight_group_id', groupId)
          .eq('approval_status', 'pending');
      }

      toast.success(`Aprobado en ${extras.length + 1} categorías: ${insight.categoria}, ${extras.join(', ')}`);
      setMultiCatInsight(null);
      setExtraCategories(new Set());
      clearSelection();
      await fetchData();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setProcessing(false);
  }

  // ─── Expand ───
  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Render insight card ───
  function renderCard(insight: InsightEntry, showActions: boolean) {
    const conf = insight.confidence || 0;
    const expanded = expandedIds.has(insight.id);
    const siblings = insight.insight_group_id ? (groupMap.get(insight.insight_group_id) || []).filter(s => s.id !== insight.id) : [];
    const sources = Array.isArray(insight.sources_urls) ? insight.sources_urls : [];
    const date = insight.created_at ? new Date(insight.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <motion.div
        key={insight.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        <Card className={`transition-all duration-200 hover:shadow-md ${selectedIds.has(insight.id) ? 'ring-2 ring-[#1E3A7B] bg-[#1E3A7B]/5' : ''}`}>
          <CardContent className="pt-5 pb-4">
            {/* Header row */}
            <div className="flex items-start gap-3">
              {showActions && (
                <Checkbox
                  checked={selectedIds.has(insight.id)}
                  onCheckedChange={() => toggleSelect(insight.id)}
                  className="mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3
                    className="font-semibold text-sm leading-snug cursor-pointer hover:text-[#1E3A7B] transition-colors"
                    onClick={() => toggleExpand(insight.id)}
                  >
                    {insight.titulo || 'Sin titulo'}
                  </h3>
                  {/* Confidence */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getConfidenceBarColor(conf)}`}
                        style={{ width: `${conf * 10}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${getConfidenceColor(conf)}`}>{conf}/10</span>
                  </div>
                </div>

                {/* Content preview */}
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {insight.contenido}
                </p>

                {/* Tags row */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] px-2 py-0 ${getCategoryStyle(insight.categoria)}`}>
                    {insight.categoria}
                  </Badge>
                  {insight.insight_group_id && siblings.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 bg-[#1E3A7B]/10 text-[#1E3A7B] border-[#7B9BCF]">
                      <Layers className="w-3 h-3 mr-1" />
                      Grupo ({siblings.length + 1} cats)
                    </Badge>
                  )}
                  {insight.insight_group_id && siblings.length > 0 && siblings.map(s => (
                    <Badge key={s.id} variant="outline" className={`text-[10px] px-2 py-0 ${getCategoryStyle(s.categoria)}`}>
                      {s.categoria}
                    </Badge>
                  ))}
                  <span className="text-[10px] text-slate-400 ml-auto">{date}</span>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        {/* Full content */}
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{insight.contenido}</p>

                        {/* Explanation */}
                        {insight.source_explanation && (
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-[11px] text-slate-500 italic">
                              <Sparkles className="w-3 h-3 inline mr-1" />
                              {insight.source_explanation}
                            </p>
                          </div>
                        )}

                        {/* Sources */}
                        {sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {sources.map((url, i) => {
                              let hostname = url;
                              try { hostname = new URL(url).hostname; } catch {}
                              return (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  {hostname}
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Group ID */}
                        {insight.insight_group_id && (
                          <p className="text-[10px] text-slate-400 font-mono">
                            Group: {insight.insight_group_id.slice(0, 8)}...
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Expand toggle */}
              <button onClick={() => toggleExpand(insight.id)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Actions */}
            {showActions && (
              <div className="flex gap-2 mt-3 pl-7">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                  disabled={processing}
                  onClick={() => approveIds([insight.id])}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Aprobar{siblings.length > 0 ? ` (+${siblings.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-[#1E3A7B] hover:bg-[#162D5F] text-white"
                  disabled={processing}
                  onClick={() => openMultiCat(insight)}
                >
                  <Send className="w-3 h-3 mr-1" />
                  Multi-cat
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  disabled={processing}
                  onClick={() => rejectIds([insight.id])}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Rechazar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ─── Render group card ───
  function renderGroupCard(groupId: string, items: InsightEntry[]) {
    const first = items[0];
    const conf = first.confidence || 0;
    const status = first.approval_status;
    const cats = items.map(i => i.categoria);
    const date = first.created_at ? new Date(first.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <motion.div
        key={groupId}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="hover:shadow-md transition-all">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{first.titulo}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{first.contenido}</p>
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {cats.map(c => (
                    <Badge key={c} variant="outline" className={`text-[10px] px-2 py-0 ${getCategoryStyle(c)}`}>
                      {c}
                    </Badge>
                  ))}
                  <Badge variant="outline" className={`text-[10px] px-2 py-0 ${
                    status === 'approved' ? 'bg-green-500/15 text-green-700 border-green-300' :
                    status === 'rejected' ? 'bg-red-500/15 text-red-700 border-red-300' :
                    'bg-yellow-500/15 text-yellow-700 border-yellow-300'
                  }`}>
                    {status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 bg-[#1E3A7B]/10 text-[#1E3A7B] border-[#7B9BCF]">
                    <Layers className="w-3 h-3 mr-1" /> {items.length} filas
                  </Badge>
                  <span className="text-[10px] text-slate-400 ml-auto">{date}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${getConfidenceBarColor(conf)}`} style={{ width: `${conf * 10}%` }} />
                </div>
                <span className={`text-xs font-bold tabular-nums ${getConfidenceColor(conf)}`}>{conf}/10</span>
              </div>
            </div>
            {status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                  disabled={processing}
                  onClick={() => approveIds(items.map(i => i.id))}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Aprobar Grupo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  disabled={processing}
                  onClick={() => rejectIds(items.map(i => i.id))}
                >
                  <XCircle className="w-3 h-3 mr-1" /> Rechazar Grupo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ─── Render swarm card ───
  function renderSwarmCard(run: SwarmRun) {
    const date = run.started_at ? new Date(run.started_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const questions = Array.isArray(run.questions) ? run.questions.length : 0;

    return (
      <Card key={run.id} className="hover:shadow-md transition-all">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
              run.status === 'completed' ? 'bg-green-50' :
              run.status === 'running' ? 'bg-yellow-50' : 'bg-red-50'
            }`}>
              {run.status === 'completed' ? '✅' : run.status === 'running' ? '⏳' : '❌'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Swarm Run</p>
              <p className="text-xs text-muted-foreground">{date} &bull; {run.id.slice(0, 8)}...</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Preguntas: <strong className="text-foreground">{questions}</strong></span>
              <span>Insights: <strong className="text-foreground">{run.insights_generated || 0}</strong></span>
              <span>Fuentes: <strong className="text-foreground">{run.total_sources || 0}</strong></span>
            </div>
            <Badge variant="outline" className={`text-[10px] ${
              run.status === 'completed' ? 'bg-green-500/15 text-green-700 border-green-300' :
              run.status === 'running' ? 'bg-yellow-500/15 text-yellow-700 border-yellow-300' :
              'bg-red-500/15 text-red-700 border-red-300'
            }`}>
              {run.status}
            </Badge>
          </div>
          {run.error_message && (
            <p className="text-xs text-red-500 mt-2 pl-[52px]">{run.error_message}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ─── Main render ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#1E3A7B]" />
      </div>
    );
  }

  const groups = [...groupMap.entries()].sort((a, b) => {
    const dA = new Date(a[1][0].created_at || 0).getTime();
    const dB = new Date(b[1][0].created_at || 0).getTime();
    return dB - dA;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#1E3A7B]" />
            Insight Approval
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aprueba o rechaza los insights del swarm. Los grupos multi-categoria se aprueban juntos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-[#1E3A7B]">{insights.length}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-yellow-600">{pending.length}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">{approved.length}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Aprobados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-red-500">{rejected.length}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Rechazados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-purple-600">{groupMap.size}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Grupos Multi-Cat</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar insights..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              categoryFilter === 'all'
                ? 'bg-[#1E3A7B] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                categoryFilter === cat
                  ? 'bg-[#1E3A7B] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="pending" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Pendientes
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Aprobados
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{approved.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Rechazados
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{rejected.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="groups" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            Grupos
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{groupMap.size}</Badge>
          </TabsTrigger>
          <TabsTrigger value="swarms" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Swarm Runs
          </TabsTrigger>
        </TabsList>

        {/* ─── Pending ─── */}
        <TabsContent value="pending" className="mt-4">
          {/* Bulk actions */}
          {(selectedIds.size > 0 || filterByStatus('pending').length > 0) && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-lg border">
              <span className="text-xs text-muted-foreground flex-1">
                {selectedIds.size > 0
                  ? <><strong className="text-[#1E3A7B]">{selectedIds.size}</strong> seleccionados</>
                  : <>{filterByStatus('pending').length} pendientes</>
                }
              </span>
              {selectedIds.size > 0 ? (
                <>
                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={processing}
                    onClick={() => approveIds([...selectedIds])}>
                    {processing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    Aprobar ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" disabled={processing}
                    onClick={() => rejectIds([...selectedIds])}>
                    Rechazar ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>Limpiar</Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectAll('pending')}>
                    Seleccionar todos
                  </Button>
                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={processing}
                    onClick={approveAll}>
                    Aprobar todos
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200" disabled={processing}
                    onClick={rejectAll}>
                    Rechazar todos
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filterByStatus('pending').length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No hay insights pendientes</p>
                  <p className="text-xs mt-1">Los insights del swarm aparecen aqui para revision</p>
                </div>
              ) : (
                filterByStatus('pending').map(i => renderCard(i, true))
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* ─── Approved ─── */}
        <TabsContent value="approved" className="mt-4">
          <div className="space-y-3">
            {filterByStatus('approved').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay insights aprobados</p>
              </div>
            ) : (
              filterByStatus('approved').map(i => renderCard(i, false))
            )}
          </div>
        </TabsContent>

        {/* ─── Rejected ─── */}
        <TabsContent value="rejected" className="mt-4">
          <div className="space-y-3">
            {filterByStatus('rejected').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <XCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay insights rechazados</p>
              </div>
            ) : (
              filterByStatus('rejected').map(i => renderCard(i, false))
            )}
          </div>
        </TabsContent>

        {/* ─── Groups ─── */}
        <TabsContent value="groups" className="mt-4">
          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay grupos multi-categoria</p>
                <p className="text-xs mt-1">Insights que aplican a 2+ categorias aparecen aqui agrupados</p>
              </div>
            ) : (
              groups.map(([gid, items]) => renderGroupCard(gid, items))
            )}
          </div>
        </TabsContent>

        {/* ─── Swarm Runs ─── */}
        <TabsContent value="swarms" className="mt-4">
          <div className="space-y-3">
            {swarmRuns.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay swarm runs</p>
              </div>
            ) : (
              swarmRuns.map(run => renderSwarmCard(run))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Multi-Category Approval Dialog ─── */}
      <Dialog open={!!multiCatInsight} onOpenChange={(open) => { if (!open) setMultiCatInsight(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="w-4 h-4 text-[#1E3A7B]" />
              Aprobar en multiples categorias
            </DialogTitle>
          </DialogHeader>
          {multiCatInsight && (
            <div className="space-y-4">
              {/* Insight preview */}
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-sm font-semibold">{multiCatInsight.titulo}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{multiCatInsight.contenido}</p>
              </div>

              {/* Current category */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Categoria actual</p>
                <Badge variant="outline" className={`${getCategoryStyle(multiCatInsight.categoria)}`}>
                  {multiCatInsight.categoria}
                </Badge>
              </div>

              {/* Extra categories */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Enviar tambien a:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_CATEGORIES.filter(c => c !== multiCatInsight.categoria).map(cat => (
                    <label
                      key={cat}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                        extraCategories.has(cat)
                          ? 'border-[#1E3A7B] bg-[#1E3A7B]/5'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Checkbox
                        checked={extraCategories.has(cat)}
                        onCheckedChange={() => toggleExtraCat(cat)}
                      />
                      <Badge variant="outline" className={`text-[10px] px-2 py-0 ${getCategoryStyle(cat)}`}>
                        {cat}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {extraCategories.size > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700">
                    Se creara <strong>1 fila por categoria</strong> con el mismo contenido, vinculadas por un grupo compartido.
                    Total: <strong>{extraCategories.size + 1} filas</strong> ({multiCatInsight.categoria}, {[...extraCategories].join(', ')})
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMultiCatInsight(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={processing || extraCategories.size === 0}
              onClick={approveWithMultiCat}
            >
              {processing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Aprobar en {extraCategories.size + 1} categorias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
