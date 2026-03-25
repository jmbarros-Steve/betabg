import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, HelpCircle } from 'lucide-react';
import { EmptyState } from '@/components/client-portal/EmptyState';
import { cn } from '@/lib/utils';

interface CohortData {
  cohort: string; // e.g., "Ene 2025"
  month0: number;
  month1?: number;
  month2?: number;
  month3?: number;
  month4?: number;
  month5?: number;
}

interface CohortAnalysisPanelProps {
  cohorts: CohortData[];
}

function getRetentionColor(rate: number): { bg: string; text: string } {
  if (rate >= 50) return { bg: '#059669', text: '#ffffff' };  // emerald-600
  if (rate >= 31) return { bg: '#10B981', text: '#ffffff' };  // emerald-500
  if (rate >= 21) return { bg: '#2563EB', text: '#ffffff' };  // blue-600
  if (rate >= 11) return { bg: '#93C5FD', text: '#1E3A5F' };  // blue-300
  if (rate > 0) return { bg: '#DBEAFE', text: '#1E40AF' };   // blue-100
  return { bg: '#F1F5F9', text: '#94A3B8' };                  // slate-100
}

export function CohortAnalysisPanel({ cohorts }: CohortAnalysisPanelProps) {
  return (
    <Card className="bg-card border border-border rounded-xl card-hover chart-animate">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4" />
          Retención de Clientes
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>Muestra cuántos clientes nuevos entraron cada mes (Nuevos) y qué porcentaje volvió a comprar en los meses siguientes.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cohorts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin datos de cohortes"
            description="Se necesitan al menos 2 meses de datos para el análisis de retención"
          />
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium rounded-l-lg">Mes</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Nuevos</th>
                {[1, 2, 3, 4, 5].map((m) => (
                  <th key={m} className={cn('text-center py-2.5 px-3 text-muted-foreground font-medium', m === 5 && 'rounded-r-lg')}>
                    Mes {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohort} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3 font-medium whitespace-nowrap">{cohort.cohort}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary">
                      {cohort.month0}
                    </span>
                  </td>
                  {[1, 2, 3, 4, 5].map((m) => {
                    const monthVal = cohort[`month${m}` as keyof CohortData] as number | undefined;
                    const rate = monthVal !== undefined && cohort.month0 > 0 && !isNaN(cohort.month0)
                      ? (monthVal / cohort.month0) * 100
                      : undefined;
                    if (rate === undefined) {
                      return (
                        <td key={m} className="py-2.5 px-3 text-center">
                          <span className="text-muted-foreground">—</span>
                        </td>
                      );
                    }
                    const colors = getRetentionColor(rate);
                    return (
                      <td key={m} className="py-2.5 px-3 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="px-2.5 py-1 rounded-md text-xs font-medium cursor-default inline-block min-w-[3rem] transition-all hover:scale-105"
                                style={{ backgroundColor: colors.bg, color: colors.text }}
                              >
                                {rate.toFixed(0)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{monthVal} de {cohort.month0} clientes volvieron</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Nuevos = clientes que compraron por primera vez ese mes · Mes 1-5 = % de esos clientes que volvieron a comprar
        </p>
        </>
        )}
      </CardContent>
    </Card>
  );
}
