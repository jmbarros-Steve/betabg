import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { List, Target, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface KlaviyoListItem {
  id: string;
  name: string;
  created: string | null;
  updated: string | null;
}

interface ProfilePreview {
  email: string;
  name: string;
  created: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ListSegmentRow({ item, type, connectionId }: { item: KlaviyoListItem; type: 'list' | 'segment'; connectionId: string }) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfilePreview[] | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const handleToggle = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && profiles === null) {
      setLoadingProfiles(true);
      try {
        const { data, error } = await supabase.functions.invoke('sync-klaviyo-metrics', {
          body: { connectionId, action: 'list-profiles', entityType: type, entityId: item.id },
        });
        if (!error && data?.profiles) {
          setProfiles(data.profiles);
          setHasMore(data.hasMore || false);
        } else {
          setProfiles([]);
        }
      } catch {
        setProfiles([]);
      } finally {
        setLoadingProfiles(false);
      }
    }
  };

  const Icon = type === 'list' ? List : Target;

  return (
    <Collapsible open={open} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <tr className="border-t border-border/30 hover:bg-muted/30 transition-colors cursor-pointer">
          <td className="p-3">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="w-3 h-3 shrink-0 text-primary" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
              <Icon className="w-4 h-4 shrink-0 text-primary" />
              <span className="font-medium truncate text-sm">{item.name}</span>
            </div>
          </td>
          <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.created)}</td>
          <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{formatDate(item.updated)}</td>
        </tr>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <tr>
          <td colSpan={3} className="p-0">
            <div className="px-8 pb-3 pt-1">
              {loadingProfiles ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : profiles && profiles.length > 0 ? (
                <>
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left p-2 font-medium text-muted-foreground">Email</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Nombre</th>
                          <th className="text-left p-2 font-medium text-muted-foreground hidden sm:table-cell">Creado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map((p, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="p-2 font-mono">
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3 h-3 text-muted-foreground" />
                                {p.email}
                              </div>
                            </td>
                            <td className="p-2">{p.name || '—'}</td>
                            <td className="p-2 text-muted-foreground hidden sm:table-cell">{formatDate(p.created)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMore && (
                    <p className="text-[10px] text-muted-foreground mt-1">Mostrando primeros 20 perfiles. Hay más disponibles en Klaviyo.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sin perfiles disponibles</p>
              )}
            </div>
          </td>
        </tr>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KlaviyoListsContent({ items, type, connectionId }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId: string }) {
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
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Creada</th>
            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <ListSegmentRow key={item.id} item={item} type={type} connectionId={connectionId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
