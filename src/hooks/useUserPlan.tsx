import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserRole } from './useUserRole';
import {
  type PlanSlug,
  type FeatureKey,
  canAccess as canAccessFeature,
  canAccessTab as canAccessTabFn,
  PLAN_INFO,
} from '@/lib/plan-features';

interface UseUserPlanReturn {
  planSlug: PlanSlug;
  planName: string;
  loading: boolean;
  canAccess: (feature: FeatureKey) => boolean;
  canAccessTab: (tabId: string) => boolean;
}

/**
 * Hook to get the current user's subscription plan.
 *
 * - Queries user_subscriptions + subscription_plans
 * - Super admins always get 'full'
 * - When admin views another client's portal (overrideUserId), uses that client's plan
 * - Defaults to 'visual' if no subscription found
 */
export function useUserPlan(overrideUserId?: string): UseUserPlanReturn {
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const [planSlug, setPlanSlug] = useState<PlanSlug>('visual');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Super admins always have full access
    if (isSuperAdmin && !overrideUserId) {
      setPlanSlug('full');
      setLoading(false);
      return;
    }

    const targetUserId = overrideUserId || user?.id;
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    async function fetchPlan() {
      try {
        // If overrideUserId is a client row ID (not a user_id), resolve to user_id first
        let userId = targetUserId;

        if (overrideUserId) {
          // overrideUserId might be from clients.id — resolve to client_user_id
          const { data: clientData } = await supabase
            .from('clients')
            .select('client_user_id')
            .eq('id', overrideUserId)
            .single();

          if (clientData?.client_user_id) {
            userId = clientData.client_user_id;
          }
        }

        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('plan_id, subscription_plans(slug)')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !data) {
          setPlanSlug('visual'); // Default
        } else {
          const slug = (data as any).subscription_plans?.slug as PlanSlug;
          setPlanSlug(slug || 'visual');
        }
      } catch {
        setPlanSlug('visual');
      } finally {
        setLoading(false);
      }
    }

    fetchPlan();
  }, [user?.id, isSuperAdmin, overrideUserId]);

  const canAccess = useCallback(
    (feature: FeatureKey) => canAccessFeature(feature, planSlug),
    [planSlug]
  );

  const canAccessTab = useCallback(
    (tabId: string) => canAccessTabFn(tabId, planSlug),
    [planSlug]
  );

  return {
    planSlug,
    planName: PLAN_INFO[planSlug]?.nombre ?? 'Visual',
    loading,
    canAccess,
    canAccessTab,
  };
}
