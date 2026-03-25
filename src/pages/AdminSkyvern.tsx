import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, RefreshCw, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

interface DetectiveRun {
  id: string;
  run_id: string;
  source: string;
  total_checks: number;
  passed: number;
  mismatches: number;
  critical: number;
  score: number;
  by_module: Record<string, { passed: number; failed: number }>;
  created_at: string;
}

interface DetectiveLogEntry {
  id: string;
  run_id: string;
  source: string;
  module: string;
  check_type: string;
  status: string;
  severity: string;
  steve_value: any;
  real_value: any;
  mismatched_fields: string[];
  details: string;
  created_at: string;
}

interface OnboardingJob {
  id: string;
  client_id: string;
  status: string;
  shopify_status: string;
  meta_status: string;
  klaviyo_status: string;
  shopify_step: string | null;
  meta_step: string | null;
  klaviyo_step: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  MAJOR: 'bg-orange-100 text-orange-700',
  MINOR: 'bg-slate-100 text-slate-600',
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  MISMATCH: AlertTriangle,
  MISSING: XCircle,
  ERROR: XCircle,
};

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 90 ? 'text-green-600' : score >= 70 ? 'text-yellow-600' : 'text-red-600';
  const bg = score >= 90 ? 'bg-green-50' : score >= 70 ? 'bg-yellow-50' : 'bg-red-50';
  return (
    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${bg}`}>
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
    </div>
  );
}

export default function AdminSkyvern() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const [runs, setRuns] = useState<DetectiveRun[]>([]);
  const [logs, setLogs] = useState<DetectiveLogEntry[]>([]);
  const [onboardingJobs, setOnboardingJobs] = useState<OnboardingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate('/');
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  async function fetchData() {
    setLoading(true);

    const [runsRes, logsRes, jobsRes] = await Promise.all([
      supabase
        .from('detective_runs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('detective_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('onboarding_jobs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setRuns((runsRes.data as any[]) || []);
    setLogs((logsRes.data as any[]) || []);
    setOnboardingJobs((jobsRes.data as any[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (isSuperAdmin) fetchData();
  }, [isSuperAdmin]);

  const filteredLogs = selectedRun
    ? logs.filter(l => l.run_id === selectedRun)
    : logs;

  const latestRun = runs[0];

  if (roleLoading) return <div className="p-8 text-center">Cargando...</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/cerebro')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Cerebro
            </Button>
            <Shield className="h-6 w-6 text-purple-600" />
            <h1 className="text-2xl font-bold">Detective Skyvern</h1>
            {latestRun && (
              <Badge variant="outline" className="ml-2">
                Score: {latestRun.score}/100
              </Badge>
            )}
          </div>
          <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>

        {/* Summary Cards */}
        {latestRun && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 text-center">
                <ScoreCircle score={latestRun.score} />
                <p className="text-sm text-gray-500 mt-2">Health Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-green-600">{latestRun.passed}</p>
                <p className="text-sm text-gray-500">Passed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-orange-600">{latestRun.mismatches}</p>
                <p className="text-sm text-gray-500">Mismatches</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold text-red-600">{latestRun.critical}</p>
                <p className="text-sm text-gray-500">Critical</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-3xl font-bold">{latestRun.total_checks}</p>
                <p className="text-sm text-gray-500">Total Checks</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="runs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="mismatches">Mismatches</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          </TabsList>

          {/* ── Runs Tab ──────────────────────────────────── */}
          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Detective Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No hay runs todavia. El detective corre cada 2 horas en horario laboral.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {runs.map(run => (
                      <div
                        key={run.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          selectedRun === run.run_id ? 'border-purple-500 bg-purple-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedRun(selectedRun === run.run_id ? null : run.run_id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ScoreCircle score={run.score} />
                            <div>
                              <p className="font-medium">{run.run_id}</p>
                              <p className="text-sm text-gray-500">
                                {new Date(run.created_at).toLocaleString('es-CL')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-600">{run.passed} passed</span>
                            <span className="text-orange-600">{run.mismatches} mismatches</span>
                            {run.critical > 0 && (
                              <Badge className="bg-red-100 text-red-700">{run.critical} critical</Badge>
                            )}
                          </div>
                        </div>
                        {run.by_module && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(run.by_module).map(([mod, stats]) => (
                              <Badge key={mod} variant="outline" className="text-xs">
                                {mod}: {stats.passed}ok / {stats.failed}fail
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Mismatches Tab ────────────────────────────── */}
          <TabsContent value="mismatches">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Mismatches Detectados
                  {selectedRun && (
                    <Badge variant="outline" className="ml-2">
                      Filtrado: {selectedRun}
                      <button className="ml-1 text-xs" onClick={() => setSelectedRun(null)}>x</button>
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No hay mismatches registrados.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredLogs.map(log => {
                      const Icon = STATUS_ICONS[log.status] || AlertTriangle;
                      return (
                        <div key={log.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <Icon className={`h-5 w-5 mt-0.5 ${
                                log.status === 'PASS' ? 'text-green-500' :
                                log.status === 'MISMATCH' ? 'text-orange-500' : 'text-red-500'
                              }`} />
                              <div>
                                <p className="font-medium">{log.details}</p>
                                <p className="text-sm text-gray-500">
                                  {log.module} / {log.check_type}
                                </p>
                                {log.mismatched_fields?.length > 0 && (
                                  <div className="flex gap-1 mt-1">
                                    {log.mismatched_fields.map(f => (
                                      <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={SEVERITY_COLORS[log.severity] || ''}>
                                {log.severity}
                              </Badge>
                              <span className="text-xs text-gray-400">
                                {new Date(log.created_at).toLocaleString('es-CL')}
                              </span>
                            </div>
                          </div>
                          {(log.steve_value || log.real_value) && (
                            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                              <div className="bg-[#F0F4FA] p-2 rounded">
                                <p className="font-semibold text-[#162D5F] mb-1">Steve</p>
                                <pre className="whitespace-pre-wrap">{JSON.stringify(log.steve_value, null, 2)}</pre>
                              </div>
                              <div className="bg-orange-50 p-2 rounded">
                                <p className="font-semibold text-orange-700 mb-1">Real</p>
                                <pre className="whitespace-pre-wrap">{JSON.stringify(log.real_value, null, 2)}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Onboarding Tab ────────────────────────────── */}
          <TabsContent value="onboarding">
            <Card>
              <CardHeader>
                <CardTitle>Onboarding Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                {onboardingJobs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No hay onboarding jobs. Se crean cuando un merchant conecta plataformas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {onboardingJobs.map(job => (
                      <div key={job.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-medium">Job {job.id.slice(0, 8)}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(job.created_at).toLocaleString('es-CL')}
                            </p>
                          </div>
                          <Badge className={
                            job.status === 'completed' ? 'bg-green-100 text-green-700' :
                            job.status === 'running' ? 'bg-[#D6E0F0] text-[#162D5F]' :
                            'bg-red-100 text-red-700'
                          }>
                            {job.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {(['shopify', 'meta', 'klaviyo'] as const).map(platform => {
                            const status = job[`${platform}_status`];
                            const step = job[`${platform}_step`];
                            return (
                              <div key={platform} className="text-center p-2 bg-gray-50 rounded">
                                <p className="text-sm font-medium capitalize">{platform}</p>
                                <Badge variant="outline" className="text-xs mt-1">
                                  {status}
                                </Badge>
                                {step && <p className="text-xs text-gray-500 mt-1">{step}</p>}
                              </div>
                            );
                          })}
                        </div>
                        {job.error && (
                          <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">{job.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
