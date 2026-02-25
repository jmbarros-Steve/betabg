import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, List, Target, Users, Mail } from 'lucide-react';

export interface KlaviyoListItem {
  id: string;
  name: string;
  profile_count: number;
  created: string | null;
  updated: string | null;
}

interface ProfilePreview {
  email: string;
  name: string;
  created: string;
}

function formatProfileCount(n: number): string {
  if (n >= 100000) return '100,000+';
  if (n >= 50000) return '50,000+';
  if (n >= 25000) return '25,000+';
  if (n >= 10000) return '10,000+';
  return Math.round(n).toLocaleString('es-CL');
}

function profileBadgeVariant(count: number): 'default' | 'secondary' | 'outline' {
  if (count > 1000) return 'default';
  if (count >= 100) return 'secondary';
  return 'outline';
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
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={profileBadgeVariant(item.profile_count)} className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              {formatProfileCount(item.profile_count)}
            </Badge>
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

interface KlaviyoListsSegmentsTabsProps {
  lists: KlaviyoListItem[];
  segments: KlaviyoListItem[];
  connectionId: string;
  activeTab: 'lists' | 'segments';
}

export function KlaviyoListsContent({ items, type, connectionId }: { items: KlaviyoListItem[]; type: 'list' | 'segment'; connectionId: string }) {
  const sorted = [...items].sort((a, b) => b.profile_count - a.profile_count);

  if (sorted.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-6">
        No hay {type === 'list' ? 'listas' : 'segmentos'} configurados
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {sorted.map(item => (
        <ListSegmentRow key={item.id} item={item} type={type} connectionId={connectionId} />
      ))}
    </div>
  );
}
