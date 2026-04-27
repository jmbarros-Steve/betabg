import { useState, useRef, useCallback } from 'react';

interface DialogState {
  resolve?: (value: { useVoice: boolean; useMusic: boolean } | null) => void;
}

const SESSION_KEY = 'audio-override-session';

interface SessionPref {
  useVoice: boolean;
  useMusic: boolean;
  clientId: string;
}

function readSession(clientId: string): { useVoice: boolean; useMusic: boolean } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SessionPref;
    if (p.clientId !== clientId) return null;
    return { useVoice: p.useVoice, useMusic: p.useMusic };
  } catch {
    return null;
  }
}

function writeSession(p: SessionPref) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function useAudioOverridesDialog(clientId: string) {
  const [open, setOpen] = useState(false);
  const stateRef = useRef<DialogState>({});

  const askForOverrides = useCallback(
    (defaults: {
      useVoice: boolean;
      useMusic: boolean;
    }): Promise<{ useVoice: boolean; useMusic: boolean } | null> => {
      // 0. Si ningún canal está configurado (ambos defaults false) → no abrir dialog
      if (!defaults.useVoice && !defaults.useMusic) {
        return Promise.resolve({ useVoice: false, useMusic: false });
      }

      // 1. Si hay preferencia en sesión, usarla sin abrir dialog
      const cached = readSession(clientId);
      if (cached) return Promise.resolve(cached);

      // 2. Abrir dialog y esperar respuesta
      return new Promise((resolve) => {
        stateRef.current.resolve = resolve;
        setOpen(true);
      });
    },
    [clientId],
  );

  const handleConfirm = useCallback(
    (opts: { useVoice: boolean; useMusic: boolean; rememberSession: boolean }) => {
      if (opts.rememberSession) {
        writeSession({ useVoice: opts.useVoice, useMusic: opts.useMusic, clientId });
      }
      stateRef.current.resolve?.({ useVoice: opts.useVoice, useMusic: opts.useMusic });
      stateRef.current.resolve = undefined;
      setOpen(false);
    },
    [clientId],
  );

  const handleCancel = useCallback(() => {
    stateRef.current.resolve?.(null);
    stateRef.current.resolve = undefined;
    setOpen(false);
  }, []);

  return { open, askForOverrides, handleConfirm, handleCancel };
}
