import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, BarChart3, FileText, Megaphone, Zap, KeyRound, Type, Puzzle, Target, Lock } from 'lucide-react';
import GoogleAnalyticsDashboard from './GoogleAnalyticsDashboard';
import GoogleAccountInfo from './GoogleAccountInfo';
import GoogleCampaignManager from './GoogleCampaignManager';
import GoogleAutomatedRules from './GoogleAutomatedRules';
import GoogleKeywordManager from './GoogleKeywordManager';
import GoogleAdManager from './GoogleAdManager';
import GoogleExtensionManager from './GoogleExtensionManager';
import GoogleConversionSetup from './GoogleConversionSetup';
import { GoogleAdsGenerator } from '@/components/client-portal/GoogleAdsGenerator';
import { PlanGate } from '@/components/client-portal/PlanGate';
import { useUserPlan } from '@/hooks/useUserPlan';

interface GoogleAdsTabProps {
  clientId: string;
}

type SubTab = 'analytics' | 'campaigns' | 'keywords' | 'ads' | 'extensions' | 'conversions' | 'rules' | 'copys';

/** Sub-tabs that require a specific plan */
const SUB_TAB_FEATURE: Partial<Record<SubTab, string>> = {
  analytics: 'google_ads.analysis',
  rules: 'google_ads.rules',
};

export default function GoogleAdsTab({ clientId }: GoogleAdsTabProps) {
  const { canAccess } = useUserPlan(clientId);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('analytics');

  useEffect(() => {
    async function fetchConnection() {
      setLoading(true);
      const { data, error } = await supabase
        .from('platform_connections')
        .select('id, last_sync_at')
        .eq('client_id', clientId)
        .eq('platform', 'google')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching Google connection:', error);
        setLoading(false);
        return;
      }

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

  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'analytics', label: 'Analiticas', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'campaigns', label: 'Campanas', icon: <Megaphone className="w-4 h-4" /> },
    { key: 'keywords', label: 'Keywords', icon: <KeyRound className="w-4 h-4" /> },
    { key: 'ads', label: 'Anuncios', icon: <Type className="w-4 h-4" /> },
    { key: 'extensions', label: 'Extensiones', icon: <Puzzle className="w-4 h-4" /> },
    { key: 'conversions', label: 'Conversiones', icon: <Target className="w-4 h-4" /> },
    { key: 'rules', label: 'Reglas', icon: <Zap className="w-4 h-4" /> },
    { key: 'copys', label: 'Copys', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Account info */}
      <GoogleAccountInfo connectionId={connectionId} />

      {/* Sub-tabs */}
      <div className="flex gap-1.5 border-b pb-0 overflow-x-auto">
        {tabs.map(tab => {
          const featureKey = SUB_TAB_FEATURE[tab.key];
          const locked = featureKey ? !canAccess(featureKey) : false;
          return (
            <Button
              key={tab.key}
              variant="ghost"
              size="sm"
              onClick={() => setSubTab(tab.key)}
              className={`gap-1.5 rounded-b-none border-b-2 whitespace-nowrap ${
                subTab === tab.key
                  ? 'border-primary text-primary'
                  : locked
                  ? 'border-transparent text-slate-400'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {locked ? <Lock className="w-3.5 h-3.5" /> : tab.icon}
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {subTab === 'analytics' && (
        <PlanGate feature="google_ads.analysis" clientId={clientId}>
          <GoogleAnalyticsDashboard
            clientId={clientId}
            connectionId={connectionId}
            lastSyncAt={lastSyncAt}
          />
        </PlanGate>
      )}
      {subTab === 'campaigns' && (
        <GoogleCampaignManager
          connectionId={connectionId}
          clientId={clientId}
        />
      )}
      {subTab === 'keywords' && (
        <GoogleKeywordManager
          connectionId={connectionId}
          clientId={clientId}
        />
      )}
      {subTab === 'ads' && (
        <GoogleAdManager
          connectionId={connectionId}
          clientId={clientId}
        />
      )}
      {subTab === 'extensions' && (
        <GoogleExtensionManager
          connectionId={connectionId}
          clientId={clientId}
        />
      )}
      {subTab === 'conversions' && (
        <GoogleConversionSetup
          connectionId={connectionId}
          clientId={clientId}
        />
      )}
      {subTab === 'rules' && (
        <PlanGate feature="google_ads.rules" clientId={clientId}>
          <GoogleAutomatedRules
            connectionId={connectionId}
            clientId={clientId}
          />
        </PlanGate>
      )}
      {subTab === 'copys' && (
        <div className="max-w-4xl mx-auto">
          <GoogleAdsGenerator clientId={clientId} />
        </div>
      )}
    </div>
  );
}
