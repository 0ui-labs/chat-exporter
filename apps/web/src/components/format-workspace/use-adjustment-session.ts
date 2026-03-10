import type { AdjustmentSessionDetail } from "@chat-exporter/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type {
  AdjustmentSelection,
  FloatingAdjustmentAnchor,
  ViewMode,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { orpc } from "@/lib/orpc";

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

export function useAdjustmentSession(view: ViewMode, jobId: string) {
  // ── Refs ──────────────────────────────────────────────────────────────

  const sectionRef = useRef<HTMLElement | null>(null);

  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── State ──────────────────────────────────────────────────────────────

  const [draftMessageByView, setDraftMessageByView] = useState<
    Record<ViewMode, string>
  >({
    reader: "",
    markdown: "",
    handover: "",
    json: "",
  });

  const [adjustModeByView, setAdjustModeByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });

  const [guideDismissedByView, setGuideDismissedByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });

  const [selectionByView, setSelectionByView] = useState<
    Record<ViewMode, AdjustmentSelection | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });

  const [anchorByView, setAnchorByView] = useState<
    Record<ViewMode, FloatingAdjustmentAnchor | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });

  const [replyVisibleByView, setReplyVisibleByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });

  const [sessionSelectionKeyByView, setSessionSelectionKeyByView] = useState<
    Record<ViewMode, string | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });

  const [activeSessionDetail, setActiveSessionDetail] =
    useState<AdjustmentSessionDetail | null>(null);

  const [sessionError, setSessionError] = useState<string | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const createSession = useMutation(
    orpc.adjustments.createSession.mutationOptions(),
  );

  const appendMessage = useMutation(
    orpc.adjustments.appendMessage.mutationOptions({
      onSuccess: (nextDetail) => {
        setActiveSessionDetail(nextDetail);
        setDraftMessageByView((current) => ({ ...current, [view]: "" }));
        setReplyVisibleByView((current) => ({ ...current, [view]: true }));
        if (nextDetail.session.status === "applied") {
          queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
        }
      },
      onError: (error) => {
        setSessionError(
          error instanceof Error
            ? error.message
            : "Anpassungsnachricht konnte nicht gespeichert werden.",
        );
      },
    }),
  );

  const discardSession = useMutation(
    orpc.adjustments.discard.mutationOptions({
      onSuccess: () => {
        clearCurrentAdjustmentState(view);
      },
      onError: (error) => {
        if (
          activeSessionDetail &&
          activeSessionDetail.session.status === "applied"
        ) {
          clearCurrentAdjustmentState(view);
        } else {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Anpassungssession konnte nicht verworfen werden.",
          );
        }
      },
    }),
  );

  // ── Helpers ────────────────────────────────────────────────────────────

  function clearCurrentAdjustmentState(targetView: ViewMode) {
    setDraftMessageByView((current) => ({ ...current, [targetView]: "" }));
    setSelectionByView((current) => ({ ...current, [targetView]: null }));
    setAnchorByView((current) => ({ ...current, [targetView]: null }));
    setActiveSessionDetail(null);
    setSessionSelectionKeyByView((current) => ({
      ...current,
      [targetView]: null,
    }));
    setSessionError(null);
    setReplyVisibleByView((current) => ({
      ...current,
      [targetView]: false,
    }));
  }

  // ── Derived values ─────────────────────────────────────────────────────

  const isAdjustableView = adjustableViews.has(view);
  const isAdjustModeEnabled = adjustModeByView[view];
  const activeSelection = selectionByView[view];
  const activeAnchor = anchorByView[view];
  const activeDraftMessage = draftMessageByView[view];
  const showGuide =
    isAdjustModeEnabled && !activeSelection && !guideDismissedByView[view];

  // ── Effects ────────────────────────────────────────────────────────────

  // Disable adjust mode when switching to a non-adjustable view
  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled) {
      setAdjustModeByView((current) => ({ ...current, [view]: false }));
    }
  }, [isAdjustModeEnabled, isAdjustableView, view]);

  // Debounced session creation on selection change
  useEffect(() => {
    const currentSelection = selectionByView[view];
    const activeSelectionKey = sessionSelectionKeyByView[view];

    if (!isAdjustModeEnabled || !isAdjustableView || !currentSelection) {
      return;
    }

    const nextSelectionKey = JSON.stringify(currentSelection);

    if (
      activeSelectionKey === nextSelectionKey &&
      activeSessionDetail &&
      activeSessionDetail.session.importId === jobId
    ) {
      return;
    }

    if (selectionDebounceRef.current !== null) {
      clearTimeout(selectionDebounceRef.current);
    }

    selectionDebounceRef.current = setTimeout(() => {
      setSessionError(null);
      createSession.mutate(
        { importId: jobId, selection: currentSelection, targetFormat: view },
        {
          onSuccess: (detail) => {
            setActiveSessionDetail(detail);
            setSessionSelectionKeyByView((current) => ({
              ...current,
              [view]: nextSelectionKey,
            }));
          },
          onError: (error) => {
            setSessionError(
              error instanceof Error
                ? error.message
                : "Anpassungssession konnte nicht erstellt werden.",
            );
          },
        },
      );
    }, 250);

    return () => {
      if (selectionDebounceRef.current !== null) {
        clearTimeout(selectionDebounceRef.current);
      }
    };
  }, [
    selectionByView[view],
    sessionSelectionKeyByView[view],
    activeSessionDetail,
    createSession.mutate,
    isAdjustModeEnabled,
    isAdjustableView,
    jobId,
    view,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────

  function toggleAdjustMode() {
    if (!isAdjustableView) return;
    const nextEnabled = !adjustModeByView[view];
    setAdjustModeByView((current) => ({ ...current, [view]: nextEnabled }));
    setGuideDismissedByView((current) => ({
      ...current,
      [view]: false,
    }));
    if (!nextEnabled) {
      clearCurrentAdjustmentState(view);
    }
  }

  function handleSelectionChange(
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) {
    const container = sectionRef.current;
    let containerAnchor = anchor;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      containerAnchor = {
        top: anchor.top - containerRect.top,
        bottom: anchor.bottom - containerRect.top,
        left: anchor.left - containerRect.left,
        width: anchor.width,
        height: anchor.height,
      };
    }
    setSelectionByView((current) => ({ ...current, [view]: selection }));
    setAnchorByView((current) => ({ ...current, [view]: containerAnchor }));
    setGuideDismissedByView((current) => ({ ...current, [view]: true }));
    setSessionError(null);
    setReplyVisibleByView((current) => ({ ...current, [view]: false }));
  }

  function handleDraftMessageChange(value: string) {
    setDraftMessageByView((current) => ({ ...current, [view]: value }));
  }

  function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSessionDetail) return;
    const content = draftMessageByView[view].trim();
    if (!content) return;
    setSessionError(null);
    appendMessage.mutate({
      sessionId: activeSessionDetail.session.id,
      content,
    });
  }

  function handleDiscardSession() {
    if (!activeSessionDetail) {
      clearCurrentAdjustmentState(view);
      return;
    }
    setSessionError(null);
    discardSession.mutate({ sessionId: activeSessionDetail.session.id });
  }

  function setReplyVisible(visible: boolean) {
    setReplyVisibleByView((current) => ({ ...current, [view]: visible }));
  }

  function setGuideDismissed(dismissed: boolean) {
    setGuideDismissedByView((current) => ({ ...current, [view]: dismissed }));
  }

  // ── Return ─────────────────────────────────────────────────────────────

  return {
    sectionRef,
    adjustModeEnabled: isAdjustModeEnabled,
    activeSessionDetail,
    activeSelection,
    activeAnchor,
    activeDraftMessage,
    activeSessionError: sessionError,
    activeSessionLoading: createSession.isPending,
    isSubmitting: appendMessage.isPending,
    isDiscarding: discardSession.isPending,
    showGuide,
    replyVisible: replyVisibleByView[view],
    guideDismissed: guideDismissedByView[view],
    toggleAdjustMode,
    handleSelectionChange,
    handleDraftMessageChange,
    handleSubmitMessage,
    handleDiscardSession,
    clearCurrentAdjustmentState,
    setReplyVisible,
    setGuideDismissed,
  };
}
