import { Context, Next } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * JWT authentication middleware.
 * Verifies Supabase JWT tokens from the Authorization header.
 * Also allows internal calls via service role key match.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'No authorization header' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const internalKey = c.req.header('X-Internal-Key')?.trim();

  // Allow internal calls (service role key)
  if (token === serviceKey || internalKey === serviceKey) {
    c.set('isInternal', true);
    c.set('user', { id: 'internal', email: 'system@steve.cl' });
    await next();
    return;
  }

  // Verify JWT via Supabase
  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  c.set('token', token);

  // Update last_active_at for churn detection (non-blocking but awaited)
  try {
    await supabase
      .from('clients')
      .update({ last_active_at: new Date().toISOString() })
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`);
  } catch (e) {
    console.warn('[auth] last_active_at update failed:', (e as Error).message);
  }

  await next();
}
