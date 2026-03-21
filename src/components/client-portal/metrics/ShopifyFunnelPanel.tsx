import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, ShoppingCart, CreditCard, CheckCircle, ArrowRight, ChevronDown } from 'lucide-react';

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
  value: number | null;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

export function ShopifyFunnelPanel({ funnelData }: ShopifyFunnelPanelProps) {
  const steps: FunnelStep[] = [
    { label: 'Sesiones', value: funnelData.sessions, icon: Eye, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { label: 'Agregar al Carro', value: funnelData.addToCarts, icon: ShoppingCart, color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { label: 'Checkout', value: funnelData.checkoutsInitiated, icon: CreditCard, color: 'text-amber-600', bgColor: 'bg-amber-100' },
    { label: 'Compras', value: funnelData.purchases, icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
  ];

  // Filter out steps with null values (sessions/addToCarts may be unavailable)
  const activeSteps = steps.filter(s => s.value !== null);

  if (activeSteps.length < 2) return null;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Funnel de Conversión
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop: horizontal */}
        <div className="hidden md:flex items-stretch gap-2">
          {activeSteps.map((step, i) => {
            const prevValue = i > 0 ? activeSteps[i - 1].value! : null;
            const conversionPct = prevValue && prevValue > 0 && step.value !== null
              ? ((step.value / prevValue) * 100).toFixed(1)
              : null;
            const dropPct = conversionPct ? (100 - parseFloat(conversionPct)).toFixed(1) : null;
            const Icon = step.icon;

            return (
              <div key={step.label} className="flex items-center flex-1 min-w-0">
                {i > 0 && (
                  <div className="flex flex-col items-center mx-1 shrink-0">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1.5 rounded-md ${step.bgColor}`}>
                            <Icon className={`w-3.5 h-3.5 ${step.color}`} />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground truncate">{step.label}</span>
                        </div>
                        <p className="text-xl font-bold tabular-nums">
                          {step.value!.toLocaleString('es-CL')}
                        </p>
                        {conversionPct && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs font-medium text-green-600">{conversionPct}%</span>
                            {dropPct && parseFloat(dropPct) > 0 && (
                              <span className="text-xs text-red-500 flex items-center">
                                <ChevronDown className="w-3 h-3" />
                                {dropPct}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{step.label}: {step.value!.toLocaleString('es-CL')}</p>
                      {conversionPct && <p>Conversión desde paso anterior: {conversionPct}%</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            );
          })}
        </div>

        {/* Mobile: vertical */}
        <div className="md:hidden space-y-2">
          {activeSteps.map((step, i) => {
            const prevValue = i > 0 ? activeSteps[i - 1].value! : null;
            const conversionPct = prevValue && prevValue > 0 && step.value !== null
              ? ((step.value / prevValue) * 100).toFixed(1)
              : null;
            const dropPct = conversionPct ? (100 - parseFloat(conversionPct)).toFixed(1) : null;
            const Icon = step.icon;

            return (
              <div key={step.label}>
                {i > 0 && (
                  <div className="flex justify-center py-1">
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div className={`p-2 rounded-lg ${step.bgColor}`}>
                    <Icon className={`w-4 h-4 ${step.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{step.label}</p>
                    <p className="text-lg font-bold tabular-nums">{step.value!.toLocaleString('es-CL')}</p>
                  </div>
                  {conversionPct && (
                    <div className="text-right">
                      <span className="text-sm font-medium text-green-600">{conversionPct}%</span>
                      {dropPct && parseFloat(dropPct) > 0 && (
                        <p className="text-xs text-red-500">{dropPct}% caída</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
