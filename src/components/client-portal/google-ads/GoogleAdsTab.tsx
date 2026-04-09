import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, BarChart3, FileText } from 'lucide-react';
import GoogleAnalyticsDashboard from './GoogleAnalyticsDashboard';
import GoogleAccountInfo from './GoogleAccountInfo';
import { GoogleAdsGenerator } from '@/components/client-portal/GoogleAdsGenerator';

interface GoogleAdsTabProps {
  clientId: string;
}

type SubTab = 'analytics' | 'copys';

export default function GoogleAdsTab({ clientId }: GoogleAdsTabProps) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('analytics');

  useEffect(() => {
    async function fetchConnection() {
      setLoading(true);
      const { data } = await supabase
        .from('platform_connections')
        .select('id, last_sync_at')
        .eq('client_id', clientId)
        .eq('platform', 'google')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setConnectionId(data.id);
        setLastSyncAt(data.last_sync_at);
      } else {
        setConnectionId(null);
        setLastSyncAt(null);
      }
      setLoading(false);
    }
    if (clientId) fetchConnection();
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // No connection — show prompt
  if (!connectionId) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Conecta Google Ads</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Para ver analiticas y gestionar campanas, primero conecta tu cuenta de Google Ads desde la pestana de Conexiones.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Account info */}
      <GoogleAccountInfo connectionId={connectionId} />

      {/* Sub-tabs */}
      <div className="flex gap-1.5 border-b pb-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSubTab('analytics')}
          className={`gap-1.5 rounded-b-none border-b-2 ${subTab === 'analytics' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          <BarChart3 className="w-4 h-4" />
          Analiticas
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSubTab('copys')}
          className={`gap-1.5 rounded-b-none border-b-2 ${subTab === 'copys' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          <FileText className="w-4 h-4" />
          Copys
        </Button>
      </div>

      {/* Sub-tab content */}
      {subTab === 'analytics' && (
        <GoogleAnalyticsDashboard
          clientId={clientId}
          connectionId={connectionId}
          lastSyncAt={lastSyncAt}
        />
      )}
      {subTab === 'copys' && (
        <div className="max-w-4xl mx-auto">
          <GoogleAdsGenerator clientId={clientId} />
        </div>
      )}
    </div>
  );
}
