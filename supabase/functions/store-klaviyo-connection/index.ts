import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StoreKlaviyoRequest {
  client_id: string;
  api_key: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { client_id, api_key }: StoreKlaviyoRequest = await req.json();

    if (!client_id || !api_key) {
      return new Response(
        JSON.stringify({ error: 'client_id and api_key are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Invalid Klaviyo API key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountData = await testResponse.json();
    const accountName = accountData.data?.[0]?.attributes?.contact_information?.organization_name || 'Klaviyo Account';

    // Use service role to encrypt and store the API key
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Encrypt the API key
    const { data: encryptedKey, error: encryptError } = await serviceSupabase
      .rpc('encrypt_platform_token', { raw_token: api_key });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to encrypt API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if connection already exists
    const { data: existingConn } = await serviceSupabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', client_id)
      .eq('platform', 'klaviyo')
      .single();

    let result;
    if (existingConn) {
      // Update existing connection
      result = await serviceSupabase
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
      result = await serviceSupabase
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
      return new Response(
        JSON.stringify({ error: 'Failed to store connection' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Klaviyo connected successfully',
        account_name: accountName,
        connection_id: result.data.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Error in store-klaviyo-connection:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
