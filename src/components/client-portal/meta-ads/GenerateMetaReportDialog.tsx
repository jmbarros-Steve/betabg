import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { FileText, Calendar as CalendarIcon, Download, Loader2, AlertCircle, CheckCircle2, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface GenerateMetaReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Cuenta Meta seleccionada actualmente — usada por default si no se incluyen todas */
  primaryConnectionId?: string | null;
}

const MIN_DAYS = 7;

interface PastReport {
  id: string;
  from_date: string;
  to_date: string;
  status: string;
  signed_url: string | null;
  generated_at: string | null;
  file_size_bytes: number | null;
  connection_ids?: string[];
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function presetRange(days: number): DateRange {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from, to };
}

function thisMonthRange(): DateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  return { from, to };
}

function lastMonthRange(): DateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from, to };
}

function thisQuarterRange(): DateRange {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const from = new Date(now.getFullYear(), q * 3, 1);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  return { from, to };
}

export function GenerateMetaReportDialog({ open, onOpenChange, clientId, primaryConnectionId }: GenerateMetaReportDialogProps) {
  const [range, setRange] = useState<DateRange | undefined>(presetRange(30));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<PastReport[]>([]);
  const [allMetaConnectionIds, setAllMetaConnectionIds] = useState<string[]>([]);
  const [includeAllAccounts, setIncludeAllAccounts] = useState(false);

  useEffect(() => {
    if (open) {
      fetchHistory();
      fetchMetaConnections();
      setGeneratedUrl(null);
    }
  }, [open]);

  async function fetchMetaConnections() {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'meta')
      .eq('is_active', true);
    const ids = (data || []).map((c: any) => c.id).filter(Boolean);
    setAllMetaConnectionIds(ids);
  }

  async function fetchHistory() {
    try {
      const { data, error } = await callApi<{ reports: PastReport[] }>('meta-reports', {
        body: { clientId },
      });
      if (!error && data?.reports) {
        setHistory(data.reports);
      }
    } catch {
      // History is optional
    }
  }

  const fromDate = range?.from;
  const toDate = range?.to;
  const periodDays = fromDate && toDate ? daysBetween(fromDate, toDate) : 0;
  const tooShort = periodDays > 0 && periodDays < MIN_DAYS;
  const canGenerate = fromDate && toDate && periodDays >= MIN_DAYS && !isGenerating;

  function applyPreset(getter: () => DateRange) {
    setRange(getter());
  }

  function expandTo7Days() {
    if (!toDate) return;
    const newFrom = new Date(toDate);
    newFrom.setDate(newFrom.getDate() - (MIN_DAYS - 1));
    setRange({ from: newFrom, to: toDate });
  }

  async function handleGenerate() {
    if (!fromDate || !toDate) return;
    setIsGenerating(true);
    setGeneratedUrl(null);

    const startDate = formatDateISO(fromDate);
    const endDate = formatDateISO(toDate);

    // Multi-account: si toggle on usa TODAS las conexiones; si no, solo la actual.
    const connectionIds = includeAllAccounts
      ? allMetaConnectionIds
      : (primaryConnectionId ? [primaryConnectionId] : allMetaConnectionIds);

    if (connectionIds.length === 0) {
      toast.error('No hay conexiones Meta activas para generar el informe.');
      setIsGenerating(false);
      return;
    }

    try {
      const { data, error } = await callApi<{ pdfUrl: string; reportId: string; campaignsAnalyzed: number }>(
        'generate-meta-report',
        {
          body: { clientId, connectionIds, startDate, endDate },
          timeoutMs: 240_000, // 4 min — generación + Claude AI puede tardar más que Shopify
        },
      );

      if (error) {
        if (error.includes('tardó') || error.includes('demasiado')) {
          await fetchHistory();
          const recent = history.find(
            (r) => r.from_date === startDate && r.to_date === endDate && r.status === 'completed',
          );
          if (recent?.signed_url) {
            setGeneratedUrl(recent.signed_url);
            window.open(recent.signed_url, '_blank');
            toast.success('Informe ejecutivo listo');
            return;
          }
          toast.warning('La generación tardó más de lo esperado. Revisá el historial en unos minutos.');
        } else {
          toast.error(`Error al generar informe: ${error}`);
        }
        return;
      }

      if (data?.pdfUrl) {
        setGeneratedUrl(data.pdfUrl);
        toast.success(
          data.campaignsAnalyzed
            ? `Informe ejecutivo listo · ${data.campaignsAnalyzed} campañas analizadas`
            : 'Informe ejecutivo listo',
        );
        window.open(data.pdfUrl, '_blank');
        fetchHistory();
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'desconocido'}`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Informe Ejecutivo de Meta Ads
          </DialogTitle>
          <DialogDescription>
            Generá un PDF con análisis completo de tus campañas Meta — 12 secciones con gráficos, matriz BCG, análisis de fatiga creativa, breakdowns de audiencia y recomendaciones IA listas para tomar acción.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="font-semibold flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                Felipe está armando tu informe
              </p>
              <p className="text-sm text-muted-foreground">
                Esto toma 2-3 minutos. Estoy analizando campañas, audiencias, fatiga creativa y armando recomendaciones.
              </p>
            </div>
          </div>
        ) : generatedUrl ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <div className="text-center space-y-1">
              <p className="font-semibold">Informe listo</p>
              <p className="text-sm text-muted-foreground">Se abrió en una pestaña nueva. También podés descargarlo desde abajo.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => window.open(generatedUrl, '_blank')} variant="default">
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
              <Button onClick={() => { setGeneratedUrl(null); setRange(presetRange(30)); }} variant="outline">
                Generar otro
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Período</label>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => applyPreset(() => presetRange(7))}>Últimos 7 días</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(() => presetRange(14))}>14 días</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(() => presetRange(30))}>30 días</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(() => presetRange(90))}>90 días</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(thisMonthRange)}>Mes actual</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(lastMonthRange)}>Mes anterior</Button>
                <Button size="sm" variant="outline" onClick={() => applyPreset(thisQuarterRange)}>Trimestre actual</Button>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !range && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate && toDate
                      ? `${formatDate(formatDateISO(fromDate))} → ${formatDate(formatDateISO(toDate))} · ${periodDays} días`
                      : 'Elegir rango personalizado'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    defaultMonth={fromDate}
                    selected={range}
                    onSelect={setRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Multi-account toggle (solo si tiene 2+ conexiones Meta) */}
            {allMetaConnectionIds.length > 1 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Cuentas Meta</label>
                <Button
                  variant={includeAllAccounts ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIncludeAllAccounts((v) => !v)}
                  className="w-full justify-start"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {includeAllAccounts
                    ? `Incluir las ${allMetaConnectionIds.length} cuentas Meta del cliente`
                    : 'Solo la cuenta seleccionada'}
                </Button>
              </div>
            )}

            {tooShort && (
              <Card className="p-4 border-amber-300 bg-amber-50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="font-semibold text-amber-900">El período es muy corto</p>
                      <p className="text-sm text-amber-800">
                        Los reportes están diseñados para análisis de tendencias. Para períodos menores a {MIN_DAYS} días, usá el dashboard en vivo.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={expandTo7Days}>
                      Ampliar a 7 días
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {history.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Informes recientes</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {history.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded border bg-background hover:bg-muted/50 text-sm">
                      <div>
                        <span className="font-medium">{formatDate(r.from_date)} → {formatDate(r.to_date)}</span>
                        {r.status !== 'completed' && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.status}</span>
                        )}
                      </div>
                      {r.status === 'completed' && r.signed_url && (
                        <Button size="sm" variant="ghost" onClick={() => window.open(r.signed_url!, '_blank')}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isGenerating && !generatedUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={!canGenerate}>
              <FileText className="w-4 h-4 mr-2" />
              Generar Informe
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
