import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * P2-7: Dashboard de salud de email_send_queue.
 * Visible solo para admins. Pega a /api/email-queue-health.
 */

const API_BASE = ((import.meta.env.VITE_API_URL as string) || '').trim();

interface QueueHealth {
  verdict: 'ok' | 'warning' | 'critical';
  warnings: string[];
  scope: 'global' | 'client';
  statusCounts: Record<string, number>;
  stuckItems: Array<{
    id: string;
    client_id: string;
    campaign_id: string | null;
    flow_id: string | null;
    processed_at: string;
    attempts: number;
    last_error: string | null;
  }>;
  throughputLastHour: {
    sent: number;
    failed: number;
    total: number;
    fail_rate_pct: number;
  };
  topClients: Array<{ client_id: string; queued: number }>;
  recentErrors: Array<{
    id: string;
    client_id: string;
    campaign_id: string | null;
    last_error: string | null;
    processed_at: string;
    attempts: number;
  }>;
  oldestQueued: {
    id: string;
    client_id: string;
    scheduled_for: string;
    created_at: string;
  } | null;
  generatedAt: string;
}

interface Props {
  clientId?: string;
}

export function QueueHealthDashboard({ clientId }: Props) {
  const [data, setData] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const url = clientId
        ? `${API_BASE}/api/email-queue-health?client_id=${clientId}`
        : `${API_BASE}/api/email-queue-health`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as QueueHealth;
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error cargando salud de la cola');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // refresh cada 30s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const verdictColor: Record<QueueHealth['verdict'], string> = {
    ok: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    critical: 'bg-red-500/10 text-red-700 border-red-500/20',
  };

  const verdictIcon: Record<QueueHealth['verdict'], React.ReactNode> = {
    ok: <CheckCircle2 className="w-4 h-4" />,
    warning: <AlertCircle className="w-4 h-4" />,
    critical: <AlertCircle className="w-4 h-4" />,
  };

  return (
    <div className="space-y-4">
      {/* Header + verdict */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Salud de la cola de envíos</h3>
          <p className="text-sm text-muted-foreground">
            {data.scope === 'global' ? 'Vista global (todos los clientes)' : 'Vista del cliente'} — actualizado{' '}
            {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={verdictColor[data.verdict]}>
            <span className="flex items-center gap-1.5">
              {verdictIcon[data.verdict]}
              {data.verdict.toUpperCase()}
            </span>
          </Badge>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <Alert variant={data.verdict === 'critical' ? 'destructive' : 'default'}>
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>Atención</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {data.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Status counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['queued', 'processing', 'sent', 'failed', 'cancelled'] as const).map((s) => (
          <Card key={s}>
            <CardContent className="pt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{s}</div>
              <div className="text-2xl font-bold mt-1">{data.statusCounts[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Throughput */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Throughput última hora</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Enviados</div>
              <div className="font-semibold text-emerald-600">{data.throughputLastHour.sent}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fallidos</div>
              <div className="font-semibold text-red-600">{data.throughputLastHour.failed}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total</div>
              <div className="font-semibold">{data.throughputLastHour.total}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fail rate</div>
              <div
                className={`font-semibold ${
                  data.throughputLastHour.fail_rate_pct > 10 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {data.throughputLastHour.fail_rate_pct}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Oldest queued */}
      {data.oldestQueued && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Item más viejo en cola
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">ID:</span> <code className="text-xs">{data.oldestQueued.id}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Programado para:</span>{' '}
              {new Date(data.oldestQueued.scheduled_for).toLocaleString()}
            </div>
            <div>
              <span className="text-muted-foreground">Creado:</span>{' '}
              {new Date(data.oldestQueued.created_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stuck items */}
      {data.stuckItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-amber-700">
              Items atascados en &apos;processing&apos; ({data.stuckItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Processed at</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stuckItems.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs">{item.client_id.slice(0, 8)}</TableCell>
                    <TableCell>{item.attempts}</TableCell>
                    <TableCell className="text-xs">{new Date(item.processed_at).toLocaleTimeString()}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{item.last_error || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top clients by queued */}
      {data.topClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top clientes con items en cola</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client ID</TableHead>
                  <TableHead className="text-right">En cola</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topClients.map((c) => (
                  <TableRow key={c.client_id}>
                    <TableCell className="font-mono text-xs">{c.client_id}</TableCell>
                    <TableCell className="text-right font-semibold">{c.queued}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent errors */}
      {data.recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos errores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.recentErrors.map((e) => (
                <div key={e.id} className="border-l-2 border-red-400 pl-3 py-1">
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.processed_at).toLocaleString()} — attempt {e.attempts}
                  </div>
                  <div className="text-sm font-mono text-red-700">{e.last_error}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
