import { useEffect, useState } from "react";
import { Check } from "lucide-react";

interface SuccessCelebrationProps {
  message: string;
  onDone?: () => void;
  duration?: number;
}

export function SuccessCelebration({ message, onDone, duration = 3000 }: SuccessCelebrationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-green-500 flex items-center justify-center success-pulse">
        <Check className="h-5 w-5 text-white" />
      </div>
      <p className="text-sm font-medium text-green-800">{message}</p>
    </div>
  );
}
