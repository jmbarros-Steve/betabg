import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  Youtube, FileText, Globe, Type, ChevronDown, ChevronUp,
  ExternalLink, BookOpen, TrendingUp, Database, Calendar,
} from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';

interface HistoryItem {
  id: string;
  source_type: string;
  source_content: string;
  source_title: string | null;
  rules_extracted: number | null;
  processed_at: string | null;
  created_at: string | null;
}

interface KnowledgeRule {
  id: string;
  titulo: string;
  contenido: string;
  categoria: string;
}

type SourceFilter = 'all' | 'youtube' | 'pdf' | 'url' | 'text';
type DateFilter = 'week' | 'month' | 'all';

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  youtube: <Youtube className="w-4 h-4 text-red-500" />,
  pdf: <FileText className="w-4 h-4 text-blue-500" />,
  url: <Globe className="w-4 h-4 text-green-500" />,
  text: <Type className="w-4 h-4 text-muted-foreground" />,
  document: <FileText className="w-4 h-4 text-blue-500" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  brief: 'bg-blue-500/15 text-blue-700 border-blue-300',
  seo: 'bg-green-500/15 text-green-700 border-green-300',
  meta_ads: 'bg-purple-500/15 text-purple-700 border-purple-300',
  meta: 'bg-indigo-500/15 text-indigo-700 border-indigo-300',
  google: 'bg-red-500/15 text-red-700 border-red-300',
  shopify: 'bg-orange-500/15 text-orange-700 border-orange-300',
  klaviyo: 'bg-pink-500/15 text-pink-700 border-pink-300',
  anuncios: 'bg-yellow-500/15 text-yellow-700 border-yellow-300',
  buyer_persona: 'bg-cyan-500/15 text-cyan-700 border-cyan-300',
  keywords: 'bg-gray-500/15 text-gray-700 border-gray-300',
  analisis: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
};

function isClickableUrl(item: HistoryItem): string | null {
  if (item.source_type === 'youtube' || item.source_type === 'url') {
    const content = item.source_content;
    if (content.startsWith('http')) return content;
  }
  return null;
}

export function LearningHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRules, setExpandedRules] = useState<KnowledgeRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [totalKnowledge, setTotalKnowledge] = useState(0);
  const [weekRules, setWeekRules] = useState(0);
  const [topCategory, setTopCategory] = useState('—');

  const fetchHistory = useCallback(async () => {
    let query = supabase
      .from('learning_queue')
      .select('*')
      .in('status', ['completed', 'done'])
      .order('processed_at', { ascending: false });

    if (sourceFilter !== 'all') {
      query = query.eq('source_type', sourceFilter);
    }

    if (dateFilter === 'week') {
      query = query.gte('processed_at', startOfWeek(new Date()).toISOString());
    } else if (dateFilter === 'month') {
      query = query.gte('processed_at', startOfMonth(new Date()).toISOString());
    }

    const { data } = await query;
    if (data) setItems(data as HistoryItem[]);
  }, [sourceFilter, dateFilter]);

  const fetchKPIs = useCallback(async () => {
    // Total knowledge entries
    const { count: knowledgeCount } = await supabase
      .from('steve_knowledge')
      .select('*', { count: 'exact', head: true });
    setTotalKnowledge(knowledgeCount || 0);

    // Rules this week
    const weekStart = startOfWeek(new Date()).toISOString();
    const { count: weekCount } = await supabase
      .from('steve_knowledge')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart);
    setWeekRules(weekCount || 0);

    // Top category
    const { data: allKnowledge } = await supabase
      .from('steve_knowledge')
      .select('categoria');
    if (allKnowledge && allKnowledge.length > 0) {
      const counts: Record<string, number> = {};
      allKnowledge.forEach(k => {
        counts[k.categoria] = (counts[k.categoria] || 0) + 1;
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) setTopCategory(`${top[0]} (${top[1]})`);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchKPIs();
  }, [fetchHistory, fetchKPIs]);

  async function toggleExpand(item: HistoryItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      setExpandedRules([]);
      return;
    }

    setExpandedId(item.id);
    setLoadingRules(true);

    // Try by source_id first
    const { data } = await supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, categoria')
      .eq('source_id', item.id);

    if (data && data.length > 0) {
      setExpandedRules(data as KnowledgeRule[]);
    } else if (item.processed_at || item.created_at) {
      // Fallback: wide window from item creation to well after processing
      const startTime = item.created_at
        ? new Date(new Date(item.created_at).getTime() - 60 * 1000) // 1 min before creation
        : new Date(new Date(item.processed_at!).getTime() - 30 * 60 * 1000); // 30 min before processing
      const endTime = item.processed_at
        ? new Date(new Date(item.processed_at).getTime() + 5 * 60 * 1000) // 5 min after processing
        : new Date(new Date(item.created_at!).getTime() + 60 * 60 * 1000); // 1 hour after creation

      const { data: fallbackData } = await supabase
        .from('steve_knowledge')
        .select('id, titulo, contenido, categoria')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .is('source_id', null)
        .order('created_at', { ascending: true })
        .limit(50);

      setExpandedRules((fallbackData as KnowledgeRule[]) || []);
    } else {
      setExpandedRules([]);
    }
    setLoadingRules(false);
  }

  const sourceFilters: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'youtube', label: '🎥 YouTube' },
    { value: 'pdf', label: '📄 PDF' },
    { value: 'url', label: '🌐 URL' },
    { value: 'text', label: '📝 Texto' },
  ];

  const dateFilters: { value: DateFilter; label: string }[] = [
    { value: 'week', label: 'Esta semana' },
    { value: 'month', label: 'Este mes' },
    { value: 'all', label: 'Todo' },
  ];

  return (
    <Card className="border-border">
      <CardContent className="pt-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          📊 Historial de Aprendizaje
        </h3>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-border p-2.5 text-center">
            <div className="flex justify-center mb-1"><Database className="w-4 h-4 text-primary" /></div>
            <p className="text-lg font-bold">{items.length}</p>
            <p className="text-xs text-muted-foreground">Fuentes procesadas</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <div className="flex justify-center mb-1"><BookOpen className="w-4 h-4 text-primary" /></div>
            <p className="text-lg font-bold">{totalKnowledge}</p>
            <p className="text-xs text-muted-foreground">Reglas en KB</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <div className="flex justify-center mb-1"><Calendar className="w-4 h-4 text-primary" /></div>
            <p className="text-lg font-bold">{weekRules}</p>
            <p className="text-xs text-muted-foreground">Reglas esta semana</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <div className="flex justify-center mb-1"><TrendingUp className="w-4 h-4 text-primary" /></div>
            <p className="text-sm font-bold truncate">{topCategory}</p>
            <p className="text-xs text-muted-foreground">Top categoría</p>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {sourceFilters.map(f => (
              <Button
                key={f.value}
                variant={sourceFilter === f.value ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setSourceFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="border-l border-border h-5 mx-1" />
          <div className="flex gap-1">
            {dateFilters.map(f => (
              <Button
                key={f.value}
                variant={dateFilter === f.value ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setDateFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {items.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8">Tipo</TableHead>
                  <TableHead className="text-xs">Título</TableHead>
                  <TableHead className="text-xs w-24">Fecha</TableHead>
                  <TableHead className="text-xs w-20">Reglas</TableHead>
                  <TableHead className="text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const url = isClickableUrl(item);
                  const isExpanded = expandedId === item.id;
                  return (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      url={url}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(item)}
                      rules={isExpanded ? expandedRules : []}
                      loadingRules={isExpanded && loadingRules}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No hay fuentes procesadas con los filtros seleccionados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  item, url, isExpanded, onToggle, rules, loadingRules,
}: {
  item: HistoryItem;
  url: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  rules: KnowledgeRule[];
  loadingRules: boolean;
}) {
  const title = (item.source_title || item.source_content).slice(0, 60);

  return (
    <>
      <TableRow>
        <TableCell className="py-2">
          {SOURCE_ICONS[item.source_type] || <Type className="w-4 h-4" />}
        </TableCell>
        <TableCell className="py-2 text-xs max-w-[250px]">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              <span className="truncate">{title}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate block">{title}</span>
          )}
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground">
          {item.processed_at ? format(new Date(item.processed_at), 'dd/MM/yy HH:mm') : '—'}
        </TableCell>
        <TableCell className="py-2">
          <Badge variant="outline" className="text-xs bg-green-500/15 text-green-700 border-green-300">
            {item.rules_extracted || 0} reglas
          </Badge>
        </TableCell>
        <TableCell className="py-2">
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onToggle}>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            Ver reglas
          </Button>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={5} className="py-2 px-4 bg-muted/30">
            {loadingRules ? (
              <p className="text-xs text-muted-foreground">Cargando reglas...</p>
            ) : rules.length > 0 ? (
              <div className="space-y-1.5">
                {rules.map(r => (
                  <div key={r.id} className="flex items-start gap-2 text-xs p-2 rounded bg-background border border-border">
                    <Badge variant="outline" className={`text-[10px] shrink-0 border ${CATEGORY_COLORS[r.categoria] || ''}`}>
                      {r.categoria}
                    </Badge>
                    <div className="min-w-0">
                      <p className="font-medium">{r.titulo}</p>
                      <p className="text-muted-foreground line-clamp-2 mt-0.5">{r.contenido}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No se encontraron reglas vinculadas. Las reglas pudieron haberse guardado fuera de la ventana de tiempo de procesamiento.
              </p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
