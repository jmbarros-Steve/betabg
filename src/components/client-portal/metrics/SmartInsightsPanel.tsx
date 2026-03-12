import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, ArrowRight, ShoppingCart, DollarSign, Target, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightData {
  totalRevenue: number;
  totalOrders: number;
  totalSpend: number;
  roas: number;
  breakEvenRoas: number;
  netProfit: number;
  netProfitMargin: number;
  aov: number;
  conversionRate?: number;
  repeatCustomerRate?: number;
  abandonedCartsCount: number;
  abandonedCartsValue: number;
  previousRevenue?: number;
  previousOrders?: number;
  previousSpend?: number;
}

interface SmartInsightsPanelProps {
  data: InsightData;
}

type InsightType = 'success' | 'warning' | 'danger' | 'tip';

interface Insight {
  type: InsightType;
  icon: React.ElementType;
  title: string;
  message: string;
  action?: string;
  priority: number; // lower = more important
}

const typeStyles: Record<InsightType, { bg: string; border: string; iconColor: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-600' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-600' },
  tip: { bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-600' },
};

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

export function SmartInsightsPanel({ data }: SmartInsightsPanelProps) {
  const insights = useMemo(() => {
    const list: Insight[] = [];

    // 1. Profitability check
    if (data.totalRevenue > 0 && data.totalSpend > 0 && data.breakEvenRoas > 0) {
      if (data.roas >= data.breakEvenRoas) {
        const margin = ((data.roas - data.breakEvenRoas) / data.breakEvenRoas * 100).toFixed(0);
        list.push({
          type: 'success',
          icon: CheckCircle,
          title: 'Operación rentable',
          message: `Tu ROAS (${data.roas.toFixed(1)}x) está ${margin}% sobre tu punto de equilibrio (${data.breakEvenRoas.toFixed(1)}x). Estás ganando dinero con tu publicidad.`,
          action: 'Puedes considerar aumentar tu inversión publicitaria gradualmente para escalar.',
          priority: 1,
        });
      } else {
        list.push({
          type: 'danger',
          icon: AlertTriangle,
          title: 'Publicidad bajo el punto de equilibrio',
          message: `Tu ROAS (${data.roas.toFixed(1)}x) está por debajo del mínimo necesario (${data.breakEvenRoas.toFixed(1)}x). Estás perdiendo dinero por cada peso invertido en ads.`,
          action: 'Revisa tus campañas: pausa las de bajo rendimiento y concentra presupuesto en las que mejor convierten.',
          priority: 0,
        });
      }
    }

    // 2. Abandoned carts opportunity
    if (data.abandonedCartsCount > 0) {
      const recoverable = Math.round(data.abandonedCartsValue * 0.12);
      if (recoverable > 0) {
        list.push({
          type: data.abandonedCartsCount > 10 ? 'warning' : 'tip',
          icon: ShoppingCart,
          title: `${data.abandonedCartsCount} carritos abandonados`,
          message: `Hay ${fmt(data.abandonedCartsValue)} en carritos sin recuperar. Con una tasa de recuperación del 12%, podrías rescatar aproximadamente ${fmt(recoverable)}.`,
          action: 'Contacta a estos clientes por WhatsApp o email. Los primeros 30 minutos son clave.',
          priority: 2,
        });
      }
    }

    // 3. AOV optimization
    if (data.aov > 0 && data.totalOrders >= 5) {
      const targetAov = Math.ceil(data.aov * 1.15 / 1000) * 1000; // Round up to nearest 1000
      const additionalRevenue = (targetAov - data.aov) * data.totalOrders;
      list.push({
        type: 'tip',
        icon: DollarSign,
        title: `Ticket promedio: ${fmt(data.aov)}`,
        message: `Si logras subir tu ticket promedio a ${fmt(targetAov)} (+15%), ganarías ${fmt(additionalRevenue)} adicionales con las mismas ventas.`,
        action: 'Prueba ofertas tipo "envío gratis sobre X", bundles de productos, o upsells en el checkout.',
        priority: 4,
      });
    }

    // 4. Revenue trend
    if (data.previousRevenue && data.previousRevenue > 0 && data.totalRevenue > 0) {
      const change = ((data.totalRevenue - data.previousRevenue) / data.previousRevenue) * 100;
      if (change > 10) {
        list.push({
          type: 'success',
          icon: TrendingUp,
          title: `Ingresos creciendo ${change.toFixed(0)}%`,
          message: `Pasaste de ${fmt(data.previousRevenue)} a ${fmt(data.totalRevenue)} respecto al período anterior. ¡Buen trabajo!`,
          priority: 3,
        });
      } else if (change < -10) {
        list.push({
          type: 'warning',
          icon: TrendingDown,
          title: `Ingresos cayeron ${Math.abs(change).toFixed(0)}%`,
          message: `Pasaste de ${fmt(data.previousRevenue)} a ${fmt(data.totalRevenue)}. Esto puede ser estacional o indicar un problema.`,
          action: 'Revisa si hubo cambios en campañas, stock, o competencia. Compara con el mismo período del año anterior.',
          priority: 1,
        });
      }
    }

    // 5. Repeat customers
    if (data.repeatCustomerRate !== undefined && data.repeatCustomerRate >= 0) {
      if (data.repeatCustomerRate < 15) {
        list.push({
          type: 'warning',
          icon: Users,
          title: `Solo ${data.repeatCustomerRate.toFixed(0)}% de clientes repiten`,
          message: 'Un negocio sano tiene al menos 20-30% de clientes recurrentes. Tus clientes compran una vez y no vuelven.',
          action: 'Implementa email post-compra, programa de fidelización, o descuento para segunda compra.',
          priority: 3,
        });
      } else if (data.repeatCustomerRate >= 25) {
        list.push({
          type: 'success',
          icon: Users,
          title: `${data.repeatCustomerRate.toFixed(0)}% de clientes recurrentes`,
          message: 'Excelente retención. Tus clientes confían en tu marca y vuelven a comprar.',
          priority: 5,
        });
      }
    }

    // 6. Conversion rate
    if (data.conversionRate !== undefined && data.conversionRate > 0) {
      if (data.conversionRate < 1.5) {
        list.push({
          type: 'warning',
          icon: Target,
          title: `Conversión baja: ${data.conversionRate.toFixed(1)}%`,
          message: 'El promedio en ecommerce es 2-3%. Muchos visitantes llegan pero no compran.',
          action: 'Revisa velocidad de carga, claridad de precios, opciones de pago, y fotos de productos.',
          priority: 2,
        });
      }
    }

    // 7. No ad spend but has revenue
    if (data.totalSpend === 0 && data.totalRevenue > 0) {
      list.push({
        type: 'tip',
        icon: Zap,
        title: 'Ventas sin publicidad',
        message: `Estás generando ${fmt(data.totalRevenue)} sin inversión en ads. Esto es tráfico orgánico o directo.`,
        action: 'Considera invertir en publicidad para multiplicar estas ventas. Un presupuesto inicial de 10-15% de tus ingresos es un buen punto de partida.',
        priority: 4,
      });
    }

    // 8. Net profit margin check
    if (data.totalRevenue > 0 && data.netProfitMargin !== 0) {
      if (data.netProfitMargin < 5 && data.netProfitMargin > 0) {
        list.push({
          type: 'warning',
          icon: AlertTriangle,
          title: `Margen neto muy ajustado: ${data.netProfitMargin.toFixed(1)}%`,
          message: 'Estás ganando dinero, pero por muy poco. Cualquier variación en costos podría dejarte en negativo.',
          action: 'Revisa tus costos fijos, negocia mejores precios con proveedores, o evalúa subir precios.',
          priority: 2,
        });
      }
    }

    return list.sort((a, b) => a.priority - b.priority).slice(0, 4);
  }, [data]);

  if (insights.length === 0) return null;

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          Steve te recomienda
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Análisis automático basado en tus datos reales
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((insight, i) => {
            const styles = typeStyles[insight.type];
            return (
              <div
                key={i}
                className={cn(
                  'p-4 rounded-xl border transition-all',
                  styles.bg,
                  styles.border,
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('mt-0.5 shrink-0', styles.iconColor)}>
                    <insight.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-sm leading-tight">{insight.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{insight.message}</p>
                    {insight.action && (
                      <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-current/10">
                        <ArrowRight className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', styles.iconColor)} />
                        <p className={cn('text-xs font-medium leading-relaxed', styles.iconColor)}>
                          {insight.action}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
