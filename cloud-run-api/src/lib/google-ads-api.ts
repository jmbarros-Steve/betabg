/**
 * Shared Google Ads API helpers.
 *
 * Extracted from manage-google-*.ts to avoid duplication across 5+ handlers.
 * Every handler that talks to the Google Ads REST API should import from here.
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from './supabase.js';
import { getGoogleTokenForConnection } from './resolve-google-token.js';
import { safeQuerySingleOrDefault } from './safe-supabase.js';
import { isValidCronSecret } from './cron-auth.js';

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

// ─── Types ───────────────────────────────────────────────────────────

export interface GoogleAdsContext {
  customerId: string;
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
  connectionId: string;
  clientId: string;
  isLeadsie: boolean;
}

// ─── googleAdsQuery ──────────────────────────────────────────────────

export async function googleAdsQuery(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  query: string
): Promise<{ ok: boolean; data?: any[]; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(loginCustomerId);

  // Fallback: MCC 403 → retry with customer's own ID
  if (response.status === 403 && loginCustomerId !== customerId) {
    console.warn(`[google-ads-api] MCC login ${loginCustomerId} denied, retrying with ${customerId}`);
    await response.text().catch(() => {}); // drain body
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[google-ads-api] GAQL error (${response.status}):`, errorText.slice(0, 500));
    return { ok: false, error: `Google Ads API error (${response.status})` };
  }

  const responseText = await response.text();
  let results: any[] = [];
  try {
    const json = JSON.parse(responseText);
    if (Array.isArray(json)) {
      for (const batch of json) {
        if (batch.results) results = results.concat(batch.results);
      }
    } else if (json.results) {
      results = json.results;
    }
  } catch {
    return { ok: false, error: 'Failed to parse Google Ads response' };
  }

  return { ok: true, data: results };
}

// ─── googleAdsMutate ─────────────────────────────────────────────────

export async function googleAdsMutate(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  mutateOperations: any[]
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:mutate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutateOperations }),
      signal: AbortSignal.timeout(60_000),
    });
  };

  let response = await makeRequest(loginCustomerId);

  if (response.status === 403 && loginCustomerId !== customerId) {
    console.warn(`[google-ads-api] MCC mutate ${loginCustomerId} denied, retrying with ${customerId}`);
    await response.text().catch(() => {}); // drain body
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    // Log full error for debugging (structured so Cloud Logging captures it)
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: '[google-ads-api] Mutate error',
      status: response.status,
      errorBody: errorText.slice(0, 4000),
      operationCount: mutateOperations.length,
      operationTypes: mutateOperations.map((op: any) => Object.keys(op)[0]),
    }));
    let errorMessage = `Google Ads API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      const detail = errJson?.error?.message || errJson?.[0]?.error?.message;
      if (detail) errorMessage = detail;
      // Extract field violation details with operation index
      const details = errJson?.error?.details || errJson?.[0]?.error?.details;
      if (details?.length) {
        for (const d of details) {
          if (d.errors?.length) {
            const fieldErrors = d.errors.map((e: any) => {
              const path = e.location?.fieldPathElements?.map((f: any) =>
                f.index !== undefined ? `${f.fieldName}[${f.index}]` : f.fieldName
              ).join('.') || 'unknown';
              return `${e.message} (${path})`;
            }).join('; ');
            if (fieldErrors) errorMessage += ` — ${fieldErrors}`;
          }
        }
      }
    } catch {}
    return { ok: false, error: errorMessage };
  }

  const data = await response.json();
  return { ok: true, data };
}

// ─── resolveConnectionAndToken ───────────────────────────────────────

/**
 * Common auth + connection resolution pattern used by all manage-google-* handlers.
 * Handles: JWT auth, cron auth, ownership check, admin bypass, token resolution.
 */
export async function resolveConnectionAndToken(
  c: Context,
  connectionId: string
): Promise<{ ctx: GoogleAdsContext } | { error: string; status: number }> {
  const supabase = getSupabaseAdmin();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    return { error: 'Google Ads developer token not configured', status: 500 };
  }

  // Auth: authMiddleware user OR cron secret
  const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
  let user: { id: string } | null = null;

  if (!isCron) {
    user = c.get('user');
    if (!user) return { error: 'Unauthorized', status: 401 };
  }

  // Fetch connection
  const { data: connection, error: connError } = await supabase
    .from('platform_connections')
    .select(`
      id, platform, account_id, access_token_encrypted, refresh_token_encrypted,
      connection_type, client_id,
      clients!inner(user_id, client_user_id)
    `)
    .eq('id', connectionId)
    .eq('platform', 'google')
    .maybeSingle();

  if (connError || !connection) {
    return { error: 'Connection not found', status: 404 };
  }

  // Verify ownership (skip for cron)
  if (!isCron && user) {
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'resolveConnectionAndToken.getAdminRole',
      );
      if (!adminRole) return { error: 'Unauthorized', status: 403 };
    }
  }

  if (!connection.account_id) {
    return { error: 'Missing Google Ads account_id', status: 400 };
  }

  // Resolve token
  const tokenResult = await getGoogleTokenForConnection(supabase, connection);
  const customerId = connection.account_id;
  const loginCustomerId = tokenResult.mccCustomerId || customerId;

  return {
    ctx: {
      customerId,
      accessToken: tokenResult.accessToken,
      developerToken,
      loginCustomerId,
      connectionId: connection.id,
      clientId: connection.client_id,
      isLeadsie: tokenResult.isLeadsie,
    },
  };
}
