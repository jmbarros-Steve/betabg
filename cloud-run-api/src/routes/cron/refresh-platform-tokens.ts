import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';
import { refreshMetaToken } from '../../lib/meta-token-refresh.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

const REFRESH_THRESHOLD_DAYS = 7;

export async function refreshPlatformTokens(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const thresholdDate = new Date(Date.now() + REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Fetch Meta connections with tokens expiring within 7 days (or already expired)
  const { data: connections, error: fetchError } = await supabase
    .from('platform_connections')
    .select('id, client_id, store_name, access_token_encrypted, token_expires_at, is_active')
    .eq('platform', 'meta')
    .eq('is_active', true)
    .not('access_token_encrypted', 'is', null)
    .lt('token_expires_at', thresholdDate);

  if (fetchError) {
    console.error('[refresh-platform-tokens] Failed to fetch connections:', fetchError.message);
    return c.json({ error: fetchError.message }, 500);
  }

  if (!connections || connections.length === 0) {
    console.log('[refresh-platform-tokens] No tokens need refresh');
    return c.json({ refreshed: 0, failed: 0, message: 'No tokens need refresh' });
  }

  console.log(`[refresh-platform-tokens] Found ${connections.length} token(s) expiring within ${REFRESH_THRESHOLD_DAYS} days`);

  let refreshed = 0;
  let failed = 0;
  const results: { id: string; store: string; status: string }[] = [];

  for (const conn of connections) {
    const label = conn.store_name || conn.id;
    try {
      if (!conn.access_token_encrypted) {
        // Token missing entirely — skip
        results.push({ id: conn.id, store: label, status: 'no_token' });
        continue;
      }
      const decrypted = await decryptPlatformToken(supabase, conn.access_token_encrypted);
      if (!decrypted) {
        console.error(`[refresh-platform-tokens] ${label}: decrypt failed (possible key rotation)`);
        results.push({ id: conn.id, store: label, status: 'decrypt_failed' });
        failed++;
        continue;
      }

      const refreshResult = await refreshMetaToken(decrypted);

      if (!refreshResult) {
        // Check if token already expired
        const isExpired = conn.token_expires_at && new Date(conn.token_expires_at) < new Date();
        if (isExpired) {
          // Mark inactive — token is dead and can't be refreshed
          await supabase
            .from('platform_connections')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', conn.id);
          console.error(`[refresh-platform-tokens] ${label}: token expired and refresh failed — marked inactive`);
          results.push({ id: conn.id, store: label, status: 'expired_deactivated' });
        } else {
          console.warn(`[refresh-platform-tokens] ${label}: refresh failed but token still valid`);
          results.push({ id: conn.id, store: label, status: 'refresh_failed' });
        }
        failed++;
        continue;
      }

      // Encrypt new token and update
      const { data: encryptedToken, error: encryptError } = await supabase
        .rpc('encrypt_platform_token', { raw_token: refreshResult.access_token });

      if (encryptError || !encryptedToken) {
        console.error(`[refresh-platform-tokens] ${label}: encrypt failed:`, encryptError?.message);
        results.push({ id: conn.id, store: label, status: 'encrypt_failed' });
        failed++;
        continue;
      }

      const newExpiry = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('platform_connections')
        .update({
          access_token_encrypted: encryptedToken,
          token_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);

      if (updateError) {
        console.error(`[refresh-platform-tokens] ${label}: update failed:`, updateError.message);
        results.push({ id: conn.id, store: label, status: 'update_failed' });
        failed++;
        continue;
      }

      console.log(`[refresh-platform-tokens] ${label}: refreshed, new expiry ${newExpiry}`);
      results.push({ id: conn.id, store: label, status: 'refreshed' });
      refreshed++;
    } catch (err: any) {
      console.error(`[refresh-platform-tokens] ${label}: unexpected error:`, err.message);
      results.push({ id: conn.id, store: label, status: 'error' });
      failed++;
    }
  }

  console.log(`[refresh-platform-tokens] Done — refreshed: ${refreshed}, failed: ${failed}`);
  return c.json({ refreshed, failed, results });
}
