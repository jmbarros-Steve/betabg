import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, List, Target, Mail } from 'lucide-react';

export interface KlaviyoListItem {
  id: string;
  name: string;
  profile_count?: number;
  created: string | null;
  updated: string | null;
}

interface ProfilePreview {
  email: string;
  name: string;
  created: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ListSegmentRow({ item, type, connectionId }: { item: KlaviyoListItem; type: 'list' | 'segment'; connectionId: string }) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfilePreview[] | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

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
        <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left cursor-pointer">
          <div className="flex items-center gap-3 min-w-0">
            {open ? <ChevronDown className="w-4 h-4 shrink-0 text-primary" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
            <Icon className="w-4 h-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <span className="text-sm font-medium truncate block">{item.name}</span>
              <span className="text-[10px] text-muted-foreground">
                Creada: {formatDate(item.created)} · Actualizada: {formatDate(item.updated)}
              </span>
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-10 pb-3">
          {loadingProfiles ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : profiles && profiles.length > 0 ? (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Creado</th>
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
                      <td className="p-2 text-muted-foreground">{formatDate(p.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin perfiles disponibles para previsualizar</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KlaviyoListsContent({ items, type, connectionId }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId: string }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-6">
        No hay {type === 'list' ? 'listas' : 'segmentos'} configurados
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {items.map(item => (
        <ListSegmentRow key={item.id} item={item} type={type} connectionId={connectionId} />
      ))}
    </div>
  );
}
