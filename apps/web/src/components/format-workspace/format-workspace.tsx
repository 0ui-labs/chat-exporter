import type { ImportJob } from "@chat-exporter/shared";
import { useCallback, useMemo } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { CompletedToolbar } from "@/components/format-workspace/completed-toolbar";
import {
  getBlockTypeLabel,
  getRoleLabel,
} from "@/components/format-workspace/labels";
import { LoadingStateBlock } from "@/components/format-workspace/loading-state-block";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import {
  applyMarkdownRules,
  buildReaderEffectsMap,
} from "@/components/format-workspace/rule-engine";
import { StatusHeader } from "@/components/format-workspace/status-header";
import type {
  AdjustmentSelection,
  ViewMode,
} from "@/components/format-workspace/types";
import { useAdjustmentPopover } from "@/components/format-workspace/use-adjustment-popover";
import { useAdjustmentSession } from "@/components/format-workspace/use-adjustment-session";
import { useFormatRules } from "@/components/format-workspace/use-format-rules";

type ActiveStage = {
  detail: string;
  label: string;
} | null;

type FormatWorkspaceProps = {
  activeStage: ActiveStage;
  elapsedTime: string;
  job: ImportJob;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
};

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

function _describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `Markdown-Zeilen ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${getRoleLabel(selection.messageRole)}-Nachricht ${selection.messageIndex + 1} · ${getBlockTypeLabel(selection.blockType)}`;
}

function renderArtifact(view: Exclude<ViewMode, "reader">, job: ImportJob) {
  if (!job.artifacts) {
    return "Artefakt ist noch nicht verfügbar.";
  }

  switch (view) {
    case "markdown":
      return job.artifacts.markdown;
    case "handover":
      return job.artifacts.handover;
    case "json":
      return job.artifacts.json;
  }
}

export function FormatWorkspace({
  activeStage,
  elapsedTime,
  job,
  view,
  onViewChange,
}: FormatWorkspaceProps) {
  const isAdjustableView = adjustableViews.has(view);

  const session = useAdjustmentSession(view, job.id);
  const rules = useFormatRules(view, job.id);
  const popover = useAdjustmentPopover(view, Boolean(session.activeSelection));

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      (
        session.sectionRef as React.MutableRefObject<HTMLElement | null>
      ).current = node;
      (
        popover.containerRef as React.MutableRefObject<HTMLElement | null>
      ).current = node;
    },
    [session.sectionRef, popover.containerRef],
  );

  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  // Design-Entscheidung: Downloads erfolgen aus `displayedMarkdown`, das
  // `applyMarkdownRules` inklusive format_profile-Rules enthält. Der Server-
  // Endpoint `imports.exportArtifact` liefert hingegen rohe Artefakte ohne Rules.
  const displayedMarkdown = useMemo(() => {
    if (view !== "markdown") return artifact;
    try {
      return applyMarkdownRules(artifact, rules.activeRules);
    } catch {
      return artifact;
    }
  }, [artifact, rules.activeRules, view]);

  const readerEffectsMap = useMemo(
    () =>
      view === "reader" && job.conversation
        ? buildReaderEffectsMap(rules.activeRules, job.conversation)
        : new Map(),
    [rules.activeRules, job.conversation, view],
  );

  const handleDownloadMarkdown = useMemo(() => {
    if (view !== "markdown") return undefined;
    return () => {
      const blob = new Blob([displayedMarkdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${job.id}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    };
  }, [view, displayedMarkdown, job.id]);
  const showPopover =
    session.adjustModeEnabled &&
    Boolean(session.activeSelection) &&
    Boolean(session.activeAnchor);

  const sessionError =
    session.activeSessionError ?? rules.disableError ?? rules.promoteError;

  return (
    <section
      ref={mergedRef}
      className="relative space-y-4 rounded-[1.9rem] border border-border/80 bg-background/70 p-4 sm:p-5"
    >
      <StatusHeader
        activeStage={activeStage}
        elapsedTime={elapsedTime}
        job={job}
      />

      {job.warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 px-4 py-3 text-sm text-amber-950">
          {job.warnings[0]}
        </div>
      ) : null}

      {job.status === "failed" ? null : job.status === "queued" ||
        job.status === "running" ? (
        <LoadingStateBlock stageDetail={activeStage?.detail} />
      ) : (
        <div className="space-y-4">
          <CompletedToolbar
            adjustModeEnabled={session.adjustModeEnabled}
            isAdjustableView={isAdjustableView}
            rules={rules}
            view={view}
            onDownloadMarkdown={handleDownloadMarkdown}
            onToggleAdjustMode={session.toggleAdjustMode}
            onViewChange={onViewChange}
          />

          {sessionError && !session.adjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {sessionError}
            </div>
          ) : null}

          <ErrorBoundary
            fallback={(_error, reset) => (
              <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-red-700">
                  Diese Ansicht konnte nicht geladen werden.
                </p>
                <button
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-foreground/5"
                  type="button"
                  onClick={reset}
                >
                  Erneut versuchen
                </button>
              </div>
            )}
          >
            {view === "reader" ? (
              <ReaderView
                activeRules={rules.activeRules}
                conversation={job.conversation}
                adjustModeEnabled={session.adjustModeEnabled}
                effectsMap={readerEffectsMap}
                highlightedRuleId={rules.hoveredRuleId}
                selectedBlock={
                  view === "reader" ? session.activeSelection : null
                }
                onSelectBlock={session.handleSelectionChange}
              />
            ) : view === "markdown" ? (
              <MarkdownView
                activeRules={rules.activeRules}
                content={displayedMarkdown}
                adjustModeEnabled={session.adjustModeEnabled}
                highlightedRuleId={rules.hoveredRuleId}
                selectedRange={session.activeSelection}
                onSelectLines={session.handleSelectionChange}
              />
            ) : (
              <ArtifactView content={artifact} />
            )}
          </ErrorBoundary>

          {session.showGuide ? (
            <AdjustmentModeGuide
              view={view}
              onDismiss={() => session.setGuideDismissed(true)}
            />
          ) : null}

          {showPopover && session.activeSelection && session.activeAnchor ? (
            <ErrorBoundary
              fallback={
                <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
                  Anpassungen konnten nicht geladen werden.
                </div>
              }
            >
              <AdjustmentPopover
                anchor={session.activeAnchor}
                containerDimensions={popover.containerDimensions}
                containerScrollTop={session.sectionRef.current?.scrollTop ?? 0}
                draftMessage={session.activeDraftMessage}
                error={session.activeSessionError}
                isLoading={session.activeSessionLoading || session.isDiscarding}
                isSubmitting={session.isSubmitting}
                sessionDetail={session.activeSessionDetail}
                showReply={session.replyVisible}
                view={view}
                onClose={() => {
                  session.handleDiscardSession();
                }}
                onDraftMessageChange={session.handleDraftMessageChange}
                onRejectLastChange={() => {
                  if (session.activeSessionDetail) {
                    void rules
                      .handleRejectLastChange(session.activeSessionDetail)
                      .then((success) => {
                        if (success) session.setReplyVisible(false);
                      });
                  }
                }}
                onSubmitMessage={session.handleSubmitMessage}
              />
            </ErrorBoundary>
          ) : null}
        </div>
      )}
    </section>
  );
}
