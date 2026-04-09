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

  if (client.user_id !== adminUser.id) {
    return c.json({ error: 'Access denied' }, 403);
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

  // Assign client role
  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({
      user_id: newUser.user.id,
      role: 'client',
    });

  if (roleError) {
    console.error('Error assigning role:', roleError);
    // Don't fail - user is created, role can be fixed
  }

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
