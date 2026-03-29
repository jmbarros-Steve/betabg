import { type PlanSlug, PLAN_INFO } from '@/lib/plan-features';

interface PlanBadgeProps {
  planSlug: PlanSlug;
  size?: 'sm' | 'md';
}

/**
 * Small badge showing the user's current plan.
 * Used in the portal header and admin panels.
 */
export function PlanBadge({ planSlug, size = 'sm' }: PlanBadgeProps) {
  const plan = PLAN_INFO[planSlug];

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border ${plan.badgeClass} ${sizeClasses}`}>
      <span>{plan.emoji}</span>
      <span>{plan.nombre}</span>
    </span>
  );
}
