import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

interface StoreKlaviyoRequest {
  client_id: string;
  api_key: string;
}

export async function storeKlaviyoConnection(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { client_id, api_key }: StoreKlaviyoRequest = await c.req.json();

    if (!client_id || !api_key) {
      return c.json({ error: 'client_id and api_key are required' }, 400);
    }

    // Ownership validation: ensure the authenticated user has access to this client_id
    const { data: ownerCheck } = await supabase.from('clients').select('id').eq('id', client_id).or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`).maybeSingle();
    if (!ownerCheck) {
      const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_super_admin) return c.json({ error: 'No tienes acceso' }, 403);
    }

    // Validate the API key by making a test request to Klaviyo
    const testResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${api_key}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15',
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('Klaviyo validation failed:', errorText);
      return c.json({ error: 'Invalid Klaviyo API key' }, 400);
    }

    const accountData: any = await testResponse.json();
    const accountName = accountData.data?.[0]?.attributes?.contact_information?.organization_name || 'Klaviyo Account';

    // Encrypt the API key
    const { data: encryptedKey, error: encryptError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: api_key });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      return c.json({ error: 'Failed to encrypt API key' }, 500);
    }

    // Check if connection already exists
    const existingConn = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', client_id)
        .eq('platform', 'klaviyo')
        .single(),
      null,
      'storeKlaviyoConnection.getExistingConn',
    );

    let result;
    if (existingConn) {
      // Update existing connection
      result = await supabase
        .from('platform_connections')
        .update({
          api_key_encrypted: encryptedKey,
          store_name: accountName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConn.id)
        .select()
        .single();
    } else {
      // Create new connection
      result = await supabase
        .from('platform_connections')
        .insert({
          client_id,
          platform: 'klaviyo',
          api_key_encrypted: encryptedKey,
          store_name: accountName,
          is_active: true,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Database error:', result.error);
      return c.json({ error: 'Failed to store connection' }, 500);
    }

    // Complete onboarding step (fire & forget)
    Promise.resolve(
      supabase
        .from('merchant_onboarding')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('client_id', client_id)
        .eq('step', 'klaviyo_connected')
        .eq('status', 'pending')
    ).then(() => console.log(`[klaviyo] Onboarding step klaviyo_connected completed for client ${client_id}`))
      .catch(() => {});

    return c.json({
      success: true,
      message: 'Klaviyo connected successfully',
      account_name: accountName,
      connection_id: result.data.id
    }, 200);

  } catch (error: unknown) {
    console.error('Error in store-klaviyo-connection:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}
