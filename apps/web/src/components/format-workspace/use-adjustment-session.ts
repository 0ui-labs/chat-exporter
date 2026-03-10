import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useReducer, useRef } from "react";

import type {
  AdjustmentSelection,
  ViewMode,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { orpc } from "@/lib/orpc";

import {
  createInitialState,
  sessionReducer,
} from "./adjustment-session-reducer";

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

export function useAdjustmentSession(view: ViewMode, jobId: string) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [state, dispatch] = useReducer(
    sessionReducer,
    undefined,
    createInitialState,
  );
  const queryClient = useQueryClient();

  const createSession = useMutation(
    orpc.adjustments.createSession.mutationOptions(),
  );

  const appendMessage = useMutation(
    orpc.adjustments.appendMessage.mutationOptions({
      onSuccess: (nextDetail) => {
        dispatch({ type: "SET_ACTIVE_SESSION_DETAIL", detail: nextDetail });
        dispatch({ type: "SET_DRAFT_MESSAGE", view, value: "" });
        dispatch({ type: "SET_REPLY_VISIBLE", view, visible: true });
        if (nextDetail.session.status === "applied") {
          queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
        }
      },
      onError: (error) => {
        dispatch({
          type: "SET_SESSION_ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Anpassungsnachricht konnte nicht gespeichert werden.",
        });
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
          state.activeSessionDetail &&
          state.activeSessionDetail.session.status === "applied"
        ) {
          clearCurrentAdjustmentState(view);
        } else {
          dispatch({
            type: "SET_SESSION_ERROR",
            error:
              error instanceof Error
                ? error.message
                : "Anpassungssession konnte nicht verworfen werden.",
          });
        }
      },
    }),
  );

  function clearCurrentAdjustmentState(targetView: ViewMode) {
    dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view: targetView });
  }

  // Derived values
  const isAdjustableView = adjustableViews.has(view);
  const isAdjustModeEnabled = state.adjustModeByView[view];
  const activeSelection = state.selectionByView[view];
  const activeAnchor = state.anchorByView[view];
  const activeDraftMessage = state.draftMessageByView[view];
  const showGuide =
    isAdjustModeEnabled &&
    !activeSelection &&
    !state.guideDismissedByView[view];

  // Disable adjust mode when switching to a non-adjustable view
  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled) {
      dispatch({ type: "SET_ADJUST_MODE", view, enabled: false });
    }
  }, [isAdjustModeEnabled, isAdjustableView, view]);

  // Debounced session creation on selection change
  useEffect(() => {
    const currentSelection = state.selectionByView[view];
    const activeSelectionKey = state.sessionSelectionKeyByView[view];
    if (!isAdjustModeEnabled || !isAdjustableView || !currentSelection) return;

    const nextSelectionKey = JSON.stringify(currentSelection);
    if (
      activeSelectionKey === nextSelectionKey &&
      state.activeSessionDetail &&
      state.activeSessionDetail.session.importId === jobId
    )
      return;

    if (selectionDebounceRef.current !== null)
      clearTimeout(selectionDebounceRef.current);

    selectionDebounceRef.current = setTimeout(() => {
      dispatch({ type: "SET_SESSION_ERROR", error: null });
      createSession.mutate(
        { importId: jobId, selection: currentSelection, targetFormat: view },
        {
          onSuccess: (detail) => {
            dispatch({ type: "SET_ACTIVE_SESSION_DETAIL", detail });
            dispatch({
              type: "SET_SESSION_SELECTION_KEY",
              view,
              key: nextSelectionKey,
            });
          },
          onError: (error) => {
            dispatch({
              type: "SET_SESSION_ERROR",
              error:
                error instanceof Error
                  ? error.message
                  : "Anpassungssession konnte nicht erstellt werden.",
            });
          },
        },
      );
    }, 250);

    return () => {
      if (selectionDebounceRef.current !== null)
        clearTimeout(selectionDebounceRef.current);
    };
  }, [
    state.selectionByView[view],
    state.sessionSelectionKeyByView[view],
    state.activeSessionDetail,
    createSession.mutate,
    isAdjustModeEnabled,
    isAdjustableView,
    jobId,
    view,
  ]);

  function toggleAdjustMode() {
    if (!isAdjustableView) return;
    const nextEnabled = !state.adjustModeByView[view];
    dispatch({ type: "SET_ADJUST_MODE", view, enabled: nextEnabled });
    dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed: false });
    if (!nextEnabled) clearCurrentAdjustmentState(view);
  }

  function handleSelectionChange(
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) {
    const container = sectionRef.current;
    let containerAnchor = anchor;
    if (container) {
      const r = container.getBoundingClientRect();
      containerAnchor = {
        top: anchor.top - r.top,
        bottom: anchor.bottom - r.top,
        left: anchor.left - r.left,
        width: anchor.width,
        height: anchor.height,
      };
    }
    dispatch({ type: "SET_SELECTION", view, selection });
    dispatch({ type: "SET_ANCHOR", view, anchor: containerAnchor });
    dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed: true });
    dispatch({ type: "SET_SESSION_ERROR", error: null });
    dispatch({ type: "SET_REPLY_VISIBLE", view, visible: false });
  }

  function handleDraftMessageChange(value: string) {
    dispatch({ type: "SET_DRAFT_MESSAGE", view, value });
  }

  function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.activeSessionDetail) return;
    const content = state.draftMessageByView[view].trim();
    if (!content) return;
    dispatch({ type: "SET_SESSION_ERROR", error: null });
    appendMessage.mutate({
      sessionId: state.activeSessionDetail.session.id,
      content,
    });
  }

  function handleDiscardSession() {
    if (!state.activeSessionDetail) {
      clearCurrentAdjustmentState(view);
      return;
    }
    dispatch({ type: "SET_SESSION_ERROR", error: null });
    discardSession.mutate({ sessionId: state.activeSessionDetail.session.id });
  }

  function setReplyVisible(visible: boolean) {
    dispatch({ type: "SET_REPLY_VISIBLE", view, visible });
  }

  function setGuideDismissed(dismissed: boolean) {
    dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed });
  }

  return {
    sectionRef,
    adjustModeEnabled: isAdjustModeEnabled,
    activeSessionDetail: state.activeSessionDetail,
    activeSelection,
    activeAnchor,
    activeDraftMessage,
    activeSessionError: state.sessionError,
    activeSessionLoading: createSession.isPending,
    isSubmitting: appendMessage.isPending,
    isDiscarding: discardSession.isPending,
    showGuide,
    replyVisible: state.replyVisibleByView[view],
    guideDismissed: state.guideDismissedByView[view],
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
