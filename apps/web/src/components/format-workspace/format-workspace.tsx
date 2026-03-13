import type { ImportJob } from "@chat-exporter/shared";
import { useCallback, useMemo, useRef, useState } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { CompletedToolbar } from "@/components/format-workspace/completed-toolbar";
import { DeleteMessageDialog } from "@/components/format-workspace/delete-message-dialog";
import {
  formatMarkdownLinesLabel,
  formatMessageBlockLabel,
  getImportStageLabel,
  miscLabels,
} from "@/components/format-workspace/labels";
import { LoadingStateBlock } from "@/components/format-workspace/loading-state-block";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import {
  applyMarkdownRules,
  buildReaderEffectsMap,
} from "@/components/format-workspace/rule-engine";
import { StatusHeader } from "@/components/format-workspace/status-header";
import {
  type AdjustmentSelection,
  adjustableViews,
  type EditMode,
  type ViewMode,
} from "@/components/format-workspace/types";
import { UndoToast } from "@/components/format-workspace/undo-toast";
import { useAdjustmentPopover } from "@/components/format-workspace/use-adjustment-popover";
import { useAdjustmentSession } from "@/components/format-workspace/use-adjustment-session";
import { useDeletionToast } from "@/components/format-workspace/use-deletion-toast";
import { useFormatRules } from "@/components/format-workspace/use-format-rules";
import { useMessageDeletion } from "@/components/format-workspace/use-message-deletion";

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

function _describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return formatMarkdownLinesLabel(selection.lineStart, selection.lineEnd);
  }

  return formatMessageBlockLabel(
    selection.messageRole,
    selection.messageIndex + 1,
    selection.blockType,
  );
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
  const deletion = useMessageDeletion(job.id);
  const deletionToast = useDeletionToast();
  const [editMode, setEditMode] = useState<EditMode>("view");
  const [deleteDialog, setDeleteDialog] = useState<{
    messageId: string;
    isRound: boolean;
    preview: string;
  } | null>(null);
  const popover = useAdjustmentPopover();

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      const msg = job.conversation?.messages.find((m) => m.id === messageId);
      const preview =
        msg?.blocks
          .map((b) => ("text" in b ? b.text : b.type))
          .join(" ")
          .slice(0, 200) ?? messageId;
      setDeleteDialog({ messageId, isRound: false, preview });
    },
    [job.conversation?.messages],
  );

  const handleDeleteRound = useCallback(
    (messageId: string) => {
      const msg = job.conversation?.messages.find((m) => m.id === messageId);
      const preview =
        msg?.blocks
          .map((b) => ("text" in b ? b.text : b.type))
          .join(" ")
          .slice(0, 200) ?? messageId;
      setDeleteDialog({ messageId, isRound: true, preview });
    },
    [job.conversation?.messages],
  );

  const handleConfirmDelete = useCallback(
    async (reason?: string) => {
      if (!deleteDialog) return;
      const { messageId, isRound } = deleteDialog;
      setDeleteDialog(null);
      if (isRound) {
        const result = await deletion.deleteRound(messageId, reason);
        deletionToast.showDeletedToast(messageId, true, result.length);
      } else {
        await deletion.deleteMessage(messageId, reason);
        deletionToast.showDeletedToast(messageId, false);
      }
    },
    [deleteDialog, deletion, deletionToast],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!deletionToast.toast) return;
    await deletion.restoreMessage(deletionToast.toast.messageId);
    deletionToast.dismissToast();
  }, [deletion, deletionToast]);

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

  const popoverCallbacksRef = useRef({
    handleDiscardSession: session.handleDiscardSession,
    activeSessionDetail: session.activeSessionDetail,
    handleRejectLastChange: rules.handleRejectLastChange,
    setReplyVisible: session.setReplyVisible,
  });
  popoverCallbacksRef.current = {
    handleDiscardSession: session.handleDiscardSession,
    activeSessionDetail: session.activeSessionDetail,
    handleRejectLastChange: rules.handleRejectLastChange,
    setReplyVisible: session.setReplyVisible,
  };

  const handlePopoverClose = useCallback(() => {
    popoverCallbacksRef.current.handleDiscardSession();
  }, []);

  const handleRejectLastChange = useCallback(() => {
    const {
      activeSessionDetail,
      handleRejectLastChange: reject,
      setReplyVisible,
    } = popoverCallbacksRef.current;
    if (activeSessionDetail) {
      void reject(activeSessionDetail).then((success) => {
        if (success) setReplyVisible(false);
      });
    }
  }, []);

  const sessionError =
    session.activeSessionError ?? rules.disableError ?? rules.promoteError;

  const viewErrorFallback = (_error: Error, reset: () => void) => (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-red-700">{miscLabels.viewLoadError}</p>
      <button
        className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-foreground/5"
        type="button"
        onClick={reset}
      >
        {miscLabels.retryButton}
      </button>
    </div>
  );

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

      {job.status === "failed" ? (
        <div className="rounded-2xl border border-red-300/40 bg-red-100/70 p-4 text-red-900">
          <p className="font-medium">{miscLabels.importFailed}</p>
          {job.errorStage && job.errorStage !== "done" && (
            <p className="text-sm mt-1">
              {miscLabels.errorInPhase(getImportStageLabel(job.errorStage))}
            </p>
          )}
          {job.error && <p className="text-sm mt-1">{job.error}</p>}
        </div>
      ) : job.status === "queued" || job.status === "running" ? (
        <LoadingStateBlock stageDetail={activeStage?.detail} />
      ) : (
        <div className="space-y-4">
          <CompletedToolbar
            adjustModeEnabled={session.adjustModeEnabled}
            editMode={editMode}
            isAdjustableView={isAdjustableView}
            rules={rules}
            view={view}
            onDownloadMarkdown={handleDownloadMarkdown}
            onEditModeChange={setEditMode}
            onToggleAdjustMode={session.toggleAdjustMode}
            onViewChange={onViewChange}
            deletionsCount={deletion.deletionsCount}
            showDeleted={deletion.showDeleted}
            onToggleShowDeleted={() =>
              deletion.setShowDeleted(!deletion.showDeleted)
            }
          />

          {sessionError && !session.adjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {sessionError}
            </div>
          ) : null}

          {view === "reader" ? (
            <ErrorBoundary fallback={viewErrorFallback}>
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
                deletedMessageIds={deletion.deletedMessageIds}
                showDeleted={deletion.showDeleted}
                onDeleteMessage={handleDeleteMessage}
                onDeleteRound={handleDeleteRound}
                onRestoreMessage={deletion.restoreMessage}
              />
            </ErrorBoundary>
          ) : view === "markdown" ? (
            <ErrorBoundary fallback={viewErrorFallback}>
              <MarkdownView
                activeRules={rules.activeRules}
                content={displayedMarkdown}
                adjustModeEnabled={session.adjustModeEnabled}
                highlightedRuleId={rules.hoveredRuleId}
                selectedRange={session.activeSelection}
                onSelectLines={session.handleSelectionChange}
              />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary fallback={viewErrorFallback}>
              <ArtifactView content={artifact} />
            </ErrorBoundary>
          )}

          {session.showGuide ? (
            <AdjustmentModeGuide
              view={view}
              onDismiss={() => session.setGuideDismissed(true)}
            />
          ) : null}

          <ErrorBoundary
            fallback={
              <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
                {miscLabels.adjustmentLoadError}
              </div>
            }
          >
            <AdjustmentPopover
              anchor={session.activeAnchor ?? null}
              containerRef={session.sectionRef}
              draftMessage={session.activeDraftMessage}
              error={session.activeSessionError}
              isLoading={session.activeSessionLoading || session.isDiscarding}
              isSubmitting={session.isSubmitting}
              open={
                showPopover &&
                Boolean(session.activeSelection) &&
                Boolean(session.activeAnchor)
              }
              sessionDetail={session.activeSessionDetail}
              showReply={session.replyVisible}
              view={view}
              onClose={handlePopoverClose}
              onDraftMessageChange={session.handleDraftMessageChange}
              onRejectLastChange={handleRejectLastChange}
              onSubmitMessage={session.handleSubmitMessage}
            />
          </ErrorBoundary>
        </div>
      )}

      {deleteDialog && (
        <DeleteMessageDialog
          messagePreview={deleteDialog.preview}
          isRound={deleteDialog.isRound}
          onConfirm={(reason) => {
            void handleConfirmDelete(reason);
          }}
          onCancel={() => setDeleteDialog(null)}
        />
      )}

      {deletionToast.toast && (
        <UndoToast
          message={deletionToast.toast.message}
          onUndo={() => {
            void handleUndoDelete();
          }}
          onDismiss={deletionToast.dismissToast}
        />
      )}
    </section>
  );
}
