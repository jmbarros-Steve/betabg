import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { ArrowLeft, Check, Minus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PLAN_INFO, PLAN_SLUGS, COMPARATIVA, type PlanSlug } from '@/lib/plan-features';
import { supabase } from '@/integrations/supabase/client';

function CellIcon({ value }: { value: boolean }) {
  if (value) {
    return <Check className="h-5 w-5 text-green-600 mx-auto" />;
  }
  return <Minus className="h-4 w-4 text-slate-300 mx-auto" />;
}

export default function AdminPlanes() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [planStats, setPlanStats] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [user, authLoading, isSuperAdmin, roleLoading, navigate]);

  // Fetch plan stats
  useEffect(() => {
    if (!isSuperAdmin) return;
    async function fetchStats() {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('plan_id, subscription_plans(slug)')
        .eq('status', 'active');

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((row: any) => {
          const slug = row.subscription_plans?.slug;
          if (slug) counts[slug] = (counts[slug] || 0) + 1;
        });
        setPlanStats(counts);
      }
    }
    fetchStats();
  }, [isSuperAdmin]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Planes Steve Ads</h1>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {PLAN_SLUGS.map((slug) => {
            const plan = PLAN_INFO[slug];
            return (
              <Card key={slug} className={`${plan.color} border-2`}>
                <CardContent className="pt-6 text-center">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${plan.headerColor} mb-4`}>
                    <plan.icon className="h-7 w-7" />
                  </div>
                  <h2 className="text-xl font-bold mb-1">
                    {plan.emoji} {plan.nombre}
                  </h2>
                  <p className="text-sm text-slate-600">{plan.tagline}</p>
                  <div className="mt-3 flex items-center justify-center gap-1 text-xs text-slate-500">
                    <Users className="w-3.5 h-3.5" />
                    <span>{planStats[slug] || 0} clientes</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Tabla comparativa */}
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-semibold text-slate-700 w-1/2">Feature</th>
                {PLAN_SLUGS.map((slug) => {
                  const plan = PLAN_INFO[slug];
                  return (
                    <th key={slug} className="text-center p-4 w-1/6">
                      <span className={`inline-block px-3 py-1 rounded-full ${plan.headerColor} text-xs font-semibold`}>
                        {plan.emoji} {plan.nombre}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARATIVA.map((modulo) => (
                <>
                  <tr key={`header-${modulo.modulo}`} className="bg-slate-50">
                    <td colSpan={4} className="p-3 font-bold text-slate-800 text-base">
                      {modulo.modulo}
                    </td>
                  </tr>
                  {modulo.features.map((feature, idx) => (
                    <tr
                      key={`${modulo.modulo}-${idx}`}
                      className="border-b border-slate-100 hover:bg-slate-50/50"
                    >
                      <td className="p-3 pl-6 text-slate-600">{feature.nombre}</td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.visual} />
                      </td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.estrategia} />
                      </td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.full} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stats section */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {PLAN_SLUGS.map((slug) => {
            const plan = PLAN_INFO[slug];
            const count = planStats[slug] || 0;
            return (
              <div key={slug} className="rounded-xl bg-white border border-slate-200 p-4 text-center">
                <div className="text-3xl font-bold text-slate-900">{count}</div>
                <div className="text-sm text-slate-500 mt-1">{plan.emoji} {plan.nombre}</div>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => navigate('/dashboard')}
                >
                  Ver clientes
                </Button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-8">
          Comparativa interna — Solo visible para administradores
        </p>
      </div>
    </div>
  );
}
