import { getViewLabel } from "@/components/format-workspace/labels";
import type { ViewMode } from "@/components/format-workspace/types";

type AdjustmentModeGuideProps = {
  onDismiss: () => void;
  view: ViewMode;
};

export function AdjustmentModeGuide({
  onDismiss,
  view,
}: AdjustmentModeGuideProps) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-6 z-20 flex justify-center">
      <div
        data-testid={`adjustment-mode-guide-${view}`}
        className="pointer-events-auto w-full max-w-md rounded-[1.4rem] border border-border/80 bg-background/96 p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          {getViewLabel(view)} anpassen
        </p>
        <p className="mt-2 text-sm text-foreground">
          Markiere die Stelle, die anders aussehen soll. Beschreibe dann kurz
          deinen Wunsch, und die Änderung erscheint direkt hier.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Du musst kein Regel-JSON lesen oder eine Vorschau vergleichen.
          </span>
          <button
            className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-3 py-2 font-medium text-foreground transition hover:bg-foreground/5"
            type="button"
            onClick={onDismiss}
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
