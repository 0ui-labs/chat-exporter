// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AdjustmentPopover } from "./adjustment-popover";

// ---------------------------------------------------------------------------
// Radix UI polyfills
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi
    .fn()
    .mockReturnValue(false) as Element["hasPointerCapture"];
  Element.prototype.setPointerCapture ??=
    vi.fn() as Element["setPointerCapture"];
  Element.prototype.releasePointerCapture ??=
    vi.fn() as Element["releasePointerCapture"];
  Element.prototype.scrollIntoView ??= vi.fn() as Element["scrollIntoView"];
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPopover(
  overrides: Partial<React.ComponentProps<typeof AdjustmentPopover>> = {},
) {
  const containerEl = document.createElement("div");
  document.body.appendChild(containerEl);

  const defaultProps: React.ComponentProps<typeof AdjustmentPopover> = {
    anchor: { top: 100, left: 100, bottom: 120, width: 200, height: 20 },
    containerRef: { current: containerEl },
    draftMessage: "",
    error: null,
    isLoading: false,
    isSubmitting: false,
    onClose: vi.fn(),
    onDraftMessageChange: vi.fn(),
    onRejectLastChange: vi.fn(),
    onSubmitMessage: vi.fn(),
    open: true,
    sessionDetail: {
      session: {
        id: "session-1",
        importId: "import-1",
        format: "reader",
        status: "active",
        selection: {
          blockType: "paragraph",
          blockIndex: 0,
          messageId: "msg-1",
          messageIndex: 0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: [
        {
          id: "msg-1",
          sessionId: "session-1",
          role: "assistant",
          content: "I made the change.",
          createdAt: new Date().toISOString(),
        },
      ],
      rules: [],
    } as never,
    showReply: true,
    view: "reader",
    ...overrides,
  };

  return render(<AdjustmentPopover {...defaultProps} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdjustmentPopover", () => {
  describe("destructive variant", () => {
    test("discard button uses destructive-outline variant styling", () => {
      renderPopover({ showReply: true });

      // The popover is aria-hidden in test env (useFloating isPositioned=false),
      // so we query the DOM directly
      const buttons = document.querySelectorAll("button");
      const discardButton = Array.from(buttons).find(
        (btn) => btn.textContent === "Verwerfen",
      );

      expect(discardButton).toBeDefined();
      // The destructive-outline variant applies red border and text classes
      const className = discardButton?.className ?? "";
      expect(className).toMatch(/border-red-300/);
      expect(className).toMatch(/text-red-600/);
    });
  });
});
