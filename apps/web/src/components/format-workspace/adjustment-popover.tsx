import type { AdjustmentSessionDetail } from "@chat-exporter/shared";
import { X } from "lucide-react";
import { type FormEvent, useRef } from "react";
import {
  adjustmentLabels,
  getAdjustViewLabel,
} from "@/components/format-workspace/labels";
import type {
  FloatingAdjustmentAnchor,
  ViewMode,
} from "@/components/format-workspace/types";
import {
  getPopoverPosition,
  usePopoverPosition,
} from "@/components/format-workspace/use-popover-position";

type AdjustmentPopoverProps = {
  anchor: FloatingAdjustmentAnchor;
  containerDimensions: { width: number; height: number };
  containerScrollTop: number;
  draftMessage: string;
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onDraftMessageChange: (value: string) => void;
  onRejectLastChange: (() => void) | undefined;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  sessionDetail: AdjustmentSessionDetail | null;
  showReply: boolean;
  view: ViewMode;
};

function getLastAssistantMessage(
  sessionDetail: AdjustmentSessionDetail | null,
) {
  return (
    sessionDetail?.messages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant")?.content ?? null
  );
}

export function AdjustmentPopover({
  anchor,
  containerDimensions,
  containerScrollTop,
  draftMessage,
  error,
  isLoading,
  isSubmitting,
  onClose,
  onDraftMessageChange,
  onRejectLastChange,
  onSubmitMessage,
  sessionDetail,
  showReply,
  view,
}: AdjustmentPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dimensions = usePopoverPosition(popoverRef);
  const lastAssistantMessage = getLastAssistantMessage(sessionDetail);
  const isApplied = sessionDetail?.session.status === "applied";

  const position = getPopoverPosition(
    anchor,
    dimensions,
    containerDimensions,
    containerScrollTop,
  );

  return (
    <div
      ref={popoverRef}
      data-testid={`adjustment-popover-${view}`}
      className="absolute z-50"
      style={{
        left: position.left,
        maxWidth: position.maxWidth,
        top: position.top,
        width: "22rem",
      }}
    >
      <div className="rounded-[1.4rem] border border-border bg-background shadow-[0_24px_80px_-32px_rgba(15,23,42,0.5)]">
        <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {getAdjustViewLabel(view)}
            </p>
          </div>
          <button
            className="rounded-full p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <span className="sr-only">{adjustmentLabels.closeLabel}</span>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {error ? (
            <div
              data-testid="adjustment-error"
              className="rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-3 text-sm text-red-900"
            >
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-border/80 bg-card/75 px-3 py-3 text-sm text-muted-foreground">
              {adjustmentLabels.loadingMessage}
            </div>
          ) : null}

          {showReply && lastAssistantMessage ? (
            <div
              data-testid="adjustment-last-reply"
              className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-foreground"
            >
              <p className="whitespace-pre-wrap">{lastAssistantMessage}</p>
            </div>
          ) : null}

          <form className="space-y-3" onSubmit={onSubmitMessage}>
            <label className="block text-sm text-foreground">
              <span className="sr-only">{adjustmentLabels.inputLabel}</span>
              <textarea
                data-testid="adjustment-draft-message"
                className="min-h-24 w-full rounded-2xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                disabled={isLoading}
                placeholder={
                  isApplied
                    ? adjustmentLabels.followUpPlaceholder
                    : adjustmentLabels.adjustmentPlaceholder
                }
                value={draftMessage}
                onChange={(event) => onDraftMessageChange(event.target.value)}
              />
            </label>

            <p className="text-sm text-muted-foreground">
              {isApplied
                ? adjustmentLabels.appliedHint
                : adjustmentLabels.defaultHint}
            </p>

            <div className="flex items-center justify-between gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
                type="button"
                onClick={onClose}
              >
                {adjustmentLabels.cancel}
              </button>
              {showReply && !isLoading && onRejectLastChange != null ? (
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
                  type="button"
                  onClick={onRejectLastChange}
                >
                  {adjustmentLabels.discard}
                </button>
              ) : null}
              <button
                data-testid="adjustment-send"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  isLoading || isSubmitting || draftMessage.trim().length === 0
                }
                type="submit"
              >
                {isSubmitting
                  ? adjustmentLabels.sendPending
                  : adjustmentLabels.send}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
