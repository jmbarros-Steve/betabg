import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaBusiness {
  id: string;
  name: string;
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  business?: MetaBusiness;
}

interface MetaResponse {
  data: MetaAdAccount[];
  paging?: {
    cursors: { after?: string };
    next?: string;
  };
}

interface MetaPermissionsResponse {
  data: Array<{
    permission: string;
    status: string;
  }>;
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

    // First, check token permissions
    console.log('Checking token permissions...');
    const permissionsUrl = new URL('https://graph.facebook.com/v18.0/me/permissions');
    permissionsUrl.searchParams.set('access_token', decryptedToken);

    const permissionsResponse = await fetch(permissionsUrl.toString());
    const permissionsData: MetaPermissionsResponse = await permissionsResponse.json();
    
    const grantedPermissions = (permissionsData.data || [])
      .filter(p => p.status === 'granted')
      .map(p => p.permission);

    console.log('Granted permissions:', grantedPermissions);

    const requiredPermissions = ['ads_read', 'business_management'];
    const missingPermissions = requiredPermissions.filter(p => !grantedPermissions.includes(p));

    if (missingPermissions.length > 0) {
      console.warn('Missing permissions:', missingPermissions);
      return new Response(
        JSON.stringify({ 
          error: 'Permisos insuficientes',
          details: `Faltan los permisos: ${missingPermissions.join(', ')}. Por favor, vuelve a conectar Meta Ads para aceptar todos los permisos necesarios.`,
          missing_permissions: missingPermissions,
          requires_reconnect: true
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ad accounts from Meta Graph API with business info
    // Include business field to group by Business Manager
    const accountsUrl = new URL('https://graph.facebook.com/v18.0/me/adaccounts');
    accountsUrl.searchParams.set('access_token', decryptedToken);
    accountsUrl.searchParams.set('fields', 'id,name,account_id,account_status,currency,timezone_name,business{id,name}');
    accountsUrl.searchParams.set('limit', '200');

    console.log('Fetching Meta ad accounts from Graph API (including Business Manager info)');

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
    console.log(`Found ${accountsData.data?.length || 0} ad accounts from /me/adaccounts`);

    // Also fetch accounts from Business Managers directly
    // First get user's businesses
    const businessesUrl = new URL('https://graph.facebook.com/v18.0/me/businesses');
    businessesUrl.searchParams.set('access_token', decryptedToken);
    businessesUrl.searchParams.set('fields', 'id,name');
    businessesUrl.searchParams.set('limit', '50');

    const businessesResponse = await fetch(businessesUrl.toString());
    let businessAccounts: MetaAdAccount[] = [];

    if (businessesResponse.ok) {
      const businessesData = await businessesResponse.json();
      console.log(`Found ${businessesData.data?.length || 0} businesses`);

      // Fetch ad accounts for each business
      for (const business of businessesData.data || []) {
        const businessAdAccountsUrl = new URL(`https://graph.facebook.com/v18.0/${business.id}/owned_ad_accounts`);
        businessAdAccountsUrl.searchParams.set('access_token', decryptedToken);
        businessAdAccountsUrl.searchParams.set('fields', 'id,name,account_id,account_status,currency,timezone_name');
        businessAdAccountsUrl.searchParams.set('limit', '100');

        const businessAdAccountsResponse = await fetch(businessAdAccountsUrl.toString());
        if (businessAdAccountsResponse.ok) {
          const businessAdAccountsData = await businessAdAccountsResponse.json();
          console.log(`Found ${businessAdAccountsData.data?.length || 0} accounts in business: ${business.name}`);
          
          // Add business info to each account
          for (const acc of businessAdAccountsData.data || []) {
            businessAccounts.push({
              ...acc,
              business: { id: business.id, name: business.name }
            });
          }
        }
      }
    }

    // Merge accounts from /me/adaccounts and business owned accounts
    // Use a Map to deduplicate by account_id
    const allAccountsMap = new Map<string, MetaAdAccount>();

    // Add accounts from /me/adaccounts
    for (const acc of accountsData.data || []) {
      allAccountsMap.set(acc.account_id, acc);
    }

    // Add/update with business accounts (these have more complete business info)
    for (const acc of businessAccounts) {
      const existing = allAccountsMap.get(acc.account_id);
      if (!existing || (acc.business && !existing.business)) {
        allAccountsMap.set(acc.account_id, acc);
      }
    }

    const allAccounts = Array.from(allAccountsMap.values());
    console.log(`Total unique accounts: ${allAccounts.length}`);

    // Filter only active accounts and format response
    // account_status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, 7 = PENDING_RISK_REVIEW, etc.
    const activeAccounts = allAccounts
      .filter(acc => acc.account_status === 1)
      .map(acc => ({
        id: acc.id,
        account_id: acc.account_id,
        name: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name,
        business_id: acc.business?.id || null,
        business_name: acc.business?.name || 'Personal',
      }))
      .sort((a, b) => {
        // Sort by business name first, then by account name
        const businessCompare = (a.business_name || '').localeCompare(b.business_name || '');
        if (businessCompare !== 0) return businessCompare;
        return (a.name || '').localeCompare(b.name || '');
      });

    // Group accounts by business for easier display
    const groupedAccounts: Record<string, typeof activeAccounts> = {};
    for (const acc of activeAccounts) {
      const groupName = acc.business_name || 'Personal';
      if (!groupedAccounts[groupName]) {
        groupedAccounts[groupName] = [];
      }
      groupedAccounts[groupName].push(acc);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        accounts: activeAccounts,
        grouped: groupedAccounts,
        total: activeAccounts.length,
        permissions: grantedPermissions
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
