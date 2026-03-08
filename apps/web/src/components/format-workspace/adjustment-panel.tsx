import type { ViewMode } from "@/components/format-workspace/format-workspace";

type AdjustmentPanelProps = {
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

export function AdjustmentPanel({ view }: AdjustmentPanelProps) {
  const copy = formatCopy[view];

  return (
    <div className="rounded-[1.4rem] border border-dashed border-primary/35 bg-primary/5 px-4 py-4">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Adjustment mode
        </p>
        <p className="text-sm text-foreground">{copy.detail}</p>
        <p className="text-sm text-muted-foreground">{copy.nextStep}</p>
      </div>
    </div>
  );
}
