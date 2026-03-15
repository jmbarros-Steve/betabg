import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Mail,
  Globe,
} from 'lucide-react';

interface DeliverabilityDashboardProps {
  clientId: string;
}

interface DashboardData {
  health_score: number;
  totals: { sent: number; delivered: number; bounced: number; complained: number };
  rates: { delivery: number; bounce: number; complaint: number; open: number };
  inbox_placement: 'likely_inbox' | 'mixed' | 'likely_spam';
  spam_score: 'good' | 'warning' | 'critical';
  bounce_breakdown: { hard: number; soft: number };
  domain_health: Array<{
    domain: string;
    verified: boolean;
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
  }>;
  trend: Array<{
    date: string;
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    delivery_rate: number;
    bounce_rate: number;
  }>;
}

function getHealthLabel(score: number) {
  if (score >= 90) return { label: 'Excelente', color: 'text-emerald-600', ring: 'stroke-emerald-500', bg: 'bg-emerald-50' };
  if (score >= 70) return { label: 'Bueno', color: 'text-amber-600', ring: 'stroke-amber-500', bg: 'bg-amber-50' };
  if (score >= 50) return { label: 'Necesita atencion', color: 'text-orange-600', ring: 'stroke-orange-500', bg: 'bg-orange-50' };
  return { label: 'Critico', color: 'text-red-600', ring: 'stroke-red-500', bg: 'bg-red-50' };
}

function TrafficBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const styles = {
    green: 'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };
  const labels = { green: 'Bien', yellow: 'Atencion', red: 'Critico' };
  return <Badge className={styles[level]}>{labels[level]}</Badge>;
}

function HealthScoreCircle({ score }: { score: number }) {
  const { label, color, ring } = getHealthLabel(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            className={ring}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className={`text-sm font-semibold ${color}`}>{label}</span>
    </div>
  );
}

function MiniSparkline({ data }: { data: Array<{ date: string; delivery_rate: number }> }) {
  const max = 100;
  const barCount = data.length;

  return (
    <div className="flex items-end gap-[2px] h-16 w-full">
      {data.map((d, i) => {
        const height = Math.max(2, (d.delivery_rate / max) * 100);
        const color =
          d.delivery_rate >= 98 ? 'bg-emerald-400' :
          d.delivery_rate >= 95 ? 'bg-amber-400' : 'bg-red-400';
        return (
          <div
            key={d.date}
            className={`${color} rounded-t-sm flex-1 min-w-[2px]`}
            style={{ height: `${height}%` }}
            title={`${d.date}: ${d.delivery_rate}%`}
          />
        );
      })}
    </div>
  );
}

function generateRecommendations(data: DashboardData): string[] {
  const tips: string[] = [];

  if (data.rates.bounce > 5) {
    tips.push('Tu tasa de rebote es muy alta (>' + data.rates.bounce.toFixed(1) + '%). Limpia tu lista eliminando direcciones invalidas.');
  } else if (data.rates.bounce > 2) {
    tips.push('Tu tasa de rebote esta por encima del ideal. Considera verificar las direcciones nuevas antes de enviar.');
  }

  if (data.rates.complaint > 0.3) {
    tips.push('La tasa de quejas es critica. Revisa tu contenido y asegurate de que los suscriptores dieron su consentimiento.');
  } else if (data.rates.complaint > 0.1) {
    tips.push('Tienes algunas quejas de spam. Incluye un enlace de baja visible y envia solo a quienes se suscribieron.');
  }

  if (data.inbox_placement === 'likely_spam') {
    tips.push('Tu tasa de apertura indica que tus correos podrian estar cayendo en spam. Mejora el asunto y remitente.');
  } else if (data.inbox_placement === 'mixed') {
    tips.push('Algunos correos podrian ir a spam. Autentifica tu dominio con SPF, DKIM y DMARC.');
  }

  if (data.bounce_breakdown.hard > data.bounce_breakdown.soft) {
    tips.push('La mayoria de tus rebotes son permanentes (hard bounce). Elimina esas direcciones de tu lista inmediatamente.');
  }

  const unverifiedDomains = data.domain_health.filter(d => !d.verified);
  if (unverifiedDomains.length > 0) {
    tips.push(`Tienes ${unverifiedDomains.length} dominio(s) sin verificar. Completa la verificacion DNS para mejorar tu reputacion.`);
  }

  if (data.domain_health.length === 0) {
    tips.push('No tienes dominios configurados. Agrega y verifica tu dominio para mejorar la entregabilidad.');
  }

  const nonDmarc = data.domain_health.filter(d => d.verified && !d.dmarc);
  if (nonDmarc.length > 0) {
    tips.push('Algunos dominios no tienen DMARC configurado. Esto es importante para prevenir suplantacion de identidad.');
  }

  if (tips.length === 0) {
    tips.push('Tu entregabilidad se ve excelente. Sigue monitoreando para mantener estos resultados.');
  }

  return tips;
}

export function DeliverabilityDashboard({ clientId }: DeliverabilityDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await callApi<DashboardData>('email-campaign-analytics', {
        body: { action: 'deliverability_dashboard', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No se pudieron cargar las metricas de entregabilidad.
        </CardContent>
      </Card>
    );
  }

  const deliveryLevel: 'green' | 'yellow' | 'red' =
    data.rates.delivery >= 98 ? 'green' : data.rates.delivery >= 95 ? 'yellow' : 'red';
  const bounceLevel: 'green' | 'yellow' | 'red' =
    data.rates.bounce < 2 ? 'green' : data.rates.bounce <= 5 ? 'yellow' : 'red';
  const complaintLevel: 'green' | 'yellow' | 'red' =
    data.rates.complaint < 0.1 ? 'green' : data.rates.complaint <= 0.3 ? 'yellow' : 'red';
  const inboxLevel: 'green' | 'yellow' | 'red' =
    data.inbox_placement === 'likely_inbox' ? 'green' :
    data.inbox_placement === 'mixed' ? 'yellow' : 'red';

  const inboxLabel = {
    likely_inbox: 'Bandeja de entrada',
    mixed: 'Mixto',
    likely_spam: 'Posible spam',
  }[data.inbox_placement];

  const recommendations = generateRecommendations(data);

  return (
    <div className="space-y-6">
      {/* Health Score */}
      <Card>
        <CardContent className="pt-6 flex flex-col md:flex-row items-center gap-6">
          <HealthScoreCircle score={data.health_score} />
          <div className="flex-1 space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Salud de Entregabilidad
            </h3>
            <p className="text-sm text-muted-foreground">
              Basado en tasas de entrega, rebotes, quejas y autenticacion de dominio de los ultimos 30 dias.
            </p>
            <div className="flex gap-4 text-sm">
              <span><strong>{data.totals.sent.toLocaleString()}</strong> enviados</span>
              <span><strong>{data.totals.delivered.toLocaleString()}</strong> entregados</span>
              <span><strong>{data.totals.bounced.toLocaleString()}</strong> rebotados</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                Tasa de Entrega
              </span>
              <TrafficBadge level={deliveryLevel} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.rates.delivery.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.totals.delivered.toLocaleString()} de {data.totals.sent.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Tasa de Rebote
              </span>
              <TrafficBadge level={bounceLevel} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.rates.bounce.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              Hard: {data.bounce_breakdown.hard} / Soft: {data.bounce_breakdown.soft}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4" />
                Tasa de Quejas
              </span>
              <TrafficBadge level={complaintLevel} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.rates.complaint.toFixed(3)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.totals.complained.toLocaleString()} quejas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />
                Inbox Placement
              </span>
              <TrafficBadge level={inboxLevel} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inboxLabel}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tasa apertura: {data.rates.open.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Domain Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Salud de Dominios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.domain_health.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay dominios configurados.</p>
          ) : (
            <div className="space-y-3">
              {data.domain_health.map((d) => (
                <div key={d.domain} className="flex items-center justify-between border rounded-lg p-3">
                  <span className="font-mono text-sm">{d.domain}</span>
                  <div className="flex items-center gap-2">
                    <DnsCheck label="SPF" ok={d.spf} />
                    <DnsCheck label="DKIM" ok={d.dkim} />
                    <DnsCheck label="DMARC" ok={d.dmarc} />
                    {d.verified ? (
                      <Badge className="bg-emerald-100 text-emerald-700 ml-2">Verificado</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 ml-2">Sin verificar</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 30-day Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Tendencia de Entrega (30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MiniSparkline data={data.trend} />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{data.trend[0]?.date}</span>
            <span>{data.trend[data.trend.length - 1]?.date}</span>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Recomendaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recommendations.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function DnsCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  );
}
