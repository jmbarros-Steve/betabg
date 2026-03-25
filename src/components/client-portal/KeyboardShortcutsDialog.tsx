import { useState, useEffect, useCallback } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["Cmd", "K"], description: "Búsqueda rápida" },
  { keys: ["?"], description: "Mostrar atajos" },
  { keys: ["1"], description: "Steve (Chat)" },
  { keys: ["2"], description: "Brief" },
  { keys: ["3"], description: "Métricas" },
  { keys: ["4"], description: "Conexiones" },
  { keys: ["5"], description: "Configuración" },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Atajos de teclado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between py-1.5 px-1"
            >
              <span className="text-sm text-muted-foreground">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex items-center justify-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground min-w-[24px]"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useShortcutsDialog() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (
      e.key === "?" &&
      !e.ctrlKey &&
      !e.metaKey &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target instanceof HTMLSelectElement)
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { open, setOpen };
}
