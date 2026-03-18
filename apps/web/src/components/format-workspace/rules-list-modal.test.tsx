// @vitest-environment happy-dom
import type { FormatRule } from "@chat-exporter/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";

import { RulesListModal } from "./rules-list-modal";

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

function createRule(overrides: Partial<FormatRule> = {}): FormatRule {
  return {
    id: "rule-1",
    scope: "import_local",
    status: "active",
    instruction: "Test rule instruction",
    kind: "render",
    selector: { strategy: "exact", blockType: "paragraph", blockIndex: 0 },
    effect: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as FormatRule;
}

type RenderModalOptions = {
  rules?: FormatRule[];
};

function renderModal(options: RenderModalOptions = {}) {
  const { rules = [createRule()] } = options;

  const props = {
    disablingRuleById: {} as Record<string, boolean>,
    expandedRuleId: null,
    explanationErrorById: {} as Record<string, string>,
    explanationLoadingById: {} as Record<string, boolean>,
    promotingRuleById: {} as Record<string, boolean>,
    rules,
    view: "reader" as const,
    getExplanationDetail: vi.fn().mockReturnValue(null),
    onDemoteRule: vi.fn(),
    onDisableRule: vi.fn(),
    onHoverRule: vi.fn(),
    onLeaveRule: vi.fn(),
    onPromoteRule: vi.fn(),
    onToggleRuleExplanation: vi.fn(),
  };

  return {
    ...render(
      <TooltipProvider delayDuration={0}>
        <RulesListModal {...props} />
      </TooltipProvider>,
    ),
    props,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RulesListModal", () => {
  describe("destructive variant", () => {
    test("disable button uses destructive-outline variant styling", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByTestId("rules-list-trigger"));
      await waitFor(() => {
        expect(screen.getByTestId("rules-list-disable")).toBeInTheDocument();
      });

      const disableButton = screen.getByTestId("rules-list-disable");

      // The destructive-outline variant applies red border and text classes
      expect(disableButton.className).toMatch(/border-red-300/);
      expect(disableButton.className).toMatch(/text-red-600/);
    });
  });

  describe("tooltips", () => {
    test("rules trigger button is wrapped in a Radix tooltip trigger", () => {
      renderModal();

      const triggerButton = screen.getByTestId("rules-list-trigger");

      // Radix Tooltip adds data-state to the trigger element
      expect(triggerButton).toHaveAttribute("data-state", "closed");
    });

    test("promote button is wrapped in a Radix tooltip trigger", async () => {
      const user = userEvent.setup();
      const localRule = createRule({ scope: "import_local" });
      renderModal({ rules: [localRule] });

      // Open the modal first
      await user.click(screen.getByTestId("rules-list-trigger"));
      await waitFor(() => {
        expect(screen.getByTestId("rules-list-promote")).toBeInTheDocument();
      });

      const promoteButton = screen.getByTestId("rules-list-promote");
      expect(promoteButton).toHaveAttribute("data-state", "closed");
    });

    test("demote button is wrapped in a Radix tooltip trigger", async () => {
      const user = userEvent.setup();
      const globalRule = createRule({ scope: "format_profile" });
      renderModal({ rules: [globalRule] });

      // Open the modal first
      await user.click(screen.getByTestId("rules-list-trigger"));
      await waitFor(() => {
        expect(screen.getByTestId("rules-list-demote")).toBeInTheDocument();
      });

      const demoteButton = screen.getByTestId("rules-list-demote");
      expect(demoteButton).toHaveAttribute("data-state", "closed");
    });

    test("disable button is wrapped in a Radix tooltip trigger", async () => {
      const user = userEvent.setup();
      renderModal();

      // Open the modal first
      await user.click(screen.getByTestId("rules-list-trigger"));
      await waitFor(() => {
        expect(screen.getByTestId("rules-list-disable")).toBeInTheDocument();
      });

      const disableButton = screen.getByTestId("rules-list-disable");
      expect(disableButton).toHaveAttribute("data-state", "closed");
    });
  });
});
