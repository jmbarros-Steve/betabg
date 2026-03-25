import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, ShoppingCart, CreditCard, CheckCircle, ArrowDown } from 'lucide-react';

export interface FunnelData {
  sessions: number | null;
  addToCarts: number | null;
  checkoutsInitiated: number;
  purchases: number;
}

interface ShopifyFunnelPanelProps {
  funnelData: FunnelData;
}

interface FunnelStep {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  barColor: string;
  estimated: boolean;
}

export function ShopifyFunnelPanel({ funnelData }: ShopifyFunnelPanelProps) {
  const steps = useMemo<FunnelStep[]>(() => {
    const purchases = funnelData.purchases || 0;
    const checkouts = funnelData.checkoutsInitiated || 0;

    // Estimate missing values based on industry averages if null
    const addToCarts = funnelData.addToCarts ?? (checkouts > 0 ? Math.round(checkouts * 2.5) : 0);
    const sessions = funnelData.sessions ?? (addToCarts > 0 ? Math.round(addToCarts * 5) : 0);

    if (sessions === 0 && purchases === 0) return [];

    return [
      { label: 'Visitas', value: sessions, icon: Eye, color: 'text-[#1E3A7B]', bgColor: 'bg-[#D6E0F0]', barColor: 'bg-[#2A4F9E]', estimated: funnelData.sessions === null },
      { label: 'Agregar al Carro', value: addToCarts, icon: ShoppingCart, color: 'text-purple-600', bgColor: 'bg-purple-100', barColor: 'bg-purple-500', estimated: funnelData.addToCarts === null },
      { label: 'Checkout', value: checkouts, icon: CreditCard, color: 'text-amber-600', bgColor: 'bg-amber-100', barColor: 'bg-amber-500', estimated: false },
      { label: 'Compras', value: purchases, icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', barColor: 'bg-green-500', estimated: false },
    ];
  }, [funnelData]);

  if (steps.length === 0) return null;

  const maxValue = steps[0].value || 1;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Funnel de Conversión
        </CardTitle>
        {(steps.some(s => s.estimated)) && (
          <p className="text-[10px] text-muted-foreground">* Valores estimados donde Shopify no reporta datos directos</p>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((step, i) => {
          const prevValue = i > 0 ? steps[i - 1].value : null;
          const conversionPct = prevValue && prevValue > 0
            ? ((step.value / prevValue) * 100).toFixed(1)
            : null;
          const widthPct = maxValue > 0 ? Math.max((step.value / maxValue) * 100, 4) : 4;
          const Icon = step.icon;

          return (
            <div key={step.label}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-0.5 pl-4">
                  <ArrowDown className="w-3 h-3 text-muted-foreground" />
                  {conversionPct && (
                    <span className={`text-xs font-medium ${parseFloat(conversionPct) >= 50 ? 'text-green-600' : parseFloat(conversionPct) >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
                      {conversionPct}% pasan al siguiente paso
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md ${step.bgColor} shrink-0`}>
                  <Icon className={`w-4 h-4 ${step.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {step.label}
                      {step.estimated && <span className="text-[10px] ml-1">*</span>}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{step.value.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${step.barColor}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Overall conversion */}
        {steps.length >= 4 && steps[0].value > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Conversión total (visita → compra)</span>
            <span className="text-sm font-bold text-green-600">
              {((steps[3].value / steps[0].value) * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
