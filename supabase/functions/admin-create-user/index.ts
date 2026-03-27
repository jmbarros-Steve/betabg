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
      return new Response(JSON.stringify({ error: 'Solo super admins pueden crear clientes' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const { email, password, name, company, plan, tokens } = await req.json();
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'email, password y name son requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Create auth user
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const userData = await createRes.json();
    if (!createRes.ok) {
      return new Response(JSON.stringify({ error: userData.msg || 'Error al crear usuario' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const newUserId = userData.id;

    // 2. Assign client role
    const { error: roleErr } = await supabase
      .from('user_roles')
      .insert({ user_id: newUserId, role: 'client', is_super_admin: false });
    if (roleErr) console.error('Role insert error:', roleErr);

    // 3. Create client record
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .insert({
        user_id: caller.id,
        client_user_id: newUserId,
        name,
        email,
        company: company || null,
      })
      .select('id')
      .single();

    if (clientErr) {
      return new Response(JSON.stringify({ error: clientErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Create client_credits with plan and tokens
    const { error: creditErr } = await supabase
      .from('client_credits')
      .insert({
        client_id: clientData.id,
        plan: plan || 'pro',
        creditos_disponibles: tokens || 500,
        creditos_usados: 0,
      });
    if (creditErr) console.error('Credit insert error:', creditErr);

    return new Response(JSON.stringify({
      success: true,
      user_id: newUserId,
      client_id: clientData.id,
      email,
      plan: plan || 'pro',
      tokens: tokens || 500,
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
