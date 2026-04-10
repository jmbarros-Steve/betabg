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
      if (createError.message.includes('already been registered')) {
        // Not an error — user exists, frontend will just sign in
        return new Response(JSON.stringify({ exists: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: createError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;
    console.log('User created:', userId, email);

    // Assign client role
    await supabase.from('user_roles').upsert(
      { user_id: userId, role: 'client' },
      { onConflict: 'user_id,role' },
    );

    // Create client record — skip if handle_new_user trigger already created it
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingClient) {
      const { error: clientError } = await supabase.from('clients').insert({
        user_id: userId,
        client_user_id: userId,
        name: email.split('@')[0],
        email,
      });
      if (clientError) {
        console.error('Client insert error (non-blocking):', clientError.message);
      }
    } else {
      // Ensure client_user_id is set (trigger might not set it)
      await supabase.from('clients')
        .update({ client_user_id: userId })
        .eq('id', existingClient.id)
        .is('client_user_id', null);
    }

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
