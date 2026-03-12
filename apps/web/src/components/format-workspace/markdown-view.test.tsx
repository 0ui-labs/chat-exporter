import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { MarkdownView } from "./markdown-view";
import type { AdjustmentSelection } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProps(
  overrides?: Partial<Parameters<typeof MarkdownView>[0]>,
): Parameters<typeof MarkdownView>[0] {
  return {
    activeRules: [],
    adjustModeEnabled: false,
    content: "line one\nline two\nline three",
    highlightedRuleId: null,
    onSelectLines: vi.fn(),
    selectedRange: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MarkdownView", () => {
  describe("rendering", () => {
    test("renders all lines", () => {
      const props = createProps({ content: "alpha\nbeta\ngamma" });

      render(<MarkdownView {...props} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(3);
    });
  });

  describe("line selection", () => {
    test("clicking a line in adjust mode calls onSelectLines with correct line data", async () => {
      const user = userEvent.setup();
      const onSelectLines = vi.fn();
      const props = createProps({
        adjustModeEnabled: true,
        content: "first\nsecond\nthird",
        onSelectLines,
      });

      render(<MarkdownView {...props} />);

      const line2 = screen.getByTestId("markdown-line-2");
      await user.click(line2);

      expect(onSelectLines).toHaveBeenCalledTimes(1);
      const [selection] = onSelectLines.mock.calls[0] as [AdjustmentSelection];
      expect(selection.lineStart).toBe(2);
      expect(selection.lineEnd).toBe(2);
      expect(selection.selectedText).toBe("second");
    });

    test("does not call onSelectLines when adjust mode is disabled", async () => {
      const user = userEvent.setup();
      const onSelectLines = vi.fn();
      const props = createProps({
        adjustModeEnabled: false,
        content: "first\nsecond",
        onSelectLines,
      });

      render(<MarkdownView {...props} />);

      await user.click(screen.getByTestId("markdown-line-1"));

      expect(onSelectLines).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("shows fallback for a line that throws and keeps other lines visible", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Make formatLineNumber throw for line 2 by patching padStart
      const originalPadStart = String.prototype.padStart;
      String.prototype.padStart = function (...args) {
        if (this.valueOf() === "2") {
          throw new Error("padStart boom");
        }
        return originalPadStart.apply(this, args);
      };

      try {
        const props = createProps({ content: "good\nbad\nalso good" });
        render(<MarkdownView {...props} />);

        expect(
          screen.getByText("Zeile konnte nicht dargestellt werden."),
        ).toBeInTheDocument();
        expect(screen.getByText("good")).toBeInTheDocument();
        expect(screen.getByText("also good")).toBeInTheDocument();
      } finally {
        String.prototype.padStart = originalPadStart;
        consoleSpy.mockRestore();
      }
    });
  });

  describe("line numbering", () => {
    test("displays formatted line numbers", () => {
      const props = createProps({ content: "a\nb\nc" });

      render(<MarkdownView {...props} />);

      expect(screen.getByText("01")).toBeInTheDocument();
      expect(screen.getByText("02")).toBeInTheDocument();
      expect(screen.getByText("03")).toBeInTheDocument();
    });
  });
});
