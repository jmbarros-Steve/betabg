/**
 * Shopify Session Token Validation Endpoint
 * 
 * This edge function validates Shopify session tokens and returns
 * the shop information. Used by the frontend to verify authentication
 * without storing tokens locally.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token',
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

    // Look up the connection in our database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: connection, error: dbError } = await supabase
      .from('platform_connections')
      .select('id, client_id, store_name, store_url, is_active')
      .eq('platform', 'shopify')
      .ilike('store_url', `%${shopDomain.replace('.myshopify.com', '')}%`)
      .eq('is_active', true)
      .single();

    if (dbError || !connection) {
      console.log('[Session Validate] No active connection found for shop:', shopDomain);
      return new Response(
        JSON.stringify({ 
          valid: true,
          shopDomain,
          installed: false,
          message: 'Shop not connected to Steve'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client info
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, email, client_user_id')
      .eq('id', connection.client_id)
      .single();

    console.log('[Session Validate] Found connection:', connection.id);

    return new Response(
      JSON.stringify({
        valid: true,
        shopDomain,
        installed: true,
        connection: {
          id: connection.id,
          storeName: connection.store_name,
          isActive: connection.is_active,
        },
        client: client ? {
          id: client.id,
          name: client.name,
          email: client.email,
          userId: client.client_user_id,
        } : null,
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
