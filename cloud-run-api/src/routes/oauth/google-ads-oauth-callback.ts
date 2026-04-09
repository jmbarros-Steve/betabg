import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

interface OAuthPayload {
  code: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
}

export async function googleAdsOauthCallback(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already verified by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload: OAuthPayload = await c.req.json();
    const { code, client_id, redirect_uri, state } = payload;

    if (!code || !client_id || !redirect_uri) {
      return c.json({ error: 'Missing required parameters' }, 400);
    }

    // CSRF protection: state parameter is mandatory
    if (!state) {
      return c.json({ error: 'Missing state parameter' }, 400);
    }

    // Validate state parameter
    {
      try {
        const decoded = Buffer.from(state, 'base64').toString();
        const [stateClientId, stateUserId] = decoded.split(':');
        if (stateClientId !== client_id || stateUserId !== user.id) {
          return c.json({ error: 'Invalid state parameter (CSRF check failed)' }, 403);
        }
      } catch {
        return c.json({ error: 'Malformed state parameter' }, 400);
      }
    }

    // Verify user owns this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.client_user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get Google OAuth credentials
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!googleClientId || !googleClientSecret || !developerToken) {
      console.error('Google Ads credentials not configured');
      return c.json({ error: 'Google Ads configuration error' }, 500);
    }

    // Exchange code for access token
    console.log('Exchanging code for token...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      console.error('Google token error:', tokenData.error);
      return c.json({ error: tokenData.error_description || 'Failed to get access token' }, 400);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    console.log('Access token obtained');

    // Get list of accessible Google Ads customers
    console.log('Fetching accessible customers...');
    const customersResponse = await fetch(
      'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      }
    );

    const customersData = await customersResponse.json() as any;

    if (customersData.error) {
      console.error('Error fetching customers:', customersData.error);
      return c.json({ error: customersData.error.message || 'Could not fetch Google Ads accounts' }, 400);
    }

    const resourceNames = customersData.resourceNames || [];
    console.log(`Found ${resourceNames.length} accessible customers`);

    if (resourceNames.length === 0) {
      return c.json({ error: 'No Google Ads accounts found for this user' }, 400);
    }

    // Extract customer ID from first resource name (format: customers/1234567890)
    const firstCustomerId = resourceNames[0].replace('customers/', '');

    // Get customer details
    let accountName = `Google Ads ${firstCustomerId}`;
    try {
      const customerDetailsResponse = await fetch(
        `https://googleads.googleapis.com/v18/customers/${firstCustomerId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'login-customer-id': firstCustomerId,
          },
        }
      );

      const customerDetails = await customerDetailsResponse.json() as any;
      if (customerDetails.descriptiveName) {
        accountName = customerDetails.descriptiveName;
      }
    } catch (e) {
      console.log('Could not fetch customer details, using default name');
    }

    // Encrypt the tokens
    const { data: encryptedAccessToken, error: encryptAccessError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptAccessError) {
      console.error('Access token encryption error:', encryptAccessError);
      return c.json({ error: 'Failed to secure access token' }, 500);
    }

    let encryptedRefreshToken = null;
    if (refreshToken) {
      const { data, error: encryptRefreshError } = await supabase
        .rpc('encrypt_platform_token', { raw_token: refreshToken });

      if (encryptRefreshError) {
        console.error('Refresh token encryption error:', encryptRefreshError);
      } else {
        encryptedRefreshToken = data;
      }
    }

    // Check if connection already exists
    const existingConnection = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', client_id)
        .eq('platform', 'google')
        .maybeSingle(),
      null,
      'googleAdsOauthCallback.getExistingConnection',
    );

    let connectionResult;
    if (existingConnection) {
      // Update existing connection
      connectionResult = await supabase
        .from('platform_connections')
        .update({
          access_token_encrypted: encryptedAccessToken,
          refresh_token_encrypted: encryptedRefreshToken,
          account_id: firstCustomerId,
          store_name: accountName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select()
        .single();
    } else {
      // Create new connection
      connectionResult = await supabase
        .from('platform_connections')
        .insert({
          client_id: client_id,
          platform: 'google',
          access_token_encrypted: encryptedAccessToken,
          refresh_token_encrypted: encryptedRefreshToken,
          account_id: firstCustomerId,
          store_name: accountName,
          is_active: true,
        })
        .select()
        .single();
    }

    if (connectionResult.error) {
      console.error('Connection save error:', connectionResult.error);
      return c.json({ error: 'Failed to save connection' }, 500);
    }

    console.log('Google Ads connection saved successfully');

    return c.json({
      success: true,
      account_name: accountName,
      account_id: firstCustomerId,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
