import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

  // Timing-safe comparison to prevent timing attacks
  const encoder = new TextEncoder();
  const computedBuffer = encoder.encode(computed);
  const receivedBuffer = encoder.encode(receivedHmac);
  if (computedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, receivedBuffer);
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
    let shopifyClientId: string = '';
    let shopifyClientSecret: string = '';

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
      // No client_id param — try looking up by shop_domain first (install-link flow)
      let foundByShop = false;
      if (shop) {
        const lookupDomain = (shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`).toLowerCase().trim();
        const conn = await safeQuerySingleOrDefault<{ shopify_client_id: string; shopify_client_secret_encrypted: string }>(
          supabaseAdmin
            .from('platform_connections')
            .select('shopify_client_id, shopify_client_secret_encrypted')
            .eq('shop_domain', lookupDomain)
            .eq('platform', 'shopify')
            .not('shopify_client_id', 'is', null)
            .single(),
          null,
          'shopifyInstall.lookupByShopDomain',
        );

        if (conn?.shopify_client_id && conn?.shopify_client_secret_encrypted) {
          const { data: decryptedSecret } = await supabaseAdmin
            .rpc('decrypt_platform_token', { encrypted_token: conn.shopify_client_secret_encrypted });

          if (decryptedSecret) {
            shopifyClientId = conn.shopify_client_id;
            shopifyClientSecret = decryptedSecret;
            foundByShop = true;
            console.log('Found per-client Shopify credentials by shop_domain:', lookupDomain);
          }
        }
      }

      if (!foundByShop) {
        // Centralized fallback: use environment variables
        shopifyClientId = process.env.SHOPIFY_CLIENT_ID || '';
        shopifyClientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';

        if (!shopifyClientId || !shopifyClientSecret) {
          return c.html(
            '<html><body><h1>Error</h1><p>Shopify credentials not configured. Please set up your Shopify connection in Steve first.</p></body></html>',
            400,
          );
        }
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
      const hmacValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
      if (!hmacValid) {
        console.error('[shopify-install] HMAC verification failed');
        return c.json({ error: 'Invalid HMAC signature' }, 403);
      }
      console.log('HMAC verification PASSED');
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
    const scopes = 'read_orders,read_analytics,write_discounts,read_discounts,read_checkouts,read_products,read_customers,write_script_tags';

    // Derive the callback URL — fix protocol for Cloud Run (behind HTTPS LB)
    const rawUrl = new URL(c.req.url);
    const proto = c.req.header('x-forwarded-proto') || rawUrl.protocol.replace(':', '');
    const host = c.req.header('host') || rawUrl.host;
    const requestOrigin = `${proto}://${host}`;
    const redirectUri = `${requestOrigin}/api/shopify-oauth-callback`;
    console.log('Constructed redirect_uri:', redirectUri);

    const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', shopifyClientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    const targetUrl = authUrl.toString();
    console.log('Redirecting to Shopify OAuth:', targetUrl);

    // Use JS top-level navigation to break out of Shopify admin iframe if embedded
    return c.html(`<!DOCTYPE html><html><head><title>Conectando con Shopify...</title></head><body>
<p>Redirigiendo a Shopify...</p>
<script>window.top.location.href = ${JSON.stringify(targetUrl)};</script>
<noscript><a href="${targetUrl}">Haz clic aquí para continuar</a></noscript>
</body></html>`);

  } catch (error: any) {
    console.error('Error in Shopify install:', error);
    return c.html(
      `<html><body><h1>Error</h1><p>${error.message}</p></body></html>`,
      500,
    );
  }
}
