import { CheckCircle } from 'lucide-react';

export interface StepDef {
  key: string;
  label: string;
  icon: React.ElementType;
}

interface StepIndicatorProps {
  steps: StepDef[];
  currentIndex: number;
  onStepClick: (index: number) => void;
}

export default function StepIndicator({ steps, currentIndex, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const isCurrent = i === currentIndex;
        const isPast = i < currentIndex;
        return (
          <button
            key={s.key}
            onClick={() => isPast && onStepClick(i)}
            disabled={!isPast && !isCurrent}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              isCurrent
                ? 'bg-blue-600 text-white'
                : isPast
                ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700'
                : 'bg-slate-200 text-muted-foreground cursor-default'
            }`}
          >
            {isPast ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
