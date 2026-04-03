import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Search, BookOpen, Calendar as CalendarIcon, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface KnowledgeRule {
  id: string;
  titulo: string;
  contenido: string;
  categoria: string;
  created_at: string | null;
  source_id: string | null;
  source_title?: string | null;
  effectiveness_score: number | null;
}

type CategoryFilter = string | 'all';

const CATEGORY_COLORS: Record<string, string> = {
  brief: 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#7B9BCF]',
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
  prospecting: 'bg-teal-500/15 text-teal-700 border-teal-300',
  cross_channel: 'bg-violet-500/15 text-violet-700 border-violet-300',
  sales_learning: 'bg-amber-500/15 text-amber-700 border-amber-300',
};

export function KnowledgeRulesExplorer() {
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from('steve_knowledge')
      .select('categoria')
      .eq('activo', true)
      .eq('approval_status', 'approved');
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach(r => { counts[r.categoria] = (counts[r.categoria] || 0) + 1; });
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
      setCategories(sorted);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, categoria, created_at, source_id, effectiveness_score')
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(500);

    if (categoryFilter !== 'all') {
      query = query.eq('categoria', categoryFilter);
    }

    if (selectedDate) {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();
      query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
    }

    if (searchQuery.trim()) {
      query = query.or(`titulo.ilike.%${searchQuery.trim()}%,contenido.ilike.%${searchQuery.trim()}%`);
    }

    const { data, error } = await query;
    if (data) {
      // Fetch source titles for rules that have source_id
      const sourceIds = [...new Set(data.filter(r => r.source_id).map(r => r.source_id!))];
      let sourceTitles: Record<string, string> = {};
      if (sourceIds.length > 0) {
        const { data: sources } = await supabase
          .from('learning_queue')
          .select('id, source_title, source_content')
          .in('id', sourceIds);
        if (sources) {
          sources.forEach(s => {
            sourceTitles[s.id] = s.source_title || s.source_content?.slice(0, 60) || 'Sin título';
          });
        }
      }

      setRules(data.map(r => ({
        ...r,
        source_title: r.source_id ? (sourceTitles[r.source_id] || null) : null,
      })));
      setTotal(data.length);
    }
    setLoading(false);
  }, [categoryFilter, selectedDate, searchQuery]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const quickDates = [
    { label: 'Hoy', date: new Date() },
    { label: 'Ayer', date: subDays(new Date(), 1) },
    { label: 'Hace 3 días', date: subDays(new Date(), 3) },
    { label: 'Hace 7 días', date: subDays(new Date(), 7) },
  ];

  return (
    <Card className="border-slate-200 bg-white rounded-xl">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Explorador de Reglas Aprendidas
          </h3>
          <Badge variant="outline" className="text-xs">
            {total} reglas encontradas
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título o contenido..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          {quickDates.map(qd => (
            <Button
              key={qd.label}
              variant={selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(qd.date, 'yyyy-MM-dd') ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                if (selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(qd.date, 'yyyy-MM-dd')) {
                  setSelectedDate(undefined);
                } else {
                  setSelectedDate(qd.date);
                }
              }}
            >
              {qd.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-7">
                {selectedDate && !quickDates.some(qd => format(qd.date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'))
                  ? format(selectedDate, 'dd/MM/yyyy')
                  : '📅 Elegir fecha'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {selectedDate && (
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => setSelectedDate(undefined)}>
              ✕ Limpiar fecha
            </Button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <Filter className="w-4 h-4 text-muted-foreground mr-1" />
          <Button
            variant={categoryFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setCategoryFilter('all')}
          >
            Todas ({categories.reduce((s, c) => s + c.count, 0)})
          </Button>
          {categories.map(cat => (
            <Button
              key={cat.name}
              variant={categoryFilter === cat.name ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setCategoryFilter(cat.name === categoryFilter ? 'all' : cat.name)}
            >
              {cat.name} ({cat.count})
            </Button>
          ))}
        </div>

        {/* Rules list */}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Cargando reglas...</p>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No se encontraron reglas con los filtros seleccionados.
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {rules.map(rule => {
              const isExpanded = expandedId === rule.id;
              return (
                <div
                  key={rule.id}
                  className="border border-slate-200 rounded-xl p-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className={`text-[10px] shrink-0 border mt-0.5 ${CATEGORY_COLORS[rule.categoria] || ''}`}>
                        {rule.categoria}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{rule.titulo}</p>
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{rule.contenido}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rule.effectiveness_score != null && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] border ${
                            rule.effectiveness_score >= 70 ? 'bg-green-500/15 text-green-700 border-green-300' :
                            rule.effectiveness_score >= 50 ? 'bg-yellow-500/15 text-yellow-700 border-yellow-300' :
                            'bg-red-500/15 text-red-700 border-red-300'
                          }`}
                        >
                          {rule.effectiveness_score >= 70 ? '▲' : rule.effectiveness_score >= 50 ? '●' : '▼'} {rule.effectiveness_score}%
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {rule.created_at ? format(new Date(rule.created_at), 'dd/MM/yy HH:mm') : '—'}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                      <p className="text-xs text-foreground whitespace-pre-wrap">{rule.contenido}</p>
                      {rule.source_title && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          📚 Fuente: {rule.source_title}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
