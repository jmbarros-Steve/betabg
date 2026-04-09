import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Clock, ExternalLink } from 'lucide-react';

interface GoogleAccountInfoProps {
  connectionId: string;
}

interface ConnectionInfo {
  account_id: string | null;
  store_name: string | null;
  connection_type: string | null;
  last_sync_at: string | null;
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'Nunca';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} dia${days !== 1 ? 's' : ''}`;
}

export default function GoogleAccountInfo({ connectionId }: GoogleAccountInfoProps) {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);

  useEffect(() => {
    async function fetchInfo() {
      const { data } = await supabase
        .from('platform_connections')
        .select('account_id, store_name, connection_type, last_sync_at')
        .eq('id', connectionId)
        .single();

      if (data) {
        setInfo(data as ConnectionInfo);
      }
    }
    if (connectionId) fetchInfo();
  }, [connectionId]);

  if (!info) return null;

  const customerId = info.account_id || 'Sin ID';
  const accountName = info.store_name || 'Cuenta Google Ads';
  const isLeadsie = info.connection_type === 'leadsie';

  return (
    <Card className="border-border/50">
      <CardContent className="pt-4 pb-4 px-5">
        <div className="flex items-center gap-3">
          {/* Google Ads icon */}
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="#4285F4"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{accountName}</span>
              <Badge variant="outline" className="text-xs shrink-0">
                {isLeadsie ? 'MCC / Leadsie' : 'OAuth'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>ID: {customerId}</span>
              {info.last_sync_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(info.last_sync_at)}
                </span>
              )}
            </div>
          </div>

          <a
            href={`https://ads.google.com/aw/overview?ocid=${customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
