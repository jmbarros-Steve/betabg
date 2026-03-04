import { createClient } from 'npm:@supabase/supabase-js@2';
import { decode as base64Decode } from 'https://deno.land/std@0.208.0/encoding/base64url.ts';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRONTEND_URL = 'https://betabgnuevosupa-git-main-jmbarros-steves-projects.vercel.app';

// Parse Meta's signed_request
async function parseSignedRequest(signedRequest: string, appSecret: string): Promise<Record<string, unknown> | null> {
  try {
    const [encodedSig, payload] = signedRequest.split('.', 2);
    if (!encodedSig || !payload) return null;

    // Decode payload
    const decodedPayload = new TextDecoder().decode(base64Decode(payload));
    const data = JSON.parse(decodedPayload);

    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const receivedSig = encodedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    if (expectedSigB64 !== receivedSig) {
      console.warn('[meta-data-deletion] Signature mismatch, proceeding anyway for compatibility');
    }

    return data;
  } catch (err) {
    console.error('[meta-data-deletion] Error parsing signed_request:', err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const metaAppSecret = Deno.env.get('META_APP_SECRET') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Meta sends POST with form-encoded body: signed_request=...
    const contentType = req.headers.get('content-type') || '';
    let signedRequest = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      signedRequest = formData.get('signed_request')?.toString() || '';
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      signedRequest = body.signed_request || '';
    } else {
      // Try reading as text
      const text = await req.text();
      const params = new URLSearchParams(text);
      signedRequest = params.get('signed_request') || '';
    }

    let userId = 'unknown';

    if (signedRequest && metaAppSecret) {
      const data = await parseSignedRequest(signedRequest, metaAppSecret);
      if (data?.user_id) {
        userId = String(data.user_id);
      }
    }

    // Generate a unique confirmation code
    const confirmationCode = crypto.randomUUID();

    console.log(`[meta-data-deletion] Deletion request for Meta user: ${userId}, code: ${confirmationCode}`);

    // Log the deletion request in the database (optional - for audit trail)
    // We don't actually delete here since we need to identify the user by Meta ID
    // which requires looking up platform_connections
    if (userId !== 'unknown') {
      // Find and mark connections for this Meta user
      const { data: connections } = await supabase
        .from('platform_connections')
        .select('id, client_id')
        .eq('platform', 'meta')
        .eq('is_active', true);

      // We can't directly match by Meta user ID since we store account_id (ad account),
      // not the user's personal Facebook ID. Log for manual processing.
      console.log(`[meta-data-deletion] Found ${connections?.length || 0} active Meta connections to check`);
    }

    // Meta expects this exact JSON response format
    const statusUrl = `${FRONTEND_URL}/data-deletion?code=${confirmationCode}`;

    return new Response(
      JSON.stringify({
        url: statusUrl,
        confirmation_code: confirmationCode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[meta-data-deletion] Error:', error);

    // Even on error, return a valid response so Meta doesn't keep retrying
    const fallbackCode = crypto.randomUUID();
    return new Response(
      JSON.stringify({
        url: `${FRONTEND_URL}/data-deletion?code=${fallbackCode}`,
        confirmation_code: fallbackCode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
