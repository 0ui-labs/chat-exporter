// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AdjustmentPopover } from "./adjustment-popover";
import type { AgentLoopStatus } from "./use-adjustment-session";

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
    agentLoopStatus: { phase: "idle" } as AgentLoopStatus,
    onScopeSelect: vi.fn(),
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

  describe("agent loop status", () => {
    test("shows spinner with thinking text when phase is thinking", () => {
      renderPopover({
        agentLoopStatus: { phase: "thinking" },
      });

      const statusEl = document.querySelector(
        "[data-testid='agent-status-thinking']",
      );
      expect(statusEl).not.toBeNull();
      expect(statusEl?.textContent).toContain("Agent analysiert");
    });

    test("shows no status indicator when phase is idle", () => {
      renderPopover({
        agentLoopStatus: { phase: "idle" },
      });

      expect(
        document.querySelector("[data-testid='agent-status-thinking']"),
      ).toBeNull();
      expect(
        document.querySelector("[data-testid='agent-status-applying']"),
      ).toBeNull();
      expect(
        document.querySelector("[data-testid='scope-selection']"),
      ).toBeNull();
    });
  });

  describe("scope dialog", () => {
    test("shows scope selection buttons when phase is done and assistant message exists", () => {
      renderPopover({
        agentLoopStatus: { phase: "done" },
        showReply: true,
      });

      const scopeEl = document.querySelector("[data-testid='scope-selection']");
      expect(scopeEl).not.toBeNull();

      const buttons = scopeEl?.querySelectorAll("button") ?? [];
      const buttonTexts = Array.from(buttons).map((b) => b.textContent);
      expect(buttonTexts).toContain("Global anwenden");
      expect(buttonTexts).toContain("Nur dieser Block");
    });

    test("global button calls onScopeSelect with 'global'", async () => {
      const user = userEvent.setup();
      const onScopeSelect = vi.fn();
      renderPopover({
        agentLoopStatus: { phase: "done" },
        showReply: true,
        onScopeSelect,
      });

      const scopeEl = document.querySelector("[data-testid='scope-selection']");
      const globalBtn = Array.from(
        scopeEl?.querySelectorAll("button") ?? [],
      ).find((b) => b.textContent === "Global anwenden");

      expect(globalBtn).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: guarded by assertion above
      await user.click(globalBtn!);
      expect(onScopeSelect).toHaveBeenCalledWith("global");
    });

    test("local button calls onScopeSelect with 'local'", async () => {
      const user = userEvent.setup();
      const onScopeSelect = vi.fn();
      renderPopover({
        agentLoopStatus: { phase: "done" },
        showReply: true,
        onScopeSelect,
      });

      const scopeEl = document.querySelector("[data-testid='scope-selection']");
      const localBtn = Array.from(
        scopeEl?.querySelectorAll("button") ?? [],
      ).find((b) => b.textContent === "Nur dieser Block");

      expect(localBtn).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: guarded by assertion above
      await user.click(localBtn!);
      expect(onScopeSelect).toHaveBeenCalledWith("local");
    });
  });
});
