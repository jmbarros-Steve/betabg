import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

export function useDraftSaver(key: string, data: unknown, interval = 30000) {
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      try {
        localStorage.setItem(`steve_draft_${key}`, JSON.stringify(dataRef.current));
        toast("Borrador guardado", { id: "draft-saved", duration: 2000 });
      } catch {
        // localStorage full — silently ignore
      }
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [key, interval]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(`steve_draft_${key}`);
  }, [key]);

  return { clearDraft };
}

export function useDraftLoader<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`steve_draft_${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
