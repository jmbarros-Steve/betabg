import { Plus } from 'lucide-react';
import { CalendarCampaignCard } from './CalendarCampaignCard';
import type { CampaignType } from '../templates/TemplatePresets';

interface CampaignItem {
  id: string;
  name: string;
  campaign_type: string;
  status: string | null;
}

interface CalendarDayCellProps {
  day: number | null;
  isToday: boolean;
  campaigns: CampaignItem[];
  onCampaignClick: (id: string) => void;
  onQuickCreate: (day: number) => void;
}

export function CalendarDayCell({ day, isToday, campaigns, onCampaignClick, onQuickCreate }: CalendarDayCellProps) {
  if (day === null) {
    return <div className="min-h-[100px] bg-muted/30 border border-slate-200 rounded-xl" />;
  }

  return (
    <div
      className={`min-h-[100px] border rounded-xl p-1.5 flex flex-col gap-1 transition-colors ${
        isToday ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20' : 'border-slate-200 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
            isToday ? 'bg-orange-500 text-white' : 'text-muted-foreground'
          }`}
        >
          {day}
        </span>
        <button
          onClick={() => onQuickCreate(day)}
          className="w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          style={{ opacity: undefined }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '')}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 overflow-hidden">
        {campaigns.map(c => (
          <CalendarCampaignCard
            key={c.id}
            id={c.id}
            name={c.name}
            campaignType={c.campaign_type as CampaignType}
            status={c.status}
            onClick={onCampaignClick}
          />
        ))}
      </div>
    </div>
  );
}
