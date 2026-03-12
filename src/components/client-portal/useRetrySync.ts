import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

interface UseRetrySyncOptions {
  maxRetries?: number;
  baseDelay?: number;
}

export function useRetrySync({ maxRetries = 2, baseDelay = 2000 }: UseRetrySyncOptions = {}) {
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const execute = useCallback(async (fn: () => Promise<any>, label: string) => {
    setAttempt(0);
    setRetrying(false);

    const tryCall = async (currentAttempt: number): Promise<any> => {
      try {
        const result = await fn();
        if (result?.error) throw new Error(result.error);
        return result;
      } catch (err: any) {
        if (currentAttempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, currentAttempt);
          setRetrying(true);
          setAttempt(currentAttempt + 1);
          toast.info(`Reintentando ${label}...`, {
            description: `Intento ${currentAttempt + 2} de ${maxRetries + 1} en ${delay / 1000}s`,
          });
          await new Promise(resolve => {
            timeoutRef.current = setTimeout(resolve, delay);
          });
          return tryCall(currentAttempt + 1);
        }
        setRetrying(false);
        throw err;
      }
    };

    try {
      const result = await tryCall(0);
      setRetrying(false);
      return result;
    } catch (err) {
      setRetrying(false);
      throw err;
    }
  }, [maxRetries, baseDelay]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setRetrying(false);
  }, []);

  return { execute, retrying, attempt, cancel };
}
