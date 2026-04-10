import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

interface CreateClientUserPayload {
  email: string;
  password: string;
  client_id: string;
}

/**
 * Creates a portal user for an existing client.
 * Requires auth middleware (JWT verified, user set on context).
 * Verifies caller is admin and owns the client.
 */
export async function createClientUser(c: Context) {
  const supabase = getSupabaseAdmin();
  const adminUser = c.get('user');

  if (!adminUser) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check if caller is admin
  const adminRole = await safeQuerySingleOrDefault<any>(
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUser.id)
      .eq('role', 'admin')
      .maybeSingle(),
    null,
    'createClientUser.getAdminRole',
  );

  if (!adminRole) {
    return c.json({ error: 'Only admins can create client users' }, 403);
  }

  const payload: CreateClientUserPayload = await c.req.json();
  const { email, password, client_id } = payload;

  if (!email || !password || !client_id) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  // Verify admin owns this client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, user_id, client_user_id')
    .eq('id', client_id)
    .single();

  if (clientError || !client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  // Check if user is super admin
  const { data: profile } = await supabase.from('user_roles').select('is_super_admin').eq('user_id', adminUser.id).maybeSingle();
  if (profile?.is_super_admin) {
    // Super admin can create users for any client
  } else if (client.user_id !== adminUser.id) {
    // Check user_roles as fallback
    const { data: roleCheck } = await supabase.from('user_roles').select('id').eq('user_id', adminUser.id).eq('client_id', client_id).maybeSingle();
    if (!roleCheck) return c.json({ error: 'No permission' }, 403);
  }

  if (client.client_user_id) {
    return c.json({ error: 'Client already has portal access' }, 400);
  }

  console.log('Creating user for client:', client_id);

  // Create user using admin API
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email
  });

  if (createError) {
    console.error('Error creating user:', createError);
    return c.json({ error: createError.message }, 400);
  }

  console.log('User created:', newUser.user.id);

  // Assign client role (upsert — trigger handle_new_user may have already created it)
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert(
      { user_id: newUser.user.id, role: 'client' },
      { onConflict: 'user_id,role' },
    );

  if (roleError) {
    console.error('Error assigning role:', roleError);
  }

  // Delete orphan client created by handle_new_user trigger
  await supabase
    .from('clients')
    .delete()
    .eq('user_id', newUser.user.id)
    .neq('id', client_id);

  // Link user to client
  const { error: linkError } = await supabase
    .from('clients')
    .update({ client_user_id: newUser.user.id })
    .eq('id', client_id);

  if (linkError) {
    console.error('Error linking user to client:', linkError);
    return c.json({ error: 'Failed to link user to client' }, 500);
  }

  console.log('Client user created and linked successfully');

  return c.json({
    success: true,
    user_id: newUser.user.id,
  });
}
