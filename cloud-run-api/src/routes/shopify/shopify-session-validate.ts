import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac } from 'crypto';

interface ShopifySessionTokenPayload {
  iss: string;  // Issuer: https://{shop}.myshopify.com/admin
  dest: string; // Destination: https://{shop}.myshopify.com
  aud: string;  // Audience: App API Key (Client ID)
  sub: string;  // Subject: User ID
  exp: number;  // Expiration time
  nbf: number;  // Not before time
  iat: number;  // Issued at time
  jti: string;  // JWT ID
  sid: string;  // Session ID
}

interface ValidationResult {
  valid: boolean;
  payload?: ShopifySessionTokenPayload;
  shopDomain?: string;
  error?: string;
  errorCode?: 'INVALID_FORMAT' | 'INVALID_SIGNATURE' | 'TOKEN_EXPIRED' | 'TOKEN_NOT_YET_VALID' | 'INVALID_AUDIENCE' | 'PARSE_ERROR';
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Verify HMAC-SHA256 signature of Shopify JWT
 * CRITICAL: Uses SHOPIFY_CLIENT_SECRET for signature validation
 */
function verifySignature(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const signatureInput = `${header}.${payload}`;

  const expectedSignature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return false;

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Full JWT validation with detailed error reporting
 */
function validateSessionToken(token: string, apiKey: string, apiSecret: string): ValidationResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format', errorCode: 'INVALID_FORMAT' };
    }

    // 1. Verify HMAC signature
    if (!verifySignature(token, apiSecret)) {
      console.error('[Session Validate] Signature verification failed');
      return { valid: false, error: 'Invalid signature - token may be tampered', errorCode: 'INVALID_SIGNATURE' };
    }

    // 2. Decode and parse payload
    const payloadJson = base64UrlDecode(parts[1]);
    const payload: ShopifySessionTokenPayload = JSON.parse(payloadJson);

    // 3. Validate time claims
    const now = Math.floor(Date.now() / 1000);
    const clockSkew = 60; // Allow 60 seconds of clock skew

    if (payload.exp < (now - clockSkew)) {
      console.error('[Session Validate] Token expired:', { exp: payload.exp, now });
      return { valid: false, error: 'Token expired', errorCode: 'TOKEN_EXPIRED' };
    }

    if (payload.nbf > (now + clockSkew)) {
      console.error('[Session Validate] Token not yet valid:', { nbf: payload.nbf, now });
      return { valid: false, error: 'Token not yet valid', errorCode: 'TOKEN_NOT_YET_VALID' };
    }

    // 4. Validate audience (must match our App's Client ID)
    if (payload.aud !== apiKey) {
      console.error('[Session Validate] Audience mismatch:', { expected: apiKey, got: payload.aud });
      return { valid: false, error: 'Invalid audience', errorCode: 'INVALID_AUDIENCE' };
    }

    // 5. Extract shop domain from dest claim (most secure method)
    const destUrl = new URL(payload.dest);
    const shopDomain = destUrl.hostname;

    console.log('[Session Validate] Token validated for shop:', shopDomain);
    console.log('[Session Validate] Token claims:', {
      iss: payload.iss,
      aud: payload.aud,
      exp: new Date(payload.exp * 1000).toISOString(),
      sub: payload.sub,
    });

    return { valid: true, payload, shopDomain };
  } catch (err: any) {
    console.error('[Session Validate] Parse error:', err);
    return { valid: false, error: err.message, errorCode: 'PARSE_ERROR' };
  }
}

export async function shopifySessionValidate(c: Context) {
  try {
    const apiKey = process.env.SHOPIFY_CLIENT_ID;
    const apiSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Validate required environment variables
    if (!apiKey || !apiSecret) {
      console.error('[Session Validate] Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
      return c.json({
        error: 'Server configuration error',
        requiresOAuth: true,
        oauthUrl: '/shopify-app'
      }, 500);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Session Validate] Missing Supabase credentials');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    // Get session token from header
    const sessionToken = c.req.header('X-Shopify-Session-Token');

    if (!sessionToken) {
      console.error('[Session Validate] No session token provided');
      return c.json({
        error: 'No session token provided',
        requiresOAuth: true,
        message: 'Please reinstall the app from your Shopify admin'
      }, 401);
    }

    console.log('[Session Validate] Received token, validating...');
    console.log('[Session Validate] Token preview:', sessionToken.substring(0, 50) + '...');

    // Validate the session token
    const validation = validateSessionToken(sessionToken, apiKey, apiSecret);

    if (!validation.valid) {
      console.error('[Session Validate] Token validation failed:', validation.error, validation.errorCode);

      // Return structured error for frontend handling
      return c.json({
        error: validation.error,
        errorCode: validation.errorCode,
        requiresOAuth: validation.errorCode === 'INVALID_SIGNATURE' || validation.errorCode === 'INVALID_AUDIENCE',
        message: validation.errorCode === 'TOKEN_EXPIRED'
          ? 'Your session has expired. Please refresh the page.'
          : 'Token validation failed. Please reinstall the app.'
      }, 401);
    }

    const shopDomain = validation.shopDomain!;
    console.log('[Session Validate] Valid session for shop:', shopDomain);

    // Create admin client for database operations
    const supabaseAdmin = getSupabaseAdmin();

    // Look up the connection in our database
    // IMPORTANT: Use .limit(1) instead of .single() to avoid errors when
    // multiple connections exist for the same shop (e.g. from repeated OAuth flows)
    const { data: connections, error: dbError } = await supabaseAdmin
      .from('platform_connections')
      .select('id, client_id, store_name, store_url, is_active, shop_domain')
      .eq('platform', 'shopify')
      .or(`shop_domain.eq.${shopDomain},store_url.ilike.%${shopDomain.replace('.myshopify.com', '')}%`)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const connection = connections?.[0] ?? null;

    console.log('[Session Validate] Connection lookup:', {
      shopDomain,
      found: !!connection,
      totalResults: connections?.length ?? 0,
      dbError: dbError?.message ?? null,
    });

    if (dbError || !connection) {
      console.log('[Session Validate] No active connection found for shop:', shopDomain);
      return c.json({
        valid: true,
        shopDomain,
        installed: false,
        requiresOAuth: true,
        message: 'Shop not connected to Steve. Please install the app first.',
        installUrl: `${process.env.SUPABASE_URL}/functions/v1/shopify-install?shop=${shopDomain}`
      });
    }

    // Get client info with their user account
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, client_user_id, shop_domain')
      .eq('id', connection.client_id)
      .single();

    if (clientError || !client) {
      console.error('[Session Validate] Client not found for connection:', connection.id);
      return c.json({ error: 'Client configuration error' }, 500);
    }

    console.log('[Session Validate] Found client:', client.id, 'user:', client.client_user_id);

    // If the client has a user account, generate a Supabase session
    if (client.client_user_id) {
      try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
          client.client_user_id
        );

        if (userError || !userData.user) {
          console.error('[Session Validate] User not found:', userError);
          return c.json({
            valid: true,
            shopDomain,
            installed: true,
            authenticated: false,
            error: 'User account not found'
          });
        }

        // Generate a magic link, then verify it SERVER-SIDE to get a real session.
        // This avoids the 403 "token expired" error that happens when the frontend
        // tries to verify the token in an iframe (3rd-party cookie issues).
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: userData.user.email!,
        });

        if (linkError) {
          console.error('[Session Validate] Failed to generate magic link:', linkError);
          return c.json({
            valid: true,
            shopDomain,
            installed: true,
            authenticated: false,
            connection: {
              id: connection.id,
              storeName: connection.store_name,
              isActive: connection.is_active,
            },
            client: {
              id: client.id,
              name: client.name,
              email: client.email,
              userId: client.client_user_id,
            },
          });
        }

        // Use the hashed_token from generateLink (more reliable than extracting from URL)
        const hashedToken = (linkData as any).properties.hashed_token;

        if (!hashedToken) {
          console.error('[Session Validate] No hashed_token in generateLink response');
          console.error('[Session Validate] Available properties:', JSON.stringify(Object.keys((linkData as any).properties)));
          return c.json({
            valid: true, shopDomain, installed: true, authenticated: false,
            error: 'Failed to extract auth token hash',
          });
        }

        // Verify the token SERVER-SIDE using token_hash (avoids otp_expired race condition)
        console.log('[Session Validate] Verifying via token_hash server-side for:', userData.user.email);

        const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
          },
          body: JSON.stringify({
            type: 'magiclink',
            token_hash: hashedToken,
          }),
        });

        if (!verifyResponse.ok) {
          const verifyErr = await verifyResponse.text();
          console.error('[Session Validate] Server-side OTP verify failed:', verifyResponse.status, verifyErr);
          return c.json({
            valid: true, shopDomain, installed: true, authenticated: false,
            error: `Auth verification failed: ${verifyResponse.status}`,
          });
        }

        const sessionResult: any = await verifyResponse.json();

        if (!sessionResult.access_token || !sessionResult.refresh_token) {
          console.error('[Session Validate] Verify response missing tokens:', Object.keys(sessionResult));
          return c.json({
            valid: true, shopDomain, installed: true, authenticated: false,
            error: 'Session creation returned incomplete data',
          });
        }

        console.log('[Session Validate] Server-side session created for:', userData.user.email);
        console.log('[Session Validate] Session expires_in:', sessionResult.expires_in);

        return c.json({
          valid: true,
          shopDomain,
          installed: true,
          authenticated: true,
          // Return the full session tokens for setSession() on frontend
          accessToken: sessionResult.access_token,
          refreshToken: sessionResult.refresh_token,
          expiresIn: sessionResult.expires_in,
          authEmail: userData.user.email,
          connection: {
            id: connection.id,
            storeName: connection.store_name,
            isActive: connection.is_active,
          },
          client: {
            id: client.id,
            name: client.name,
            email: client.email,
            userId: client.client_user_id,
          },
        });

      } catch (authError: any) {
        console.error('[Session Validate] Auth generation error:', authError);
        return c.json({
          valid: true,
          shopDomain,
          installed: true,
          authenticated: false,
          error: 'Failed to generate authentication',
          connection: {
            id: connection.id,
            storeName: connection.store_name,
            isActive: connection.is_active,
          },
          client: {
            id: client.id,
            name: client.name,
            email: client.email,
          },
        });
      }
    }

    // No user account linked - return connection info only
    console.log('[Session Validate] Client has no user account linked');
    return c.json({
      valid: true,
      shopDomain,
      installed: true,
      authenticated: false,
      message: 'Shop connected but no user account linked',
      connection: {
        id: connection.id,
        storeName: connection.store_name,
        isActive: connection.is_active,
      },
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
      },
    });

  } catch (error: any) {
    console.error('[Session Validate] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
