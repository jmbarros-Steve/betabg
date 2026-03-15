import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, BarChart3, Target, Award, Loader2, Lightbulb } from 'lucide-react';

interface IndustryBenchmarksPanelProps {
  clientId: string;
}

interface BenchmarkData {
  client_metrics: {
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
    unsubscribe_rate: number;
    conversion_rate: number;
    total_sent: number;
  };
  industry_avg: {
    ecommerce: {
      open_rate: number;
      click_rate: number;
      bounce_rate: number;
      unsubscribe_rate: number;
      conversion_rate: number;
    };
    retail: { open_rate: number; click_rate: number };
    saas: { open_rate: number; click_rate: number };
  };
  top_performers: {
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
    unsubscribe_rate: number;
  };
  percentile_estimates: {
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
    unsubscribe_rate: number;
    overall: number;
  };
}

type MetricKey = 'open_rate' | 'click_rate' | 'bounce_rate' | 'unsubscribe_rate';

const METRIC_LABELS: Record<MetricKey, string> = {
  open_rate: 'Tasa de apertura',
  click_rate: 'Tasa de clicks',
  bounce_rate: 'Tasa de rebote',
  unsubscribe_rate: 'Tasa de desuscripcion',
};

const TIPS: Record<MetricKey, { condition: 'below' | 'above'; message: string }> = {
  open_rate: { condition: 'below', message: 'Mejora tus subject lines, prueba A/B testing con diferentes asuntos y preheaders.' },
  click_rate: { condition: 'below', message: 'Agrega CTAs mas visibles, usa botones en vez de links y reduce la cantidad de texto.' },
  bounce_rate: { condition: 'above', message: 'Limpia tu lista de contactos, verifica emails antes de enviar y elimina direcciones invalidas.' },
  unsubscribe_rate: { condition: 'above', message: 'Reduce la frecuencia de envio, segmenta mejor tu audiencia y ofrece contenido mas relevante.' },
};

export function IndustryBenchmarksPanel({ clientId }: IndustryBenchmarksPanelProps) {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBenchmarks = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await callApi<BenchmarkData>('email-campaign-analytics', {
        body: { action: 'industry_benchmarks', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No se pudieron cargar los benchmarks.
        </CardContent>
      </Card>
    );
  }

  const { client_metrics, industry_avg, top_performers, percentile_estimates } = data;
  const ecom = industry_avg.ecommerce;

  const metrics: MetricKey[] = ['open_rate', 'click_rate', 'bounce_rate', 'unsubscribe_rate'];

  const isAboveAvg = (metric: MetricKey): boolean => {
    const lowerIsBetter = metric === 'bounce_rate' || metric === 'unsubscribe_rate';
    if (lowerIsBetter) return client_metrics[metric] <= ecom[metric];
    return client_metrics[metric] >= ecom[metric];
  };

  // Determine which tips to show
  const activeTips = metrics.filter((m) => {
    const above = isAboveAvg(m);
    const tip = TIPS[m];
    return (tip.condition === 'below' && !above) || (tip.condition === 'above' && !above);
  });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const above = isAboveAvg(metric);
          const clientVal = client_metrics[metric];
          const avgVal = ecom[metric];
          const diff = Math.abs(clientVal - avgVal);

          return (
            <Card key={metric}>
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{METRIC_LABELS[metric]}</span>
                  {above ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="text-2xl font-bold">{clientVal.toFixed(2)}%</div>
                <div className={`text-xs mt-1 ${above ? 'text-green-600' : 'text-red-600'}`}>
                  {above ? '+' : '-'}{diff.toFixed(2)}% vs industria
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Percentile card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Tu posicion en la industria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-primary">
              Top {Math.max(1, 100 - percentile_estimates.overall)}%
            </div>
            <div className="text-sm text-muted-foreground">
              Estas en el <span className="font-semibold text-foreground">top {Math.max(1, 100 - percentile_estimates.overall)}%</span> de marcas de e-commerce
              basado en tus metricas de los ultimos 30 dias.
              {client_metrics.total_sent === 0 && (
                <span className="block mt-1 text-amber-600">Aun no tienes envios en los ultimos 30 dias.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bar chart comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Comparacion con la industria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {metrics.map((metric) => {
            const clientVal = client_metrics[metric];
            const avgVal = ecom[metric];
            const topVal = top_performers[metric];
            const above = isAboveAvg(metric);

            // Determine max value for scaling bars
            const maxVal = Math.max(clientVal, avgVal, topVal, 0.01);
            const scale = (val: number) => Math.max(2, (val / maxVal) * 100);

            return (
              <div key={metric}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{METRIC_LABELS[metric]}</span>
                  <Badge variant={above ? 'default' : 'destructive'} className="text-xs">
                    {above ? 'Sobre promedio' : 'Bajo promedio'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {/* Client bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-24 text-right text-muted-foreground">Tu marca</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${above ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${scale(clientVal)}%` }}
                      />
                    </div>
                    <span className="text-xs w-14 font-mono font-medium">{clientVal.toFixed(2)}%</span>
                  </div>
                  {/* Industry average bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-24 text-right text-muted-foreground">Promedio</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-400 transition-all duration-500"
                        style={{ width: `${scale(avgVal)}%` }}
                      />
                    </div>
                    <span className="text-xs w-14 font-mono text-muted-foreground">{avgVal.toFixed(2)}%</span>
                  </div>
                  {/* Top performers bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-24 text-right text-muted-foreground">Top 25%</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${scale(topVal)}%` }}
                      />
                    </div>
                    <span className="text-xs w-14 font-mono text-amber-600">{topVal.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Tips section */}
      {activeTips.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              Recomendaciones para mejorar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeTips.map((metric) => (
              <div key={metric} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Lightbulb className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{METRIC_LABELS[metric]}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{TIPS[metric].message}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
