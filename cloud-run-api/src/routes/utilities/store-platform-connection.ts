import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface ConnectionPayload {
  clientId: string;
  platform: 'shopify' | 'meta' | 'google';
  storeName?: string;
  storeUrl?: string;
  accessToken?: string;
  accountId?: string;
}

export async function storePlatformConnection(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();
    const userId = user.id;
    console.log('Authenticated user:', userId);

    // Parse request body
    const payload: ConnectionPayload = await c.req.json();
    const { clientId, platform, storeName, storeUrl, accessToken, accountId } = payload;

    // Validate required fields
    if (!clientId || !platform) {
      return c.json({ error: 'Client ID and platform are required' }, 400);
    }

    // Validate platform-specific fields
    if (platform === 'shopify' && (!storeUrl || !accessToken)) {
      return c.json({ error: 'Store URL and Access Token are required for Shopify' }, 400);
    }

    // Verify user owns the client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('user_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientError);
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.user_id !== userId) {
      console.error('User does not own this client');
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Encrypt the token using database function before storing
    let encryptedToken = null;
    if (accessToken) {
      const { data: encryptResult, error: encryptError } = await supabase
        .rpc('encrypt_platform_token', { raw_token: accessToken });

      if (encryptError) {
        console.error('Error encrypting token:', encryptError);
        return c.json({ error: 'Error al encriptar el token' }, 500);
      }
      encryptedToken = encryptResult;
    }

    // Insert the connection with encrypted token
    const { data: connection, error: insertError } = await supabase
      .from('platform_connections')
      .insert({
        client_id: clientId,
        platform: platform,
        store_name: storeName || null,
        store_url: storeUrl || null,
        access_token_encrypted: encryptedToken,
        account_id: accountId || null,
      })
      .select('id, platform, store_name, store_url, account_id, is_active, created_at')
      .single();

    if (insertError) {
      console.error('Error inserting connection:', insertError);
      if (insertError.code === '23505') {
        return c.json({ error: 'Este cliente ya tiene una conexión con esta plataforma' }, 409);
      }
      return c.json({ error: 'Error al crear conexión' }, 500);
    }

    console.log('Connection created successfully:', connection.id);

    // Return connection info WITHOUT sensitive tokens
    return c.json({
      success: true,
      connection: connection,
    });

  } catch (error: any) {
    console.error('Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
