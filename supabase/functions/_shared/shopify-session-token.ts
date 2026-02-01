/**
 * Shopify Session Token Validation for Edge Functions
 * 
 * Architecture: M&A Ready
 * Security: Validates session tokens using Shopify API Secret
 * 
 * Session tokens are JWTs signed by Shopify containing:
 * - iss: Shop domain (e.g., "https://example.myshopify.com/admin")
 * - dest: Shop domain (e.g., "https://example.myshopify.com")
 * - aud: App API Key
 * - sub: Shop user ID
 * - exp: Expiration timestamp
 * - nbf: Not before timestamp
 * - iat: Issued at timestamp
 * - jti: Unique token identifier
 * - sid: Session ID
 */

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

export interface ShopifySessionTokenPayload {
  iss: string;  // Issuer: https://{shop}.myshopify.com/admin
  dest: string; // Destination: https://{shop}.myshopify.com
  aud: string;  // Audience: App API Key
  sub: string;  // Subject: User ID
  exp: number;  // Expiration time
  nbf: number;  // Not before time
  iat: number;  // Issued at time
  jti: string;  // JWT ID
  sid: string;  // Session ID
}

export interface ValidationResult {
  valid: boolean;
  payload?: ShopifySessionTokenPayload;
  shopDomain?: string;
  error?: string;
}

/**
 * Base64URL decode (handles URL-safe base64)
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Pad with = if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  
  return atob(base64);
}

/**
 * Verify the signature of a Shopify Session Token
 */
function verifySignature(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  const signatureInput = `${header}.${payload}`;
  
  // Create HMAC-SHA256 signature
  const expectedSignature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  // Compare signatures (timing-safe comparison would be ideal, but this works)
  return signature === expectedSignature;
}

/**
 * Validate a Shopify Session Token
 * 
 * @param token - The session token from X-Shopify-Session-Token header
 * @param apiKey - Your Shopify App API Key
 * @param apiSecret - Your Shopify App API Secret
 * @returns ValidationResult with payload and shop domain if valid
 */
export function validateShopifySessionToken(
  token: string,
  apiKey: string,
  apiSecret: string
): ValidationResult {
  try {
    // Split the JWT
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Verify signature
    if (!verifySignature(token, apiSecret)) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payloadJson = base64UrlDecode(parts[1]);
    const payload: ShopifySessionTokenPayload = JSON.parse(payloadJson);

    // Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Validate not before
    if (payload.nbf > now) {
      return { valid: false, error: 'Token not yet valid' };
    }

    // Validate audience (should match our API key)
    if (payload.aud !== apiKey) {
      return { valid: false, error: 'Invalid audience' };
    }

    // Extract shop domain from dest claim (most reliable)
    // dest format: "https://example.myshopify.com"
    const destUrl = new URL(payload.dest);
    const shopDomain = destUrl.hostname;

    console.log('[Session Token] Validated successfully for shop:', shopDomain);

    return {
      valid: true,
      payload,
      shopDomain,
    };
  } catch (err: any) {
    console.error('[Session Token] Validation error:', err);
    return { valid: false, error: err.message };
  }
}

/**
 * Middleware helper to validate session token from request headers
 */
export function getSessionTokenFromRequest(req: Request): string | null {
  // Check X-Shopify-Session-Token header (our custom header)
  const sessionToken = req.headers.get('X-Shopify-Session-Token');
  if (sessionToken) {
    return sessionToken;
  }

  // Fallback: Check Authorization header (Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Full middleware validation for Edge Functions
 */
export async function validateShopifyRequest(req: Request): Promise<{
  valid: boolean;
  shopDomain?: string;
  userId?: string;
  error?: string;
}> {
  const token = getSessionTokenFromRequest(req);
  
  if (!token) {
    return { valid: false, error: 'No session token provided' };
  }

  const apiKey = Deno.env.get('SHOPIFY_CLIENT_ID');
  const apiSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');

  if (!apiKey || !apiSecret) {
    console.error('[Session Token] Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
    return { valid: false, error: 'Server configuration error' };
  }

  const result = validateShopifySessionToken(token, apiKey, apiSecret);

  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  return {
    valid: true,
    shopDomain: result.shopDomain,
    userId: result.payload?.sub,
  };
}
