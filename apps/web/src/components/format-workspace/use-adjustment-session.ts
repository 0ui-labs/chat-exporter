import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  type AdjustmentSelection,
  getAdjustableViews,
  type ViewMode,
  type ViewportAnchor,
} from "@/components/format-workspace/types";
import { orpc } from "@/lib/orpc";

import {
  createInitialState,
  sessionReducer,
} from "./adjustment-session-reducer";

export type AgentLoopStatus =
  | { phase: "idle" }
  | { phase: "thinking" }
  | { phase: "applying"; iteration: number }
  | { phase: "verifying"; iteration: number }
  | { phase: "asking_scope" }
  | { phase: "done" }
  | { phase: "failed"; reason: string };

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
  const [agentLoopStatus, setAgentLoopStatus] = useState<AgentLoopStatus>({
    phase: "idle",
  });
  const queryClient = useQueryClient();

  const statusQuery = useQuery(orpc.adjustments.status.queryOptions());

  const createSession = useMutation(
    orpc.adjustments.createSession.mutationOptions(),
  );

  const appendMessage = useMutation(
    orpc.adjustments.appendMessage.mutationOptions({
      onMutate: () => {
        setAgentLoopStatus({ phase: "thinking" });
      },
      onSuccess: (nextDetail) => {
        dispatch({ type: "APPEND_MESSAGE_SUCCESS", view, detail: nextDetail });
        if (nextDetail.session.status === "applied")
          queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
        setAgentLoopStatus({ phase: "done" });
        toast.success("Anpassung übernommen");
      },
      onError: (error) => {
        dispatch({
          type: "SET_SESSION_ERROR",
          error: extractErrorMessage(
            error,
            "Anpassungsnachricht konnte nicht gespeichert werden.",
          ),
        });
        setAgentLoopStatus({
          phase: "failed",
          reason: extractErrorMessage(error, "Unbekannter Fehler"),
        });
        toast.error("Anpassung fehlgeschlagen");
      },
    }),
  );

  const discardSession = useMutation(
    orpc.adjustments.discard.mutationOptions({
      onSuccess: () => {
        dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
        toast.info("Letzte Änderung verworfen");
      },
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
  const isAdjustableView = getAdjustableViews().has(view);
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

  const toggleAdjustMode = useCallback(() => {
    if (!isAdjustableView) return;

    // Block enabling when AI is unavailable
    if (
      !state.adjustModeByView[view] &&
      statusQuery.data &&
      !statusQuery.data.available
    ) {
      toast.info(
        "Der KI-Anpassungsmodus erfordert einen API-Schlüssel. Bitte richte einen Anthropic API-Key ein.",
      );
      return;
    }

    const nextEnabled = !state.adjustModeByView[view];
    dispatch({ type: "SET_ADJUST_MODE", view, enabled: nextEnabled });
    dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed: false });
    if (!nextEnabled) dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
  }, [isAdjustableView, state.adjustModeByView, view, statusQuery.data]);

  const handleSelectionChange = useCallback(
    (selection: AdjustmentSelection, anchor: ViewportAnchor) => {
      const container = sectionRef.current;
      const r = container?.getBoundingClientRect();
      const scrollTop = container?.scrollTop ?? 0;
      const adjusted = r
        ? {
            top: anchor.top - r.top + scrollTop,
            bottom: anchor.bottom - r.top + scrollTop,
            left: anchor.left - r.left,
            width: anchor.width,
            height: anchor.height,
          }
        : anchor;
      dispatch({
        type: "SELECTION_CHANGED",
        view,
        selection,
        anchor: adjusted,
      });
    },
    [view],
  );

  // Stable refs for values used in callbacks — prevents useCallback from
  // getting new references when mutation objects or state change.
  const latestRef = useRef({
    activeSessionDetail: state.activeSessionDetail,
    draftMessageByView: state.draftMessageByView,
    selectionByView: state.selectionByView,
    appendMutate: appendMessage.mutate,
    discardMutate: discardSession.mutate,
  });
  latestRef.current = {
    activeSessionDetail: state.activeSessionDetail,
    draftMessageByView: state.draftMessageByView,
    selectionByView: state.selectionByView,
    appendMutate: appendMessage.mutate,
    discardMutate: discardSession.mutate,
  };

  const handleSubmitMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const {
        activeSessionDetail,
        draftMessageByView,
        appendMutate,
        selectionByView,
      } = latestRef.current;
      if (!activeSessionDetail) return;
      const content = draftMessageByView[view].trim();
      if (!content) return;
      dispatch({ type: "SET_SESSION_ERROR", error: null });

      // Capture screenshot + markup of the selected block
      let screenshot: string | undefined;
      let markup: string | undefined;
      const selection = selectionByView[view];

      if (selection && sectionRef.current) {
        const blockEl = sectionRef.current.querySelector<HTMLElement>(
          `[data-testid="reader-block-${selection.messageId}-${selection.blockIndex}"]`,
        );
        if (blockEl) {
          try {
            const dataUrl = await toPng(blockEl, {
              width: Math.min(blockEl.scrollWidth, 800),
              pixelRatio: 1,
              cacheBust: true,
            });
            screenshot = dataUrl.replace(/^data:image\/png;base64,/, "");
          } catch {
            // Screenshot capture is best-effort — don't block the message
          }
          markup = blockEl.innerHTML;
        }
      }

      appendMutate({
        sessionId: activeSessionDetail.session.id,
        content,
        screenshot,
        markup,
      });
    },
    [view],
  );

  const handleDiscardSession = useCallback(() => {
    const { activeSessionDetail, discardMutate } = latestRef.current;
    if (!activeSessionDetail) {
      dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view });
      return;
    }
    dispatch({ type: "SET_SESSION_ERROR", error: null });
    discardMutate({ sessionId: activeSessionDetail.session.id });
  }, [view]);

  const handleDraftMessageChange = useCallback(
    (value: string) => dispatch({ type: "SET_DRAFT_MESSAGE", view, value }),
    [view],
  );

  const setReplyVisible = useCallback(
    (visible: boolean) =>
      dispatch({ type: "SET_REPLY_VISIBLE", view, visible }),
    [view],
  );

  const setGuideDismissed = useCallback(
    (dismissed: boolean) =>
      dispatch({ type: "SET_GUIDE_DISMISSED", view, dismissed }),
    [view],
  );

  const clearCurrentAdjustmentState = useCallback(
    (targetView: ViewMode) =>
      dispatch({ type: "CLEAR_ADJUSTMENT_STATE", view: targetView }),
    [],
  );

  const handleScopeSelect = useCallback((_scope: "global" | "local") => {
    // For now, just reset the agent status — the actual scope mutation
    // (changing rule selectors) will be handled in a follow-up when the
    // server endpoint exists.
    setAgentLoopStatus({ phase: "idle" });
  }, []);

  return {
    sectionRef,
    adjustmentAvailable: statusQuery.data?.available ?? false,
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
    handleDraftMessageChange,
    handleSubmitMessage,
    handleDiscardSession,
    clearCurrentAdjustmentState,
    setReplyVisible,
    setGuideDismissed,
    agentLoopStatus,
    handleScopeSelect,
  };
}
