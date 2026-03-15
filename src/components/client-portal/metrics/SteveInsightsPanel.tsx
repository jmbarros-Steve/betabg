import { useState, useEffect } from "react";
import { Brain, TrendingUp, AlertTriangle, Zap, ChevronRight } from "lucide-react";

interface Insight {
  type: "positive" | "warning" | "action";
  title: string;
  description: string;
}

interface SteveInsightsPanelProps {
  revenue?: number;
  adSpend?: number;
  roas?: number;
  orders?: number;
  previousRevenue?: number;
  previousOrders?: number;
}

export function SteveInsightsPanel({
  revenue = 0,
  adSpend = 0,
  roas = 0,
  orders = 0,
  previousRevenue = 0,
  previousOrders = 0,
}: SteveInsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [analyzing, setAnalyzing] = useState(true);

  useEffect(() => {
    // Generate insights based on actual metrics
    const timer = setTimeout(() => {
      const generated: Insight[] = [];

      const revenueChange = previousRevenue > 0
        ? ((revenue - previousRevenue) / previousRevenue) * 100
        : 0;
      const ordersChange = previousOrders > 0
        ? ((orders - previousOrders) / previousOrders) * 100
        : 0;

      if (revenueChange > 10) {
        generated.push({
          type: "positive",
          title: `Revenue creció ${revenueChange.toFixed(0)}%`,
          description: "Tendencia positiva sostenida. Considera escalar las campañas que mejor convierten",
        });
      } else if (revenueChange < -5) {
        generated.push({
          type: "warning",
          title: `Revenue bajó ${Math.abs(revenueChange).toFixed(0)}%`,
          description: "Revisa tus campañas activas y verifica que no haya problemas de inventario o precio",
        });
      }

      if (roas > 4) {
        generated.push({
          type: "positive",
          title: `ROAS de ${roas.toFixed(1)}x — excelente`,
          description: "Estás generando buen retorno. Aumenta presupuesto gradualmente para escalar",
        });
      } else if (roas > 0 && roas < 2) {
        generated.push({
          type: "warning",
          title: `ROAS de ${roas.toFixed(1)}x — bajo`,
          description: "Optimiza audiencias o pausa campañas con ROAS menor a 1.5x",
        });
      }

      if (adSpend > 0 && orders > 0) {
        const cac = adSpend / orders;
        generated.push({
          type: "action",
          title: `CAC actual: $${Math.round(cac).toLocaleString("es-CL")}`,
          description: "Prueba audiencias lookalike o retargeting para reducir el costo de adquisición",
        });
      }

      if (ordersChange > 15) {
        generated.push({
          type: "positive",
          title: `Pedidos subieron ${ordersChange.toFixed(0)}%`,
          description: "Más clientes están comprando. Activa flows de post-compra para retención",
        });
      }

      // Always show at least one insight
      if (generated.length === 0) {
        generated.push({
          type: "action",
          title: "Conecta más plataformas",
          description: "Mientras más datos tenga Steve, mejores serán las recomendaciones",
        });
      }

      setInsights(generated.slice(0, 3));
      setAnalyzing(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [revenue, adSpend, roas, orders, previousRevenue, previousOrders]);

  const tagStyles = {
    positive: "bg-green-500/15 text-green-400",
    warning: "bg-amber-500/15 text-amber-400",
    action: "bg-indigo-500/15 text-indigo-300",
  };

  const tagIcons = {
    positive: TrendingUp,
    warning: AlertTriangle,
    action: Zap,
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/15 bg-gradient-to-br from-indigo-500/[0.08] to-purple-500/[0.04] p-6">
      {/* Pulsing background glow */}
      <div className="absolute -top-1/2 -right-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(99,102,241,0.05),transparent_50%)] animate-pulse pointer-events-none" />

      {/* AI Orb */}
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-500 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
          <Brain className="h-5 w-5 text-white" />
        </div>

        <h3 className="text-sm font-bold mb-1">Steve Insights</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {analyzing ? (
            <span className="inline-flex items-center gap-1.5">
              Analizando datos
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
              </span>
            </span>
          ) : (
            `${insights.length} recomendaciones basadas en tus datos`
          )}
        </p>

        <div className="space-y-2">
          {insights.map((insight, i) => {
            const TagIcon = tagIcons[insight.type];
            return (
              <div
                key={i}
                className="group bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 hover:bg-white/[0.06] hover:border-indigo-500/20 transition-all cursor-default"
              >
                <div className="flex items-start gap-2">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${tagStyles[insight.type]}`}>
                    <TagIcon className="h-2.5 w-2.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.description}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
