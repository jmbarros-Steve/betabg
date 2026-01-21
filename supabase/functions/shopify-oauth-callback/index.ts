import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthPayload {
  code: string;
  shop: string;
  client_id?: string; // Optional - for existing clients
}

// Generate a random password
function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const shopifyClientId = Deno.env.get('SHOPIFY_CLIENT_ID')!;
    const shopifyClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;

    // Parse request body
    const payload: OAuthPayload = await req.json();
    const { code, shop, client_id: existingClientId } = payload;

    console.log('Received OAuth callback:', { shop, existingClientId, hasCode: !!code });

    // Validate required fields
    if (!code || !shop) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: code, shop' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate shop format
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    console.log('Shop domain:', shopDomain);

    // Use service role for all database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Exchange authorization code for access token
    console.log('Exchanging code for access token...');
    const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: shopifyClientId,
        client_secret: shopifyClientSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Shopify token exchange failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Successfully obtained access token');

    // Get shop info including email
    const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    });

    let storeName = shopDomain.replace('.myshopify.com', '');
    let shopEmail = '';
    let shopOwnerName = '';
    
    if (shopInfoResponse.ok) {
      const shopInfo = await shopInfoResponse.json();
      storeName = shopInfo.shop?.name || storeName;
      shopEmail = shopInfo.shop?.email || '';
      shopOwnerName = shopInfo.shop?.shop_owner || storeName;
      console.log('Shop info:', { storeName, shopEmail, shopOwnerName });
    }

    if (!shopEmail) {
      console.error('No shop email found');
      return new Response(
        JSON.stringify({ error: 'Could not retrieve shop email from Shopify' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === shopEmail);

    let userId: string;
    let clientId: string;
    let isNewUser = false;
    let tempPassword: string | null = null;

    if (existingUser) {
      // User exists - find their client record
      console.log('User already exists:', existingUser.id);
      userId = existingUser.id;

      // Find client where user is either owner or client_user
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id')
        .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        // Create client for existing user
        const { data: newClient, error: clientError } = await supabaseAdmin
          .from('clients')
          .insert({
            user_id: userId,
            client_user_id: userId,
            name: shopOwnerName,
            email: shopEmail,
            company: storeName,
          })
          .select('id')
          .single();

        if (clientError) {
          console.error('Error creating client for existing user:', clientError);
          return new Response(
            JSON.stringify({ error: 'Error creating client record' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        clientId = newClient.id;
      }
    } else {
      // New user - create everything
      isNewUser = true;
      tempPassword = generatePassword();
      
      console.log('Creating new user...');
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: shopEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          shop_domain: shopDomain,
          store_name: storeName,
        }
      });

      if (authError || !authData.user) {
        console.error('Error creating user:', authError);
        return new Response(
          JSON.stringify({ error: 'Error creating user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
      console.log('Created new user:', userId);

      // Assign client role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'client'
        });

      if (roleError) {
        console.error('Error assigning role:', roleError);
        // Continue anyway - role can be fixed later
      }

      // Create client record
      const { data: newClient, error: clientError } = await supabaseAdmin
        .from('clients')
        .insert({
          user_id: userId,
          client_user_id: userId,
          name: shopOwnerName,
          email: shopEmail,
          company: storeName,
        })
        .select('id')
        .single();

      if (clientError || !newClient) {
        console.error('Error creating client:', clientError);
        return new Response(
          JSON.stringify({ error: 'Error creating client record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      clientId = newClient.id;
      console.log('Created client:', clientId);

      // Get Free plan and assign subscription
      const { data: freePlan } = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('slug', 'free')
        .single();

      if (freePlan) {
        const { error: subError } = await supabaseAdmin
          .from('user_subscriptions')
          .insert({
            user_id: userId,
            plan_id: freePlan.id,
            status: 'active',
            credits_used: 0,
            credits_reset_at: new Date().toISOString(),
          });

        if (subError) {
          console.error('Error creating subscription:', subError);
          // Continue anyway - subscription can be fixed later
        } else {
          console.log('Assigned Free plan to user');
        }
      }
    }

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptError) {
      console.error('Error encrypting token:', encryptError);
      return new Response(
        JSON.stringify({ error: 'Error encrypting token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing Shopify connection for this client
    const { data: existingConnection } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .single();

    let connection;
    if (existingConnection) {
      // Update existing connection
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('platform_connections')
        .update({
          store_name: storeName,
          store_url: `https://${shopDomain}`,
          access_token_encrypted: encryptedToken,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select('id, platform, store_name, store_url, is_active')
        .single();

      if (updateError) {
        console.error('Error updating connection:', updateError);
        return new Response(
          JSON.stringify({ error: 'Error updating connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      connection = updated;
      console.log('Updated existing connection:', connection.id);
    } else {
      // Insert new connection
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('platform_connections')
        .insert({
          client_id: clientId,
          platform: 'shopify',
          store_name: storeName,
          store_url: `https://${shopDomain}`,
          access_token_encrypted: encryptedToken,
          is_active: true,
        })
        .select('id, platform, store_name, store_url, is_active')
        .single();

      if (insertError) {
        console.error('Error inserting connection:', insertError);
        return new Response(
          JSON.stringify({ error: 'Error creating connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      connection = inserted;
      console.log('Created new connection:', connection.id);
    }

    // Generate a magic link for auto-login (valid for 1 hour)
    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: shopEmail,
      options: {
        redirectTo: `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/portal?tab=connections`,
      }
    });

    let loginToken: string | null = null;
    if (!magicLinkError && magicLinkData?.properties?.hashed_token) {
      loginToken = magicLinkData.properties.hashed_token;
    }

    return new Response(
      JSON.stringify({
        success: true,
        store_name: storeName,
        connection: connection,
        is_new_user: isNewUser,
        user_email: shopEmail,
        temp_password: isNewUser ? tempPassword : null,
        magic_link_token: loginToken,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in Shopify OAuth callback:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
