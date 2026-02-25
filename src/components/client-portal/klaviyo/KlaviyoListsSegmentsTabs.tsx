import { Badge } from '@/components/ui/badge';
import { List, Target, Users } from 'lucide-react';

export interface KlaviyoListItem {
  id: string;
  name: string;
  profile_count: number | null; // null = not counted, -1 = 1000+, -2 = error
  created: string | null;
  updated: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProfileCountBadge({ count }: { count: number | null }) {
  if (count === null) return <Badge variant="outline" className="text-xs text-muted-foreground">—</Badge>;
  if (count === -2) return <Badge variant="outline" className="text-xs text-muted-foreground">error</Badge>;
  if (count === -1) return <Badge className="text-xs bg-green-600 hover:bg-green-700">1,000+</Badge>;
  if (count >= 1000) return <Badge className="text-xs bg-green-600 hover:bg-green-700">{count.toLocaleString('es-CL')}</Badge>;
  if (count >= 100) return <Badge className="text-xs bg-yellow-600 hover:bg-yellow-700">{count.toLocaleString('es-CL')}</Badge>;
  return <Badge variant="secondary" className="text-xs">{count.toLocaleString('es-CL')}</Badge>;
}

export function KlaviyoListsContent({ items, type }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId: string }) {
  const Icon = type === 'list' ? List : Target;

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-6">
        No hay {type === 'list' ? 'listas' : 'segmentos'} configurados
      </p>
    );
  }

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nombre</th>
            <th className="text-center p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Perfiles</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Creada</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-border/30 hover:bg-muted/30 transition-colors">
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0 text-primary" />
                  <span className="font-medium truncate">{item.name}</span>
                </div>
              </td>
              <td className="p-3 text-center">
                <ProfileCountBadge count={item.profile_count} />
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
