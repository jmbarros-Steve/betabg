import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfitLossData {
  grossRevenue: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  
  metaSpend: number;
  googleSpend: number;
  totalAdSpend: number;
  
  shopifyCost: number;
  klaviyoCost: number;
  otherFixedCosts: number;
  totalFixedCosts: number;
  
  paymentGatewayFees: number;
  
  netProfit: number;
  netProfitMargin: number;
}

interface ProfitLossPanelProps {
  data: ProfitLossData;
  previousData?: ProfitLossData;
  currency?: string;
  periodLabel?: string;
}

function formatCurrency(value: number, currency: string = 'CLP'): string {
  return `$${value.toLocaleString('es-CL')}`;
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

export function ProfitLossPanel({ data, previousData, currency = 'CLP', periodLabel = 'Período actual' }: ProfitLossPanelProps) {
  const isNetProfitPositive = data.netProfit >= 0;

  return (
    <Card className="glow-box">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Estado de Resultados
        </CardTitle>
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Ingresos Brutos</span>
            <span className="font-semibold">
              {formatCurrency(data.grossRevenue, currency)}
              <ChangeIndicator current={data.grossRevenue} previous={previousData?.grossRevenue} />
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">(-) IVA / Impuestos</span>
            <span className="text-sm">{formatCurrency(data.grossRevenue - data.netRevenue, currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Ingresos Netos</span>
            <span className="font-semibold">{formatCurrency(data.netRevenue, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Cost of Goods */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm">(-) Costo de Productos</span>
            <span className="text-sm text-destructive">-{formatCurrency(data.costOfGoods, currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Utilidad Bruta</span>
            <span className="font-semibold text-primary">{formatCurrency(data.grossProfit, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Marketing Expenses */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Inversión en Marketing</p>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">Meta Ads</span>
            <span className="text-sm text-destructive">-{formatCurrency(data.metaSpend, currency)}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">Google Ads</span>
            <span className="text-sm text-destructive">-{formatCurrency(data.googleSpend, currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Marketing</span>
            <span className="font-medium text-destructive">-{formatCurrency(data.totalAdSpend, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Fixed Costs */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Costos Fijos</p>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">Shopify</span>
            <span className="text-sm text-destructive">-{formatCurrency(data.shopifyCost, currency)}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm pl-4">Klaviyo</span>
            <span className="text-sm text-destructive">-{formatCurrency(data.klaviyoCost, currency)}</span>
          </div>
          {data.otherFixedCosts > 0 && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-sm pl-4">Otros</span>
              <span className="text-sm text-destructive">-{formatCurrency(data.otherFixedCosts, currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Costos Fijos</span>
            <span className="font-medium text-destructive">-{formatCurrency(data.totalFixedCosts, currency)}</span>
          </div>
        </div>

        <Separator />

        {/* Payment Gateway */}
        <div className="flex justify-between items-center text-muted-foreground">
          <span className="text-sm">(-) Comisiones Pasarela</span>
          <span className="text-sm text-destructive">-{formatCurrency(data.paymentGatewayFees, currency)}</span>
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
            <span className={cn('text-xl font-bold', isNetProfitPositive ? 'text-primary' : 'text-destructive')}>
              {isNetProfitPositive ? '' : '-'}
              {formatCurrency(Math.abs(data.netProfit), currency)}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-sm">Margen Neto</span>
            <span className={cn('text-sm font-medium', isNetProfitPositive ? 'text-primary' : 'text-destructive')}>
              {data.netProfitMargin.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
