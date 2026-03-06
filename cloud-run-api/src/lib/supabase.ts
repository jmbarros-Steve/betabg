import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client (service role).
 * Use for all database operations where RLS should be bypassed.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return adminClient;
}

/**
 * Creates a Supabase client scoped to a specific user's JWT token.
 * Use when operations should respect RLS policies.
 */
export function getSupabaseWithUserToken(token: string): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );
}
