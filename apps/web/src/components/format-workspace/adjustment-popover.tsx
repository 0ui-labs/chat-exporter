import type { AdjustmentSessionDetail } from "@chat-exporter/shared";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { X } from "lucide-react";
import {
  type FormEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { adjustmentLabels } from "@/components/format-workspace/labels";
import type {
  FloatingAdjustmentAnchor,
  ViewMode,
} from "@/components/format-workspace/types";
import { Button } from "@/components/ui/button";

type AdjustmentPopoverProps = {
  anchor: FloatingAdjustmentAnchor | null;
  containerRef: React.RefObject<HTMLElement | null>;
  draftMessage: string;
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onDraftMessageChange: (value: string) => void;
  onRejectLastChange: (() => void) | undefined;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
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

/** Debounce loading indicator to avoid flashing the overlay for fast API responses. */
const LOADING_DEBOUNCE_MS = 300;

function useDebouncedLoading(isLoading: boolean) {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), LOADING_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  return showLoading;
}

// Isolated textarea — prevents re-renders from parent state changes (isLoading, sessionDetail)
// from touching the textarea DOM node, which would cause a placeholder repaint.
const DraftTextarea = memo(function DraftTextarea({
  value,
  placeholder,
  onChangeRef,
}: {
  value: string;
  placeholder: string;
  onChangeRef: React.RefObject<(value: string) => void>;
}) {
  return (
    <textarea
      data-testid="adjustment-draft-message"
      className="min-h-24 w-full rounded-2xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChangeRef.current?.(event.target.value)}
    />
  );
});

const PopoverContent = memo(function PopoverContent({
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
  view: _view,
}: Omit<AdjustmentPopoverProps, "anchor" | "containerRef" | "open">) {
  const lastAssistantMessage = getLastAssistantMessage(sessionDetail);
  const showLoadingOverlay = useDebouncedLoading(isLoading);

  const onChangeRef = useRef(onDraftMessageChange);
  onChangeRef.current = onDraftMessageChange;

  const placeholder = showReply
    ? adjustmentLabels.followUpPlaceholder
    : adjustmentLabels.adjustmentPlaceholder;

  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-border bg-background shadow-[0_24px_80px_-32px_rgba(15,23,42,0.5)]">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          {adjustmentLabels.createRuleLabel}
        </p>
        <button
          className="rounded-full p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          type="button"
          onClick={onClose}
        >
          <span className="sr-only">{adjustmentLabels.closeLabel}</span>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative overflow-y-auto px-4 py-4">
        {error ? (
          <div
            data-testid="adjustment-error"
            className="absolute inset-x-4 top-4 z-10 rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-3 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        {showLoadingOverlay ? (
          <div className="absolute inset-x-4 top-4 z-10 rounded-2xl border border-border/80 bg-card/95 px-3 py-3 text-sm text-muted-foreground">
            {adjustmentLabels.loadingMessage}
          </div>
        ) : null}

        {showReply && lastAssistantMessage ? (
          <div
            data-testid="adjustment-last-reply"
            className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-foreground"
          >
            <p className="whitespace-pre-wrap">{lastAssistantMessage}</p>
          </div>
        ) : null}

        <form className="space-y-3" onSubmit={onSubmitMessage}>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: DraftTextarea contains a textarea */}
          <label className="block text-sm text-foreground">
            <span className="sr-only">{adjustmentLabels.inputLabel}</span>
            <DraftTextarea
              value={draftMessage}
              placeholder={placeholder}
              onChangeRef={onChangeRef}
            />
          </label>

          <p className="px-3 text-sm text-muted-foreground">
            {showReply
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
              <Button
                variant="destructive-outline"
                type="button"
                onClick={onRejectLastChange}
              >
                {adjustmentLabels.discard}
              </Button>
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
  );
});

export function AdjustmentPopover({
  anchor,
  containerRef,
  open,
  ...contentProps
}: AdjustmentPopoverProps) {
  const { refs, floatingStyles, isPositioned } = useFloating({
    open,
    placement: "top-start",
    middleware: [offset(12), flip({ padding: 16 }), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    if (!anchor) return;
    refs.setPositionReference({
      getBoundingClientRect() {
        const container = containerRef.current;
        if (!container) {
          return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            width: 0,
            height: 0,
          };
        }
        const cr = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const top = anchor.top - scrollTop + cr.top;
        const left = anchor.left + cr.left;
        return {
          x: left,
          y: top,
          top,
          left,
          bottom: top + anchor.height,
          right: left + anchor.width,
          width: anchor.width,
          height: anchor.height,
        };
      },
    });
  }, [anchor, containerRef, refs]);

  const visible = open && isPositioned;

  return (
    <div
      ref={refs.setFloating}
      data-testid={`adjustment-popover-${contentProps.view}`}
      className="z-50 w-[28rem] max-w-[calc(100vw-2rem)]"
      style={{
        ...floatingStyles,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-hidden={!visible}
    >
      <PopoverContent {...contentProps} />
    </div>
  );
}
