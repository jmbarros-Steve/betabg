import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { fetchReportData } from '@/lib/report/report-data-fetcher';
import { generateInsights, generateStrategy } from '@/lib/report/report-ai-insights';
import { renderReportPDF } from '@/lib/report/report-pdf-renderer';

interface ReportGeneratorButtonProps {
  clientId: string;
}

export function ReportGeneratorButton({ clientId }: ReportGeneratorButtonProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [includeAI, setIncludeAI] = useState(false);
  const [range, setRange] = useState<DayPickerRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  });

  async function handleGenerate() {
    if (!range?.from || !range?.to) {
      toast.error('Selecciona un rango de fechas');
      return;
    }

    setGenerating(true);
    try {
      setStatus('Cargando datos...');
      const data = await fetchReportData(clientId, { from: range.from, to: range.to });

      setStatus('Generando recomendaciones...');
      data.insights = await generateInsights(data, includeAI);

      setStatus('Generando estrategia...');
      data.strategy = generateStrategy(data);

      setStatus('Generando PDF...');
      await renderReportPDF(data);

      toast.success('Reporte descargado');
      setOpen(false);
    } catch (err) {
      console.error('Error generating report:', err);
      toast.error('Error al generar el reporte');
    } finally {
      setGenerating(false);
      setStatus('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Generar Reporte PDF">
          <FileText className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar Reporte de Performance</DialogTitle>
          <DialogDescription>
            Selecciona el periodo y genera un PDF con todas las metricas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-2">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            disabled={{ after: new Date() }}
            className="rounded-md border"
          />
        </div>

        {range?.from && range?.to && (
          <p className="text-sm text-muted-foreground text-center">
            {range.from.toLocaleDateString('es-CL')} - {range.to.toLocaleDateString('es-CL')}
          </p>
        )}

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="include-ai"
            checked={includeAI}
            onCheckedChange={(checked) => setIncludeAI(checked === true)}
          />
          <label htmlFor="include-ai" className="text-sm cursor-pointer">
            Incluir recomendaciones AI de Steve
          </label>
        </div>

        {status && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={generating || !range?.from || !range?.to}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generar Reporte
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
