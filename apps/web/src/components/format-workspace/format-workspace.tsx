import type { Block, ImportJob } from "@chat-exporter/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { CompletedToolbar } from "@/components/format-workspace/completed-toolbar";
import { DeleteMessageDialog } from "@/components/format-workspace/delete-message-dialog";
import {
  formatMarkdownLinesLabel,
  formatMessageBlockLabel,
  getImportStageLabel,
  miscLabels,
} from "@/components/format-workspace/labels";
import { LoadingStateBlock } from "@/components/format-workspace/loading-state-block";
import { copyMessageToClipboard } from "@/components/format-workspace/message-clipboard";
import {
  applyMarkdownRules,
  buildReaderEffectsMap,
} from "@/components/format-workspace/rule-engine";
import { SaveIndicator } from "@/components/format-workspace/save-indicator";
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
import { useAutoSnapshot } from "@/components/format-workspace/use-auto-snapshot";
import { useDeletionToast } from "@/components/format-workspace/use-deletion-toast";
import { useFormatRules } from "@/components/format-workspace/use-format-rules";
import { useMessageDeletion } from "@/components/format-workspace/use-message-deletion";
import { useMessageEdits } from "@/components/format-workspace/use-message-edits";
import { useResolvedConversation } from "@/components/format-workspace/use-resolved-conversation";
import { useSnapshots } from "@/components/format-workspace/use-snapshots";
import { VersionsModal } from "@/components/format-workspace/versions-modal";
import { clientFormatRegistry } from "@/lib/format-plugins";

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

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
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
  const snapshots = useSnapshots(job.id);
  const messageEdits = useMessageEdits(job.id, snapshots.activeSnapshot?.id);
  const resolvedMessages = useResolvedConversation(
    job.conversation,
    messageEdits.editedMessagesMap,
  );
  const autoSnapshot = useAutoSnapshot({
    activeSnapshot: snapshots.activeSnapshot,
    create: snapshots.create,
    activate: snapshots.activate,
  });
  const deletion = useMessageDeletion(job.id);
  const deletionToast = useDeletionToast();
  const [editMode, setEditMode] = useState<EditMode>("view");

  // Mutual exclusion: edit mode and adjustment mode must never be active simultaneously
  const handleEditModeChange = useCallback(
    (mode: EditMode) => {
      if (mode === "edit" && session.adjustModeEnabled) {
        session.toggleAdjustMode();
      }
      setEditMode(mode);
    },
    [session],
  );

  const handleToggleAdjustMode = useCallback(() => {
    if (!session.adjustModeEnabled && editMode === "edit") {
      setEditMode("view");
    }
    session.toggleAdjustMode();
  }, [session, editMode]);

  const hasEdits = resolvedMessages.some((m) => m.isEdited);

  // beforeunload warning when unsaved edits exist.
  // hasPendingEdits covers both debounce timers that haven't fired yet and
  // in-flight HTTP mutations, preventing data loss during the 500 ms debounce
  // window where isSaving alone would still be false.
  useEffect(() => {
    if (!messageEdits.hasPendingEdits) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [messageEdits.hasPendingEdits]);

  const handleBlocksChange = useCallback(
    (messageId: string, blocks: Block[]) => {
      void autoSnapshot.ensureSnapshot().then((ready) => {
        if (ready) {
          messageEdits.saveEdit(messageId, blocks);
        }
      });
    },
    [autoSnapshot, messageEdits],
  );
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
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

  const artifact =
    view === "reader" || view === "html-export"
      ? ""
      : (job.artifacts?.[view] ?? "Artefakt ist noch nicht verfügbar.");
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

  const resolvedConversation = useMemo(() => {
    if (!job.conversation) return undefined;
    return {
      ...job.conversation,
      messages: resolvedMessages.map((rm) => ({
        id: rm.id,
        role: rm.role,
        blocks: rm.blocks,
      })),
    };
  }, [job.conversation, resolvedMessages]);

  const readerEffectsMap = useMemo(
    () =>
      (view === "reader" || view === "html-export") && resolvedConversation
        ? buildReaderEffectsMap(rules.activeRules, resolvedConversation)
        : new Map(),
    [rules.activeRules, resolvedConversation, view],
  );

  const handleCopyMessage = useCallback(
    (messageId: string) => {
      const msg = resolvedConversation?.messages.find(
        (m) => m.id === messageId,
      );
      if (!msg) return;
      void copyMessageToClipboard(msg, view, msg.blocks);
    },
    [resolvedConversation, view],
  );

  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopyAll = useMemo(() => {
    const plugin = clientFormatRegistry.get(view);
    if (!plugin) return undefined;

    const doCopy = async (content: string, isHtml: boolean) => {
      try {
        if (isHtml) {
          const blob = new Blob([content], { type: "text/html" });
          const plainBlob = new Blob([content], { type: "text/plain" });
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": blob,
              "text/plain": plainBlob,
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(content);
        }
        clearTimeout(copyTimeoutRef.current);
        setCopySuccess(true);
        copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Fallback: silently fail
      }
    };

    // Formats with conversation-based export (reader, html-export)
    if (plugin.prepareConversationExport && resolvedConversation) {
      const exportFn = plugin.prepareConversationExport;
      return () => {
        const html = exportFn(
          resolvedConversation,
          readerEffectsMap,
          resolvedConversation.title ?? `export-${job.id}`,
        );
        void doCopy(html, true);
      };
    }

    // Markdown: displayedMarkdown already has rules applied
    if (view === "markdown") {
      return () => {
        void doCopy(displayedMarkdown, false);
      };
    }

    // Others: raw artifact
    if (artifact) {
      return () => {
        void doCopy(artifact, false);
      };
    }
    return undefined;
  }, [
    view,
    displayedMarkdown,
    job.id,
    resolvedConversation,
    readerEffectsMap,
    artifact,
  ]);

  const handleDownload = useMemo(() => {
    const plugin = clientFormatRegistry.get(view);
    if (!plugin) return undefined;

    // Formats with conversation-based export (reader, html-export)
    if (plugin.prepareConversationExport && resolvedConversation) {
      const exportFn = plugin.prepareConversationExport;
      return () => {
        const html = exportFn(
          resolvedConversation,
          readerEffectsMap,
          resolvedConversation.title ?? `export-${job.id}`,
        );
        downloadBlob(
          html,
          plugin.descriptor.exportMimeType,
          `export-${job.id}${plugin.descriptor.exportExtension}`,
        );
      };
    }

    // For all other formats: use prepareDownload if available, else raw content
    const content = view === "markdown" ? displayedMarkdown : artifact;
    if (!content) return undefined;

    return () => {
      const finalContent =
        plugin.prepareDownload?.(content, rules.activeRules) ?? content;
      downloadBlob(
        finalContent,
        plugin.descriptor.exportMimeType,
        `export-${job.id}${plugin.descriptor.exportExtension}`,
      );
    };
  }, [
    view,
    displayedMarkdown,
    job.id,
    resolvedConversation,
    readerEffectsMap,
    artifact,
    rules.activeRules,
  ]);
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
        hasEdits={hasEdits}
        isSaving={messageEdits.isSaving}
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
            copySuccess={copySuccess}
            editMode={editMode}
            isAdjustableView={isAdjustableView}
            rules={rules}
            view={view}
            onCopyAll={handleCopyAll}
            onDownloadMarkdown={handleDownload}
            onEditModeChange={handleEditModeChange}
            onToggleAdjustMode={handleToggleAdjustMode}
            onViewChange={onViewChange}
            deletionsCount={deletion.deletionsCount}
            showDeleted={deletion.showDeleted}
            snapshotCount={snapshots.snapshots.length}
            onVersionsClick={() => setVersionsModalOpen(true)}
            onToggleShowDeleted={() =>
              deletion.setShowDeleted(!deletion.showDeleted)
            }
          />

          {sessionError && !session.adjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {sessionError}
            </div>
          ) : null}

          <ErrorBoundary fallback={viewErrorFallback}>
            {(() => {
              const plugin = clientFormatRegistry.get(view);
              if (!plugin) {
                return (
                  <div className="text-sm text-muted-foreground">
                    Format nicht verfügbar
                  </div>
                );
              }
              const { ViewComponent } = plugin;
              const viewElement = (
                <ViewComponent
                  activeRules={rules.activeRules}
                  conversation={resolvedConversation}
                  adjustModeEnabled={session.adjustModeEnabled}
                  editMode={editMode === "edit"}
                  effectsMap={readerEffectsMap}
                  highlightedRuleId={rules.hoveredRuleId}
                  selectedBlock={
                    view === "reader" ? session.activeSelection : null
                  }
                  onSelectBlock={session.handleSelectionChange}
                  deletedMessageIds={deletion.deletedMessageIds}
                  showDeleted={deletion.showDeleted}
                  onBlocksChange={handleBlocksChange}
                  onCopyMessage={handleCopyMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onDeleteRound={handleDeleteRound}
                  onRestoreMessage={deletion.restoreMessage}
                  content={view === "markdown" ? displayedMarkdown : artifact}
                  selectedRange={session.activeSelection}
                  onSelectLines={session.handleSelectionChange}
                  rules={rules.activeRules}
                />
              );
              if (view === "reader") {
                return (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <SaveIndicator
                        isSaving={messageEdits.isSaving}
                        hasEdits={hasEdits}
                      />
                    </div>
                    {viewElement}
                  </div>
                );
              }
              return viewElement;
            })()}
          </ErrorBoundary>

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

      <VersionsModal
        open={versionsModalOpen}
        onOpenChange={setVersionsModalOpen}
        snapshots={snapshots.snapshots}
        activeSnapshotId={snapshots.activeSnapshot?.id ?? null}
        onActivate={(snapshotId) => {
          void snapshots.activate(snapshotId);
        }}
        onDeactivate={() => {
          void snapshots.deactivate();
        }}
        onCreate={(label) => {
          void snapshots.create(label);
        }}
        onRename={(snapshotId, label) => {
          void snapshots.rename(snapshotId, label);
        }}
        onDelete={(snapshotId) => {
          void snapshots.delete(snapshotId);
        }}
      />
    </section>
  );
}
