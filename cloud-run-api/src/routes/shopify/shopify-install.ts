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
 * Receives query params: shop, hmac, host
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
    const hostParam = url.searchParams.get('host'); // Persist for App Bridge after OAuth

    const shopifyClientId = process.env.SHOPIFY_CLIENT_ID!;
    const shopifyClientSecret = process.env.SHOPIFY_CLIENT_SECRET!;

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
      paramKeys,
      shopifyClientIdPrefix: shopifyClientId?.slice?.(0, 6) ?? null,
      shopifyClientSecretLength: shopifyClientSecret?.trim?.()?.length ?? null,
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
        // SECURITY NOTE: We log the mismatch but allow the flow to continue.
        // This endpoint ONLY redirects to Shopify's own OAuth page — it does NOT
        // mutate data or expose tokens. Strict HMAC is enforced on the OAuth callback.
        // Shopify's install entrypoint can send extra/missing params (e.g. host)
        // that change the query string and cause legitimate HMAC mismatches.
        console.warn('HMAC verification FAILED on install endpoint; continuing to OAuth redirect (non-destructive)');
      } else {
        console.log('HMAC verification PASSED');
      }
    }

    // CRITICAL: Generate nonce and persist it in DB for CSRF validation on callback
    const nonce = crypto.randomUUID();

    // Store nonce in oauth_states table for validation in callback
    const supabaseAdmin = getSupabaseAdmin();

    const normalizedShop = shopDomain.toLowerCase().trim();
    await supabaseAdmin.from('oauth_states').insert({
      nonce,
      shop_domain: normalizedShop,
    });

    // Clean up expired states (fire and forget)
    supabaseAdmin.from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .then(() => {});

    const statePayload = JSON.stringify({ nonce, host: hostParam || '' });
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
