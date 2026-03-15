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

function getRetentionColor(rate: number): string {
  if (rate >= 50) return 'bg-primary text-primary-foreground';
  if (rate >= 30) return 'bg-primary/70 text-primary-foreground';
  if (rate >= 20) return 'bg-primary/50 text-primary-foreground';
  if (rate >= 10) return 'bg-primary/30 text-foreground';
  if (rate > 0) return 'bg-primary/15 text-foreground';
  return 'bg-muted text-muted-foreground';
}

export function CohortAnalysisPanel({ cohorts }: CohortAnalysisPanelProps) {
  return (
    <Card className="bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/[0.12] transition-all">
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
              <tr className="bg-white/[0.04]">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Mes</th>
                <th className="text-center py-2 px-3 text-muted-foreground font-medium">Nuevos</th>
                {[1, 2, 3, 4, 5].map((m) => (
                  <th key={m} className="text-center py-2 px-3 text-muted-foreground font-medium">
                    Mes {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohort} className="border-t border-white/[0.06]">
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{cohort.cohort}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-2 py-1 rounded text-xs font-semibold bg-primary/10 text-primary">
                      {cohort.month0}
                    </span>
                  </td>
                  {[1, 2, 3, 4, 5].map((m) => {
                    const monthVal = cohort[`month${m}` as keyof CohortData] as number | undefined;
                    const rate = monthVal !== undefined && cohort.month0 > 0 && !isNaN(cohort.month0)
                      ? (monthVal / cohort.month0) * 100
                      : undefined;
                    return (
                      <td key={m} className="py-2 px-3 text-center">
                        {rate !== undefined ? (
                          <span
                            className={cn(
                              'px-2 py-1 rounded text-xs font-medium',
                              getRetentionColor(rate)
                            )}
                          >
                            {rate.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
