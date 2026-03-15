import type { AdjustmentSessionDetail } from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";

import type {
  AdjustmentSelection,
  FloatingAdjustmentAnchor,
} from "@/components/format-workspace/types";

import {
  createInitialState,
  type SessionState,
  sessionReducer,
} from "./adjustment-session-reducer";

// ── Factories ───────────────────────────────────────────────────────────

function createSelection(
  overrides?: Partial<AdjustmentSelection>,
): AdjustmentSelection {
  return {
    blockIndex: 0,
    blockType: "paragraph",
    messageId: "msg-1",
    messageIndex: 0,
    messageRole: "user",
    selectedText: "selected text",
    textQuote: "selected text",
    ...overrides,
  } as AdjustmentSelection;
}

function createAnchor(
  overrides?: Partial<FloatingAdjustmentAnchor>,
): FloatingAdjustmentAnchor {
  return {
    top: 10,
    bottom: 50,
    left: 20,
    width: 200,
    height: 40,
    ...overrides,
  };
}

function createSessionDetail(
  overrides?: Partial<AdjustmentSessionDetail>,
): AdjustmentSessionDetail {
  return {
    session: {
      id: "session-1",
      importId: "job-1",
      targetFormat: "reader",
      status: "open",
      selection: createSelection(),
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    messages: [],
    ...overrides,
  } as AdjustmentSessionDetail;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("sessionReducer", () => {
  test("createInitialState returns zeroed-out state", () => {
    const state = createInitialState();

    expect(state.draftMessageByView.reader).toBe("");
    expect(state.adjustModeByView.markdown).toBe(false);
    expect(state.selectionByView.reader).toBeNull();
    expect(state.activeSessionDetail).toBeNull();
    expect(state.sessionError).toBeNull();
  });

  describe("SET_DRAFT_MESSAGE", () => {
    test("updates draft for the given view only", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_DRAFT_MESSAGE",
        view: "reader",
        value: "hello",
      });

      expect(next.draftMessageByView.reader).toBe("hello");
      expect(next.draftMessageByView.markdown).toBe("");
    });
  });

  describe("SET_ADJUST_MODE", () => {
    test("enables adjust mode for the given view", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_ADJUST_MODE",
        view: "markdown",
        enabled: true,
      });

      expect(next.adjustModeByView.markdown).toBe(true);
      expect(next.adjustModeByView.reader).toBe(false);
    });
  });

  describe("SET_GUIDE_DISMISSED", () => {
    test("dismisses guide for the given view", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_GUIDE_DISMISSED",
        view: "reader",
        dismissed: true,
      });

      expect(next.guideDismissedByView.reader).toBe(true);
      expect(next.guideDismissedByView.markdown).toBe(false);
    });
  });

  describe("SET_SELECTION", () => {
    test("sets selection for the given view", () => {
      const state = createInitialState();
      const selection = createSelection();

      const next = sessionReducer(state, {
        type: "SET_SELECTION",
        view: "reader",
        selection,
      });

      expect(next.selectionByView.reader).toBe(selection);
      expect(next.selectionByView.markdown).toBeNull();
    });

    test("clears selection when set to null", () => {
      const state: SessionState = {
        ...createInitialState(),
        selectionByView: {
          ...createInitialState().selectionByView,
          reader: createSelection(),
        },
      };

      const next = sessionReducer(state, {
        type: "SET_SELECTION",
        view: "reader",
        selection: null,
      });

      expect(next.selectionByView.reader).toBeNull();
    });
  });

  describe("SET_ANCHOR", () => {
    test("sets anchor for the given view", () => {
      const state = createInitialState();
      const anchor = createAnchor();

      const next = sessionReducer(state, {
        type: "SET_ANCHOR",
        view: "reader",
        anchor,
      });

      expect(next.anchorByView.reader).toBe(anchor);
    });
  });

  describe("SET_REPLY_VISIBLE", () => {
    test("sets reply visibility for the given view", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_REPLY_VISIBLE",
        view: "markdown",
        visible: true,
      });

      expect(next.replyVisibleByView.markdown).toBe(true);
      expect(next.replyVisibleByView.reader).toBe(false);
    });
  });

  describe("SET_SESSION_SELECTION_KEY", () => {
    test("sets session selection key for the given view", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_SESSION_SELECTION_KEY",
        view: "reader",
        key: "some-key",
      });

      expect(next.sessionSelectionKeyByView.reader).toBe("some-key");
      expect(next.sessionSelectionKeyByView.markdown).toBeNull();
    });
  });

  describe("SET_ACTIVE_SESSION_DETAIL", () => {
    test("sets active session detail", () => {
      const state = createInitialState();
      const detail = createSessionDetail();

      const next = sessionReducer(state, {
        type: "SET_ACTIVE_SESSION_DETAIL",
        detail,
      });

      expect(next.activeSessionDetail).toBe(detail);
    });

    test("clears active session detail when set to null", () => {
      const state: SessionState = {
        ...createInitialState(),
        activeSessionDetail: createSessionDetail(),
      };

      const next = sessionReducer(state, {
        type: "SET_ACTIVE_SESSION_DETAIL",
        detail: null,
      });

      expect(next.activeSessionDetail).toBeNull();
    });
  });

  describe("SET_SESSION_ERROR", () => {
    test("sets session error", () => {
      const state = createInitialState();

      const next = sessionReducer(state, {
        type: "SET_SESSION_ERROR",
        error: "something went wrong",
      });

      expect(next.sessionError).toBe("something went wrong");
    });

    test("clears session error when set to null", () => {
      const state: SessionState = {
        ...createInitialState(),
        sessionError: "old error",
      };

      const next = sessionReducer(state, {
        type: "SET_SESSION_ERROR",
        error: null,
      });

      expect(next.sessionError).toBeNull();
    });
  });

  describe("CLEAR_ADJUSTMENT_STATE", () => {
    test("resets all relevant fields for the given view", () => {
      const state: SessionState = {
        ...createInitialState(),
        draftMessageByView: {
          reader: "draft",
          markdown: "keep",
          handover: "",
          json: "",
          "html-export": "",
        },
        selectionByView: {
          reader: createSelection(),
          markdown: createSelection({ selectedText: "md selection" }),
          handover: null,
          json: null,
          "html-export": null,
        },
        anchorByView: {
          reader: createAnchor(),
          markdown: createAnchor({ top: 99 }),
          handover: null,
          json: null,
          "html-export": null,
        },
        activeSessionDetail: createSessionDetail(),
        sessionSelectionKeyByView: {
          reader: "key-r",
          markdown: "key-m",
          handover: null,
          json: null,
          "html-export": null,
        },
        sessionError: "some error",
        replyVisibleByView: {
          reader: true,
          markdown: true,
          handover: false,
          json: false,
          "html-export": false,
        },
      };

      const next = sessionReducer(state, {
        type: "CLEAR_ADJUSTMENT_STATE",
        view: "reader",
      });

      // Cleared for the target view
      expect(next.draftMessageByView.reader).toBe("");
      expect(next.selectionByView.reader).toBeNull();
      expect(next.anchorByView.reader).toBeNull();
      expect(next.sessionSelectionKeyByView.reader).toBeNull();
      expect(next.replyVisibleByView.reader).toBe(false);

      // Global fields cleared
      expect(next.activeSessionDetail).toBeNull();
      expect(next.sessionError).toBeNull();

      // Other views untouched
      expect(next.draftMessageByView.markdown).toBe("keep");
      expect(next.selectionByView.markdown).toEqual(
        createSelection({ selectedText: "md selection" }),
      );
      expect(next.anchorByView.markdown).toEqual(createAnchor({ top: 99 }));
      expect(next.sessionSelectionKeyByView.markdown).toBe("key-m");
      expect(next.replyVisibleByView.markdown).toBe(true);
    });

    test("does not touch adjustModeByView or guideDismissedByView", () => {
      const state: SessionState = {
        ...createInitialState(),
        adjustModeByView: {
          reader: true,
          markdown: false,
          handover: false,
          json: false,
          "html-export": false,
        },
        guideDismissedByView: {
          reader: true,
          markdown: false,
          handover: false,
          json: false,
          "html-export": false,
        },
      };

      const next = sessionReducer(state, {
        type: "CLEAR_ADJUSTMENT_STATE",
        view: "reader",
      });

      expect(next.adjustModeByView.reader).toBe(true);
      expect(next.guideDismissedByView.reader).toBe(true);
    });
  });

  test("does not mutate original state", () => {
    const state = createInitialState();
    const frozen = Object.freeze({ ...state });

    // Should not throw since reducer creates new objects
    const next = sessionReducer(frozen as SessionState, {
      type: "SET_DRAFT_MESSAGE",
      view: "reader",
      value: "test",
    });

    expect(next).not.toBe(state);
    expect(next.draftMessageByView).not.toBe(state.draftMessageByView);
  });
});
