import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Milk, Lightbulb, Ghost } from 'lucide-react';

interface SkuSale {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface ProductVariant {
  sku: string;
  price: number;
  cost: number | null;
}

interface Product {
  title: string;
  variants: ProductVariant[];
}

interface ProductMatrixPanelProps {
  products: Product[];
  allSkuSales: SkuSale[];
}

interface MatrixProduct {
  name: string;
  margin: number;
  velocity: number;
  revenue: number;
  units: number;
}

const QUADRANTS = [
  { key: 'star', label: 'Estrella', desc: 'Alto margen + alta velocidad', tip: 'Invertir más en publicidad de estos productos', icon: Star, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200', badgeColor: 'bg-green-100 text-green-700' },
  { key: 'cow', label: 'Vaca', desc: 'Alto margen + baja velocidad', tip: 'Aumentar visibilidad con campañas de remarketing', icon: Milk, color: 'text-[#1E3A7B]', bgColor: 'bg-[#F0F4FA] border-[#B5C8E0]', badgeColor: 'bg-[#D6E0F0] text-[#162D5F]' },
  { key: 'opportunity', label: 'Oportunidad', desc: 'Bajo margen + alta velocidad', tip: 'Subir precio o reducir costo para mejorar margen', icon: Lightbulb, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200', badgeColor: 'bg-amber-100 text-amber-700' },
  { key: 'zombie', label: 'Zombi', desc: 'Bajo margen + baja velocidad', tip: 'Evaluar descontinuar o hacer liquidación', icon: Ghost, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200', badgeColor: 'bg-red-100 text-red-700' },
] as const;

export function ProductMatrixPanel({ products, allSkuSales }: ProductMatrixPanelProps) {
  const matrix = useMemo(() => {
    if (!products.length || !allSkuSales.length) return null;

    // Build SKU → sales map
    const salesMap = new Map(allSkuSales.map(s => [s.sku, s]));

    // Build matrix products: cross products with sales
    const matrixProducts: MatrixProduct[] = [];

    for (const product of products) {
      for (const variant of product.variants) {
        if (!variant.sku || variant.cost === null) continue;
        const sales = salesMap.get(variant.sku);
        if (!sales || sales.quantity === 0) continue;

        const margin = variant.cost > 0 ? ((variant.price - variant.cost) / variant.price) * 100 : 0;
        matrixProducts.push({
          name: product.variants.length > 1 ? `${product.title} (${variant.sku})` : product.title,
          margin,
          velocity: sales.quantity,
          revenue: sales.revenue,
          units: sales.quantity,
        });
      }
    }

    if (matrixProducts.length < 2) return null;

    // Calculate medians
    const margins = matrixProducts.map(p => p.margin).sort((a, b) => a - b);
    const velocities = matrixProducts.map(p => p.velocity).sort((a, b) => a - b);
    const medianMargin = margins[Math.floor(margins.length / 2)];
    const medianVelocity = velocities[Math.floor(velocities.length / 2)];

    // Classify
    const classified: Record<string, MatrixProduct[]> = { star: [], cow: [], opportunity: [], zombie: [] };

    for (const p of matrixProducts) {
      const highMargin = p.margin >= medianMargin;
      const highVelocity = p.velocity >= medianVelocity;

      if (highMargin && highVelocity) classified.star.push(p);
      else if (highMargin && !highVelocity) classified.cow.push(p);
      else if (!highMargin && highVelocity) classified.opportunity.push(p);
      else classified.zombie.push(p);
    }

    // Sort each by revenue desc
    for (const key of Object.keys(classified)) {
      classified[key].sort((a, b) => b.revenue - a.revenue);
    }

    return { classified, medianMargin, medianVelocity };
  }, [products, allSkuSales]);

  if (!matrix) return null;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Star className="w-4 h-4" />
          Matriz de Productos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Clasificación automática basada en margen (mediana: {matrix.medianMargin.toFixed(0)}%) y velocidad de venta (mediana: {matrix.medianVelocity.toFixed(0)} uds)
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANTS.map(q => {
            const items = matrix.classified[q.key];
            const Icon = q.icon;
            return (
              <div key={q.key} className={`p-3 rounded-lg border ${q.bgColor}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${q.color}`} />
                  <span className="font-semibold text-sm">{q.label}</span>
                  <Badge className={`text-xs ${q.badgeColor}`}>{items.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{q.desc}</p>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sin productos en esta categoría</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {items.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate flex-1">{p.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{p.margin.toFixed(0)}%</span>
                          <span className="font-medium">{p.units} uds</span>
                          <span className="font-semibold">${Math.round(p.revenue).toLocaleString('es-CL')}</span>
                        </div>
                      </div>
                    ))}
                    {items.length > 5 && (
                      <p className="text-xs text-muted-foreground">+{items.length - 5} más</p>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-current/10 italic">{q.tip}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
