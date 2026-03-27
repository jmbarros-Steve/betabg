import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerRole } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', caller.id)
      .single();

    if (!callerRole?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Solo super admins pueden eliminar clientes' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request - accepts single id or array of ids
    const { client_ids } = await req.json();
    const ids: string[] = Array.isArray(client_ids) ? client_ids : [client_ids];

    if (!ids.length) {
      return new Response(JSON.stringify({ error: 'client_ids es requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const errors: string[] = [];
    let deleted = 0;

    for (const clientId of ids) {
      try {
        // Get client info to find auth user
        const { data: clientData } = await supabase
          .from('clients')
          .select('client_user_id')
          .eq('id', clientId)
          .single();

        // Delete all related records (order matters for FK constraints)
        const tables = [
          'client_credits',
          'brand_research',
          'buyer_personas',
          'email_campaigns',
          'meta_ad_campaigns',
          'google_ad_campaigns',
          'shopify_products',
          'shopify_orders',
          'chat_messages',
          'steve_conversations',
        ];

        for (const table of tables) {
          await supabase.from(table).delete().eq('client_id', clientId);
        }

        // Delete the client record
        const { error: delErr } = await supabase
          .from('clients')
          .delete()
          .eq('id', clientId);

        if (delErr) {
          errors.push(`${clientId}: ${delErr.message}`);
          continue;
        }

        // Delete user_roles and auth user if exists
        if (clientData?.client_user_id) {
          await supabase.from('user_roles').delete().eq('user_id', clientData.client_user_id);

          // Delete auth user
          await fetch(`${supabaseUrl}/auth/v1/admin/users/${clientData.client_user_id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey,
            },
          });
        }

        deleted++;
      } catch (e: any) {
        errors.push(`${clientId}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deleted,
      total: ids.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
