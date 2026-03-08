import type { FormEvent } from "react";

import type { AdjustmentPreview, AdjustmentSessionDetail } from "@chat-exporter/shared";

import type {
  AdjustmentSelection,
  ViewMode
} from "@/components/format-workspace/types";

type AdjustmentPanelProps = {
  draftMessage: string;
  error: string | null;
  isApplying: boolean;
  isLoading: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  onApplyPreview: () => void;
  onDraftMessageChange: (value: string) => void;
  onGeneratePreview: () => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  selection: AdjustmentSelection | null;
  sessionDetail: AdjustmentSessionDetail | null;
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

export function AdjustmentPanel({
  draftMessage,
  error,
  isApplying,
  isLoading,
  isPreviewing,
  isSubmitting,
  onApplyPreview,
  onDraftMessageChange,
  onGeneratePreview,
  onSubmitMessage,
  selection,
  sessionDetail,
  view
}: AdjustmentPanelProps) {
  const copy = formatCopy[view];
  const preview = sessionDetail?.session.previewArtifact as AdjustmentPreview | undefined;

  return (
    <div className="rounded-[1.4rem] border border-dashed border-primary/35 bg-primary/5 px-4 py-4">
      <div className="space-y-3">
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

        {error ? (
          <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-border/80 bg-background/75 px-3 py-3 text-sm text-muted-foreground">
            Starting an adjustment session for this selection.
          </div>
        ) : null}

        {sessionDetail ? (
          <div className="space-y-3 rounded-2xl border border-border/80 bg-background/75 p-3">
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <span>Session</span>
              <span>{sessionDetail.session.targetFormat}</span>
            </div>

            {sessionDetail.messages.length > 0 ? (
              <div className="space-y-2">
                {sessionDetail.messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-border/70 bg-card/85 px-3 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {message.role}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                      {message.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Describe what is wrong with this selection. The server session is ready and the
                next step can compile this into a format-specific rule.
              </p>
            )}

            <form className="space-y-3" onSubmit={onSubmitMessage}>
              <label className="block text-sm text-foreground">
                <span className="sr-only">Adjustment request</span>
                <textarea
                  className="min-h-28 w-full rounded-2xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  placeholder="Explain what is wrong here or how this format should change."
                  value={draftMessage}
                  onChange={(event) => onDraftMessageChange(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    isPreviewing ||
                    isLoading ||
                    sessionDetail.messages.every((message) => message.role !== "user")
                  }
                  type="button"
                  onClick={onGeneratePreview}
                >
                  {isPreviewing ? "Building preview..." : "Generate preview"}
                </button>

                <button
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting || draftMessage.trim().length === 0}
                  type="submit"
                >
                  {isSubmitting ? "Sending..." : "Send"}
                </button>
              </div>
            </form>

            {preview ? (
              <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-primary">
                  <span>Preview</span>
                  <span>{preview.draftRule.kind}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{preview.summary}</p>
                <p className="text-sm text-muted-foreground">{preview.rationale}</p>

                {preview.limitations.length > 0 ? (
                  <div className="space-y-1">
                    {preview.limitations.map((limitation) => (
                      <p key={limitation} className="text-sm text-muted-foreground">
                        {limitation}
                      </p>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border/80 bg-background/80 p-3">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
                    <code>{JSON.stringify(preview.draftRule, null, 2)}</code>
                  </pre>
                </div>

                <div className="flex justify-end">
                  <button
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isApplying || sessionDetail.session.status === "applied"}
                    type="button"
                    onClick={onApplyPreview}
                  >
                    {sessionDetail.session.status === "applied"
                      ? "Applied"
                      : isApplying
                        ? "Applying..."
                        : "Apply rule"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
