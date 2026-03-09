import type { FormEvent } from "react";
import { X } from "lucide-react";

import type { AdjustmentSessionDetail } from "@chat-exporter/shared";

import type {
  FloatingAdjustmentAnchor,
  ViewMode
} from "@/components/format-workspace/types";
import { getViewLabel } from "@/components/format-workspace/labels";

type AdjustmentPopoverProps = {
  anchor: FloatingAdjustmentAnchor;
  containerRect: DOMRect | null;
  draftMessage: string;
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onDraftMessageChange: (value: string) => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  selectionLabel: string;
  selectionQuote: string;
  sessionDetail: AdjustmentSessionDetail | null;
  view: ViewMode;
};

function getLastAssistantMessage(sessionDetail: AdjustmentSessionDetail | null) {
  return (
    sessionDetail?.messages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant")?.content ?? null
  );
}

function getPopoverPosition(anchor: FloatingAdjustmentAnchor) {
  if (typeof window === "undefined") {
    return {
      left: anchor.left,
      top: anchor.bottom + 12
    };
  }

  const margin = 16;
  const popoverWidth = Math.min(352, window.innerWidth - margin * 2);
  const left = Math.min(Math.max(anchor.left, margin), window.innerWidth - popoverWidth - margin);
  const top = Math.min(anchor.bottom + 12, window.innerHeight - 300);

  return {
    left,
    top
  };
}

function getAnchoredPopoverPosition(
  anchor: FloatingAdjustmentAnchor,
  containerRect: DOMRect | null
) {
  if (!containerRect) {
    return getPopoverPosition(anchor);
  }

  const margin = 16;
  const containerWidth = Math.max(containerRect.width, 320);
  const popoverWidth = Math.min(352, containerWidth - margin * 2);
  const left = Math.min(
    Math.max(anchor.left - containerRect.left, margin),
    containerWidth - popoverWidth - margin
  );
  const top = Math.max(anchor.bottom - containerRect.top + 12, margin);

  return {
    left,
    top
  };
}

export function AdjustmentPopover({
  anchor,
  containerRect,
  draftMessage,
  error,
  isLoading,
  isSubmitting,
  onClose,
  onDraftMessageChange,
  onSubmitMessage,
  selectionLabel,
  selectionQuote,
  sessionDetail,
  view
}: AdjustmentPopoverProps) {
  const lastAssistantMessage = getLastAssistantMessage(sessionDetail);
  const isApplied = sessionDetail?.session.status === "applied";
  const position = getAnchoredPopoverPosition(anchor, containerRect);

  return (
    <div
      data-testid={`adjustment-popover-${view}`}
      className="absolute z-30 w-[min(22rem,calc(100vw-2rem))]"
      style={{
        left: position.left,
        top: position.top
      }}
    >
      <div className="rounded-[1.4rem] border border-border/80 bg-background/98 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.5)] backdrop-blur">
        <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {getViewLabel(view)} anpassen
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">{selectionLabel}</p>
          </div>
          <button
            className="rounded-full p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <span className="sr-only">Anpassung schließen</span>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-2xl border border-border/80 bg-secondary/35 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Markierte Stelle
            </p>
            <p className="mt-2 text-sm text-foreground">{selectionQuote}</p>
          </div>

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
              Ich bereite diese Stelle gerade für die Anpassung vor.
            </div>
          ) : null}

          {lastAssistantMessage ? (
            <div
              data-testid="adjustment-last-reply"
              className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                Letzte KI-Antwort
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {lastAssistantMessage}
              </p>
            </div>
          ) : null}

          <form className="space-y-3" onSubmit={onSubmitMessage}>
            <label className="block text-sm text-foreground">
              <span className="sr-only">Anpassungsanfrage</span>
              <textarea
                data-testid="adjustment-draft-message"
                className="min-h-24 w-full rounded-2xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                disabled={isLoading || isApplied}
                placeholder="Beschreibe kurz, wie diese Stelle aussehen soll."
                value={draftMessage}
                onChange={(event) => onDraftMessageChange(event.target.value)}
              />
            </label>

            {isApplied ? (
              <p className="text-sm text-muted-foreground">
                Die Änderung ist schon sichtbar. Markiere eine andere Stelle, wenn du noch etwas
                anpassen willst.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Die KI antwortet kurz und setzt klare Änderungen sofort direkt in dieser Ansicht um.
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
                type="button"
                onClick={onClose}
              >
                Abbrechen
              </button>
              <button
                data-testid="adjustment-send"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading || isSubmitting || isApplied || draftMessage.trim().length === 0}
                type="submit"
              >
                {isSubmitting ? "Wird gesendet..." : "Senden"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
