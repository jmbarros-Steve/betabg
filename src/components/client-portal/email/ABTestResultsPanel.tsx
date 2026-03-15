import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Trophy,
  Mail,
  MousePointerClick,
  Eye,
  DollarSign,
  Send,
  Loader2,
  RefreshCw,
  BarChart3,
  FlaskConical,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface ABTestResultsPanelProps {
  campaignId: string;
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface VariantStats {
  sent: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
  open_rate: string;
  click_rate: string;
}

interface ABTest {
  id: string;
  campaign_id: string;
  client_id: string;
  variant_b_subject: string | null;
  variant_b_preview_text: string | null;
  test_percentage: number;
  winning_metric: string;
  test_duration_hours: number;
  status: string;
  winner: string | null;
  winner_selected_at: string | null;
  created_at: string;
}

interface ABTestResults {
  test: ABTest;
  results: {
    variant_a: VariantStats;
    variant_b: VariantStats;
  };
}

const METRIC_LABELS: Record<string, string> = {
  open_rate: 'Tasa de apertura',
  click_rate: 'Tasa de clics',
  revenue: 'Ingresos',
};

function StatItem({
  icon: Icon,
  label,
  value,
  subValue,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        highlight ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-muted/50'
      }`}
    >
      <div
        className={`p-2 rounded-md ${
          highlight ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</p>
        {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  label,
  subject,
  stats,
  isWinner,
  isLeading,
  winningMetric,
}: {
  variant: 'A' | 'B';
  label: string;
  subject: string;
  stats: VariantStats;
  isWinner: boolean;
  isLeading: boolean;
  winningMetric: string;
}) {
  const highlightMetric = (metric: string) => {
    return metric === winningMetric && isLeading;
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        isWinner
          ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/10'
          : isLeading
          ? 'ring-2 ring-primary shadow-md'
          : 'border'
      }`}
    >
      {isWinner && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
      )}
      {!isWinner && isLeading && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 to-primary" />
      )}
      <CardContent className="pt-5 pb-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                variant === 'A'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {variant}
            </div>
            <span className="font-medium text-sm">{label}</span>
          </div>
          {isWinner && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
              <Trophy className="w-3 h-3" /> Ganador
            </Badge>
          )}
          {!isWinner && isLeading && (
            <Badge variant="outline" className="gap-1 text-primary border-primary/30">
              <BarChart3 className="w-3 h-3" /> Liderando
            </Badge>
          )}
        </div>

        <div className="mb-4 p-2.5 bg-muted/60 rounded-md">
          <p className="text-xs text-muted-foreground mb-0.5">Asunto</p>
          <p className="text-sm font-medium leading-snug">{subject}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatItem icon={Send} label="Envíos" value={stats.sent.toLocaleString()} />
          <StatItem
            icon={Eye}
            label="Aperturas"
            value={stats.opens.toLocaleString()}
            subValue={`${stats.open_rate}%`}
            highlight={highlightMetric('open_rate')}
          />
          <StatItem
            icon={MousePointerClick}
            label="Clics"
            value={stats.clicks.toLocaleString()}
            subValue={`${stats.click_rate}%`}
            highlight={highlightMetric('click_rate')}
          />
          <StatItem
            icon={DollarSign}
            label="Ingresos"
            value={`$${stats.revenue.toLocaleString()}`}
            highlight={highlightMetric('revenue')}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function calculateConfidence(statsA: VariantStats, statsB: VariantStats, metric: string): number | null {
  let pA: number, pB: number, nA: number, nB: number;

  if (metric === 'revenue') return null;

  if (metric === 'click_rate') {
    pA = statsA.sent > 0 ? statsA.clicks / statsA.sent : 0;
    pB = statsB.sent > 0 ? statsB.clicks / statsB.sent : 0;
    nA = statsA.sent;
    nB = statsB.sent;
  } else {
    pA = statsA.sent > 0 ? statsA.opens / statsA.sent : 0;
    pB = statsB.sent > 0 ? statsB.opens / statsB.sent : 0;
    nA = statsA.sent;
    nB = statsB.sent;
  }

  if (nA < 10 || nB < 10) return null;

  const pPool = (pA * nA + pB * nB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  if (se === 0) return null;

  const z = Math.abs(pA - pB) / se;
  // Approximate 2-tailed p-value from z-score using error function approximation
  const p = 2 * (1 - normalCDF(z));
  return Math.min(Math.round((1 - p) * 100), 99);
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

export function ABTestResultsPanel({ campaignId, clientId, isOpen, onClose }: ABTestResultsPanelProps) {
  const [data, setData] = useState<ABTestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingWinner, setSendingWinner] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!campaignId || !clientId) return;
    setLoading(true);
    try {
      const res = await callApi<ABTestResults>('email-ab-testing', {
        body: { action: 'get_results', campaign_id: campaignId, client_id: clientId },
      });
      if (res.error) {
        toast.error(`Error cargando resultados: ${res.error}`);
      } else if (res.data) {
        setData(res.data);
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId, clientId]);

  useEffect(() => {
    if (isOpen) {
      setData(null);
      fetchResults();
    }
  }, [isOpen, fetchResults]);

  const handleSendWinner = async () => {
    if (!data?.test) return;

    const winnerVariant = determineLeader();
    const winnerLabel = winnerVariant === 'a' ? 'Variante A' : 'Variante B';

    if (!window.confirm(`Enviar ${winnerLabel} al resto de suscriptores?`)) return;

    setSendingWinner(true);
    try {
      const res = await callApi('execute-ab-test-winner', {
        body: { test_id: data.test.id, client_id: clientId },
      });
      if (res.error) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(`${winnerLabel} enviada al resto de suscriptores`);
        fetchResults();
      }
    } finally {
      setSendingWinner(false);
    }
  };

  const determineLeader = (): 'a' | 'b' => {
    if (!data) return 'a';
    const { variant_a, variant_b } = data.results;
    const metric = data.test.winning_metric;

    if (metric === 'click_rate') {
      return parseFloat(variant_b.click_rate) > parseFloat(variant_a.click_rate) ? 'b' : 'a';
    }
    if (metric === 'revenue') {
      return variant_b.revenue > variant_a.revenue ? 'b' : 'a';
    }
    return parseFloat(variant_b.open_rate) > parseFloat(variant_a.open_rate) ? 'b' : 'a';
  };

  const testStatus = data?.test?.status;
  const isCompleted = testStatus === 'completed' || testStatus === 'winner_selected';
  const isTesting = testStatus === 'testing';

  const leader = data ? determineLeader() : 'a';
  const officialWinner = data?.test?.winner as 'a' | 'b' | null;

  const confidence = data
    ? calculateConfidence(data.results.variant_a, data.results.variant_b, data.test.winning_metric)
    : null;

  // Calculate test progress
  const testProgress = (() => {
    if (!data?.test) return 0;
    if (isCompleted) return 100;
    const createdAt = new Date(data.test.created_at).getTime();
    const durationMs = data.test.test_duration_hours * 60 * 60 * 1000;
    const elapsed = Date.now() - createdAt;
    return Math.min(Math.round((elapsed / durationMs) * 100), 100);
  })();

  // Get campaign subject (variant A is the original campaign subject)
  const variantASubject = 'Asunto original (Variante A)';
  const variantBSubject = data?.test?.variant_b_subject || 'Variante B';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-orange-600" />
            Resultados Test A/B
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando resultados...</p>
          </div>
        )}

        {!loading && !data && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FlaskConical className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No se encontraron resultados del test A/B</p>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-5">
            {/* Test Progress & Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Completado
                    </Badge>
                  ) : isTesting ? (
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 gap-1">
                      <Clock className="w-3 h-3" /> En progreso
                    </Badge>
                  ) : (
                    <Badge variant="outline">{testStatus}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Métrica: {METRIC_LABELS[data.test.winning_metric] || data.test.winning_metric}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchResults} className="gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progreso del test</span>
                  <span>{testProgress}%</span>
                </div>
                <Progress value={testProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Duración: {data.test.test_duration_hours} {data.test.test_duration_hours === 1 ? 'hora' : 'horas'}
                  {' · '}
                  Porcentaje de prueba: {data.test.test_percentage}%
                </p>
              </div>
            </div>

            {/* Statistical Confidence */}
            {confidence !== null && (
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  confidence >= 95
                    ? 'bg-green-50 border-green-200'
                    : confidence >= 80
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-muted/50 border-border'
                }`}
              >
                <ShieldCheck
                  className={`w-5 h-5 ${
                    confidence >= 95
                      ? 'text-green-600'
                      : confidence >= 80
                      ? 'text-yellow-600'
                      : 'text-muted-foreground'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">
                    Confianza estadística: {confidence}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {confidence >= 95
                      ? 'Resultado estadísticamente significativo'
                      : confidence >= 80
                      ? 'Resultado prometedor, necesita más datos'
                      : 'Aún no hay suficientes datos para una conclusión'}
                  </p>
                </div>
              </div>
            )}

            {/* Variant Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VariantCard
                variant="A"
                label="Variante A (Original)"
                subject={variantASubject}
                stats={data.results.variant_a}
                isWinner={officialWinner === 'a'}
                isLeading={!officialWinner && leader === 'a'}
                winningMetric={data.test.winning_metric}
              />
              <VariantCard
                variant="B"
                label="Variante B"
                subject={variantBSubject}
                stats={data.results.variant_b}
                isWinner={officialWinner === 'b'}
                isLeading={!officialWinner && leader === 'b'}
                winningMetric={data.test.winning_metric}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {data && isTesting && (
            <Button
              onClick={handleSendWinner}
              disabled={sendingWinner}
              className="gap-2"
            >
              {sendingWinner ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Enviar ganador al resto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
