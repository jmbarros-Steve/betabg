import { getSupabaseAdmin } from './supabase.js';
import { safeQuerySingleOrDefault } from './safe-supabase.js';
import { getTokenForConnection } from './resolve-meta-token.js';

const META_API_VERSION = 'v21.0';
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function isTokenExpiredError(error: any): boolean {
  if (!error) return false;
  return (
    error.code === 190 ||
    error.error_subcode === 463 ||
    error.error_subcode === 467 ||
    (typeof error.message === 'string' && error.message.includes('Session has expired'))
  );
}

export async function refreshMetaToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const metaAppId = process.env.META_APP_ID;
  const metaAppSecret = process.env.META_APP_SECRET;

  if (!metaAppId || !metaAppSecret) {
    console.error('[meta-token-refresh] META_APP_ID or META_APP_SECRET not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: metaAppId,
          client_secret: metaAppSecret,
          fb_exchange_token: currentToken,
        }),
      }
    );

    const data = await response.json() as any;

    if (data.error || !data.access_token) {
      console.error('[meta-token-refresh] Refresh failed:', data.error?.message || 'No token');
      return null;
    }

    console.log(`[meta-token-refresh] Token refreshed, expires in ${data.expires_in}s`);
    return { access_token: data.access_token, expires_in: data.expires_in || 5184000 };
  } catch (err) {
    console.error('[meta-token-refresh] Network error:', err);
    return null;
  }
}

export async function getValidMetaToken(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: conn, error } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, token_expires_at, connection_type')
    .eq('id', connectionId)
    .eq('platform', 'meta')
    .single();

  if (error || !conn) return null;

  // Use getTokenForConnection to handle both SUAT (bm_partner/leadsie) and OAuth tokens
  const decryptedToken = await getTokenForConnection(supabase, conn);
  if (!decryptedToken) return null;

  const needsRefresh = conn.token_expires_at &&
    new Date(conn.token_expires_at).getTime() - Date.now() < REFRESH_THRESHOLD_MS;

  if (needsRefresh) {
    console.log(`[meta-token-refresh] Token for ${connectionId} expires soon, refreshing...`);
    const refreshed = await refreshMetaToken(decryptedToken);
    if (refreshed) {
      await updateConnectionToken(supabase, connectionId, refreshed.access_token, refreshed.expires_in);
      return refreshed.access_token;
    }
    console.warn('[meta-token-refresh] Proactive refresh failed, using current token');
  }

  return decryptedToken;
}

export async function handleTokenExpired(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const conn = await safeQuerySingleOrDefault<{ access_token_encrypted: string | null }>(
    supabase
      .from('platform_connections')
      .select('access_token_encrypted')
      .eq('id', connectionId)
      .single(),
    null,
    'meta-token-refresh.handleTokenExpired.fetchConnection',
  );

  if (!conn?.access_token_encrypted) return null;

  const { data: decryptedToken } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: conn.access_token_encrypted });

  if (!decryptedToken) return null;

  const refreshed = await refreshMetaToken(decryptedToken);
  if (!refreshed) {
    await supabase
      .from('platform_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    console.error(`[meta-token-refresh] Refresh failed for ${connectionId}, marked inactive`);
    return null;
  }

  await updateConnectionToken(supabase, connectionId, refreshed.access_token, refreshed.expires_in);
  return refreshed.access_token;
}

async function updateConnectionToken(
  supabase: any, connectionId: string, newToken: string, expiresIn: number
): Promise<void> {
  const { data: encryptedToken, error: encryptError } = await supabase
    .rpc('encrypt_platform_token', { raw_token: newToken });

  if (encryptError) { console.error('[meta-token-refresh] Encrypt failed:', encryptError); return; }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('platform_connections')
    .update({
      access_token_encrypted: encryptedToken,
      token_expires_at: expiresAt,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  if (updateError) console.error('[meta-token-refresh] Update failed:', updateError);
  else console.log(`[meta-token-refresh] Token updated, expires ${expiresAt}`);
}
