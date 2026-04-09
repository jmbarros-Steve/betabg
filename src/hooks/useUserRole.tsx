import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'admin' | 'client';

interface UseUserRoleReturn {
  role: AppRole | null;
  isAdmin: boolean;
  isClient: boolean;
  isSuperAdmin: boolean;
  isShopifyUser: boolean;
  loading: boolean;
  clientData: {
    id: string;
    name: string;
    company: string | null;
    shop_domain: string | null;
  } | null;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<UseUserRoleReturn['clientData']>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isShopifyUser, setIsShopifyUser] = useState(false);

  useEffect(() => {
    async function fetchRole() {
      if (!user) {
        setRole(null);
        setClientData(null);
        setIsSuperAdmin(false);
        setIsShopifyUser(false);
        setLoading(false);
        return;
      }

      try {
        // Use SECURITY DEFINER RPC to avoid RLS issues when reading roles
        // Also check for super admin and shopify user status for security
        const [
          { data: isAdmin, error: adminErr }, 
          { data: isClient, error: clientErr },
          { data: superAdminCheck, error: superAdminErr },
          { data: shopifyUserCheck, error: shopifyErr },
        ] = await Promise.all([
          supabase.rpc('has_role', { _role: 'admin', _user_id: user.id }),
          supabase.rpc('has_role', { _role: 'client', _user_id: user.id }),
          supabase.rpc('is_super_admin', { _user_id: user.id }),
          supabase.rpc('is_shopify_user', { _user_id: user.id }),
        ]);

        // Log RPC errors — these must never be silent
        if (adminErr) console.error('[useUserRole] has_role(admin) RPC failed:', adminErr.message);
        if (clientErr) console.error('[useUserRole] has_role(client) RPC failed:', clientErr.message);
        if (superAdminErr) console.error('[useUserRole] is_super_admin RPC failed:', superAdminErr.message);
        if (shopifyErr) console.error('[useUserRole] is_shopify_user RPC failed:', shopifyErr.message);

        // Fallback: if has_role RPCs failed, check clients table directly
        let effectiveIsClient = isClient ?? false;
        let effectiveIsAdmin = isAdmin ?? false;

        if (clientErr || adminErr) {
          console.warn('[useUserRole] RPC failed, using clients table fallback:', clientErr?.message || adminErr?.message);
          const { data: fallbackClients, error: fallbackErr } = await supabase
            .from('clients')
            .select('id')
            .eq('client_user_id', user.id)
            .limit(1);

          if (fallbackErr) {
            console.error('[useUserRole] Fallback query failed:', fallbackErr.message);
          } else if (fallbackClients && fallbackClients.length > 0) {
            effectiveIsClient = true;
          }
        }

        setIsSuperAdmin(superAdminCheck ?? false);
        // Super admins should NOT be flagged as Shopify users even if linked to a shop
        setIsShopifyUser(superAdminCheck ? false : (shopifyUserCheck ?? false));

        // SECURITY FIX: Super admins ALWAYS get admin role, even if linked to a Shopify client.
        // Non-super-admin Shopify users are ALWAYS treated as 'client' role.
        let userRole: AppRole | null;

        if (superAdminCheck) {
          // Super admins ALWAYS get admin role — highest priority
          userRole = 'admin';
        } else if (shopifyUserCheck) {
          // Shopify users are clients, regardless of role table
          userRole = 'client';
        } else if (effectiveIsAdmin && !shopifyUserCheck) {
          // Regular admin (but this should be deprecated - use super_admin)
          userRole = 'admin';
        } else if (effectiveIsClient) {
          userRole = 'client';
        } else {
          userRole = null;
        }

        setRole(userRole);

        // Fetch client data for clients or Shopify users
        if (userRole === 'client' || shopifyUserCheck) {
          const { data: clients, error: clientError } = await supabase
            .from('clients')
            .select('id, name, company, shop_domain')
            .eq('client_user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

          // Pick the best match: prefer one with shop_domain set
          const client = clients && clients.length > 0
            ? clients.find(c => c.shop_domain) || clients[0]
            : null;

          if (clientError) console.error('[useUserRole] Failed to fetch client data:', clientError.message);

          setClientData(client);
        } else {
          setClientData(null);
        }
      } catch (err) {
        console.error('[useUserRole] Unexpected error in fetchRole:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchRole();
  }, [user]);

  // SECURITY: isAdmin should only be true for super admins or non-Shopify admins
  // Shopify users can NEVER be admins
  const effectiveIsAdmin = isSuperAdmin || (role === 'admin' && !isShopifyUser);

  return {
    role,
    isAdmin: effectiveIsAdmin,
    isClient: role === 'client' || isShopifyUser,
    isSuperAdmin,
    isShopifyUser,
    loading,
    clientData,
  };
}
