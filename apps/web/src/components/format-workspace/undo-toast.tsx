import { Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
};

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  duration = 8000,
}: UndoToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in">
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background px-4 py-3 shadow-lg">
        <span className="text-sm">{message}</span>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          onClick={() => {
            onUndo();
            setVisible(false);
          }}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Rückgängig
        </button>
        <button
          type="button"
          className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          aria-label="Schließen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
