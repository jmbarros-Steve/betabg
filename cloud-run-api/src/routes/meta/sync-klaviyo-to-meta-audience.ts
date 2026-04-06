import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { createHash } from 'crypto';

const META_API_BASE = 'https://graph.facebook.com/v21.0';
const KLAVIYO_REVISION = '2024-10-15';

/**
 * Sync Klaviyo list/segment profiles to a Meta Custom Audience.
 * POST /api/sync-klaviyo-to-meta-audience
 */
export async function syncKlaviyoToMetaAudience(c: Context) {
  const supabase = getSupabaseAdmin();

  // Auth
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return c.json({ error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return c.json({ error: 'Invalid token' }, 401);

  const body = await c.req.json();
  const { klaviyo_connection_id, meta_connection_id, klaviyo_list_id, audience_name } = body;

  if (!klaviyo_connection_id || !meta_connection_id || !audience_name) {
    return c.json({ error: 'Missing required: klaviyo_connection_id, meta_connection_id, audience_name' }, 400);
  }

  try {
    // 1. Get Klaviyo connection + decrypt key
    const { data: klaviyoConn } = await supabase
      .from('platform_connections')
      .select('id, api_key_encrypted, client_id, clients!inner(user_id, client_user_id)')
      .eq('id', klaviyo_connection_id)
      .eq('platform', 'klaviyo')
      .single();

    if (!klaviyoConn?.api_key_encrypted) {
      return c.json({ error: 'Klaviyo connection not found or missing API key' }, 404);
    }

    // Verify ownership
    const kClient = klaviyoConn.clients as any;
    if (kClient.user_id !== user.id && kClient.client_user_id !== user.id) {
      const { data: adminRole } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id)
        .in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
      if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
    }

    const { data: klaviyoApiKey } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: klaviyoConn.api_key_encrypted });
    if (!klaviyoApiKey) return c.json({ error: 'Failed to decrypt Klaviyo key' }, 500);

    // 2. Get Meta connection + decrypt token
    const { data: metaConn } = await supabase
      .from('platform_connections')
      .select('id, account_id, access_token_encrypted, connection_type, client_id')
      .eq('id', meta_connection_id)
      .eq('platform', 'meta')
      .single();

    if (!metaConn?.account_id) {
      return c.json({ error: 'Meta connection not found or missing account ID' }, 404);
    }

    const metaToken = await getTokenForConnection(supabase, metaConn);
    if (!metaToken) return c.json({ error: 'Failed to resolve Meta token' }, 500);

    const accountId = metaConn.account_id.replace(/^act_/, '');

    // 3. Fetch all profiles from Klaviyo (paginated)
    const emails: string[] = [];
    let nextUrl: string | null = klaviyo_list_id
      ? `https://a.klaviyo.com/api/lists/${klaviyo_list_id}/profiles/?page[size]=100&fields[profile]=email`
      : `https://a.klaviyo.com/api/profiles/?page[size]=100&fields[profile]=email`;

    let pageCount = 0;
    const MAX_PAGES = 50; // Safety: max 5000 profiles

    while (nextUrl && pageCount < MAX_PAGES) {
      const res = await fetch(nextUrl, {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'accept': 'application/json',
          'revision': KLAVIYO_REVISION,
        },
      });

      if (!res.ok) {
        console.error(`[sync-klaviyo-meta] Klaviyo API error: ${res.status}`);
        break;
      }

      const data: any = await res.json();
      for (const profile of (data.data || [])) {
        const email = profile.attributes?.email;
        if (email) emails.push(email.toLowerCase().trim());
      }

      nextUrl = data.links?.next || null;
      pageCount++;
    }

    if (emails.length === 0) {
      return c.json({ error: 'No profiles found in Klaviyo list' }, 404);
    }

    console.log(`[sync-klaviyo-meta] Fetched ${emails.length} emails from Klaviyo`);

    // 4. Create Meta Custom Audience
    const createRes = await fetch(`${META_API_BASE}/act_${accountId}/customaudiences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${metaToken}`,
      },
      body: JSON.stringify({
        name: audience_name,
        subtype: 'CUSTOM',
        description: `Imported from Klaviyo${klaviyo_list_id ? ` (list ${klaviyo_list_id})` : ''} - ${emails.length} contacts`,
        customer_file_source: 'USER_PROVIDED_ONLY',
      }),
    });

    const createData: any = await createRes.json();
    if (!createRes.ok) {
      console.error('[sync-klaviyo-meta] Create audience error:', createData);
      return c.json({ error: 'Failed to create Meta audience', details: createData?.error?.message }, 502);
    }

    const audienceId = createData.id;
    console.log(`[sync-klaviyo-meta] Created audience ${audienceId}`);

    // 5. Hash emails and upload to audience in batches of 10000
    const BATCH_SIZE = 10000;
    let totalUploaded = 0;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const hashedEmails = batch.map(email =>
        createHash('sha256').update(email).digest('hex')
      );

      const payload = {
        payload: {
          schema: ['EMAIL_SHA256'],
          data: hashedEmails.map(h => [h]),
        },
      };

      const uploadRes = await fetch(`${META_API_BASE}/${audienceId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${metaToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (uploadRes.ok) {
        totalUploaded += batch.length;
      } else {
        const errData: any = await uploadRes.json();
        console.error(`[sync-klaviyo-meta] Upload batch error:`, errData);
      }
    }

    console.log(`[sync-klaviyo-meta] Uploaded ${totalUploaded}/${emails.length} emails to audience ${audienceId}`);

    return c.json({
      success: true,
      audience_id: audienceId,
      audience_name,
      profiles_found: emails.length,
      profiles_uploaded: totalUploaded,
    });

  } catch (err: any) {
    console.error('[sync-klaviyo-meta] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
