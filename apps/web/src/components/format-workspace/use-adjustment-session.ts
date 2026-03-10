import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useReducer, useRef } from "react";

import {
  type AdjustmentSelection,
  adjustableViews,
  type ViewMode,
  type ViewportAnchor,
} from "@/components/format-workspace/types";
import { orpc } from "@/lib/orpc";

import {
  createInitialState,
  sessionReducer,
} from "./adjustment-session-reducer";

function extractErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdjustmentSession(view: ViewMode, jobId: string) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        dispatch({ type: "APPEND_MESSAGE_SUCCESS", view, detail: nextDetail });
        if (nextDetail.session.status === "applied")
          queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      },
      onError: (error) => {
        dispatch({
          type: "SET_SESSION_ERROR",
          error: extractErrorMessage(
            error,
            "Anpassungsnachricht konnte nicht gespeichert werden.",
          ),
        });
      },
    }),
  );

  const discardSession = useMutation(
    orpc.adjustments.discard.mutationOptions({
      onSuccess: () => dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view }),
      onError: (error) => {
        if (state.activeSessionDetail?.session.status === "applied") {
          dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
        } else {
          dispatch({
            type: "SET_SESSION_ERROR",
            error: extractErrorMessage(
              error,
              "Anpassungssession konnte nicht verworfen werden.",
            ),
          });
        }
      },
    }),
  );

  // Derived values
  const isAdjustableView = adjustableViews.has(view);
  const isAdjustModeEnabled = state.adjustModeByView[view];
  const activeSelection = state.selectionByView[view];

  // Disable adjust mode when switching to a non-adjustable view
  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled)
      dispatch({ type: "SET_ADJUST_MODE", view, enabled: false });
  }, [isAdjustModeEnabled, isAdjustableView, view]);

  // Debounced session creation on selection change
  useEffect(() => {
    const currentSelection = state.selectionByView[view];
    const activeSelectionKey = state.sessionSelectionKeyByView[view];
    if (!isAdjustModeEnabled || !isAdjustableView || !currentSelection) return;

    const nextSelectionKey = JSON.stringify(currentSelection);
    if (
      activeSelectionKey === nextSelectionKey &&
      state.activeSessionDetail?.session.importId === jobId
    )
      return;

    if (debounceRef.current !== null) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
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
              error: extractErrorMessage(
                error,
                "Anpassungssession konnte nicht erstellt werden.",
              ),
            });
          },
        },
      );
    }, 250);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
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
    if (!nextEnabled) dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
  }

  function handleSelectionChange(
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) {
    const container = sectionRef.current;
    const r = container?.getBoundingClientRect();
    const adjusted = r
      ? {
          top: anchor.top - r.top,
          bottom: anchor.bottom - r.top,
          left: anchor.left - r.left,
          width: anchor.width,
          height: anchor.height,
        }
      : anchor;
    dispatch({ type: "SELECTION_CHANGED", view, selection, anchor: adjusted });
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
      dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
      return;
    }
    dispatch({ type: "SET_SESSION_ERROR", error: null });
    discardSession.mutate({ sessionId: state.activeSessionDetail.session.id });
  }

  return {
    sectionRef,
    adjustModeEnabled: isAdjustModeEnabled,
    activeSessionDetail: state.activeSessionDetail,
    activeSelection,
    activeAnchor: state.anchorByView[view],
    activeDraftMessage: state.draftMessageByView[view],
    activeSessionError: state.sessionError,
    activeSessionLoading: createSession.isPending,
    isSubmitting: appendMessage.isPending,
    isDiscarding: discardSession.isPending,
    showGuide:
      isAdjustModeEnabled &&
      !activeSelection &&
      !state.guideDismissedByView[view],
    replyVisible: state.replyVisibleByView[view],
    guideDismissed: state.guideDismissedByView[view],
    toggleAdjustMode,
    handleSelectionChange,
    handleDraftMessageChange: (value: string) =>
      dispatch({ type: "SET_DRAFT_MESSAGE", view, value }),
    handleSubmitMessage,
    handleDiscardSession,
    clearCurrentAdjustmentState: (targetView: ViewMode) =>
      dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view: targetView }),
    setReplyVisible: (visible: boolean) =>
      dispatch({ type: "SET_REPLY_VISIBLE", view, visible }),
    setGuideDismissed: (dismissed: boolean) =>
      dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed }),
  };
}
