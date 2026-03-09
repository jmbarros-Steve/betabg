import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac } from 'node:crypto';

/**
 * Verify Shopify HMAC signature following Shopify's exact specification.
 * Uses raw query string to avoid encoding mismatches.
 */
function verifyHmacFromRawUrl(url: URL, secret: string): boolean {
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const secretKey = secret.trim();

  const parts = rawQuery
    .split('&')
    .map((p) => p.trim())
    .filter(Boolean);

  let receivedHmac: string | null = null;
  const pairs: Array<[string, string]> = [];

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    const key = eqIdx === -1 ? part : part.slice(0, eqIdx);
    const value = eqIdx === -1 ? '' : part.slice(eqIdx + 1);

    if (key === 'hmac') {
      receivedHmac = value;
      continue;
    }
    if (key === 'signature') continue;
    pairs.push([key, value]);
  }

  if (!receivedHmac) return false;

  // Sort parameters lexicographically by key
  const message = pairs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  console.log('HMAC verification - rawQuery:', rawQuery);
  console.log('HMAC verification - message:', message);

  const computed = createHmac('sha256', secretKey).update(message).digest('hex');

  console.log('HMAC verification - computed hash:', computed);
  console.log('HMAC verification - received hmac:', receivedHmac);

  return computed === receivedHmac;
}

/**
 * Shopify Install handler — GET endpoint (browser redirect from Shopify).
 *
 * Supports two modes:
 *   1. Per-client: ?client_id=xxx — looks up credentials from platform_connections
 *   2. Centralized: fallback to SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET env vars
 *
 * Receives query params: shop, hmac, host, client_id (optional)
 * Validates shop, verifies HMAC (non-destructive), generates nonce,
 * stores in oauth_states, and redirects to Shopify OAuth.
 *
 * NO auth middleware needed — this is the entry point for Shopify app install.
 */
export async function shopifyInstall(c: Context) {
  try {
    const url = new URL(c.req.url);
    const shop = url.searchParams.get('shop');
    const hmac = url.searchParams.get('hmac');
    const hostParam = url.searchParams.get('host');
    const perClientId = url.searchParams.get('client_id'); // Per-client OAuth

    const supabaseAdmin = getSupabaseAdmin();

    // Resolve Shopify credentials: per-client or centralized
    let shopifyClientId: string;
    let shopifyClientSecret: string;

    if (perClientId) {
      // Per-client mode: look up credentials from platform_connections
      const { data: conn, error: connError } = await supabaseAdmin
        .from('platform_connections')
        .select('shopify_client_id, shopify_client_secret_encrypted')
        .eq('client_id', perClientId)
        .eq('platform', 'shopify')
        .single();

      if (connError || !conn?.shopify_client_id || !conn?.shopify_client_secret_encrypted) {
        console.error('Per-client Shopify credentials not found for client:', perClientId);
        return c.html(
          '<html><body><h1>Error</h1><p>Shopify credentials not found for this client. Please configure them first.</p></body></html>',
          400,
        );
      }

      shopifyClientId = conn.shopify_client_id;

      // Decrypt the client secret
      const { data: decryptedSecret, error: decryptError } = await supabaseAdmin
        .rpc('decrypt_platform_token', { encrypted_token: conn.shopify_client_secret_encrypted });

      if (decryptError || !decryptedSecret) {
        console.error('Error decrypting Shopify client secret:', decryptError);
        return c.html(
          '<html><body><h1>Error</h1><p>Error decrypting Shopify credentials</p></body></html>',
          500,
        );
      }

      shopifyClientSecret = decryptedSecret;
      console.log('Using per-client Shopify credentials for client:', perClientId);
    } else {
      // Centralized mode: use environment variables (backwards compatibility)
      shopifyClientId = process.env.SHOPIFY_CLIENT_ID || '';
      shopifyClientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';

      if (!shopifyClientId || !shopifyClientSecret) {
        return c.html(
          '<html><body><h1>Error</h1><p>Shopify credentials not configured</p></body></html>',
          500,
        );
      }
    }

    const paramKeys = (() => {
      try {
        return Array.from(url.searchParams.keys());
      } catch {
        return [] as string[];
      }
    })();

    console.log('Shopify install request:', {
      shop,
      hasHmac: !!hmac,
      hasHost: !!hostParam,
      perClientId: perClientId || null,
      paramKeys,
      shopifyClientIdPrefix: shopifyClientId?.slice?.(0, 6) ?? null,
    });

    // Validate shop parameter
    if (!shop) {
      return c.html(
        '<html><body><h1>Error</h1><p>Missing shop parameter</p></body></html>',
        400,
      );
    }

    // Validate shop format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

    if (!shopRegex.test(shopDomain)) {
      return c.html(
        '<html><body><h1>Error</h1><p>Invalid shop domain</p></body></html>',
        400,
      );
    }

    // Verify HMAC if present (for requests from Shopify)
    if (hmac) {
      const isValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
      if (!isValid) {
        console.warn('HMAC verification FAILED on install endpoint; continuing to OAuth redirect (non-destructive)');
      } else {
        console.log('HMAC verification PASSED');
      }
    }

    // CRITICAL: Generate nonce and persist it in DB for CSRF validation on callback
    const nonce = crypto.randomUUID();

    const normalizedShop = shopDomain.toLowerCase().trim();
    await supabaseAdmin.from('oauth_states').insert({
      nonce,
      shop_domain: normalizedShop,
      client_id: perClientId || null, // Track which client initiated OAuth
    });

    // Clean up expired states (fire and forget)
    supabaseAdmin.from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .then(() => {});

    // Include client_id in the state param so the callback can retrieve per-client credentials
    const statePayload = JSON.stringify({
      nonce,
      host: hostParam || '',
      ...(perClientId ? { client_id: perClientId } : {}),
    });
    const state = btoa(statePayload);

    // Build Shopify OAuth URL
    const scopes = 'read_orders,read_analytics,write_discounts,read_discounts,read_checkouts,read_products';

    // Derive the callback URL from the current request origin
    const requestOrigin = new URL(c.req.url).origin;
    const redirectUri = `${requestOrigin}/api/shopify-oauth-callback`;

    const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', shopifyClientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    console.log('Redirecting to Shopify OAuth:', authUrl.toString());

    // Redirect to Shopify OAuth
    return c.redirect(authUrl.toString(), 302);

  } catch (error: any) {
    console.error('Error in Shopify install:', error);
    return c.html(
      `<html><body><h1>Error</h1><p>${error.message}</p></body></html>`,
      500,
    );
  }
}
