import { TrendingUp, Eye, Layers, Sparkles, Megaphone, Paintbrush } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, type CampaignType } from '../templates/TemplatePresets';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, Eye, Layers, Sparkles, Megaphone, Paintbrush,
};

interface QuickCreatePopoverProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: CampaignType) => void;
}

export function QuickCreatePopover({ children, open, onOpenChange, onSelect }: QuickCreatePopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">Crear campaña</p>
        <div className="grid grid-cols-3 gap-1">
          {CAMPAIGN_TYPE_LIST.map(type => {
            const t = CAMPAIGN_TEMPLATES[type];
            const Icon = ICONS[t.icon];
            return (
              <button
                key={type}
                onClick={() => { onSelect(type); onOpenChange(false); }}
                className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-muted transition-colors text-center"
                title={t.label}
              >
                {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
                <span className="text-[10px] leading-tight text-foreground">{t.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
