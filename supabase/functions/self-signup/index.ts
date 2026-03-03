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
    const { email, password, action } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Action: confirm existing user's email
    if (action === 'confirm') {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const user = users?.find(u => u.email === email);
      if (user) {
        await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
        console.log('Email confirmed for:', email);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default action: create new user
    if (!password) {
      return new Response(JSON.stringify({ error: 'Contraseña requerida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create user with auto-confirmed email
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('Create user error:', createError.message);
      const message = createError.message.includes('already been registered')
        ? 'Este email ya está registrado'
        : createError.message;
      return new Response(JSON.stringify({ error: message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;
    console.log('User created:', userId, email);

    // Assign client role
    await supabase.from('user_roles').upsert(
      { user_id: userId, role: 'client' },
      { onConflict: 'user_id,role' },
    );

    // Create client record (user manages their own account)
    await supabase.from('clients').insert({
      user_id: userId,
      client_user_id: userId,
      name: email.split('@')[0],
      email,
    });

    console.log('Self-signup complete for:', email);

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Self-signup error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
