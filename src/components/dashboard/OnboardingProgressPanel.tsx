import { useEffect, useState, useMemo } from 'react';
import { Loader2, CheckCircle2, Clock, AlertTriangle, Users, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OnboardingRow {
  client_id: string;
  step: string;
  status: string;
  completed_at: string | null;
  reminder_count: number;
}

interface ClientOnboarding {
  id: string;
  name: string | null;
  email: string | null;
  churn_risk: string | null;
  created_at: string;
  steps: OnboardingRow[];
  completedPct: number;
}

type FilterType = 'all' | 'completed' | 'in_progress' | 'stalled';

const STEP_LABELS: Record<string, string> = {
  welcome: 'Bienvenida',
  shopify_connected: 'Shopify',
  meta_connected: 'Meta Ads',
  klaviyo_connected: 'Klaviyo',
  brief_completed: 'Brief',
  first_campaign: '1ra Campaña',
};

const CHURN_BADGE: Record<string, { label: string; color: string }> = {
  none: { label: '', color: '' },
  low: { label: 'Low', color: 'bg-yellow-100 text-yellow-700' },
  medium: { label: 'Medium', color: 'bg-orange-100 text-orange-700' },
  high: { label: 'High', color: 'bg-red-100 text-red-700' },
};

export function OnboardingProgressPanel() {
  const [clientsData, setClientsData] = useState<ClientOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch clients with onboarding data
      const { data: clients, error: clientErr } = await supabase
        .from('clients')
        .select('id, name, email, churn_risk, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (clientErr) throw clientErr;

      const { data: steps, error: stepErr } = await supabase
        .from('merchant_onboarding')
        .select('client_id, step, status, completed_at, reminder_count')
        .in('client_id', (clients || []).map(c => c.id));

      if (stepErr) throw stepErr;

      // Group steps by client
      const stepsByClient: Record<string, OnboardingRow[]> = {};
      (steps || []).forEach(s => {
        if (!stepsByClient[s.client_id]) stepsByClient[s.client_id] = [];
        stepsByClient[s.client_id].push(s);
      });

      const result: ClientOnboarding[] = (clients || [])
        .filter(c => stepsByClient[c.id]?.length > 0)
        .map(c => {
          const clientSteps = stepsByClient[c.id] || [];
          const completed = clientSteps.filter(s => s.status === 'completed').length;
          const total = clientSteps.length;
          return {
            ...c,
            steps: clientSteps,
            completedPct: total > 0 ? Math.round((completed / total) * 100) : 0,
          };
        });

      setClientsData(result);
    } catch (err) {
      toast.error('Error cargando datos de onboarding');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    switch (filter) {
      case 'completed': return clientsData.filter(c => c.completedPct === 100);
      case 'in_progress': return clientsData.filter(c => c.completedPct > 0 && c.completedPct < 100);
      case 'stalled': return clientsData.filter(c => c.completedPct < 50 && c.steps.some(s => s.reminder_count >= 2));
      default: return clientsData;
    }
  }, [clientsData, filter]);

  // Stats
  const completedCount = clientsData.filter(c => c.completedPct === 100).length;
  const inProgressCount = clientsData.filter(c => c.completedPct > 0 && c.completedPct < 100).length;
  const stalledCount = clientsData.filter(c => c.completedPct < 50 && c.steps.some(s => s.reminder_count >= 2)).length;
  const churnCount = clientsData.filter(c => c.churn_risk === 'medium' || c.churn_risk === 'high').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Onboarding Merchants</h2>
        <p className="text-muted-foreground">{clientsData.length} merchants con onboarding</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{completedCount}</div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completado
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> En progreso
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{stalledCount}</div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Estancados
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{churnCount}</div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Churn risk
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'completed', 'in_progress', 'stalled'] as FilterType[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            className={filter === f ? 'bg-[#1E3A7B]' : ''}
          >
            {f === 'all' ? 'Todos' : f === 'completed' ? 'Completado' : f === 'in_progress' ? 'En progreso' : 'Estancados'}
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Merchant</th>
              <th className="text-center px-2 py-3 font-medium">Progreso</th>
              {Object.keys(STEP_LABELS).map(step => (
                <th key={step} className="text-center px-2 py-3 font-medium text-xs">
                  {STEP_LABELS[step]}
                </th>
              ))}
              <th className="text-center px-2 py-3 font-medium">Churn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  No hay merchants en esta categoría
                </td>
              </tr>
            )}
            {filtered.map(client => (
              <tr key={client.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{client.name || client.email?.split('@')[0] || '—'}</div>
                  <div className="text-xs text-muted-foreground">{client.email}</div>
                </td>
                <td className="text-center px-2 py-3">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${client.completedPct === 100 ? 'bg-emerald-500' : client.completedPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                        style={{ width: `${client.completedPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono">{client.completedPct}%</span>
                  </div>
                </td>
                {Object.keys(STEP_LABELS).map(step => {
                  const stepData = client.steps.find(s => s.step === step);
                  return (
                    <td key={step} className="text-center px-2 py-3">
                      {stepData?.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : stepData?.status === 'pending' || stepData?.status === 'in_progress' ? (
                        <Clock className="w-4 h-4 text-slate-300 mx-auto" />
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center px-2 py-3">
                  {client.churn_risk && client.churn_risk !== 'none' && (
                    <Badge className={`${CHURN_BADGE[client.churn_risk]?.color} border-0 text-xs`}>
                      {CHURN_BADGE[client.churn_risk]?.label}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
