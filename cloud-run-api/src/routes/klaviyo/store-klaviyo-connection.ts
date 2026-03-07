import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

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

    // Validate the API key by making a test request to Klaviyo
    const testResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${api_key}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15',
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
    const { data: existingConn } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', client_id)
      .eq('platform', 'klaviyo')
      .single();

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
