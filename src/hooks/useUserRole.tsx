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
        // Use SECURITY DEFINER RPC to avoid RLS issues when reading roles
        const [{ data: isAdmin, error: adminErr }, { data: isClient, error: clientErr }] =
          await Promise.all([
            supabase.rpc('has_role', { _role: 'admin', _user_id: user.id }),
            supabase.rpc('has_role', { _role: 'client', _user_id: user.id }),
          ]);

        if (adminErr || clientErr) {
          console.error('Error checking roles:', adminErr ?? clientErr);
        }

        const userRole: AppRole | null = isAdmin
          ? 'admin'
          : isClient
            ? 'client'
            : null;

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

  return {
    role,
    isAdmin: role === 'admin',
    isClient: role === 'client',
    loading,
    clientData,
  };
}
