import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
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
  const months = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];

  return (
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Cohort Analysis - Retención de Clientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cohorts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin datos de cohortes"
            description="Se necesitan al menos 2 meses de datos para el análisis de cohortes"
          />
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Cohorte</th>
                {months.map((m) => (
                  <th key={m} className="text-center py-2 px-3 text-muted-foreground font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohort} className="border-t border-border">
                  <td className="py-2 px-3 font-medium">{cohort.cohort}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={cn('px-2 py-1 rounded text-xs font-medium', getRetentionColor(100))}>
                      {cohort.month0}
                    </span>
                  </td>
                  {[1, 2, 3, 4, 5].map((m) => {
                    const monthVal = cohort[`month${m}` as keyof CohortData] as number | undefined;
                    const rate = monthVal !== undefined && cohort.month0 > 0
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
          M0 = clientes nuevos del mes | M1-M5 = % que volvieron a comprar en meses siguientes
        </p>
        </>
        )}
      </CardContent>
    </Card>
  );
}
