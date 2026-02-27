import {
  ShoppingCart, PackageCheck, UserCheck, Eye, Crown, Gift,
  PackagePlus, TrendingDown, HandHeart, Sunset, Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type FlowTemplate,
  FLOW_CATEGORY_LABELS,
  FLOW_PRIORITY_COLORS,
} from './FlowTemplates';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart,
  PackageCheck,
  UserCheck,
  Eye,
  Crown,
  Gift,
  PackagePlus,
  TrendingDown,
  HandHeart,
  Sunset,
};

type FlowStatus = 'not_created' | 'draft' | 'active' | 'paused';

interface FlowCardProps {
  template: FlowTemplate;
  status: FlowStatus;
  metrics?: { revenue: number; sent: number; openRate: number };
  recommended?: boolean;
  onAction: (flowId: string, action: 'create' | 'view' | 'activate') => void;
}

const STATUS_LABELS: Record<FlowStatus, string> = {
  not_created: 'No creado',
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
};

const STATUS_VARIANTS: Record<FlowStatus, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  not_created: 'outline',
  draft: 'secondary',
  active: 'default',
  paused: 'destructive',
};

function formatDelay(hours: number): string {
  if (hours === 0) return 'Inmediato';
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''}`;
}

function getTimingSummary(template: FlowTemplate): string {
  const emailCount = template.emails.length;
  const maxDelay = Math.max(...template.emails.map((e) => e.delayHours));
  const totalDays = Math.round(maxDelay / 24);
  const dayLabel = totalDays === 0 ? 'inmediato' : `${totalDays} dia${totalDays > 1 ? 's' : ''}`;
  return `${emailCount} email${emailCount > 1 ? 's' : ''} · ${dayLabel}`;
}

export function FlowCard({ template, status, metrics, recommended, onAction }: FlowCardProps) {
  const Icon = ICON_MAP[template.icon] || Zap;
  const borderColor = FLOW_PRIORITY_COLORS[template.priority];

  const handleAction = () => {
    if (status === 'not_created') {
      onAction(template.id, 'create');
    } else if (status === 'draft' || status === 'paused') {
      onAction(template.id, 'view');
    } else {
      onAction(template.id, 'activate');
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:shadow-md relative overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
      onClick={handleAction}
    >
      <CardContent className="p-5 flex flex-col gap-3">
        {/* Header: Icon + Name + Category */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${borderColor}15` }}
            >
              <Icon className="w-4.5 h-4.5" style={{ color: borderColor }} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight truncate">{template.nameEs}</h3>
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/70">
                {FLOW_CATEGORY_LABELS[template.category]}
              </span>
            </div>
          </div>
          <Badge variant={STATUS_VARIANTS[status]} className="shrink-0 text-[10px]">
            {STATUS_LABELS[status]}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>

        {/* Timing summary */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="w-3 h-3" />
          <span>{getTimingSummary(template)}</span>
        </div>

        {/* Metrics (if available) */}
        {metrics && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <p className="text-xs font-semibold">${metrics.revenue.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Revenue</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold">{metrics.openRate}%</p>
              <p className="text-[10px] text-muted-foreground">Apertura</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold">{metrics.sent.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Enviados</p>
            </div>
          </div>
        )}

        {/* Recommended chip */}
        {recommended && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 rounded-full px-2.5 py-1 w-fit">
            <span>Recomendado por Steve</span>
          </div>
        )}

        {/* Action button */}
        <Button
          variant={status === 'active' ? 'outline' : 'default'}
          size="sm"
          className="w-full mt-auto"
          onClick={(e) => {
            e.stopPropagation();
            handleAction();
          }}
        >
          {status === 'not_created' && 'Crear'}
          {status === 'draft' && 'Ver detalle'}
          {status === 'active' && 'Activo \u2713'}
          {status === 'paused' && 'Ver detalle'}
        </Button>
      </CardContent>
    </Card>
  );
}
