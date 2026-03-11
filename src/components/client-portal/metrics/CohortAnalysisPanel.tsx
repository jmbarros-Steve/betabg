import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
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
                  <td className="py-2 px-3 text-center">
                    {cohort.month1 !== undefined ? (
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          getRetentionColor((cohort.month1 / cohort.month0) * 100)
                        )}
                      >
                        {((cohort.month1 / cohort.month0) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {cohort.month2 !== undefined ? (
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          getRetentionColor((cohort.month2 / cohort.month0) * 100)
                        )}
                      >
                        {((cohort.month2 / cohort.month0) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {cohort.month3 !== undefined ? (
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          getRetentionColor((cohort.month3 / cohort.month0) * 100)
                        )}
                      >
                        {((cohort.month3 / cohort.month0) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {cohort.month4 !== undefined ? (
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          getRetentionColor((cohort.month4 / cohort.month0) * 100)
                        )}
                      >
                        {((cohort.month4 / cohort.month0) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {cohort.month5 !== undefined ? (
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          getRetentionColor((cohort.month5 / cohort.month0) * 100)
                        )}
                      >
                        {((cohort.month5 / cohort.month0) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          M0 = clientes nuevos del mes | M1-M5 = % que volvieron a comprar en meses siguientes
        </p>
      </CardContent>
    </Card>
  );
}
