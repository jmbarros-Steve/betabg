import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/client-portal/EmptyState';

export interface SkuData {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface TopSkusPanelProps {
  skus: SkuData[];
  currency?: string;
}

export function TopSkusPanel({ skus, currency = 'CLP' }: TopSkusPanelProps) {
  const maxQuantity = Math.max(...skus.map((s) => s.quantity), 1);

  return (
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4" />
          Top SKUs Vendidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {skus.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Sin datos de productos"
            description="Conecta tu Shopify para ver tus productos más vendidos"
          />
        ) : (
          <div className="space-y-4">
            {skus.slice(0, 10).map((sku, index) => (
              <div key={sku.sku} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{sku.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{sku.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{sku.quantity.toLocaleString('es-CL')} uds</p>
                    <p className="text-xs text-muted-foreground">
                      ${sku.revenue.toLocaleString('es-CL')} {currency}
                    </p>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(sku.quantity / maxQuantity) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
