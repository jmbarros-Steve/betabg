import { useState } from 'react';
import { CreditCard, ExternalLink, Calendar, Loader2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserPlan } from '@/hooks/useUserPlan';
import { PlanBadge } from './PlanBadge';
import { PLAN_INFO, PLAN_SLUGS, formatPriceCLP, type PlanSlug } from '@/lib/plan-features';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const EDGE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co/functions/v1';

interface BillingPanelProps {
  clientId: string;
}

export function BillingPanel({ clientId }: BillingPanelProps) {
  const { planSlug, loading: planLoading } = useUserPlan();
  const [loadingCheckout, setLoadingCheckout] = useState<PlanSlug | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleUpgrade = async (targetPlan: PlanSlug) => {
    setLoadingCheckout(targetPlan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No hay sesión activa');
        return;
      }

      const res = await fetch(`${EDGE_URL}/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_slug: targetPlan }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Error al crear checkout');
      }
    } catch {
      toast.error('Error al conectar con Stripe');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No hay sesión activa');
        return;
      }

      const res = await fetch(`${EDGE_URL}/stripe-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        toast.info(data.error || 'Contacta a soporte para gestionar tu suscripción');
      }
    } catch {
      toast.error('Error al conectar con Stripe');
    } finally {
      setLoadingPortal(false);
    }
  };

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentPlan = PLAN_INFO[planSlug];

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <CreditCard className="w-5 h-5" />
            Tu Plan Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${currentPlan.headerColor}`}>
                <currentPlan.icon className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">{currentPlan.emoji} {currentPlan.nombre}</h3>
                  <PlanBadge planSlug={planSlug} />
                </div>
                <p className="text-sm text-slate-500">{currentPlan.tagline}</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {formatPriceCLP(currentPlan.priceMonthly)}/mes
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleManageBilling} disabled={loadingPortal}>
              {loadingPortal ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Gestionar suscripción
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade options */}
      {planSlug !== 'full' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <ArrowUpRight className="w-5 h-5" />
              Mejorar Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PLAN_SLUGS.filter(s => s !== planSlug && PLAN_INFO[s].priceMonthly > currentPlan.priceMonthly).map((slug) => {
                const plan = PLAN_INFO[slug];
                return (
                  <div key={slug} className={`rounded-xl border-2 p-5 ${plan.color}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${plan.headerColor}`}>
                        <plan.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold">{plan.emoji} {plan.nombre}</h4>
                        <p className="text-xs text-slate-500">{plan.tagline}</p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-slate-900 mb-4">
                      {formatPriceCLP(plan.priceMonthly)}/mes
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => handleUpgrade(slug)}
                      disabled={loadingCheckout === slug}
                    >
                      {loadingCheckout === slug ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="w-4 h-4 mr-2" />
                      )}
                      Mejorar a {plan.nombre}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 text-center">
              <a
                href="https://meetings.hubspot.com/jose-manuel15"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary transition-colors"
              >
                <Calendar className="w-4 h-4" />
                ¿Prefieres hablar con alguien? Agendar reunión
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
