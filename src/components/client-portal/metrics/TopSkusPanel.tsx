import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const MEDAL_COLORS = [
  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' }, // gold
  { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' }, // silver
  { bg: '#FED7AA', border: '#D97706', text: '#78350F' }, // bronze
] as const;

export function TopSkusPanel({ skus, currency = 'CLP' }: TopSkusPanelProps) {
  const maxQuantity = skus.length > 0 ? Math.max(...skus.map((s) => s.quantity), 1) : 1;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover chart-animate">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="w-4 h-4" />
          Top 10 Productos Vendidos
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
            {skus.slice(0, 10).map((sku, index) => {
              const medal = index < 3 ? MEDAL_COLORS[index] : null;
              return (
                <div key={sku.sku} className="space-y-2 rounded-lg px-1 py-0.5 transition-all duration-200 hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {medal ? (
                        <div
                          className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0"
                          style={{ backgroundColor: medal.bg, border: `1.5px solid ${medal.border}`, color: medal.text }}
                        >
                          {index + 1}
                        </div>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium text-muted-foreground border border-border shrink-0">
                          {index + 1}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm line-clamp-1" title={sku.name}>{sku.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{sku.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {sku.quantity.toLocaleString('es-CL')} uds
                      </p>
                      <p className="text-xs text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${sku.revenue.toLocaleString('es-CL')} {currency}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(sku.quantity / maxQuantity) * 100}%`,
                        background: `linear-gradient(90deg, #2563EB, #F97316)`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
