import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Search, Clock, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Eye, SkipForward, Send, CheckCircle2, Sparkles, BarChart3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────

interface CreativeItem {
  id: string;
  client_id: string;
  channel: string | null;
  copy_text: string | null;
  angle: string | null;
  product_name: string | null;
  score_headline: number | null;
  score_hook: number | null;
  score_cta: number | null;
  score_overall: number | null;
  review_status: string;
  admin_feedback: string | null;
  feedback_rules_generated: number | null;
  feedback_queue_id: string | null;
  feedback_processed_at: string | null;
  created_at: string | null;
  clients: { name: string | null; company: string | null } | null;
}

interface Stats {
  pending: number;
  reviewed: number;
  skipped: number;
  rules_generated: number;
}

// ─── Channel colors ──────────────────────────────────────────────

const CHANNEL_STYLES: Record<string, string> = {
  meta: 'bg-blue-500/15 text-blue-700 border-blue-300',
  email: 'bg-pink-500/15 text-pink-700 border-pink-300',
  google: 'bg-red-500/15 text-red-700 border-red-300',
};

function getChannelStyle(ch: string | null) {
  if (!ch) return 'bg-slate-500/15 text-slate-700 border-slate-300';
  return CHANNEL_STYLES[ch.toLowerCase()] || 'bg-slate-500/15 text-slate-700 border-slate-300';
}

function getScoreColor(s: number | null): string {
  if (!s) return 'text-slate-400';
  if (s >= 8) return 'text-green-600';
  if (s >= 5) return 'text-yellow-600';
  return 'text-red-500';
}

// ─── Component ────────────────────────────────────────────────────

export function CreativeReviewFeed() {
  const [items, setItems] = useState<CreativeItem[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, reviewed: 0, skipped: 0, rules_generated: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [feedbackTexts, setFeedbackTexts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<{ items: CreativeItem[]; stats: Stats }>('creative-review-feed', {
        body: { action: 'list' },
      });
      if (error) throw new Error(error);
      setItems(data?.items || []);
      setStats(data?.stats || { pending: 0, reviewed: 0, skipped: 0, rules_generated: 0 });
    } catch (err: any) {
      toast.error(err.message || 'Error cargando creativos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Derived ───
  function filterByStatus(status: string) {
    let list = items.filter(i => i.review_status === status);
    if (channelFilter !== 'all') {
      list = list.filter(i => (i.channel || '').toLowerCase() === channelFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        (i.copy_text || '').toLowerCase().includes(q) ||
        (i.angle || '').toLowerCase().includes(q) ||
        (i.product_name || '').toLowerCase().includes(q) ||
        (i.clients?.name || '').toLowerCase().includes(q) ||
        (i.clients?.company || '').toLowerCase().includes(q)
      );
    }
    return list;
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

  // ─── Submit Feedback ───
  async function submitFeedback(creativeId: string) {
    const feedback = feedbackTexts[creativeId]?.trim();
    if (!feedback) {
      toast.error('Escribe feedback antes de enviar');
      return;
    }

    setSubmittingId(creativeId);
    try {
      const { data, error } = await callApi('creative-review-feed', {
        body: { action: 'submit_feedback', creative_id: creativeId, feedback },
      });
      if (error) throw new Error(error);

      toast.success('Feedback enviado al pipeline de aprendizaje');

      // Fire-and-forget process-queue-item
      if (data?.queueId) {
        void callApi('process-queue-item', {
          body: { queueId: data.queueId },
        }).then(async (res) => {
          if (res.data?.rulesSaved) {
            // Update rules_generated count on creative_history via the feed endpoint
            toast.success(`${res.data.rulesSaved} reglas extraidas del feedback`);
          }
        }).catch(() => {});
      }

      setFeedbackTexts(prev => {
        const next = { ...prev };
        delete next[creativeId];
        return next;
      });
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error enviando feedback');
    }
    setSubmittingId(null);
  }

  // ─── Skip ───
  async function skipCreative(creativeId: string) {
    try {
      const { error } = await callApi('creative-review-feed', {
        body: { action: 'skip', creative_ids: [creativeId] },
      });
      if (error) throw new Error(error);
      toast.success('Creativo omitido');
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  }

  // ─── Render card ───
  function renderCard(item: CreativeItem, showActions: boolean) {
    const expanded = expandedIds.has(item.id);
    const clientName = item.clients?.name || item.clients?.company || 'Sin cliente';
    const copyPreview = (item.copy_text || '').slice(0, 120);
    const date = item.created_at
      ? new Date(item.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="transition-all duration-200 hover:shadow-md">
          <CardContent className="pt-5 pb-4">
            {/* Header row */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex items-center gap-2 cursor-pointer hover:text-[#1E3A7B] transition-colors"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <Badge variant="outline" className={`text-[10px] px-2 py-0 ${getChannelStyle(item.channel)}`}>
                      {item.channel || '?'}
                    </Badge>
                    <span className="font-semibold text-sm">{clientName}</span>
                    {item.angle && (
                      <span className="text-xs text-muted-foreground">— {item.angle}</span>
                    )}
                  </div>

                  {/* Score */}
                  {item.score_overall != null && (
                    <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${getScoreColor(item.score_overall)}`}>
                      {item.score_overall}/10
                    </span>
                  )}
                </div>

                {/* Copy preview */}
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {copyPreview}{(item.copy_text || '').length > 120 ? '...' : ''}
                </p>

                {/* Tags */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {item.product_name && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 bg-slate-100 text-slate-600">
                      {item.product_name}
                    </Badge>
                  )}
                  {item.score_headline != null && (
                    <span className="text-[10px] text-slate-400">H:{item.score_headline}</span>
                  )}
                  {item.score_hook != null && (
                    <span className="text-[10px] text-slate-400">Hk:{item.score_hook}</span>
                  )}
                  {item.score_cta != null && (
                    <span className="text-[10px] text-slate-400">CTA:{item.score_cta}</span>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">{date}</span>
                </div>

                {/* Reviewed: show feedback + rules */}
                {item.review_status === 'reviewed' && item.admin_feedback && !expanded && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="text-[11px] text-green-700 line-clamp-1">
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      {item.admin_feedback}
                    </p>
                    {(item.feedback_rules_generated || 0) > 0 && (
                      <Badge variant="outline" className="mt-1 text-[10px] bg-green-500/15 text-green-700 border-green-300">
                        {item.feedback_rules_generated} reglas generadas
                      </Badge>
                    )}
                  </div>
                )}

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
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                        {/* Full copy */}
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Copy completo</p>
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{item.copy_text || '(sin copy)'}</p>
                        </div>

                        {/* Reviewed feedback display */}
                        {item.review_status === 'reviewed' && item.admin_feedback && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-[11px] font-medium text-green-600 uppercase tracking-wide mb-1">Tu feedback</p>
                            <p className="text-xs text-green-800 whitespace-pre-wrap">{item.admin_feedback}</p>
                            {(item.feedback_rules_generated || 0) > 0 && (
                              <Badge variant="outline" className="mt-2 text-[10px] bg-green-500/15 text-green-700 border-green-300">
                                <Sparkles className="w-3 h-3 mr-1" />
                                {item.feedback_rules_generated} reglas generadas
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Feedback textarea (only for pending) */}
                        {showActions && (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Escribe tu feedback... (ej: 'El hook es muy generico, deberia mencionar el dolor del cliente directo')"
                              value={feedbackTexts[item.id] || ''}
                              onChange={e => setFeedbackTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="text-sm min-h-[80px] resize-none"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-[#1E3A7B] hover:bg-[#162D5F] text-white"
                                disabled={submittingId === item.id || !feedbackTexts[item.id]?.trim()}
                                onClick={() => submitFeedback(item.id)}
                              >
                                {submittingId === item.id
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : <Send className="w-3 h-3 mr-1" />
                                }
                                Enviar Feedback
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-slate-500"
                                disabled={submittingId === item.id}
                                onClick={() => skipCreative(item.id)}
                              >
                                <SkipForward className="w-3 h-3 mr-1" />
                                Skip
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Expand toggle */}
              <button onClick={() => toggleExpand(item.id)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
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

  const channels = [...new Set(items.map(i => (i.channel || '').toLowerCase()).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="w-6 h-6 text-[#1E3A7B]" />
            Creative Review Feed
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Revisa los creativos generados por Steve y escribe feedback que se convierte en reglas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">{stats.reviewed}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Revisados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-purple-600">{stats.rules_generated}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Reglas generadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-slate-400">{stats.skipped}</p>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Skipped</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Channel Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por copy, cliente, angulo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setChannelFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              channelFilter === 'all'
                ? 'bg-[#1E3A7B] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Todas
          </button>
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                channelFilter === ch
                  ? 'bg-[#1E3A7B] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {ch.charAt(0).toUpperCase() + ch.slice(1)}
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
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{stats.pending}</Badge>
          </TabsTrigger>
          <TabsTrigger value="reviewed" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Revisados
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{stats.reviewed}</Badge>
          </TabsTrigger>
          <TabsTrigger value="skipped" className="data-[state=active]:bg-[#1E3A7B] data-[state=active]:text-white">
            <SkipForward className="w-3.5 h-3.5 mr-1.5" />
            Skipped
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-5">{stats.skipped}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending" className="mt-4">
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filterByStatus('pending').length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No hay creativos pendientes de revision</p>
                  <p className="text-xs mt-1">Los creativos generados por Steve aparecen aqui</p>
                </div>
              ) : (
                filterByStatus('pending').map(i => renderCard(i, true))
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* Reviewed */}
        <TabsContent value="reviewed" className="mt-4">
          <div className="space-y-3">
            {filterByStatus('reviewed').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay creativos revisados</p>
              </div>
            ) : (
              filterByStatus('reviewed').map(i => renderCard(i, false))
            )}
          </div>
        </TabsContent>

        {/* Skipped */}
        <TabsContent value="skipped" className="mt-4">
          <div className="space-y-3">
            {filterByStatus('skipped').length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <SkipForward className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No hay creativos omitidos</p>
              </div>
            ) : (
              filterByStatus('skipped').map(i => renderCard(i, false))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
