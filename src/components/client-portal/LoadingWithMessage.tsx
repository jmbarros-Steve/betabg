import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const DEFAULT_MESSAGES = [
  "Cargando datos...",
  "Sincronizando metricas...",
  "Casi listo...",
];

interface LoadingWithMessageProps {
  messages?: string[];
  interval?: number;
  className?: string;
}

export function LoadingWithMessage({
  messages = DEFAULT_MESSAGES,
  interval = 3000,
  className = "",
}: LoadingWithMessageProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [messages.length, interval]);

  return (
    <div className={`flex items-center justify-center gap-3 py-8 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground animate-pulse">
        {messages[index]}
      </span>
    </div>
  );
}
