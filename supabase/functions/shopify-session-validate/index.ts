/**
 * Shopify Session Token Validation & Auto-Login Endpoint
 * 
 * This edge function validates Shopify session tokens and creates
 * a Supabase session for the merchant, enabling seamless embedded app login.
 * 
 * Flow:
 * 1. Validate Shopify Session Token (HMAC signature check)
 * 2. Extract shop_domain from token
 * 3. Find or create user account linked to shop
 * 4. Generate Supabase access token for the user
 * 5. Return tokens for client-side session establishment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token, x-shopify-host, x-shopify-shop',
};

interface ShopifySessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function verifySignature(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const signatureInput = `${header}.${payload}`;
  
  const expectedSignature = createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  return signature === expectedSignature;
}

function validateSessionToken(token: string, apiKey: string, apiSecret: string): {
  valid: boolean;
  payload?: ShopifySessionTokenPayload;
  shopDomain?: string;
  error?: string;
} {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    if (!verifySignature(token, apiSecret)) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payloadJson = base64UrlDecode(parts[1]);
    const payload: ShopifySessionTokenPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    if (payload.nbf > now) {
      return { valid: false, error: 'Token not yet valid' };
    }

    if (payload.aud !== apiKey) {
      return { valid: false, error: 'Invalid audience' };
    }

    const destUrl = new URL(payload.dest);
    const shopDomain = destUrl.hostname;

    return { valid: true, payload, shopDomain };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SHOPIFY_CLIENT_ID')!;
    const apiSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get session token from header
    const sessionToken = req.headers.get('X-Shopify-Session-Token');
    
    if (!sessionToken) {
      console.error('[Session Validate] No session token provided');
      return new Response(
        JSON.stringify({ error: 'No session token provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the session token
    const validation = validateSessionToken(sessionToken, apiKey, apiSecret);

    if (!validation.valid) {
      console.error('[Session Validate] Invalid token:', validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopDomain = validation.shopDomain!;
    console.log('[Session Validate] Valid session for shop:', shopDomain);

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Look up the connection in our database
    const { data: connection, error: dbError } = await supabaseAdmin
      .from('platform_connections')
      .select('id, client_id, store_name, store_url, is_active, shop_domain')
      .eq('platform', 'shopify')
      .or(`shop_domain.eq.${shopDomain},store_url.ilike.%${shopDomain.replace('.myshopify.com', '')}%`)
      .eq('is_active', true)
      .single();

    if (dbError || !connection) {
      console.log('[Session Validate] No active connection found for shop:', shopDomain);
      return new Response(
        JSON.stringify({ 
          valid: true,
          shopDomain,
          installed: false,
          message: 'Shop not connected to Steve. Please install the app first.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client info with their user account
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, client_user_id, shop_domain')
      .eq('id', connection.client_id)
      .single();

    if (clientError || !client) {
      console.error('[Session Validate] Client not found for connection:', connection.id);
      return new Response(
        JSON.stringify({ error: 'Client configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Session Validate] Found client:', client.id, 'user:', client.client_user_id);

    // If the client has a user account, generate a Supabase session
    if (client.client_user_id) {
      try {
        // Generate magic link token for the user (works without password)
        // We use admin API to create a session directly
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
          client.client_user_id
        );

        if (userError || !userData.user) {
          console.error('[Session Validate] User not found:', userError);
          return new Response(
            JSON.stringify({ 
              valid: true,
              shopDomain,
              installed: true,
              authenticated: false,
              error: 'User account not found'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Generate a new session for the user
        // This creates access and refresh tokens that the client can use
        const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: userData.user.email!,
          options: {
            redirectTo: `${supabaseUrl}/auth/v1/callback`,
          }
        });

        if (sessionError) {
          console.error('[Session Validate] Failed to generate session:', sessionError);
          // Fallback: return user info without session
          return new Response(
            JSON.stringify({
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
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract token from the magic link
        const magicLinkUrl = new URL(sessionData.properties.action_link);
        const token = magicLinkUrl.searchParams.get('token');
        const tokenType = magicLinkUrl.searchParams.get('type');

        console.log('[Session Validate] Generated auth token for user:', userData.user.email);

        return new Response(
          JSON.stringify({
            valid: true,
            shopDomain,
            installed: true,
            authenticated: true,
            authToken: token,
            authTokenType: tokenType,
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
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (authError: any) {
        console.error('[Session Validate] Auth generation error:', authError);
        return new Response(
          JSON.stringify({
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
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // No user account linked - return connection info only
    console.log('[Session Validate] Client has no user account linked');
    return new Response(
      JSON.stringify({
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
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Session Validate] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
