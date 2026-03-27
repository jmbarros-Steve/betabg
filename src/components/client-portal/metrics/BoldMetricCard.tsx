import { Card, CardContent } from '@/components/ui/card';
import {
  type MetricKey,
  METRICS,
  getTargetStatus,
  getTargetColor,
  getTargetBorderColor,
  getTargetBgColor,
  getProgressPercent,
  type TargetStatus,
} from '@/lib/metric-utils';
import { cn } from '@/lib/utils';

interface BoldMetricCardProps {
  metricKey: MetricKey;
  value: number;
  target?: number;
}

export function BoldMetricCard({ metricKey, value, target }: BoldMetricCardProps) {
  const def = METRICS[metricKey];
  const Icon = def.icon;
  const status: TargetStatus = target ? getTargetStatus(value, target, def.higherIsBetter) : 'none';
  const borderColor = getTargetBorderColor(status);
  const progress = target ? getProgressPercent(value, target, def.higherIsBetter) : 0;

  return (
    <Card
      className={cn(
        'border-l-4 transition-all duration-200 hover:shadow-md hover:scale-[1.02] bg-gradient-to-br',
        borderColor,
        def.bgGradient,
        'to-transparent'
      )}
    >
      <CardContent className="pt-5 pb-4 px-5">
        {/* Header: label + icon */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">{def.label}</span>
          <div className={cn('p-2 rounded-xl', status === 'none' ? 'bg-slate-100' : `${getTargetBgColor(status)}/10`)}>
            <Icon className={cn('w-4 h-4', status === 'none' ? 'text-slate-500' : getTargetColor(status))} />
          </div>
        </div>

        {/* Big number */}
        <p className="text-3xl font-bold tracking-tight tabular-nums">{def.format(value)}</p>

        {/* Target comparison */}
        {target !== undefined && target > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className={cn('w-2 h-2 rounded-full', getTargetBgColor(status))} />
              <span className={cn('font-medium', getTargetColor(status))}>
                Meta: {def.format(target)}
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', getTargetBgColor(status))}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
