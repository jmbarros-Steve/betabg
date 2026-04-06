import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Copy,
  Download,
  ExternalLink,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type WaitlistStatus = 'pending' | 'contacted' | 'converted' | 'spam';

interface WaitlistLead {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  ecommerce_url: string;
  status: WaitlistStatus;
  notes: string | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
  contacted_at: string | null;
  converted_at: string | null;
}

const STATUS_LABEL: Record<WaitlistStatus, string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  converted: 'Convertido',
  spam: 'Spam',
};

const STATUS_COLOR: Record<WaitlistStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  contacted: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  converted: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  spam: 'bg-slate-200 text-slate-700 hover:bg-slate-200',
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfThisWeek(): Date {
  const d = startOfToday();
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function AdminWaitlist() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [leads, setLeads] = useState<WaitlistLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && user && !isSuperAdmin) navigate('/portal');
  }, [user, authLoading, isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchLeads();
  }, [isSuperAdmin]);

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('waitlist_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminWaitlist] fetch error:', error);
      toast.error('No se pudieron cargar los leads');
    } else {
      setLeads((data ?? []) as WaitlistLead[]);
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: WaitlistStatus) {
    const patch: Record<string, any> = { status };
    if (status === 'contacted') patch.contacted_at = new Date().toISOString();
    if (status === 'converted') patch.converted_at = new Date().toISOString();

    const { error } = await (supabase as any)
      .from('waitlist_leads')
      .update(patch)
      .eq('id', id);

    if (error) {
      console.error('[AdminWaitlist] update error:', error);
      toast.error('Error al actualizar status');
      return;
    }
    toast.success(`Status actualizado: ${STATUS_LABEL[status]}`);
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    toast.success('Email copiado');
  }

  function exportCsv() {
    const headers = [
      'fecha',
      'nombre',
      'apellido',
      'email',
      'ecommerce_url',
      'status',
      'notas',
      'referrer',
    ];
    const rows = filteredLeads.map((l) =>
      [
        new Date(l.created_at).toISOString(),
        l.first_name,
        l.last_name,
        l.email,
        l.ecommerce_url,
        l.status,
        l.notes,
        l.referrer,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waitlist-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.email.toLowerCase().includes(q) ||
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
        (l.ecommerce_url ?? '').toLowerCase().includes(q)
    );
  }, [leads, search]);

  const stats = useMemo(() => {
    const today = startOfToday().getTime();
    const week = startOfThisWeek().getTime();
    const counts = { pending: 0, contacted: 0, converted: 0, spam: 0 } as Record<
      WaitlistStatus,
      number
    >;
    let todayCount = 0;
    let weekCount = 0;
    leads.forEach((l) => {
      counts[l.status]++;
      const ts = new Date(l.created_at).getTime();
      if (ts >= today) todayCount++;
      if (ts >= week) weekCount++;
    });
    return {
      total: leads.length,
      today: todayCount,
      week: weekCount,
      ...counts,
    };
  }, [leads]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/cerebro')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <h1 className="text-2xl font-bold text-slate-900">Waitlist · Leads pre-launch</h1>
          </div>
          <Button onClick={exportCsv} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total" value={stats.total} icon={<Users className="w-4 h-4" />} />
          <StatCard label="Hoy" value={stats.today} icon={<Calendar className="w-4 h-4" />} />
          <StatCard label="Esta semana" value={stats.week} icon={<Calendar className="w-4 h-4" />} />
          <StatCard label="Pendientes" value={stats.pending} tone="amber" />
          <StatCard label="Contactados" value={stats.contacted} tone="blue" />
          <StatCard label="Convertidos" value={stats.converted} tone="emerald" />
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, email o URL"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">Cargando leads...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                {leads.length === 0 ? 'Aún no hay leads.' : 'Sin resultados para tu búsqueda.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>E-commerce</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {lead.first_name} {lead.last_name}
                      </TableCell>
                      <TableCell className="text-slate-700">{lead.email}</TableCell>
                      <TableCell>
                        <a
                          href={lead.ecommerce_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {lead.ecommerce_url.replace(/^https?:\/\//, '').slice(0, 40)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLOR[lead.status]}>
                          {STATUS_LABEL[lead.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Select
                            value={lead.status}
                            onValueChange={(v) => updateStatus(lead.id, v as WaitlistStatus)}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pendiente</SelectItem>
                              <SelectItem value="contacted">Contactado</SelectItem>
                              <SelectItem value="converted">Convertido</SelectItem>
                              <SelectItem value="spam">Spam</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyEmail(lead.email)}
                            title="Copiar email"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: 'slate' | 'amber' | 'blue' | 'emerald';
}) {
  const toneClass = {
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          {icon && <div className="text-slate-400">{icon}</div>}
        </div>
        <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
