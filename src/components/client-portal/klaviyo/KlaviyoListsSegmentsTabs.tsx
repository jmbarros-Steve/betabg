import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { List, Target, Loader2 } from 'lucide-react';

export interface KlaviyoListItem {
  id: string;
  name: string;
  created: string | null;
  updated: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProfileCountBadge({ count, display, loading }: { count: number | null; display: string | null; loading: boolean }) {
  if (loading) {
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  }
  if (count === null || display === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  let className = 'text-xs ';
  if (count >= 100) {
    className += 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
  } else if (count >= 10) {
    className += 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
  } else {
    className += 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
  }

  return <Badge variant="outline" className={className}>{display}</Badge>;
}

export function KlaviyoListsContent({ items, type, connectionId }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId: string }) {
  const [counts, setCounts] = useState<Record<string, { count: number; display: string }>>({});
  const [loading, setLoading] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current || items.length === 0) return;
    hasFetched.current = true;
    setLoading(true);

    const fetchCounts = async () => {
      try {
        const entities = items.map(item => ({ type, id: item.id }));
        const { data, error } = await supabase.functions.invoke('sync-klaviyo-metrics', {
          body: { connectionId, action: 'count-profiles', entities },
        });
        if (!error && data?.results) {
          setCounts(data.results);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };

    fetchCounts();
  }, [items, type, connectionId]);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-6">
        No hay {type === 'list' ? 'listas' : 'segmentos'} configurados
      </p>
    );
  }

  const Icon = type === 'list' ? List : Target;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nombre</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Perfiles</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Creada</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const countData = counts[item.id];
            return (
              <tr key={item.id} className="border-t border-border/30 hover:bg-muted/30 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0 text-primary" />
                    <span className="font-medium truncate text-sm">{item.name}</span>
                  </div>
                </td>
                <td className="p-3">
                  <ProfileCountBadge
                    count={countData?.count ?? null}
                    display={countData?.display ?? null}
                    loading={loading && !countData}
                  />
                </td>
                <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.created)}</td>
                <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.updated)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
