import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FolderOpen, RefreshCw } from 'lucide-react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface CollectionRevenue {
  id: number;
  title: string;
  image: string | null;
  revenue: number;
  orders: number;
  avgMargin: number;
  productCount: number;
}

interface CollectionRevenuePanelProps {
  connectionId: string;
}

export function CollectionRevenuePanel({ connectionId }: CollectionRevenuePanelProps) {
  const [collections, setCollections] = useState<CollectionRevenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchCollectionRevenue = async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('collection-revenue', {
        body: { connectionId },
      });
      if (error) {
        toast.error('Error al cargar colecciones: ' + error);
        return;
      }
      setCollections(data?.collections || []);
      setLoaded(true);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const maxRevenue = collections.length > 0 ? Math.max(...collections.map(c => c.revenue)) : 0;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Colecciones por Revenue
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCollectionRevenue}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {loaded ? 'Actualizar' : 'Calcular'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!loaded && !loading ? (
          <div className="text-center py-6 text-muted-foreground">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Haz clic en "Calcular" para ver revenue por colección</p>
            <p className="text-xs mt-1">Cruza colecciones con ventas del período</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : collections.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin colecciones con ventas</p>
        ) : (
          <div className="space-y-3">
            {collections.map((col, i) => {
              const pct = maxRevenue > 0 ? (col.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={col.id} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right">{i + 1}</span>
                    {col.image ? (
                      <img src={col.image} alt={col.title} className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{col.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{col.orders} pedidos</span>
                        <span>{col.productCount} productos</span>
                        {col.avgMargin > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {col.avgMargin.toFixed(0)}% margen
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-sm whitespace-nowrap">${Math.round(col.revenue).toLocaleString('es-CL')}</span>
                  </div>
                  <div className="ml-9 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
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
