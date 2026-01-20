import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConnectionPayload {
  clientId: string;
  platform: 'shopify' | 'meta' | 'google';
  storeName?: string;
  storeUrl?: string;
  accessToken?: string;
  accountId?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate the JWT and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('Invalid JWT:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    // Parse request body
    const payload: ConnectionPayload = await req.json();
    const { clientId, platform, storeName, storeUrl, accessToken, accountId } = payload;

    // Validate required fields
    if (!clientId || !platform) {
      return new Response(
        JSON.stringify({ error: 'Client ID and platform are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate platform-specific fields
    if (platform === 'shopify' && (!storeUrl || !accessToken)) {
      return new Response(
        JSON.stringify({ error: 'Store URL and Access Token are required for Shopify' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseService
      .from('clients')
      .select('user_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.user_id !== userId) {
      console.error('User does not own this client');
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the connection with tokens stored server-side only
    const { data: connection, error: insertError } = await supabaseService
      .from('platform_connections')
      .insert({
        client_id: clientId,
        platform: platform,
        store_name: storeName || null,
        store_url: storeUrl || null,
        access_token: accessToken || null,
        account_id: accountId || null,
      })
      .select('id, platform, store_name, store_url, account_id, is_active, created_at')
      .single();

    if (insertError) {
      console.error('Error inserting connection:', insertError);
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Este cliente ya tiene una conexión con esta plataforma' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Error al crear conexión' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Connection created successfully:', connection.id);

    // Return connection info WITHOUT sensitive tokens
    return new Response(
      JSON.stringify({
        success: true,
        connection: connection,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
