import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault, safeMutateSingle } from '../../lib/safe-supabase.js';

/**
 * Public endpoint (no JWT required) - handles self-signup.
 * Takes {email, password, action} from body.
 * action === 'confirm' → confirms existing user email
 * Default action → creates new user with admin API, assigns client role, creates client record
 */
export async function selfSignup(c: Context) {
  const { email, password, action } = await c.req.json();

  if (!email) {
    return c.json({ error: 'Email requerido' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Action: confirm existing user's email
  if (action === 'confirm') {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const user = users?.find(u => u.email === email);
    if (user) {
      await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
      console.log('Email confirmed for:', email);
    }
    return c.json({ success: true });
  }

  // Default action: create new user
  if (!password) {
    return c.json({ error: 'Contraseña requerida' }, 400);
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
      return c.json({ exists: true });
    }
    return c.json({ error: createError.message });
  }

  const userId = newUser.user.id;
  console.log('User created:', userId, email);

  // Assign client role
  await supabase.from('user_roles').upsert(
    { user_id: userId, role: 'client' },
    { onConflict: 'user_id,role' },
  );

  // Create client record (user manages their own account)
  const newClient = await safeMutateSingle<any>(
    supabase.from('clients').insert({
      user_id: userId,
      client_user_id: userId,
      name: email.split('@')[0],
      email,
    }).select('id').single(),
    'selfSignup.createClient',
  );

  // Seed onboarding steps
  if (newClient) {
    const onboardResult = await supabase.from('merchant_onboarding').insert([
      { client_id: newClient.id, step: 'welcome', status: 'completed', completed_at: new Date().toISOString() },
      { client_id: newClient.id, step: 'shopify_connected', status: 'pending' },
      { client_id: newClient.id, step: 'meta_connected', status: 'pending' },
      { client_id: newClient.id, step: 'brief_completed', status: 'pending' },
      { client_id: newClient.id, step: 'first_campaign', status: 'pending' },
    ]);
    if (onboardResult.error) {
      console.warn('Onboarding seed error (non-blocking):', onboardResult.error.message);
    } else {
      console.log('Onboarding steps seeded for client:', newClient.id);
    }
  }

  // Check if this email matches a WhatsApp prospect and convert them
  if (newClient) {
    const prospect = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_prospects')
        .select('id, phone')
        .eq('email', email)
        .neq('stage', 'converted')
        .maybeSingle(),
      null,
      'selfSignup.getProspect',
    );

    if (prospect) {
      await supabase
        .from('wa_prospects')
        .update({
          stage: 'converted',
          converted_client_id: newClient.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);

      // Set the prospect's WhatsApp phone on the new client
      await supabase
        .from('clients')
        .update({ whatsapp_phone: prospect.phone })
        .eq('id', newClient.id);

      console.log('Prospect converted:', prospect.phone, '→ client', newClient.id);
    }
  }

  console.log('Self-signup complete for:', email);

  return c.json({ success: true, user_id: userId });
}
