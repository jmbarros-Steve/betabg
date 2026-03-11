import { Badge } from '@/components/ui/badge';
import { List, Target } from 'lucide-react';

export interface KlaviyoListItem {
  id: string;
  name: string;
  created: string | null;
  updated: string | null;
  profile_count?: number | string;
  profile_count_raw?: number;
  has_more?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProfileCountBadge({ item }: { item: KlaviyoListItem }) {
  const raw = item.profile_count_raw ?? (typeof item.profile_count === 'number' ? item.profile_count : 0);
  const display = item.profile_count !== undefined && item.profile_count !== null
    ? String(item.profile_count)
    : '—';

  if (display === '—') {
    return <span className="text-muted-foreground">—</span>;
  }

  let className = 'text-xs ';
  if (raw >= 100) {
    className += 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
  } else if (raw >= 10) {
    className += 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
  } else {
    className += 'bg-destructive/15 text-destructive border-destructive/30';
  }

  return <Badge variant="outline" className={className}>{display}</Badge>;
}

export function KlaviyoListsContent({ items, type }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId?: string }) {
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
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nombre</th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground w-28">Perfiles</th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Creada</th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-border/30 hover:bg-muted/30 transition-colors">
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0 text-primary" />
                  <span className="font-medium truncate text-sm">{item.name}</span>
                </div>
              </td>
              <td className="p-3">
                <ProfileCountBadge item={item} />
              </td>
              <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.created)}</td>
              <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
