import { Lock, ArrowUpRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type PlanSlug, PLAN_INFO } from '@/lib/plan-features';

interface UpgradeOverlayProps {
  requiredPlan: PlanSlug;
}

/**
 * Semi-transparent overlay shown over locked content.
 * Includes plan name, CTA to upgrade, and option to schedule a meeting.
 */
export function UpgradeOverlay({ requiredPlan }: UpgradeOverlayProps) {
  const plan = PLAN_INFO[requiredPlan];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm bg-white/80 rounded-xl">
      <div className="text-center max-w-sm px-6 py-8">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${plan.headerColor} mb-4`}>
          <Lock className="h-6 w-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-2">
          Disponible en plan {plan.emoji} {plan.nombre}
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          {plan.tagline}. Mejora tu plan para desbloquear esta funcionalidad.
        </p>

        <div className="flex flex-col gap-3">
          <a
            href="https://meetings.hubspot.com/jose-manuel15"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="w-full" size="lg">
              <Calendar className="w-4 h-4 mr-2" />
              Agendar reunión
            </Button>
          </a>
          <a
            href="https://wa.me/15559061514?text=Hola%20Steve%2C%20quiero%20mejorar%20mi%20plan"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="w-full" size="sm">
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Hablar por WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
