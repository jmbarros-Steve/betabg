import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Multi-tenant scoping helper.
 * Checks if user is super_admin; if not, returns the client IDs
 * linked to the user via clients.user_id or clients.client_user_id.
 */
export async function getUserClientIds(
  supabase: SupabaseClient,
  userId: string
): Promise<{ isSuperAdmin: boolean; clientIds: string[] }> {
  // La columna `role` es un ENUM app_role que NO acepta el valor 'super_admin'
  // (fallaría con "invalid input value for enum app_role"). La fuente de verdad
  // canónica para super admin en este proyecto es la columna booleana
  // `is_super_admin`. Users legacy tienen role='admin' + is_super_admin=true.
  const { data: adminCheck } = await supabase
    .from('user_roles')
    .select('is_super_admin')
    .eq('user_id', userId)
    .eq('is_super_admin', true)
    .limit(1)
    .maybeSingle();

  if (adminCheck) return { isSuperAdmin: true, clientIds: [] };

  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .or(`user_id.eq.${userId},client_user_id.eq.${userId}`);

  return {
    isSuperAdmin: false,
    clientIds: (clients || []).map((c: any) => c.id),
  };
}

/**
 * Check if a specific prospect belongs to the user's clients.
 * Returns true if user is super_admin or if the prospect's converted_client_id
 * is in the user's client list, OR if the prospect has no converted_client_id
 * (unassigned prospects visible to any authenticated user with client access).
 */
export async function verifyProspectOwnership(
  supabase: SupabaseClient,
  prospectId: string,
  userId: string
): Promise<{ allowed: boolean; isSuperAdmin: boolean }> {
  const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, userId);
  if (isSuperAdmin) return { allowed: true, isSuperAdmin: true };

  const { data: prospect } = await supabase
    .from('wa_prospects')
    .select('id, converted_client_id')
    .eq('id', prospectId)
    .maybeSingle();

  if (!prospect) return { allowed: false, isSuperAdmin: false };

  // If prospect has no converted_client_id, check if user has any clients at all
  // (they are a legitimate user, just prospect is unassigned)
  if (!prospect.converted_client_id) {
    return { allowed: clientIds.length > 0, isSuperAdmin: false };
  }

  return {
    allowed: clientIds.includes(prospect.converted_client_id),
    isSuperAdmin: false,
  };
}
