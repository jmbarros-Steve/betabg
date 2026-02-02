import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

interface MetaResponse {
  data: MetaAdAccount[];
  paging?: {
    cursors: { after?: string };
    next?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get connection_id from request
    const { connection_id } = await req.json();
    
    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching Meta ad accounts for connection: ${connection_id}`);

    // Fetch connection details and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        access_token_encrypted,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      console.error('Connection fetch error:', connError);
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this connection
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    
    if (!isOwner) {
      console.error('Authorization failed:', { userId: user.id });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.access_token_encrypted) {
      return new Response(
        JSON.stringify({ error: 'Missing Meta access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('Token decryption error:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ad accounts from Meta Graph API
    const accountsUrl = new URL('https://graph.facebook.com/v18.0/me/adaccounts');
    accountsUrl.searchParams.set('access_token', decryptedToken);
    accountsUrl.searchParams.set('fields', 'id,name,account_id,account_status,currency,timezone_name');
    accountsUrl.searchParams.set('limit', '100');

    console.log('Fetching Meta ad accounts from Graph API');

    const metaResponse = await fetch(accountsUrl.toString());
    
    if (!metaResponse.ok) {
      const errorData = await metaResponse.json();
      console.error('Meta API error:', errorData);
      return new Response(
        JSON.stringify({ 
          error: 'Meta API error', 
          details: errorData.error?.message || 'Unknown error' 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountsData: MetaResponse = await metaResponse.json();
    console.log(`Found ${accountsData.data?.length || 0} ad accounts`);

    // Filter only active accounts (status 1 = active, 2 = disabled, etc.)
    const activeAccounts = (accountsData.data || [])
      .filter(acc => acc.account_status === 1)
      .map(acc => ({
        id: acc.id,
        account_id: acc.account_id,
        name: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name,
      }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        accounts: activeAccounts,
        total: activeAccounts.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fetch accounts error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
