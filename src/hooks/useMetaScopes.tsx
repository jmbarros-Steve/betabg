import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Scope → Feature mapping
// ---------------------------------------------------------------------------

export interface FeatureStatus {
  key: string;
  label: string;
  available: boolean;
  requiredScopes: string[];
  missingScopes: string[];
}

const FEATURE_SCOPE_MAP: Array<{
  key: string;
  label: string;
  requiredScopes: string[];
}> = [
  { key: 'metrics', label: 'Metricas y Dashboard', requiredScopes: ['ads_read'] },
  { key: 'campaigns', label: 'Gestionar Campanas', requiredScopes: ['ads_management'] },
  { key: 'audiences', label: 'Audiencias y Segmentos', requiredScopes: ['ads_management'] },
  { key: 'pixel', label: 'Meta Pixel', requiredScopes: ['ads_management', 'ads_read'] },
  { key: 'pages', label: 'Paginas y Social Inbox', requiredScopes: ['pages_read_engagement', 'pages_manage_ads'] },
  { key: 'catalog', label: 'Catalogo de Productos', requiredScopes: ['catalog_management'] },
  { key: 'insights', label: 'Insights Avanzados', requiredScopes: ['read_insights'] },
];

// All scopes we want
export const ALL_REQUIRED_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
  'read_insights',
  'pages_read_engagement',
  'pages_manage_ads',
  'pages_manage_metadata',
  'catalog_management',
  'public_profile',
  'email',
];

const META_APP_ID = '1994525824461583';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMetaScopes(clientId: string) {
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState<string[]>([]);
  const [declined, setDeclined] = useState<string[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [noConnection, setNoConnection] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkScopes = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTokenExpired(false);
    try {
      // Get Meta connection
      const { data: conns } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1);

      if (!conns || conns.length === 0) {
        setNoConnection(true);
        setGranted([]);
        return;
      }

      setNoConnection(false);
      setConnectionId(conns[0].id);

      // Call edge function
      const { data, error: fnError } = await supabase.functions.invoke('check-meta-scopes', {
        body: { connection_id: conns[0].id },
      });

      if (fnError) throw fnError;

      if (data?.token_expired) {
        setTokenExpired(true);
        setGranted([]);
        return;
      }

      if (data?.missing_all) {
        setGranted([]);
        return;
      }

      setGranted(data?.granted || []);
      setDeclined(data?.declined || []);
    } catch (err: any) {
      console.error('[useMetaScopes] Error:', err);
      setError(err?.message || 'Error checking scopes');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    checkScopes();
  }, [checkScopes]);

  // Compute feature availability
  const features: FeatureStatus[] = FEATURE_SCOPE_MAP.map((f) => {
    const missingScopes = f.requiredScopes.filter((s) => !granted.includes(s));
    return {
      key: f.key,
      label: f.label,
      available: missingScopes.length === 0,
      requiredScopes: f.requiredScopes,
      missingScopes,
    };
  });

  const allScopesMissing = ALL_REQUIRED_SCOPES.filter((s) => !granted.includes(s));
  const needsReconnect = allScopesMissing.length > 0 || tokenExpired;

  // Build reconnect URL
  const getReconnectUrl = useCallback(() => {
    const redirectUri = `${window.location.origin}/oauth/meta/callback`;
    const scopes = ALL_REQUIRED_SCOPES.join(',');
    sessionStorage.setItem('meta_oauth_client_id', clientId);
    return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${clientId}&auth_type=rerequest`;
  }, [clientId]);

  const reconnect = useCallback(() => {
    window.location.href = getReconnectUrl();
  }, [getReconnectUrl]);

  // Check if a specific feature is available
  const hasFeature = useCallback(
    (featureKey: string) => {
      const f = features.find((ft) => ft.key === featureKey);
      return f ? f.available : false;
    },
    [features],
  );

  return {
    loading,
    granted,
    declined,
    features,
    connectionId,
    noConnection,
    tokenExpired,
    needsReconnect,
    error,
    reconnect,
    hasFeature,
    refresh: checkScopes,
  };
}
