import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthPayload {
  code: string;
  client_id: string;
  redirect_uri: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: OAuthPayload = await req.json();
    const { code, client_id, redirect_uri } = payload;

    if (!code || !client_id || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Google OAuth credentials
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (!googleClientId || !googleClientSecret || !developerToken) {
      console.error('Google Ads credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Google Ads configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Google token error:', tokenData.error);
      return new Response(
        JSON.stringify({ error: tokenData.error_description || 'Failed to get access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    const customersData = await customersResponse.json();

    if (customersData.error) {
      console.error('Error fetching customers:', customersData.error);
      return new Response(
        JSON.stringify({ error: customersData.error.message || 'Could not fetch Google Ads accounts' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resourceNames = customersData.resourceNames || [];
    console.log(`Found ${resourceNames.length} accessible customers`);

    if (resourceNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No Google Ads accounts found for this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      
      const customerDetails = await customerDetailsResponse.json();
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
      return new Response(
        JSON.stringify({ error: 'Failed to secure access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const { data: existingConnection } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', client_id)
      .eq('platform', 'google')
      .maybeSingle();

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
      return new Response(
        JSON.stringify({ error: 'Failed to save connection' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Google Ads connection saved successfully');

    return new Response(
      JSON.stringify({
        success: true,
        account_name: accountName,
        account_id: firstCustomerId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
