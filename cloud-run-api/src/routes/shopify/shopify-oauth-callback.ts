import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Verify HMAC using timing-safe comparison to prevent timing attacks.
 * Uses raw query string and URL-decoded values per Shopify spec.
 */
function verifyHmacFromRawUrl(url: URL, secret: string): boolean {
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const secretKey = secret.trim();
  const parts = rawQuery.split('&').map((p) => p.trim()).filter(Boolean);
  let receivedHmac: string | null = null;
  const pairs: Array<[string, string]> = [];
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    const key = eqIdx === -1 ? part : part.slice(0, eqIdx);
    const value = eqIdx === -1 ? '' : part.slice(eqIdx + 1);
    if (key === 'hmac') { receivedHmac = value; continue; }
    if (key === 'signature') continue;
    // CRITICAL: Shopify computes HMAC over URL-decoded values
    pairs.push([decodeURIComponent(key), decodeURIComponent(value)]);
  }
  if (!receivedHmac) return false;
  const message = pairs.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const computed = createHmac('sha256', secretKey).update(message).digest('hex');

  console.log('[HMAC-DEBUG] message:', message);
  console.log('[HMAC-DEBUG] computed:', computed);
  console.log('[HMAC-DEBUG] received:', receivedHmac);

  // Timing-safe comparison
  const encoder = new TextEncoder();
  const computedBuffer = encoder.encode(computed);
  const receivedBuffer = encoder.encode(receivedHmac);
  if (computedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, receivedBuffer);
}

/**
 * Validate the OAuth state parameter against stored nonces (CSRF protection).
 * Returns the client_id if this was a per-client OAuth flow.
 */
async function validateState(
  supabaseAdmin: any,
  stateParam: string | null,
  shopDomain: string
): Promise<{ valid: boolean; error?: string; clientId?: string }> {
  if (!stateParam) {
    return { valid: false, error: 'missing_state' };
  }

  try {
    const decoded = JSON.parse(atob(stateParam));
    const nonce = decoded.nonce;
    const clientId = decoded.client_id || null;
    if (!nonce) {
      return { valid: false, error: 'invalid_state_format' };
    }

    // Look up the nonce in the DB
    const { data, error } = await supabaseAdmin
      .from('oauth_states')
      .select('id, shop_domain, expires_at, client_id')
      .eq('nonce', nonce)
      .single();

    if (error || !data) {
      console.warn('State nonce not found in DB:', nonce);
      return { valid: false, error: 'state_not_found' };
    }

    // Check expiration
    if (new Date(data.expires_at) < new Date()) {
      console.warn('State nonce expired:', nonce);
      // Clean up expired nonce
      await supabaseAdmin.from('oauth_states').delete().eq('id', data.id);
      return { valid: false, error: 'state_expired' };
    }

    // Check shop domain matches
    const normalizedShop = shopDomain.toLowerCase().trim();
    if (data.shop_domain !== normalizedShop) {
      console.warn('State shop mismatch:', { expected: data.shop_domain, got: normalizedShop });
      return { valid: false, error: 'state_shop_mismatch' };
    }

    // Verify client_id consistency between state param and DB record
    if (clientId && data.client_id && clientId !== data.client_id) {
      console.warn('State client_id mismatch:', { stateClientId: clientId, dbClientId: data.client_id });
      return { valid: false, error: 'state_client_mismatch' };
    }

    // Delete used nonce (one-time use)
    await supabaseAdmin.from('oauth_states').delete().eq('id', data.id);

    console.log('State validation PASSED for nonce:', nonce, 'clientId:', clientId || data.client_id || 'none');
    return { valid: true, clientId: clientId || data.client_id || undefined };
  } catch (e) {
    console.error('State validation error:', e);
    return { valid: false, error: 'state_parse_error' };
  }
}

/**
 * Resolve Shopify credentials: per-client from DB or centralized from env vars.
 */
async function resolveShopifyCredentials(
  supabaseAdmin: any,
  perClientId: string | undefined
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (perClientId) {
    const { data: conn } = await supabaseAdmin
      .from('platform_connections')
      .select('shopify_client_id, shopify_client_secret_encrypted')
      .eq('client_id', perClientId)
      .eq('platform', 'shopify')
      .single();

    if (!conn?.shopify_client_id || !conn?.shopify_client_secret_encrypted) {
      console.error('Per-client Shopify credentials not found for client:', perClientId);
      return null;
    }

    const { data: decryptedSecret, error: decryptError } = await supabaseAdmin
      .rpc('decrypt_platform_token', { encrypted_token: conn.shopify_client_secret_encrypted });

    if (decryptError || !decryptedSecret) {
      console.error('Error decrypting Shopify client secret:', decryptError);
      return null;
    }

    console.log('Using per-client Shopify credentials for callback, client:', perClientId);
    return { clientId: conn.shopify_client_id, clientSecret: decryptedSecret };
  }

  // Centralized fallback
  const envClientId = process.env.SHOPIFY_CLIENT_ID || '';
  const envClientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  if (!envClientId || !envClientSecret) return null;
  return { clientId: envClientId, clientSecret: envClientSecret };
}

/**
 * Shopify OAuth Callback handler.
 *
 * Handles both:
 *   - GET: Direct Shopify redirect with code, shop, hmac, state query params
 *   - POST: Frontend call with {code, shop, state} JSON body
 *
 * Supports two modes:
 *   1. Per-client: state contains client_id — uses credentials from platform_connections
 *   2. Centralized: fallback to env vars + auto-creates user/client
 *
 * NO auth middleware — uses Shopify HMAC verification (GET) and state/nonce CSRF protection.
 */
export async function shopifyOauthCallback(c: Context) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://betabgnuevosupa-git-main-jmbarros-steves-projects.vercel.app';

  try {
    const isDirectRedirect = c.req.method === 'GET';
    const supabaseAdmin = getSupabaseAdmin();

    let code: string;
    let shop: string;
    let hmac: string | null = null;
    let stateParam: string | null = null;

    if (isDirectRedirect) {
      const url = new URL(c.req.url);
      code = url.searchParams.get('code') || '';
      shop = url.searchParams.get('shop') || '';
      hmac = url.searchParams.get('hmac');
      stateParam = url.searchParams.get('state');
      console.log('Direct Shopify callback:', { shop, hasCode: !!code, hasHmac: !!hmac, hasState: !!stateParam });
    } else {
      const body = await c.req.json();
      code = body.code;
      shop = body.shop;
      stateParam = body.state;
      console.log('Frontend callback:', { shop, hasCode: !!code });
    }

    if (!code || !shop) {
      if (isDirectRedirect) {
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=missing_params`, 302);
      }
      return c.json({ error: 'Missing required parameters: code, shop' }, 400);
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const normalizedShopDomain = shopDomain.toLowerCase().trim();

    let perClientId: string | undefined;
    let isPerClient = false;
    let shopifyClientId: string;
    let shopifyClientSecret: string;

    // Try state validation first (for flows that went through our shopify-install endpoint)
    if (stateParam) {
      const stateResult = await validateState(supabaseAdmin, stateParam, normalizedShopDomain);
      if (stateResult.valid) {
        perClientId = stateResult.clientId;
      } else {
        console.warn('State validation failed:', stateResult.error, '— will try shop_domain lookup');
      }
    }

    // If no client_id from state, look up by shop_domain (for install-link flow)
    if (!perClientId) {
      const { data: conn } = await supabaseAdmin
        .from('platform_connections')
        .select('client_id, shopify_client_id, shopify_client_secret_encrypted')
        .eq('shop_domain', normalizedShopDomain)
        .eq('platform', 'shopify')
        .not('shopify_client_id', 'is', null)
        .single();

      if (conn?.shopify_client_id && conn?.shopify_client_secret_encrypted) {
        perClientId = conn.client_id;
        console.log('Found per-client credentials by shop_domain:', normalizedShopDomain, '-> client:', perClientId);
      }
    }

    isPerClient = !!perClientId;

    // Resolve Shopify credentials based on mode
    const creds = await resolveShopifyCredentials(supabaseAdmin, perClientId);
    if (!creds) {
      console.error('Could not resolve Shopify credentials for shop:', normalizedShopDomain);
      if (isDirectRedirect) {
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=credentials_not_found`, 302);
      }
      return c.json({ error: 'Shopify credentials not found. Configure your app credentials in Steve first.' }, 400);
    }

    shopifyClientId = creds.clientId;
    shopifyClientSecret = creds.clientSecret;

    // Verify HMAC with the correct secret (per-client or centralized)
    if (isDirectRedirect && hmac) {
      const url = new URL(c.req.url);
      const isValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
      if (!isValid) {
        console.error('HMAC verification FAILED on callback');
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=hmac_failed`, 302);
      }
      console.log('HMAC verification PASSED (timing-safe)');
    }

    // Exchange authorization code for access token
    console.log('Exchanging code for access token...');
    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: shopifyClientId,
        client_secret: shopifyClientSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Shopify token exchange failed:', errorText);
      if (isDirectRedirect) {
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=token_exchange_failed`, 302);
      }
      return c.json({ error: 'Failed to exchange authorization code' }, 400);
    }

    const tokenData: any = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Successfully obtained access token');

    // Get shop info
    const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    let storeName = shopDomain.replace('.myshopify.com', '');
    let shopEmail = '';
    let shopOwnerName = '';

    if (shopInfoResponse.ok) {
      const shopInfo: any = await shopInfoResponse.json();
      storeName = shopInfo.shop?.name || storeName;
      shopEmail = shopInfo.shop?.email || '';
      shopOwnerName = shopInfo.shop?.shop_owner || storeName;
    }

    // --- Per-client mode: skip user creation, just update the connection ---
    if (isPerClient) {
      console.log('Per-client OAuth: updating platform_connections for client:', perClientId);

      // Encrypt the access token
      const { data: encryptedToken, error: encryptError } = await supabaseAdmin
        .rpc('encrypt_platform_token', { raw_token: accessToken });

      if (encryptError) {
        console.error('Error encrypting token:', encryptError);
        if (isDirectRedirect) {
          return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=encryption_failed`, 302);
        }
        return c.json({ error: 'Error encrypting token' }, 500);
      }

      // Update the existing platform_connections record
      await supabaseAdmin.from('platform_connections').update({
        store_name: storeName,
        store_url: `https://${normalizedShopDomain}`,
        shop_domain: normalizedShopDomain,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('client_id', perClientId).eq('platform', 'shopify');

      // Update client record with shop info
      await supabaseAdmin.from('clients').update({
        shop_domain: normalizedShopDomain,
        company: storeName || undefined,
      }).eq('id', perClientId);

      // Register webhooks
      await registerWebhooks(c, shopDomain, accessToken);

      // Redirect back to Steve — use JS top-level navigation to break out of Shopify admin iframe
      if (isDirectRedirect) {
        const redirectUrl = new URL(`${frontendUrl}/oauth/shopify/callback`);
        redirectUrl.searchParams.set('success', 'true');
        redirectUrl.searchParams.set('store', storeName);
        redirectUrl.searchParams.set('shop', normalizedShopDomain);
        const targetUrl = redirectUrl.toString();
        console.log('Per-client redirect to:', targetUrl);
        return c.html(`<!DOCTYPE html><html><head><title>Redirecting...</title></head><body>
<script>window.top.location.href = ${JSON.stringify(targetUrl)};</script>
<noscript><a href="${targetUrl}">Click here to continue to Steve</a></noscript>
</body></html>`);
      }

      return c.json({ success: true, store_name: storeName });
    }

    // --- Centralized mode: existing logic with user creation ---
    if (!shopEmail) {
      if (isDirectRedirect) {
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=no_email`, 302);
      }
      return c.json({ error: 'Could not retrieve shop email from Shopify' }, 400);
    }

    // PRIORITY 1: Check if a client was pre-registered with this shop_domain
    const { data: preRegisteredClient } = await supabaseAdmin
      .from('clients').select('id, client_user_id')
      .eq('shop_domain', normalizedShopDomain)
      .single();

    let userId: string;
    let clientId: string;
    let isNewUser = false;
    let tempPassword: string | null = null;

    if (preRegisteredClient) {
      clientId = preRegisteredClient.id;
      userId = preRegisteredClient.client_user_id;
      console.log('Pre-registered client found for shop:', normalizedShopDomain, '-> client_id:', clientId);

      await supabaseAdmin.from('clients').update({
        shop_domain: normalizedShopDomain,
        company: storeName || undefined,
      }).eq('id', clientId);

    } else {
      // PRIORITY 2: Check if user already exists by email
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email === shopEmail);

      if (existingUser) {
        userId = existingUser.id;
        const { data: existingClient } = await supabaseAdmin
          .from('clients').select('id')
          .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
          .single();

        if (existingClient) {
          clientId = existingClient.id;
          await supabaseAdmin.from('clients').update({
            shop_domain: normalizedShopDomain,
            company: storeName,
          }).eq('id', clientId);
        } else {
          const { data: newClient, error: clientError } = await supabaseAdmin
            .from('clients').insert({
              user_id: userId, client_user_id: userId,
              name: shopOwnerName, email: shopEmail, company: storeName,
            }).select('id').single();

          if (clientError || !newClient) {
            if (isDirectRedirect) {
              return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=client_creation_failed`, 302);
            }
            return c.json({ error: 'Error creating client record' }, 500);
          }
          clientId = newClient.id;
        }
      } else {
        isNewUser = true;
        tempPassword = generatePassword();

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: shopEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            shop_domain: normalizedShopDomain,
            store_name: storeName,
            is_shopify_user: true,
          }
        });

        if (authError || !authData.user) {
          if (isDirectRedirect) {
            return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=user_creation_failed`, 302);
          }
          return c.json({ error: 'Error creating user account' }, 500);
        }

        userId = authData.user.id;

        await supabaseAdmin.from('user_roles').insert({
          user_id: userId, role: 'client', is_super_admin: false
        });

        const { data: newClient, error: clientError } = await supabaseAdmin
          .from('clients').insert({
            user_id: userId, client_user_id: userId,
            name: shopOwnerName, email: shopEmail, company: storeName,
            shop_domain: normalizedShopDomain,
          }).select('id').single();

        if (clientError || !newClient) {
          if (isDirectRedirect) {
            return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=client_creation_failed`, 302);
          }
          return c.json({ error: 'Error creating client record' }, 500);
        }

        clientId = newClient.id;

        const { data: freePlan } = await supabaseAdmin
          .from('subscription_plans').select('id').eq('slug', 'free').single();

        if (freePlan) {
          await supabaseAdmin.from('user_subscriptions').insert({
            user_id: userId, plan_id: freePlan.id, status: 'active',
            credits_used: 0, credits_reset_at: new Date().toISOString(),
          });
        }
      }
    }

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptError) {
      if (isDirectRedirect) {
        return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=encryption_failed`, 302);
      }
      return c.json({ error: 'Error encrypting token' }, 500);
    }

    // Upsert Shopify connection
    const { data: existingConnection } = await supabaseAdmin
      .from('platform_connections').select('id')
      .eq('client_id', clientId).eq('platform', 'shopify').single();

    if (existingConnection) {
      await supabaseAdmin.from('platform_connections').update({
        store_name: storeName,
        store_url: `https://${normalizedShopDomain}`,
        shop_domain: normalizedShopDomain,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existingConnection.id);
    } else {
      await supabaseAdmin.from('platform_connections').insert({
        client_id: clientId, platform: 'shopify',
        store_name: storeName, store_url: `https://${normalizedShopDomain}`,
        shop_domain: normalizedShopDomain, access_token_encrypted: encryptedToken,
        is_active: true,
      });
    }

    // Register webhooks
    await registerWebhooks(c, shopDomain, accessToken);

    // Redirect back to frontend
    if (isDirectRedirect) {
      const redirectUrl = new URL(`${frontendUrl}/oauth/shopify/callback`);
      redirectUrl.searchParams.set('success', 'true');
      redirectUrl.searchParams.set('store', storeName);
      redirectUrl.searchParams.set('shop', normalizedShopDomain);

      if (isNewUser && tempPassword) {
        redirectUrl.searchParams.set('email', shopEmail);
        redirectUrl.searchParams.set('new_user', 'true');
        redirectUrl.searchParams.set('temp_pass', tempPassword);
      }

      console.log('Standalone redirect to:', redirectUrl.toString());
      return c.redirect(redirectUrl.toString(), 302);
    }

    return c.json({
      success: true,
      store_name: storeName,
      is_new_user: isNewUser,
      user_email: shopEmail,
      temp_password: isNewUser ? tempPassword : null,
    });

  } catch (error: any) {
    console.error('Error in Shopify OAuth callback:', error);
    if (c.req.method === 'GET') {
      return c.redirect(`${frontendUrl}/oauth/shopify/callback?error=${encodeURIComponent(error.message)}`, 302);
    }
    return c.json({ error: error.message }, 500);
  }
}

/**
 * Register Shopify webhooks for the connected store.
 */
async function registerWebhooks(c: Context, shopDomain: string, accessToken: string) {
  // Fix protocol for Cloud Run (behind HTTPS LB)
  const rawUrl = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') || rawUrl.protocol.replace(':', '');
  const host = c.req.header('host') || rawUrl.host;
  const requestOrigin = `${proto}://${host}`;
  const gdprWebhookUrl = `${requestOrigin}/api/shopify-gdpr-webhooks`;
  const fulfillmentWebhookUrl = `${requestOrigin}/api/shopify-fulfillment-webhooks`;
  const emailFlowWebhookUrl = `${requestOrigin}/api/email-flow-webhooks`;

  const webhooksToRegister = [
    { topic: 'app/uninstalled', address: gdprWebhookUrl },
    { topic: 'orders/fulfilled', address: fulfillmentWebhookUrl },
    { topic: 'orders/partially_fulfilled', address: fulfillmentWebhookUrl },
    { topic: 'orders/cancelled', address: fulfillmentWebhookUrl },
    // Steve Mail: flow triggers
    { topic: 'checkouts/create', address: emailFlowWebhookUrl },
    { topic: 'customers/create', address: emailFlowWebhookUrl },
    { topic: 'orders/create', address: emailFlowWebhookUrl },
    { topic: 'products/update', address: emailFlowWebhookUrl },
  ];

  // Fetch existing webhooks to avoid duplicates
  let existingWebhooks: Array<{ topic: string; address: string }> = [];
  try {
    const listRes = await fetch(
      `https://${shopDomain}/admin/api/2024-10/webhooks.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } },
    );
    if (listRes.ok) {
      const listData: any = await listRes.json();
      existingWebhooks = (listData.webhooks || []).map((w: any) => ({
        topic: w.topic, address: w.address,
      }));
      console.log(`Found ${existingWebhooks.length} existing webhooks`);
    }
  } catch (e) {
    console.warn('Could not list existing webhooks, will attempt to create all:', e);
  }

  for (const wh of webhooksToRegister) {
    const alreadyExists = existingWebhooks.some(
      (ew) => ew.topic === wh.topic && ew.address === wh.address
    );
    if (alreadyExists) {
      console.log(`Webhook ${wh.topic} already registered — skipping`);
      continue;
    }

    try {
      const webhookRes = await fetch(
        `https://${shopDomain}/admin/api/2024-10/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: 'json' } }),
        }
      );
      if (webhookRes.ok) {
        console.log(`Webhook ${wh.topic} registered successfully`);
      } else {
        const errBody = await webhookRes.text();
        if (webhookRes.status === 422) {
          console.log(`Webhook ${wh.topic} already registered (422)`);
        } else {
          console.warn(`Failed to register ${wh.topic} webhook:`, webhookRes.status, errBody);
        }
      }
    } catch (webhookErr) {
      console.warn(`Non-fatal: Could not register ${wh.topic} webhook:`, webhookErr);
    }
  }
}
