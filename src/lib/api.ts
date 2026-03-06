import { supabase } from '@/integrations/supabase/client';

const CLOUD_RUN_URL = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Functions that have been migrated to Cloud Run.
 * Add function names here as they are migrated.
 * When empty or VITE_API_URL is not set, all calls go to Supabase Edge Functions.
 */
const CLOUD_RUN_FUNCTIONS = new Set<string>([
  // Phase 1: Utilities
  // 'chonga-support',
  // 'parse-email-html',
  // 'export-all-data',
  // 'export-database',
  // 'check-video-status',
  // 'process-queue-item',
  // 'process-transcription',
  // 'learn-from-source',
  // 'train-steve',
  // 'analyze-ad-image',
  // 'generate-brief-visual',
  // 'generate-copy',
  // 'generate-google-copy',
  // 'generate-campaign-recommendations',
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
