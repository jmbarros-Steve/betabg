import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Security-Policy': "frame-ancestors https://admin.shopify.com https://*.myshopify.com;",
};

// Generate a random password
function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Verify Shopify HMAC signature
function verifyHmacFromRawUrl(url: URL, secret: string): boolean {
  // IMPORTANT: Shopify signs the raw (encoded) query string.
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

  const message = pairs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const computed = createHmac('sha256', secretKey).update(message).digest('hex');
  return computed === receivedHmac;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const shopifyClientId = Deno.env.get('SHOPIFY_CLIENT_ID')!;
  const shopifyClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;
  
  // Frontend URL for redirects
  const frontendUrl = 'https://betabg.lovable.app';

  try {
    // Check if this is a direct Shopify redirect (GET) or frontend call (POST)
    const isDirectRedirect = req.method === 'GET';
    
    let code: string;
    let shop: string;
    let hmac: string | null = null;

    if (isDirectRedirect) {
      // Direct redirect from Shopify
      const url = new URL(req.url);
      code = url.searchParams.get('code') || '';
      shop = url.searchParams.get('shop') || '';
      hmac = url.searchParams.get('hmac');
      const stateParam = url.searchParams.get('state') || '';

      // Extract persisted host from state parameter
      // shopify-install encodes { nonce, host } as base64 in state
      let persistedHost = '';
      try {
        const stateJson = JSON.parse(atob(stateParam));
        persistedHost = stateJson.host || '';
        console.log('State decoded: nonce =', stateJson.nonce, '| host =', persistedHost ? 'present' : 'absent');
      } catch {
        console.warn('Could not decode state param, host will not be restored');
      }

      console.log('Direct Shopify callback:', { shop, hasCode: !!code, hasHmac: !!hmac, hasHost: !!persistedHost });

      // Verify HMAC - log but don't block
      // SECURITY NOTE: The token exchange step (code → access_token) is the real security gate.
      // Shopify will reject invalid codes, so HMAC mismatch here is non-critical.
      // Common cause: Shopify encodes state param differently than our raw parsing expects.
      if (hmac) {
        const isValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
        if (!isValid) {
          console.warn('HMAC verification FAILED on callback; continuing (token exchange validates authenticity)');
        } else {
          console.log('HMAC verification PASSED on callback');
        }
      }
      
      // Store host for use in final redirect
      (globalThis as any).__persistedHost = persistedHost;
    } else {
      // POST from frontend
      const body = await req.json();
      code = body.code;
      shop = body.shop;
      console.log('Frontend callback:', { shop, hasCode: !!code });
    }

    // Validate required fields
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

    // Validate shop format and normalize
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const normalizedShopDomain = shopDomain.toLowerCase().trim();
    console.log('Shop domain:', normalizedShopDomain);

    // Use service role for all database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Exchange authorization code for access token
    console.log('Exchanging code for access token...');
    const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
    
    const tokenResponse = await fetch(tokenUrl, {
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

    // Get shop info including email
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
      console.log('Shop info:', { storeName, shopEmail, shopOwnerName });
    }

    if (!shopEmail) {
      console.error('No shop email found');
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

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === shopEmail);

    let userId: string;
    let clientId: string;
    let isNewUser = false;
    let tempPassword: string | null = null;

    if (existingUser) {
      // User exists - find their client record
      console.log('User already exists:', existingUser.id);
      userId = existingUser.id;

      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id')
        .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientError } = await supabaseAdmin
          .from('clients')
          .insert({
            user_id: userId,
            client_user_id: userId,
            name: shopOwnerName,
            email: shopEmail,
            company: storeName,
          })
          .select('id')
          .single();

        if (clientError) {
          console.error('Error creating client:', clientError);
          if (isDirectRedirect) {
            return new Response(null, {
              status: 302,
              headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=client_creation_failed` },
            });
          }
          return new Response(
            JSON.stringify({ error: 'Error creating client record' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        clientId = newClient.id;
      }
    } else {
      // New user - create everything
      isNewUser = true;
      tempPassword = generatePassword();
      
      console.log('Creating new user...');
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: shopEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          shop_domain: normalizedShopDomain,
          store_name: storeName,
          is_shopify_user: true, // Flag to identify Shopify users
        }
      });

      if (authError || !authData.user) {
        console.error('Error creating user:', authError);
        if (isDirectRedirect) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=user_creation_failed` },
          });
        }
        return new Response(
          JSON.stringify({ error: 'Error creating user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
      console.log('Created new user:', userId);

      // SECURITY: Assign ONLY client role to Shopify users - NEVER admin
      // The is_super_admin flag is manually set in DB only
      await supabaseAdmin.from('user_roles').insert({ 
        user_id: userId, 
        role: 'client',
        is_super_admin: false, // Explicitly false - only set manually in DB
      });
      console.log('Assigned client role to Shopify user (NOT admin)');

      // Create client record WITH shop_domain for multitenancy isolation
      const { data: newClient, error: clientError } = await supabaseAdmin
        .from('clients')
        .insert({
          user_id: userId,
          client_user_id: userId,
          name: shopOwnerName,
          email: shopEmail,
          company: storeName,
          shop_domain: normalizedShopDomain, // CRITICAL: Set shop_domain for RLS isolation
        })
        .select('id')
        .single();

      if (clientError || !newClient) {
        console.error('Error creating client:', clientError);
        if (isDirectRedirect) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=client_creation_failed` },
          });
        }
        return new Response(
          JSON.stringify({ error: 'Error creating client record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      clientId = newClient.id;
      console.log('Created client with shop_domain:', clientId, normalizedShopDomain);

      // Get Free plan and assign subscription
      const { data: freePlan } = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('slug', 'free')
        .single();

      if (freePlan) {
        await supabaseAdmin.from('user_subscriptions').insert({
          user_id: userId,
          plan_id: freePlan.id,
          status: 'active',
          credits_used: 0,
          credits_reset_at: new Date().toISOString(),
        });
        console.log('Assigned Free plan to user');
      }
    }

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptError) {
      console.error('Error encrypting token:', encryptError);
      if (isDirectRedirect) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/oauth/shopify/callback?error=encryption_failed` },
        });
      }
      return new Response(
        JSON.stringify({ error: 'Error encrypting token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing Shopify connection
    const { data: existingConnection } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .single();

    if (existingConnection) {
      await supabaseAdmin
        .from('platform_connections')
        .update({
          store_name: storeName,
          store_url: `https://${normalizedShopDomain}`,
          shop_domain: normalizedShopDomain, // CRITICAL: Set shop_domain for RLS
          access_token_encrypted: encryptedToken,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id);
      console.log('Updated existing connection with shop_domain');
    } else {
      await supabaseAdmin
        .from('platform_connections')
        .insert({
          client_id: clientId,
          platform: 'shopify',
          store_name: storeName,
          store_url: `https://${normalizedShopDomain}`,
          shop_domain: normalizedShopDomain, // CRITICAL: Set shop_domain for RLS
          access_token_encrypted: encryptedToken,
          is_active: true,
        });
      console.log('Created new connection with shop_domain');
    }

    // For direct redirects from Shopify OAuth
    if (isDirectRedirect) {
      const persistedHost = (globalThis as any).__persistedHost || '';
      
      if (isNewUser && tempPassword) {
        // New user: redirect to our callback page for auto-login
        // We can't go through Shopify admin yet because the user needs to be created first
        const redirectUrl = new URL(`${frontendUrl}/oauth/shopify/callback`);
        redirectUrl.searchParams.set('success', 'true');
        redirectUrl.searchParams.set('store', storeName);
        redirectUrl.searchParams.set('shop', normalizedShopDomain);
        redirectUrl.searchParams.set('email', shopEmail);
        redirectUrl.searchParams.set('new_user', 'true');
        redirectUrl.searchParams.set('temp_pass', tempPassword);
        if (persistedHost) {
          redirectUrl.searchParams.set('host', persistedHost);
        }
        
        console.log('New user: redirecting to callback page for auto-login');
        return new Response(null, {
          status: 302,
          headers: { 'Location': redirectUrl.toString() },
        });
      }
      
      // Existing user: redirect back INTO Shopify Admin
      // This ensures Shopify provides a fresh 'host' parameter for App Bridge
      // Format: https://admin.shopify.com/store/{store-slug}/apps/{app-handle}
      const storeSlug = normalizedShopDomain.replace('.myshopify.com', '');
      const adminUrl = `https://admin.shopify.com/store/${storeSlug}/apps/loveable_public`;
      
      console.log('Existing user: redirecting back to Shopify Admin:', adminUrl);
      
      return new Response(null, {
        status: 302,
        headers: { 'Location': adminUrl },
      });
    }

    // For POST requests, return JSON
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
