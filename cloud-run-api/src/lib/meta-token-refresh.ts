/**
 * Meta token refresh utility.
 *
 * Meta long-lived tokens expire after ~60 days. This module:
 * 1. Detects expired tokens (error code 190)
 * 2. Proactively refreshes tokens nearing expiry
 * 3. Updates the encrypted token in platform_connections
 */

import { getSupabaseAdmin } from './supabase.js';

const META_API_VERSION = 'v21.0';

/** Threshold: refresh tokens expiring within 7 days */
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check if a Meta API error indicates an expired/invalid token.
 */
export function isTokenExpiredError(error: any): boolean {
  if (!error) return false;
  // Meta error code 190 = invalid/expired access token
  // Subcode 463 = token expired
  // Subcode 467 = token invalidated
  return (
    error.code === 190 ||
    error.error_subcode === 463 ||
    error.error_subcode === 467 ||
    (typeof error.message === 'string' && error.message.includes('Session has expired'))
  );
}

/**
 * Refresh a Meta long-lived token by exchanging it for a new one.
 * Returns the new token on success, null on failure.
 */
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
      console.error('[meta-token-refresh] Refresh failed:', data.error?.message || 'No token returned');
      return null;
    }

    console.log(`[meta-token-refresh] Token refreshed, expires in ${data.expires_in}s`);
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 5184000, // Default 60 days
    };
  } catch (err) {
    console.error('[meta-token-refresh] Network error:', err);
    return null;
  }
}

/**
 * Get a valid decrypted Meta token for a connection, refreshing if needed.
 * This is the main entry point — use this instead of decrypting manually.
 */
export async function getValidMetaToken(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Fetch connection with expiry info
  const { data: conn, error } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, token_expires_at')
    .eq('id', connectionId)
    .eq('platform', 'meta')
    .single();

  if (error || !conn?.access_token_encrypted) {
    console.error('[meta-token-refresh] Connection not found:', connectionId);
    return null;
  }

  // Decrypt the current token
  const { data: decryptedToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: conn.access_token_encrypted });

  if (decryptError || !decryptedToken) {
    console.error('[meta-token-refresh] Decrypt failed:', decryptError);
    return null;
  }

  // Check if token is near expiry and needs proactive refresh
  const needsRefresh = conn.token_expires_at &&
    new Date(conn.token_expires_at).getTime() - Date.now() < REFRESH_THRESHOLD_MS;

  if (needsRefresh) {
    console.log(`[meta-token-refresh] Token for ${connectionId} expires soon, refreshing...`);
    const refreshed = await refreshMetaToken(decryptedToken);

    if (refreshed) {
      await updateConnectionToken(supabase, connectionId, refreshed.access_token, refreshed.expires_in);
      return refreshed.access_token;
    }
    // If refresh fails, return current token — it may still work
    console.warn('[meta-token-refresh] Proactive refresh failed, using current token');
  }

  return decryptedToken;
}

/**
 * Handle a token expired error by refreshing and returning the new token.
 * Call this when a Meta API call returns error code 190.
 */
export async function handleTokenExpired(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('access_token_encrypted')
    .eq('id', connectionId)
    .single();

  if (!conn?.access_token_encrypted) return null;

  const { data: decryptedToken } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: conn.access_token_encrypted });

  if (!decryptedToken) return null;

  const refreshed = await refreshMetaToken(decryptedToken);
  if (!refreshed) {
    // Mark connection as needing re-auth
    await supabase
      .from('platform_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    console.error(`[meta-token-refresh] Token refresh failed for ${connectionId}, marked inactive`);
    return null;
  }

  await updateConnectionToken(supabase, connectionId, refreshed.access_token, refreshed.expires_in);
  return refreshed.access_token;
}

/**
 * Encrypt and store a new token + expiry in the database.
 */
async function updateConnectionToken(
  supabase: any,
  connectionId: string,
  newToken: string,
  expiresIn: number
): Promise<void> {
  const { data: encryptedToken, error: encryptError } = await supabase
    .rpc('encrypt_platform_token', { raw_token: newToken });

  if (encryptError) {
    console.error('[meta-token-refresh] Encrypt failed:', encryptError);
    return;
  }

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

  if (updateError) {
    console.error('[meta-token-refresh] Update failed:', updateError);
  } else {
    console.log(`[meta-token-refresh] Token updated for ${connectionId}, expires ${expiresAt}`);
  }
}
