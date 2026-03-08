import type {
  AdjustmentSelection,
  ViewMode
} from "@/components/format-workspace/types";

type AdjustmentPanelProps = {
  selection: AdjustmentSelection | null;
  view: ViewMode;
};

const formatCopy: Record<ViewMode, { detail: string; nextStep: string }> = {
  reader: {
    detail: "Use this mode to adjust how the in-app Reader presents the selected transcript.",
    nextStep: "Select a block or text region to open a context-aware adjustment chat."
  },
  markdown: {
    detail: "Use this mode to refine portable Markdown output with format-specific AI help.",
    nextStep: "Select lines or a rendered section to ask for a Markdown-safe rewrite."
  },
  handover: {
    detail: "Handover adjustments are not available yet.",
    nextStep: "Switch back to Reader or Markdown to start an adjustment session."
  },
  json: {
    detail: "JSON adjustments are not available yet.",
    nextStep: "Switch back to Reader or Markdown to start an adjustment session."
  }
};

export function AdjustmentPanel({ selection, view }: AdjustmentPanelProps) {
  const copy = formatCopy[view];

  return (
    <div className="rounded-[1.4rem] border border-dashed border-primary/35 bg-primary/5 px-4 py-4">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Adjustment mode
        </p>
        <p className="text-sm text-foreground">{copy.detail}</p>
        {selection ? (
          <div className="rounded-2xl border border-primary/20 bg-background/75 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Current selection
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {selection.lineStart && selection.lineEnd
                ? `markdown lines ${selection.lineStart}-${selection.lineEnd}`
                : `${selection.messageRole} message ${selection.messageIndex + 1} · ${selection.blockType}`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{selection.textQuote}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.nextStep}</p>
        )}
      </div>
    </div>
  );
}
