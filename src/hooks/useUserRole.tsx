import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'admin' | 'client';

interface UseUserRoleReturn {
  role: AppRole | null;
  isAdmin: boolean;
  isClient: boolean;
  loading: boolean;
  clientData: {
    id: string;
    name: string;
    company: string | null;
  } | null;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<UseUserRoleReturn['clientData']>(null);

  useEffect(() => {
    async function fetchRole() {
      if (!user) {
        setRole(null);
        setClientData(null);
        setLoading(false);
        return;
      }

      try {
        // Fetch user role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleError) {
          console.error('Error fetching role:', roleError);
        }

        const userRole = (roleData?.role as AppRole) || null;
        setRole(userRole);

        // If client, fetch client data
        if (userRole === 'client') {
          const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, company')
            .eq('client_user_id', user.id)
            .maybeSingle();

          if (clientError) {
            console.error('Error fetching client data:', clientError);
          }

          setClientData(client);
        }
      } catch (error) {
        console.error('Error in fetchRole:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRole();
  }, [user]);

  return {
    role,
    isAdmin: role === 'admin',
    isClient: role === 'client',
    loading,
    clientData,
  };
}
