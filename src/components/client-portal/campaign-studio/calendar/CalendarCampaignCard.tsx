import { CAMPAIGN_TYPE_COLORS, type CampaignType } from '../templates/TemplatePresets';
import { Badge } from '@/components/ui/badge';

interface CalendarCampaignCardProps {
  id: string;
  name: string;
  campaignType: CampaignType;
  status: string | null;
  onClick: (id: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Borrador', variant: 'secondary' },
  scheduled: { label: 'Programado', variant: 'default' },
  sent: { label: 'Enviado', variant: 'outline' },
  sending: { label: 'Enviando', variant: 'destructive' },
};

export function CalendarCampaignCard({ id, name, campaignType, status, onClick }: CalendarCampaignCardProps) {
  const color = CAMPAIGN_TYPE_COLORS[campaignType] || '#6b7280';
  const statusInfo = STATUS_LABELS[status || 'draft'] || STATUS_LABELS.draft;

  return (
    <button
      onClick={() => onClick(id)}
      className="w-full text-left rounded-md px-2 py-1 text-xs hover:opacity-80 transition-opacity cursor-pointer group"
      style={{ borderLeft: `3px solid ${color}`, backgroundColor: `${color}10` }}
    >
      <p className="font-medium truncate text-foreground leading-tight">{name}</p>
      <Badge variant={statusInfo.variant} className="mt-0.5 text-[10px] px-1 py-0 h-4">
        {statusInfo.label}
      </Badge>
    </button>
  );
}
