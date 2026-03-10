import type { AdjustmentSessionDetail } from "@chat-exporter/shared";

import type {
  AdjustmentSelection,
  FloatingAdjustmentAnchor,
  ViewMode,
} from "@/components/format-workspace/types";

export type SessionState = {
  draftMessageByView: Record<ViewMode, string>;
  adjustModeByView: Record<ViewMode, boolean>;
  guideDismissedByView: Record<ViewMode, boolean>;
  selectionByView: Record<ViewMode, AdjustmentSelection | null>;
  anchorByView: Record<ViewMode, FloatingAdjustmentAnchor | null>;
  replyVisibleByView: Record<ViewMode, boolean>;
  sessionSelectionKeyByView: Record<ViewMode, string | null>;
  activeSessionDetail: AdjustmentSessionDetail | null;
  sessionError: string | null;
};

const falsy = <T>(v: T): Record<ViewMode, T> => ({
  reader: v,
  markdown: v,
  handover: v,
  json: v,
});

export function createInitialState(): SessionState {
  return {
    draftMessageByView: falsy(""),
    adjustModeByView: falsy(false),
    guideDismissedByView: falsy(false),
    selectionByView: falsy(null),
    anchorByView: falsy(null),
    replyVisibleByView: falsy(false),
    sessionSelectionKeyByView: falsy(null),
    activeSessionDetail: null,
    sessionError: null,
  };
}

export type SessionAction =
  | { type: "SET_DRAFT_MESSAGE"; view: ViewMode; value: string }
  | { type: "SET_ADJUST_MODE"; view: ViewMode; enabled: boolean }
  | { type: "SET_GUIDE_DISMISSED"; view: ViewMode; dismissed: boolean }
  | {
      type: "SET_SELECTION";
      view: ViewMode;
      selection: AdjustmentSelection | null;
    }
  | {
      type: "SET_ANCHOR";
      view: ViewMode;
      anchor: FloatingAdjustmentAnchor | null;
    }
  | { type: "SET_REPLY_VISIBLE"; view: ViewMode; visible: boolean }
  | { type: "SET_SESSION_SELECTION_KEY"; view: ViewMode; key: string | null }
  | {
      type: "SET_ACTIVE_SESSION_DETAIL";
      detail: AdjustmentSessionDetail | null;
    }
  | { type: "SET_SESSION_ERROR"; error: string | null }
  | { type: "CLEAR_ADJUSTMENT_STATE"; view: ViewMode };

/** Sets `key` in a per-view record to `value` for `view`. */
function setView<K extends keyof SessionState>(
  state: SessionState,
  key: K,
  view: ViewMode,
  value: SessionState[K] extends Record<ViewMode, infer V> ? V : never,
): SessionState {
  return {
    ...state,
    [key]: { ...(state[key] as Record<ViewMode, unknown>), [view]: value },
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "SET_DRAFT_MESSAGE":
      return setView(state, "draftMessageByView", action.view, action.value);
    case "SET_ADJUST_MODE":
      return setView(state, "adjustModeByView", action.view, action.enabled);
    case "SET_GUIDE_DISMISSED":
      return setView(
        state,
        "guideDismissedByView",
        action.view,
        action.dismissed,
      );
    case "SET_SELECTION":
      return setView(state, "selectionByView", action.view, action.selection);
    case "SET_ANCHOR":
      return setView(state, "anchorByView", action.view, action.anchor);
    case "SET_REPLY_VISIBLE":
      return setView(state, "replyVisibleByView", action.view, action.visible);
    case "SET_SESSION_SELECTION_KEY":
      return setView(
        state,
        "sessionSelectionKeyByView",
        action.view,
        action.key,
      );
    case "SET_ACTIVE_SESSION_DETAIL":
      return { ...state, activeSessionDetail: action.detail };
    case "SET_SESSION_ERROR":
      return { ...state, sessionError: action.error };
    case "CLEAR_ADJUSTMENT_STATE": {
      const { view } = action;
      return {
        ...state,
        draftMessageByView: { ...state.draftMessageByView, [view]: "" },
        selectionByView: { ...state.selectionByView, [view]: null },
        anchorByView: { ...state.anchorByView, [view]: null },
        sessionSelectionKeyByView: {
          ...state.sessionSelectionKeyByView,
          [view]: null,
        },
        replyVisibleByView: { ...state.replyVisibleByView, [view]: false },
        activeSessionDetail: null,
        sessionError: null,
      };
    }
  }
}
