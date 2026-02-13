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

        if (adminErr || clientErr) {
          console.error('Error checking roles:', adminErr ?? clientErr);
        }
        if (superAdminErr) {
          console.error('Error checking super admin:', superAdminErr);
        }
        if (shopifyErr) {
          console.error('Error checking Shopify user:', shopifyErr);
        }

        setIsSuperAdmin(superAdminCheck ?? false);
        setIsShopifyUser(shopifyUserCheck ?? false);

        // SECURITY FIX: Shopify users should ALWAYS be treated as 'client' role
        // Even if they somehow have 'admin' role assigned, they cannot access admin features
        // Only super admins (manually set in DB) can have real admin access
        let userRole: AppRole | null;
        
        if (shopifyUserCheck) {
          // Shopify users are ALWAYS clients, regardless of role table
          userRole = 'client';
        } else if (superAdminCheck) {
          // Only super admins get admin role
          userRole = 'admin';
        } else if (isAdmin && !shopifyUserCheck) {
          // Regular admin (but this should be deprecated - use super_admin)
          userRole = 'admin';
        } else if (isClient) {
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

          if (clientError) {
            console.error('Error fetching client data:', clientError);
          }

          setClientData(client);
        } else {
          setClientData(null);
        }
      } catch (error) {
        console.error('Error in fetchRole:', error);
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
