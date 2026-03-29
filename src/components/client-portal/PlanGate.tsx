import { type ReactNode } from 'react';
import { useUserPlan } from '@/hooks/useUserPlan';
import { type FeatureKey, getRequiredPlan } from '@/lib/plan-features';
import { UpgradeOverlay } from './UpgradeOverlay';

interface PlanGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Optional: override the user whose plan to check (for admin viewing client portal) */
  clientId?: string;
}

/**
 * Wraps content that requires a specific plan level.
 * If the user doesn't have access, shows an UpgradeOverlay instead.
 */
export function PlanGate({ feature, children, clientId }: PlanGateProps) {
  const { canAccess, loading } = useUserPlan(clientId);

  if (loading) return <>{children}</>;

  if (!canAccess(feature)) {
    const requiredPlan = getRequiredPlan(feature);
    return (
      <div className="relative">
        <div className="pointer-events-none select-none" aria-hidden="true">
          {children}
        </div>
        <UpgradeOverlay requiredPlan={requiredPlan || 'estrategia'} />
      </div>
    );
  }

  return <>{children}</>;
}
