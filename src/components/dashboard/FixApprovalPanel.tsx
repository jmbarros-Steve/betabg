import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, Clock, Loader2, RefreshCw,
  ChevronDown, ChevronUp, Wrench, Shield, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────

interface FixEntry {
  id: string;
  check_id: string;
  check_number: number;
  check_result: any;
  fix_prompt: string;
  probable_cause: string | null;
  files_to_check: string[] | null;
  status: string;
  difficulty: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  attempt: number;
  created_at: string;
  // Joined from chino_routine
  check_description?: string;
  check_severity?: string;
  check_platform?: string;
  check_type?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  assigned: 'bg-blue-100 text-blue-700',
  fixing: 'bg-purple-100 text-purple-700',
  deployed: 'bg-indigo-100 text-indigo-700',
  verifying: 'bg-cyan-100 text-cyan-700',
  fixed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  escalated: 'bg-red-200 text-red-800',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────

export function FixApprovalPanel() {
  const [fixes, setFixes] = useState<FixEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState('pending');
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const fetchFixes = useCallback(async () => {
    setLoading(true);
    // Fetch fixes with check info via separate query (no FK join available from frontend)
    const { data: fixData } = await supabase
      .from('steve_fix_queue' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!fixData) {
      setFixes([]);
      setLoading(false);
      return;
    }

    // Get unique check_ids to fetch check details
    const checkIds = [...new Set((fixData as any[]).map((f: any) => f.check_id))];
    const { data: checks } = await supabase
      .from('chino_routine' as any)
      .select('id, description, severity, platform, check_type')
      .in('id', checkIds);

    const checkMap = new Map<string, any>();
    for (const c of (checks || []) as any[]) {
      checkMap.set(c.id, c);
    }

    const enriched: FixEntry[] = (fixData as any[]).map((f: any) => {
      const check = checkMap.get(f.check_id);
      return {
        ...f,
        check_description: check?.description || 'Check desconocido',
        check_severity: check?.severity || 'medium',
        check_platform: check?.platform || 'unknown',
        check_type: check?.check_type || 'unknown',
      };
    });

    setFixes(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFixes();
  }, [fetchFixes]);

  // Filter by tab
  const pendingFixes = fixes.filter((f) => f.approval_status === 'pending_approval');
  const autoFixes = fixes.filter((f) => f.approval_status === 'auto_approved');
  const rejectedFixes = fixes.filter((f) => f.approval_status === 'rejected');

  const currentList = tab === 'pending' ? pendingFixes
    : tab === 'auto' ? autoFixes
    : rejectedFixes;

  // Selection
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === currentList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(currentList.map((f) => f.id)));
    }
  }

  // Expand/collapse fix_prompt
  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Approve
  async function approveIds(ids: string[]) {
    if (ids.length === 0) return;
    setActing(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || 'admin';

    const { error } = await supabase
      .from('steve_fix_queue' as any)
      .update({
        approval_status: 'approved',
        approved_by: email,
        approved_at: new Date().toISOString(),
      } as any)
      .in('id', ids);

    if (error) {
      toast.error(`Error aprobando: ${error.message}`);
    } else {
      toast.success(`${ids.length} fix(es) aprobados`);
      setSelected(new Set());
      await fetchFixes();
    }
    setActing(false);
  }

  // Reject
  async function rejectId(id: string, reason: string) {
    setActing(true);

    const { error } = await supabase
      .from('steve_fix_queue' as any)
      .update({
        approval_status: 'rejected',
        rejection_reason: reason || 'Rechazado por JM',
        status: 'failed',
      } as any)
      .eq('id', id);

    if (error) {
      toast.error(`Error rechazando: ${error.message}`);
    } else {
      toast.success('Fix rechazado');
      setRejectDialogId(null);
      setRejectReason('');
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await fetchFixes();
    }
    setActing(false);
  }

  // Batch reject
  async function rejectSelected() {
    if (selected.size === 0) return;
    setActing(true);

    const { error } = await supabase
      .from('steve_fix_queue' as any)
      .update({
        approval_status: 'rejected',
        rejection_reason: 'Batch reject por JM',
        status: 'failed',
      } as any)
      .in('id', [...selected]);

    if (error) {
      toast.error(`Error rechazando: ${error.message}`);
    } else {
      toast.success(`${selected.size} fix(es) rechazados`);
      setSelected(new Set());
      await fetchFixes();
    }
    setActing(false);
  }

  // ─── Render ─────────────────────────────────────────────────────

  function renderFixCard(fix: FixEntry) {
    const isExpanded = expandedIds.has(fix.id);
    const isSelected = selected.has(fix.id);
    const isPending = fix.approval_status === 'pending_approval';

    return (
      <Card key={fix.id} className={`transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="pt-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {isPending && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelect(fix.id)}
                className="mt-1"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold">#{fix.check_number}</span>
                <Badge className={`text-xs ${SEVERITY_COLORS[fix.check_severity || 'medium'] || ''}`}>
                  {fix.check_severity}
                </Badge>
                <Badge variant="outline" className="text-xs">{fix.check_platform}</Badge>
                <Badge variant="outline" className="text-xs">{fix.check_type}</Badge>
                {fix.difficulty === 'auto' && (
                  <Badge className="text-xs bg-emerald-100 text-emerald-700">
                    <Zap className="w-3 h-3 mr-1" /> auto
                  </Badge>
                )}
                <Badge className={`text-xs ${STATUS_COLORS[fix.status] || ''}`}>
                  {fix.status}
                </Badge>
              </div>
              <p className="text-sm mt-1">{fix.check_description}</p>
              {fix.probable_cause && (
                <p className="text-xs text-muted-foreground mt-1">
                  <Wrench className="w-3 h-3 inline mr-1" />
                  {fix.probable_cause}
                </p>
              )}
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(fix.created_at)}
            </div>
          </div>

          {/* Files to check */}
          {fix.files_to_check && fix.files_to_check.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fix.files_to_check.map((f, i) => (
                <Badge key={i} variant="outline" className="text-xs font-mono">{f}</Badge>
              ))}
            </div>
          )}

          {/* Error details from check_result */}
          {fix.check_result?.error_message && (
            <p className="text-xs text-red-600 bg-red-50 rounded p-2 font-mono">
              {fix.check_result.error_message}
            </p>
          )}

          {/* Expandable fix_prompt */}
          <button
            onClick={() => toggleExpand(fix.id)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {isExpanded ? 'Ocultar fix_prompt' : 'Ver fix_prompt'}
          </button>
          {isExpanded && (
            <pre className="text-xs bg-slate-50 border rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
              {fix.fix_prompt}
            </pre>
          )}

          {/* Rejection reason */}
          {fix.rejection_reason && (
            <p className="text-xs text-orange-700 bg-orange-50 rounded p-2">
              Razón: {fix.rejection_reason}
            </p>
          )}

          {/* Approval info */}
          {fix.approved_by && (
            <p className="text-xs text-green-700">
              Aprobado por {fix.approved_by} — {fix.approved_at ? formatDate(fix.approved_at) : ''}
            </p>
          )}

          {/* Action buttons for pending */}
          {isPending && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => approveIds([fix.id])}
                disabled={acting}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setRejectDialogId(fix.id); setRejectReason(''); }}
                disabled={acting}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Fixes del Chino — Piloto Automático
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Stats badges */}
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" /> {pendingFixes.length} pendientes
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Zap className="w-3 h-3 mr-1" /> {autoFixes.length} auto
            </Badge>
            <Badge variant="outline" className="text-xs">
              <XCircle className="w-3 h-3 mr-1" /> {rejectedFixes.length} rechazados
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchFixes} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelected(new Set()); }}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending">
              Pendientes ({pendingFixes.length})
            </TabsTrigger>
            <TabsTrigger value="auto">
              Auto-arreglados ({autoFixes.length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rechazados ({rejectedFixes.length})
            </TabsTrigger>
          </TabsList>

          {/* Batch actions for pending tab */}
          {tab === 'pending' && pendingFixes.length > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <Button variant="outline" size="sm" onClick={selectAll}>
                {selected.size === currentList.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </Button>
              {selected.size > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={() => approveIds([...selected])}
                    disabled={acting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {acting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    Aprobar {selected.size}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rejectSelected}
                    disabled={acting}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar {selected.size}
                  </Button>
                </>
              )}
            </div>
          )}

          <TabsContent value="pending" className="space-y-3">
            {pendingFixes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin fixes pendientes de aprobacion</p>
            ) : pendingFixes.map(renderFixCard)}
          </TabsContent>

          <TabsContent value="auto" className="space-y-3">
            {autoFixes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin auto-fixes recientes</p>
            ) : autoFixes.slice(0, 50).map(renderFixCard)}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-3">
            {rejectedFixes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin fixes rechazados</p>
            ) : rejectedFixes.map(renderFixCard)}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Reject reason dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={(open) => { if (!open) setRejectDialogId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar Fix</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Razon del rechazo (opcional)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogId(null)}>Cancelar</Button>
            <Button
              onClick={() => rejectDialogId && rejectId(rejectDialogId, rejectReason)}
              disabled={acting}
              className="bg-red-600 hover:bg-red-700"
            >
              {acting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
