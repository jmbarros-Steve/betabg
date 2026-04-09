/**
 * Google Ads token resolver — mirrors resolve-meta-token.ts pattern.
 *
 * connection_type='leadsie' → refresh MCC token from env var GOOGLE_MCC_REFRESH_TOKEN
 * connection_type='oauth'   → decrypt from DB (legacy)
 *
 * MCC access tokens are cached in-memory with 50-minute TTL (they expire at 60min).
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface GoogleTokenResult {
  accessToken: string;
  mccCustomerId: string | null;
  isLeadsie: boolean;
}

// In-memory cache for MCC access token
let cachedMccToken: string | null = null;
let cachedMccTokenExpiry = 0;
const MCC_TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

async function refreshMccAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_MCC_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing MCC credentials: GOOGLE_MCC_REFRESH_TOKEN, GOOGLE_CLIENT_ID, or GOOGLE_ADS_CLIENT_SECRET');
  }

  const now = Date.now();
  if (cachedMccToken && now < cachedMccTokenExpiry) {
    return cachedMccToken;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data: any = await response.json();

  if (!data.access_token) {
    throw new Error(`MCC token refresh failed: ${JSON.stringify(data)}`);
  }

  cachedMccToken = data.access_token;
  cachedMccTokenExpiry = now + MCC_TOKEN_TTL_MS;
  console.log('[resolve-google-token] MCC access token refreshed');

  return cachedMccToken!;
}

/**
 * Resolve a Google Ads access token for a platform_connection row.
 *
 * For Leadsie connections: uses the MCC refresh token (env var).
 * For OAuth connections: decrypts from DB.
 */
export async function getGoogleTokenForConnection(
  supabase: SupabaseClient,
  connection: {
    id: string;
    connection_type?: string;
    access_token_encrypted?: string | null;
    refresh_token_encrypted?: string | null;
  }
): Promise<GoogleTokenResult> {
  const connType = connection.connection_type || 'oauth';
  const mccCustomerId = process.env.GOOGLE_MCC_CUSTOMER_ID || null;

  // Leadsie / MCC connections — token lives in env var
  if (connType === 'leadsie') {
    if (!mccCustomerId) {
      throw new Error('GOOGLE_MCC_CUSTOMER_ID env var not set');
    }
    const accessToken = await refreshMccAccessToken();
    return { accessToken, mccCustomerId, isLeadsie: true };
  }

  // Legacy OAuth — decrypt from DB
  if (!connection.access_token_encrypted) {
    throw new Error(`Connection ${connection.id} has no access_token_encrypted`);
  }

  const { data: decryptedAccessToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

  if (decryptError || !decryptedAccessToken) {
    throw new Error(`Token decryption failed for ${connection.id}: ${decryptError?.message}`);
  }

  let accessToken = decryptedAccessToken;

  // Try to refresh if we have a refresh token
  if (connection.refresh_token_encrypted) {
    const { data: decryptedRefreshToken } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.refresh_token_encrypted });

    if (decryptedRefreshToken) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

      if (clientId && clientSecret) {
        try {
          const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: decryptedRefreshToken,
              grant_type: 'refresh_token',
            }),
          });

          const refreshData: any = await refreshResponse.json();

          if (refreshData.access_token) {
            accessToken = refreshData.access_token;

            // Update encrypted token in database
            const { data: newEncryptedToken } = await supabase
              .rpc('encrypt_platform_token', { raw_token: accessToken });

            if (newEncryptedToken) {
              await supabase
                .from('platform_connections')
                .update({ access_token_encrypted: newEncryptedToken })
                .eq('id', connection.id);
            }
          }
        } catch (refreshErr) {
          console.log('[resolve-google-token] OAuth token refresh failed, using existing:', refreshErr);
        }
      }
    }
  }

  return { accessToken, mccCustomerId: null, isLeadsie: false };
}
