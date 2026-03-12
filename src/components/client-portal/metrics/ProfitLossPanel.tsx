import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProductMarginItem {
  title: string;
  image: string | null;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  quantity: number;
}

interface FixedCostItem {
  name: string;
  amount: number;
}

interface ProfitLossData {
  grossRevenue: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;

  metaSpend: number;
  googleSpend: number;
  manualGoogleSpend: number;
  totalAdSpend: number;

  fixedCostItems: FixedCostItem[];
  totalFixedCosts: number;

  paymentGatewayFees: number;
  shippingCosts: number;
  shopifyCommission: number;

  netProfit: number;
  netProfitMargin: number;
}

interface ProfitLossPanelProps {
  data: ProfitLossData;
  previousData?: ProfitLossData;
  currency?: string;
  periodLabel?: string;
  productBreakdown?: ProductMarginItem[];
}

function formatCurrency(value: number, currency: string = 'CLP'): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

function ChangeIndicator({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === 0) return null;
  
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const isPositive = change > 0;
  
  return (
    <span className={cn('text-xs ml-2', isPositive ? 'text-primary' : 'text-destructive')}>
      {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export function ProfitLossPanel({ data, previousData, currency = 'CLP', periodLabel = 'Período actual', productBreakdown }: ProfitLossPanelProps) {
  const isNetProfitPositive = data.netProfit >= 0;
  const [showProductDetail, setShowProductDetail] = useState(false);

  return (
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Estado de Resultados
          <span className="ml-auto text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded">CLP</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Ingresos Brutos</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(data.grossRevenue, currency)}
              <ChangeIndicator current={data.grossRevenue} previous={previousData?.grossRevenue} />
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">(-) IVA / Impuestos</span>
            <span className="text-sm tabular-nums">{formatCurrency(data.grossRevenue - data.netRevenue, currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Ingresos Netos</span>
            <span className="font-semibold tabular-nums">{formatCurrency(data.netRevenue, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Cost of Goods with expandable product detail */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm">(-) Costo de Productos</span>
            <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.costOfGoods, currency)}</span>
          </div>
          
          <Collapsible open={showProductDetail} onOpenChange={setShowProductDetail}>
            <div className="flex justify-between items-center">
              <CollapsibleTrigger asChild>
                <button className="text-sm font-medium flex items-center gap-1.5 hover:text-primary transition-colors group cursor-pointer">
                  {showProductDetail ? (
                    <ChevronDown className="w-4 h-4 text-primary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  )}
                  Utilidad Bruta
                  {productBreakdown && productBreakdown.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({productBreakdown.length} productos)
                    </span>
                  )}
                </button>
              </CollapsibleTrigger>
              <span className="font-semibold tabular-nums text-primary">{formatCurrency(data.grossProfit, currency)}</span>
            </div>

            <CollapsibleContent>
              {productBreakdown && productBreakdown.length > 0 ? (
                <div className="mt-3 space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs text-muted-foreground pb-1 border-b border-border/50 px-1">
                    <span>Producto</span>
                    <span className="text-right w-20">Ingreso</span>
                    <span className="text-right w-20">Costo</span>
                    <span className="text-right w-16">Margen</span>
                  </div>
                  {productBreakdown.map((product, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-xs py-1.5 px-1 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="truncate">{product.title}</span>
                      </div>
                      <span className="text-right w-20 font-mono">
                        {formatCurrency(product.revenue)}
                      </span>
                      <span className="text-right w-20 font-mono text-destructive">
                        -{formatCurrency(product.cost)}
                      </span>
                      <span className={cn(
                        'text-right w-16 font-mono font-medium',
                        product.marginPercent >= 30 ? 'text-primary' : product.marginPercent >= 15 ? 'text-yellow-600' : 'text-destructive'
                      )}>
                        {product.marginPercent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 pl-6">
                  Carga los productos en Configuración para ver el detalle por producto.
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator />

        {/* Marketing Expenses */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Inversión en Marketing</p>
          {data.metaSpend > 0 && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-sm pl-4">Meta Ads</span>
              <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.metaSpend, currency)}</span>
            </div>
          )}
          {data.googleSpend > 0 && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-sm pl-4">Google Ads</span>
              <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.googleSpend, currency)}</span>
            </div>
          )}
          {data.manualGoogleSpend > 0 && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-sm pl-4">Google Ads (manual)</span>
              <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.manualGoogleSpend, currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Marketing</span>
            <span className="font-semibold tabular-nums text-destructive">-{formatCurrency(data.totalAdSpend, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Fixed Costs - Dynamic */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Costos Fijos (prorrateados)</p>
          {data.fixedCostItems.map((item, idx) => (
            item.amount > 0 && (
              <div key={idx} className="flex justify-between items-center text-muted-foreground">
                <span className="text-sm pl-4">{item.name || 'Sin nombre'}</span>
                <span className="text-sm tabular-nums text-destructive">-{formatCurrency(item.amount, currency)}</span>
              </div>
            )
          ))}
          {data.totalFixedCosts > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Costos Fijos</span>
              <span className="font-semibold tabular-nums text-destructive">-{formatCurrency(data.totalFixedCosts, currency)}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Operational Costs */}
        {(data.shippingCosts > 0 || data.shopifyCommission > 0) && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Costos Operacionales</p>
            {data.shippingCosts > 0 && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-sm pl-4">Despachos</span>
                <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.shippingCosts, currency)}</span>
              </div>
            )}
            {data.shopifyCommission > 0 && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="text-sm pl-4">Comisión Shopify</span>
                <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.shopifyCommission, currency)}</span>
              </div>
            )}
          </div>
        )}

        {(data.shippingCosts > 0 || data.shopifyCommission > 0) && <Separator />}

        {/* Payment Gateway */}
        <div className="flex justify-between items-center text-muted-foreground">
          <span className="text-sm">(-) Comisiones Pasarela</span>
          <span className="text-sm tabular-nums text-destructive">-{formatCurrency(data.paymentGatewayFees, currency)}</span>
        </div>

        <Separator className="border-2" />

        {/* Net Profit */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold flex items-center gap-2">
              {isNetProfitPositive ? (
                <TrendingUp className="w-5 h-5 text-primary" />
              ) : (
                <TrendingDown className="w-5 h-5 text-destructive" />
              )}
              Utilidad Neta
            </span>
            <span className={cn('text-xl font-bold tabular-nums', isNetProfitPositive ? 'text-primary' : 'text-destructive')}>
              {isNetProfitPositive ? '' : '-'}
              {formatCurrency(Math.abs(data.netProfit), currency)}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm">Margen Neto</span>
            <span className={cn('text-sm font-medium tabular-nums', isNetProfitPositive ? 'text-primary' : 'text-destructive')}>
              {data.netProfitMargin.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
