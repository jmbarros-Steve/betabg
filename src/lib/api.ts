import { supabase } from '@/integrations/supabase/client';

const CLOUD_RUN_URL = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Functions that have been migrated to Cloud Run.
 * Add function names here as they are migrated.
 * When empty or VITE_API_URL is not set, all calls go to Supabase Edge Functions.
 */
const CLOUD_RUN_FUNCTIONS = new Set<string>([
  // Phase 1: Utilities
  'chonga-support',
  'parse-email-html',
  'export-all-data',
  'export-database',
  'check-video-status',
  'process-queue-item',
  'process-transcription',
  'learn-from-source',
  'train-steve',
  'analyze-ad-image',
  'generate-brief-visual',
  'generate-copy',
  'generate-google-copy',
  'generate-campaign-recommendations',
  // Phase 2: AI & Analytics
  'steve-chat',
  'steve-strategy',
  'steve-email-content',
  'steve-send-time-analysis',
  'steve-bulk-analyze',
  'generate-meta-copy',
  'generate-image',
  'generate-video',
  'generate-mass-campaigns',
  'analyze-brand',
  'analyze-brand-research',
  'analyze-brand-strategy',
  'sync-competitor-ads',
  'deep-dive-competitor',
  'fetch-campaign-adsets',
  'sync-campaign-metrics',
  // Phase 3: Shopify
  'fetch-shopify-analytics',
  'fetch-shopify-products',
  'fetch-shopify-collections',
  'create-shopify-discount',
  'shopify-session-validate',
  'sync-shopify-metrics',
  // Phase 3: Meta
  'check-meta-scopes',
  'fetch-meta-ad-accounts',
  'fetch-meta-business-hierarchy',
  'manage-meta-audiences',
  'manage-meta-campaign',
  'manage-meta-pixel',
  'meta-social-inbox',
  'meta-data-deletion',
  'sync-meta-metrics',
  // Phase 3: Google
  'sync-google-ads-metrics',
  // Phase 3: Klaviyo
  'fetch-klaviyo-top-products',
  'store-klaviyo-connection',
  'import-klaviyo-templates',
  'upload-klaviyo-drafts',
  'klaviyo-manage-flows',
  'klaviyo-push-emails',
  'klaviyo-smart-format',
  'sync-klaviyo-metrics',
  // Phase 3: Other
  'store-platform-connection',
  // Phase 4: Auth & OAuth
  'self-signup',
  'admin-create-client',
  'create-client-user',
  'meta-oauth-callback',
  'google-ads-oauth-callback',
  'shopify-install',
  'shopify-oauth-callback',
  'shopify-fulfillment-webhooks',
  'shopify-gdpr-webhooks',
]);

interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
}

/**
 * Unified API call function.
 * Routes to Cloud Run if the function has been migrated, otherwise falls back to Supabase Edge Functions.
 */
export async function callApi<T = any>(
  functionName: string,
  options: { method?: string; body?: any } = {}
): Promise<ApiResponse<T>> {
  const { method = 'POST', body } = options;

  if (CLOUD_RUN_URL && CLOUD_RUN_FUNCTIONS.has(functionName)) {
    return callCloudRun<T>(functionName, method, body);
  }

  return callSupabase<T>(functionName, body);
}

async function callCloudRun<T>(
  functionName: string,
  method: string,
  body?: any
): Promise<ApiResponse<T>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${CLOUD_RUN_URL}/api/${functionName}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: errorData.error || `Error ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err: any) {
    console.error(`[callApi] Cloud Run error for ${functionName}:`, err);
    return { data: null, error: err.message };
  }
}

async function callSupabase<T>(
  functionName: string,
  body?: any
): Promise<ApiResponse<T>> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body || undefined,
  });

  if (error) {
    return { data: null, error: error.message || String(error) };
  }
  return { data: data as T, error: null };
}
