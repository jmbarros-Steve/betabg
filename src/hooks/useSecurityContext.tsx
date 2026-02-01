import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Security Context Hook
 * 
 * Provides multitenancy security context including:
 * - Whether user is a Shopify user (shop_domain based)
 * - Whether user is a super admin (manually set in DB)
 * - Shop domain for the current user
 * - Role validation that distinguishes real admins from Shopify merchants
 */

interface SecurityContextType {
  isShopifyUser: boolean;
  isSuperAdmin: boolean;
  shopDomain: string | null;
  isRealAdmin: boolean; // Super admin only, not Shopify users with wrong roles
  loading: boolean;
  canAccessAdminRoutes: boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isShopifyUser, setIsShopifyUser] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSecurityContext() {
      if (!user) {
        setIsShopifyUser(false);
        setIsSuperAdmin(false);
        setShopDomain(null);
        setLoading(false);
        return;
      }

      try {
        // Fetch all security context in parallel
        const [shopifyCheck, superAdminCheck, shopDomainResult] = await Promise.all([
          supabase.rpc('is_shopify_user', { _user_id: user.id }),
          supabase.rpc('is_super_admin', { _user_id: user.id }),
          supabase.rpc('get_user_shop_domain', { _user_id: user.id }),
        ]);

        if (shopifyCheck.error) {
          console.error('Error checking Shopify user:', shopifyCheck.error);
        }
        if (superAdminCheck.error) {
          console.error('Error checking super admin:', superAdminCheck.error);
        }
        if (shopDomainResult.error) {
          console.error('Error getting shop domain:', shopDomainResult.error);
        }

        setIsShopifyUser(shopifyCheck.data ?? false);
        setIsSuperAdmin(superAdminCheck.data ?? false);
        setShopDomain(shopDomainResult.data ?? null);

      } catch (error) {
        console.error('Error in security context:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSecurityContext();
  }, [user]);

  // A "real admin" is a super admin who is NOT a Shopify user
  // Shopify users should NEVER have admin access even if they somehow got admin role
  const isRealAdmin = isSuperAdmin && !isShopifyUser;
  
  // Can access admin routes only if super admin
  const canAccessAdminRoutes = isSuperAdmin;

  return (
    <SecurityContext.Provider 
      value={{ 
        isShopifyUser, 
        isSuperAdmin, 
        shopDomain, 
        isRealAdmin,
        loading,
        canAccessAdminRoutes,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurityContext() {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurityContext must be used within a SecurityProvider');
  }
  return context;
}
