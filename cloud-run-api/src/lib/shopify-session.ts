/**
 * Shared Shopify Session Token validation with HMAC signature verification.
 * Replaces the unsafe atob-only decoding used in multiple routes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

interface SessionTokenResult {
  valid: boolean;
  shopDomain?: string;
  userId?: string;
  error?: string;
}

/**
 * Verify and decode a Shopify Session Token (JWT).
 * - Validates the HMAC-SHA256 signature using SHOPIFY_CLIENT_SECRET
 * - Checks token expiration
 * - Looks up the shop domain in the database
 */
export async function validateShopifySessionToken(
  sessionToken: string,
  supabase: any
): Promise<SessionTokenResult> {
  try {
    const parts = sessionToken.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format: expected 3 parts' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Step 1: Verify HMAC signature
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (secret) {
      const signingInput = `${headerB64}.${payloadB64}`;
      const expectedSig = createHmac('sha256', secret)
        .update(signingInput)
        .digest('base64url');

      // Normalize both to base64url for comparison
      const normalizedReceived = signatureB64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const normalizedExpected = expectedSig.replace(/=+$/, '');

      const receivedBuf = Buffer.from(normalizedReceived);
      const expectedBuf = Buffer.from(normalizedExpected);
      if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
        console.error('[shopify-session] JWT signature verification failed');
        return { valid: false, error: 'Invalid token signature' };
      }
    } else {
      console.warn('[shopify-session] SHOPIFY_CLIENT_SECRET not set — skipping signature verification');
    }

    // Step 2: Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    );

    // Step 3: Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { valid: false, error: 'Token expired' };
    }

    // Step 4: Extract shop domain
    const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
    if (!shopDomain) {
      return { valid: false, error: 'No shop domain in token' };
    }

    // Step 5: Look up shop in database
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id')
      .eq('shop_domain', shopDomain)
      .single();

    if (error || !client) {
      return { valid: false, error: 'Shop not found in database' };
    }

    const userId = client.client_user_id || client.user_id;
    return { valid: true, shopDomain, userId };
  } catch (err: any) {
    console.error('[shopify-session] Token validation error:', err);
    return { valid: false, error: err.message };
  }
}
