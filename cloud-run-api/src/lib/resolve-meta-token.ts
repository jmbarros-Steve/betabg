import { getSupabaseAdmin } from './supabase.js';
import { refreshMetaToken, handleTokenExpired } from './meta-token-refresh.js';

const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Drop-in replacement for inline decrypt_platform_token calls.
 * Handles SUAT-based connections (bm_partner, leadsie) vs oauth/flbi (encrypted token).
 *
 * Both bm_partner (manual onboarding) and leadsie (Leadsie webhook) share the
 * same Business Manager Partner SUAT — they only differ in how the asset got
 * shared with our BM. Treating them identically here avoids touching 24+
 * downstream files while preserving connection_type for analytics/billing.
 *
 * @param supabase - Supabase admin client (already instantiated by caller)
 * @param connection - Row from platform_connections with at minimum:
 *   { id, connection_type?, access_token_encrypted? }
 * @returns Decrypted/resolved token string, or null on failure
 */
export async function getTokenForConnection(
  supabase: any,
  connection: {
    id: string;
    connection_type?: string | null;
    access_token_encrypted?: string | null;
  },
): Promise<string | null> {
  // BM Partner / Leadsie: use System User Access Token from env (never expires)
  if (connection.connection_type === 'bm_partner' || connection.connection_type === 'leadsie') {
    const suat = process.env.META_SYSTEM_TOKEN;
    if (!suat) {
      console.error('[resolve-meta-token] META_SYSTEM_TOKEN env var not set');
      return null;
    }
    return suat;
  }

  // OAuth / FLBI: decrypt from DB
  if (!connection.access_token_encrypted) {
    console.error(`[resolve-meta-token] No encrypted token for connection ${connection.id}`);
    return null;
  }

  const { data: decryptedToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

  if (decryptError || !decryptedToken) {
    console.error('[resolve-meta-token] Decrypt failed:', decryptError);
    return null;
  }

  return decryptedToken;
}

/**
 * Full version with proactive refresh for oauth tokens.
 * For bm_partner: returns SUAT directly (never expires).
 */
export async function resolveMetaToken(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: conn, error } = await supabase
    .from('platform_connections')
    .select('id, connection_type, access_token_encrypted, token_expires_at')
    .eq('id', connectionId)
    .eq('platform', 'meta')
    .single();

  if (error || !conn) return null;

  // BM Partner / Leadsie: SUAT from env, no refresh needed
  if (conn.connection_type === 'bm_partner' || conn.connection_type === 'leadsie') {
    const suat = process.env.META_SYSTEM_TOKEN;
    if (!suat) {
      console.error('[resolve-meta-token] META_SYSTEM_TOKEN env var not set');
      return null;
    }
    return suat;
  }

  // OAuth: decrypt + proactive refresh
  if (!conn.access_token_encrypted) return null;

  const { data: decryptedToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: conn.access_token_encrypted });

  if (decryptError || !decryptedToken) return null;

  // Proactive refresh if expiring within 7 days
  const needsRefresh = conn.token_expires_at &&
    new Date(conn.token_expires_at).getTime() - Date.now() < REFRESH_THRESHOLD_MS;

  if (needsRefresh) {
    console.log(`[resolve-meta-token] Token for ${connectionId} expires soon, refreshing...`);
    const refreshed = await refreshMetaToken(decryptedToken);
    if (refreshed) {
      // Encrypt and store the new token
      const { data: encryptedToken } = await supabase
        .rpc('encrypt_platform_token', { raw_token: refreshed.access_token });

      if (encryptedToken) {
        const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabase
          .from('platform_connections')
          .update({
            access_token_encrypted: encryptedToken,
            token_expires_at: expiresAt,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connectionId);
      }
      return refreshed.access_token;
    }
    console.warn('[resolve-meta-token] Proactive refresh failed, using current token');
  }

  return decryptedToken;
}
