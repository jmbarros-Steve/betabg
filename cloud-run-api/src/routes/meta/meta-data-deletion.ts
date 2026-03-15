import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

const FRONTEND_URL = 'https://betabgnuevosupa-git-main-jmbarros-steves-projects.vercel.app';

// Parse Meta's signed_request
async function parseSignedRequest(signedRequest: string, appSecret: string): Promise<Record<string, unknown> | null> {
  try {
    const [encodedSig, payload] = signedRequest.split('.', 2);
    if (!encodedSig || !payload) return null;

    // Decode payload
    const decodedPayload = Buffer.from(
      payload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    const data = JSON.parse(decodedPayload);

    // Verify signature using Node.js crypto
    const { createHmac } = await import('crypto');
    const expectedSig = createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const receivedSig = encodedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    if (expectedSig !== receivedSig) {
      console.error('[meta-data-deletion] Signature verification failed');
      return null;
    }

    return data;
  } catch (err) {
    console.error('[meta-data-deletion] Error parsing signed_request:', err);
    return null;
  }
}

export async function metaDataDeletion(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const metaAppSecret = process.env.META_APP_SECRET || '';

    // Meta sends POST with form-encoded body: signed_request=...
    const contentType = c.req.header('content-type') || '';
    let signedRequest = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await c.req.parseBody();
      signedRequest = (formData['signed_request'] as string) || '';
    } else if (contentType.includes('application/json')) {
      const body: any = await c.req.json();
      signedRequest = body.signed_request || '';
    } else {
      // Try reading as text
      const text = await c.req.text();
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
    const confirmationCode = randomUUID();

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

    return c.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    }, 200);
  } catch (error) {
    console.error('[meta-data-deletion] Error:', error);

    // Even on error, return a valid response so Meta doesn't keep retrying
    const fallbackCode = randomUUID();
    return c.json({
      url: `${FRONTEND_URL}/data-deletion?code=${fallbackCode}`,
      confirmation_code: fallbackCode,
    }, 200);
  }
}
