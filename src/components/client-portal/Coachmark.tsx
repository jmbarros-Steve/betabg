import { useState, useEffect } from "react";
import { X, Lightbulb } from "lucide-react";

interface CoachmarkProps {
  id: string;
  message: string;
  className?: string;
}

export function Coachmark({ id, message, className = "" }: CoachmarkProps) {
  const storageKey = `steve_coachmark_${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, "true");
  };

  if (!visible) return null;

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}>
      <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <p className="flex-1 text-foreground">{message}</p>
      <button onClick={dismiss} className="p-0.5 hover:bg-muted rounded shrink-0">
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
