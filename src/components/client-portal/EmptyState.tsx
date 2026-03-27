import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tip?: string;
  variant?: 'default' | 'compact';
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, tip, variant = 'default' }: EmptyStateProps) {
  const isCompact = variant === 'compact';

  return (
    <div className={`flex flex-col items-center justify-center ${isCompact ? 'py-8 px-3' : 'py-16 px-4'} text-center`}>
      <div className={`rounded-full bg-gradient-to-br from-primary/10 to-accent/10 ${isCompact ? 'p-3 mb-3' : 'p-4 mb-4'}`}>
        <Icon className={`${isCompact ? 'h-6 w-6' : 'h-8 w-8'} text-primary/70`} />
      </div>
      <h3 className={`${isCompact ? 'text-base' : 'text-lg'} font-semibold mb-2`}>{title}</h3>
      <p className={`text-muted-foreground max-w-md ${tip ? 'mb-3' : 'mb-6'} ${isCompact ? 'text-sm' : ''}`}>{description}</p>
      {tip && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 mb-5 max-w-sm">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <span>{tip}</span>
        </div>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} size={isCompact ? 'sm' : 'default'}>{actionLabel}</Button>
      )}
    </div>
  );
}
