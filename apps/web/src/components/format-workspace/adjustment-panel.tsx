import type {
  AdjustmentPreview,
  AdjustmentSessionDetail,
} from "@chat-exporter/shared";
import type { FormEvent, ReactNode } from "react";

import {
  getBlockTypeLabel,
  getRoleLabel,
  getRuleKindLabel,
  getViewLabel,
} from "@/components/format-workspace/labels";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import type {
  AdjustmentSelection,
  ViewMode,
} from "@/components/format-workspace/types";

type AdjustmentPanelProps = {
  draftMessage: string;
  error: string | null;
  isApplying: boolean;
  isDiscarding: boolean;
  isLoading: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  onApplyPreview: () => void;
  onDiscardSession: () => void;
  onDraftMessageChange: (value: string) => void;
  onGeneratePreview: () => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  previewContent: ReactNode;
  selection: AdjustmentSelection | null;
  sessionDetail: AdjustmentSessionDetail | null;
  view: ViewMode;
};

const formatCopy: Record<ViewMode, { detail: string; nextStep: string }> = {
  reader: {
    detail:
      "In diesem Modus passt du an, wie der integrierte Reader den ausgewählten Transkriptabschnitt darstellt.",
    nextStep:
      "Wähle einen Block oder Textbereich aus, um einen kontextbezogenen Anpassungs-Chat zu öffnen.",
  },
  markdown: {
    detail:
      "In diesem Modus verfeinerst du die portable Markdown-Ausgabe mit formatbezogener KI-Hilfe.",
    nextStep:
      "Wähle Zeilen oder einen gerenderten Abschnitt aus, um eine Markdown-sichere Anpassung anzufragen.",
  },
  handover: {
    detail: "Anpassungen für die Übergabe sind noch nicht verfügbar.",
    nextStep:
      "Wechsle zurück zu Reader oder Markdown, um eine Anpassungssession zu starten.",
  },
  json: {
    detail: "Anpassungen für JSON sind noch nicht verfügbar.",
    nextStep:
      "Wechsle zurück zu Reader oder Markdown, um eine Anpassungssession zu starten.",
  },
};

function describePreviewScope(
  preview: AdjustmentPreview,
  selection: AdjustmentSelection,
  view: ViewMode,
) {
  return describeSelectorScope({
    blockType: selection.blockType,
    exactLabel: "Diese Regel gilt nur für die aktuelle Auswahl.",
    selector: preview.draftRule.selector,
    view,
  });
}

function describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart && selection.lineEnd) {
    return `Markdown-Zeilen ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${getRoleLabel(selection.messageRole)}-Nachricht ${selection.messageIndex + 1} · ${getBlockTypeLabel(selection.blockType)}`;
}

export function AdjustmentPanel({
  draftMessage,
  error,
  isApplying,
  isDiscarding,
  isLoading,
  isPreviewing,
  isSubmitting,
  onApplyPreview,
  onDiscardSession,
  onDraftMessageChange,
  onGeneratePreview,
  onSubmitMessage,
  previewContent,
  selection,
  sessionDetail,
  view,
}: AdjustmentPanelProps) {
  const copy = formatCopy[view];
  const preview = sessionDetail?.session.previewArtifact as
    | AdjustmentPreview
    | undefined;
  const previewScope =
    preview && selection
      ? describePreviewScope(preview, selection, view)
      : null;

  return (
    <div
      data-testid={`adjustment-panel-${view}`}
      className="rounded-[1.4rem] border border-dashed border-primary/35 bg-primary/5 px-4 py-4"
    >
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Anpassungsmodus
        </p>
        <p className="text-sm text-foreground">{copy.detail}</p>
        {selection ? (
          <div className="rounded-2xl border border-primary/20 bg-background/75 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Aktuelle Auswahl
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {describeSelectionLabel(selection)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {selection.textQuote}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.nextStep}</p>
        )}

        {error ? (
          <div
            data-testid="adjustment-error"
            className="rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-3 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-border/80 bg-background/75 px-3 py-3 text-sm text-muted-foreground">
            Anpassungssession für diese Auswahl wird gestartet.
          </div>
        ) : null}

        {sessionDetail ? (
          <div
            data-testid="adjustment-session"
            className="space-y-3 rounded-2xl border border-border/80 bg-background/75 p-3"
          >
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <span>Sitzung</span>
              <span>{getViewLabel(view)}</span>
            </div>

            {sessionDetail.messages.length > 0 ? (
              <div className="space-y-2">
                {sessionDetail.messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-border/70 bg-card/85 px-3 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {getRoleLabel(message.role)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                      {message.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Beschreibe, was an dieser Auswahl falsch ist. Die Serversession
                ist bereit und der nächste Schritt kann daraus eine
                formatspezifische Regel ableiten.
              </p>
            )}

            <form className="space-y-3" onSubmit={onSubmitMessage}>
              <label className="block text-sm text-foreground">
                <span className="sr-only">Anpassungsanfrage</span>
                <textarea
                  data-testid="adjustment-draft-message"
                  className="min-h-28 w-full rounded-2xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  placeholder="Beschreibe, was hier falsch ist oder wie sich dieses Format ändern soll."
                  value={draftMessage}
                  onChange={(event) => onDraftMessageChange(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    data-testid="adjustment-generate-preview"
                    className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      isPreviewing ||
                      isLoading ||
                      sessionDetail.messages.every(
                        (message) => message.role !== "user",
                      )
                    }
                    type="button"
                    onClick={onGeneratePreview}
                  >
                    {isPreviewing
                      ? "Vorschau wird erstellt..."
                      : "Vorschau erzeugen"}
                  </button>

                  <button
                    data-testid="adjustment-discard-draft"
                    className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      isDiscarding || sessionDetail.session.status === "applied"
                    }
                    type="button"
                    onClick={onDiscardSession}
                  >
                    {isDiscarding
                      ? "Entwurf wird verworfen..."
                      : "Entwurf verwerfen"}
                  </button>
                </div>

                <button
                  data-testid="adjustment-send"
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting || draftMessage.trim().length === 0}
                  type="submit"
                >
                  {isSubmitting ? "Wird gesendet..." : "Senden"}
                </button>
              </div>
            </form>

            {preview ? (
              <div
                data-testid="adjustment-preview"
                className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3"
              >
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-primary">
                  <span>Vorschau</span>
                  <span>{getRuleKindLabel(preview.draftRule.kind)}</span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {preview.summary}
                </p>
                <p className="text-sm text-muted-foreground">
                  {preview.rationale}
                </p>
                {previewScope ? (
                  <div className="rounded-2xl border border-primary/20 bg-background/80 px-3 py-2 text-sm text-foreground">
                    {previewScope}
                  </div>
                ) : null}

                {preview.limitations.length > 0 ? (
                  <div className="space-y-1">
                    {preview.limitations.map((limitation) => (
                      <p
                        key={limitation}
                        className="text-sm text-muted-foreground"
                      >
                        {limitation}
                      </p>
                    ))}
                  </div>
                ) : null}

                {previewContent}

                <details className="rounded-2xl border border-border/80 bg-background/80 p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Regelentwurf als JSON
                  </summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
                    <code>{JSON.stringify(preview.draftRule, null, 2)}</code>
                  </pre>
                </details>

                <div className="flex justify-end">
                  <button
                    data-testid="adjustment-apply-rule"
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      isApplying || sessionDetail.session.status === "applied"
                    }
                    type="button"
                    onClick={onApplyPreview}
                  >
                    {sessionDetail.session.status === "applied"
                      ? "Angewendet"
                      : isApplying
                        ? "Wird angewendet..."
                        : "Regel anwenden"}
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
