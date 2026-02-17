import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac, timingSafeEqual } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Verify HMAC using timing-safe comparison to prevent timing attacks
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
    pairs.push([key, value]);
  }
  if (!receivedHmac) return false;
  const message = pairs.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const computed = createHmac('sha256', secretKey).update(message).digest('hex');
  
  // Timing-safe comparison
  const encoder = new TextEncoder();
  const computedBuffer = encoder.encode(computed);
  const receivedBuffer = encoder.encode(receivedHmac);
  if (computedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(computedBuffer, receivedBuffer);
}

/**
 * Validate the OAuth state parameter against stored nonces (CSRF protection)
 */
async function validateState(
  supabaseAdmin: ReturnType<typeof createClient>,
  stateParam: string | null,
  shopDomain: string
): Promise<{ valid: boolean; error?: string }> {
  if (!stateParam) {
    return { valid: false, error: 'missing_state' };
  }

  try {
    const decoded = JSON.parse(atob(stateParam));
    const nonce = decoded.nonce;
    if (!nonce) {
      return { valid: false, error: 'invalid_state_format' };
    }

    // Look up the nonce in the DB
    const { data, error } = await supabaseAdmin
      .from('oauth_states')
      .select('id, shop_domain, expires_at')
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

    // Delete used nonce (one-time use)
    await supabaseAdmin.from('oauth_states').delete().eq('id', data.id);

    console.log('State validation PASSED for nonce:', nonce);
    return { valid: true };
  } catch (e) {
    console.error('State validation error:', e);
    return { valid: false, error: 'state_parse_error' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const shopifyClientId = Deno.env.get('SHOPIFY_CLIENT_ID')!;
  const shopifyClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;
  
  const frontendUrl = 'https://betabg.lovable.app';

  try {
    const isDirectRedirect = req.method === 'GET';
    
    let code: string;
    let shop: string;
    let hmac: string | null = null;
    let stateParam: string | null = null;

    if (isDirectRedirect) {
      const url = new URL(req.url);
      code = url.searchParams.get('code') || '';
      shop = url.searchParams.get('shop') || '';
      hmac = url.searchParams.get('hmac');
      stateParam = url.searchParams.get('state');

      console.log('Direct Shopify callback:', { shop, hasCode: !!code, hasHmac: !!hmac, hasState: !!stateParam });

      if (hmac) {
        const isValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
        if (!isValid) {
          console.error('HMAC verification FAILED on callback');
          return new Response(null, {
            status: 302,
            headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=hmac_failed` },
          });
        }
        console.log('HMAC verification PASSED (timing-safe)');
      }
    } else {
      const body = await req.json();
      code = body.code;
      shop = body.shop;
      stateParam = body.state;
      console.log('Frontend callback:', { shop, hasCode: !!code });
    }

    if (!code || !shop) {
      if (isDirectRedirect) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=missing_params` },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: code, shop' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const normalizedShopDomain = shopDomain.toLowerCase().trim();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // SECURITY: Validate state parameter (CSRF protection)
    const stateResult = await validateState(supabaseAdmin, stateParam, normalizedShopDomain);
    if (!stateResult.valid) {
      console.error('State validation failed:', stateResult.error);
      if (isDirectRedirect) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=${stateResult.error}` },
        });
      }
      return new Response(
        JSON.stringify({ error: `State validation failed: ${stateResult.error}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=token_exchange_failed` },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
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
      const shopInfo = await shopInfoResponse.json();
      storeName = shopInfo.shop?.name || storeName;
      shopEmail = shopInfo.shop?.email || '';
      shopOwnerName = shopInfo.shop?.shop_owner || storeName;
    }

    if (!shopEmail) {
      if (isDirectRedirect) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=no_email` },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Could not retrieve shop email from Shopify' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === shopEmail);

    let userId: string;
    let clientId: string;
    let isNewUser = false;
    let tempPassword: string | null = null;

    if (existingUser) {
      userId = existingUser.id;
      const { data: existingClient } = await supabaseAdmin
        .from('clients').select('id')
        .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
        // Ensure shop_domain is set on reconnection
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
            return new Response(null, { status: 302, headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=client_creation_failed` } });
          }
          return new Response(JSON.stringify({ error: 'Error creating client record' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          return new Response(null, { status: 302, headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=user_creation_failed` } });
        }
        return new Response(JSON.stringify({ error: 'Error creating user account' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          return new Response(null, { status: 302, headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=client_creation_failed` } });
        }
        return new Response(JSON.stringify({ error: 'Error creating client record' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptError) {
      if (isDirectRedirect) {
        return new Response(null, { status: 302, headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=encryption_failed` } });
      }
      return new Response(JSON.stringify({ error: 'Error encrypting token' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    // Register webhooks via REST API (fire and forget, non-blocking)
    const gdprWebhookUrl = `${supabaseUrl}/functions/v1/shopify-gdpr-webhooks`;
    const fulfillmentWebhookUrl = `${supabaseUrl}/functions/v1/shopify-fulfillment-webhooks`;

    const webhooksToRegister = [
      { topic: 'app/uninstalled', address: gdprWebhookUrl },
      { topic: 'orders/fulfilled', address: fulfillmentWebhookUrl },
      { topic: 'orders/partially_fulfilled', address: fulfillmentWebhookUrl },
      { topic: 'orders/cancelled', address: fulfillmentWebhookUrl },
    ];

    for (const wh of webhooksToRegister) {
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
            console.log(`Webhook ${wh.topic} already registered`);
          } else {
            console.warn(`Failed to register ${wh.topic} webhook:`, webhookRes.status, errBody);
          }
        }
      } catch (webhookErr) {
        console.warn(`Non-fatal: Could not register ${wh.topic} webhook:`, webhookErr);
      }
    }

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
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl.toString() },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        store_name: storeName,
        is_new_user: isNewUser,
        user_email: shopEmail,
        temp_password: isNewUser ? tempPassword : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in Shopify OAuth callback:', error);
    if (req.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=${encodeURIComponent(error.message)}` },
      });
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
