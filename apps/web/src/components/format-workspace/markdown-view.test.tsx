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
    onScrollRefChange: vi.fn(),
    onSelectLines: vi.fn(),
    selectedRange: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// jsdom polyfills for @tanstack/react-virtual and Radix UI
// ---------------------------------------------------------------------------

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    // No-op — the virtualizer will use offsetHeight via its own measureElement
    // fallback when no borderBoxSize entry is available.
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // ResizeObserver is required by @tanstack/virtual-core
  globalThis.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;

  Element.prototype.hasPointerCapture ??= vi
    .fn()
    .mockReturnValue(false) as Element["hasPointerCapture"];
  Element.prototype.setPointerCapture ??=
    vi.fn() as Element["setPointerCapture"];
  Element.prototype.releasePointerCapture ??=
    vi.fn() as Element["releasePointerCapture"];
  Element.prototype.scrollIntoView ??= vi.fn() as Element["scrollIntoView"];

  // jsdom has no layout — give elements non-zero dimensions so the
  // virtualizer can compute how many items fit in the viewport.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 800;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return 10000;
    },
  });

  Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
    x: 0,
    y: 0,
    width: 800,
    height: 40,
    top: 0,
    right: 800,
    bottom: 40,
    left: 0,
    toJSON: () => ({}),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MarkdownView", () => {
  describe("virtualisation", () => {
    test("renders only a subset of lines when content is large", () => {
      const manyLines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
      const props = createProps({ content: manyLines.join("\n") });

      const { container } = render(<MarkdownView {...props} />);

      // With overscan 20 and viewport near top, far fewer than 500 buttons
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeLessThan(500);
      expect(buttons.length).toBeGreaterThan(0);
    });

    test("each rendered line has data-index attribute", () => {
      const props = createProps({ content: "alpha\nbeta\ngamma" });

      render(<MarkdownView {...props} />);

      const buttons = screen.getAllByRole("button");
      for (const button of buttons) {
        expect(button).toHaveAttribute("data-index");
      }
    });

    test("rendered lines use absolute positioning via transform", () => {
      const props = createProps({ content: "hello\nworld" });

      render(<MarkdownView {...props} />);

      const buttons = screen.getAllByRole("button");
      for (const button of buttons) {
        expect(button.style.position).toBe("absolute");
        expect(button.style.transform).toMatch(/translateY/);
      }
    });

    test("scroll container has overflow-y auto and height 100%", () => {
      const props = createProps();

      const { container } = render(<MarkdownView {...props} />);

      const scrollContainer = container.firstElementChild as HTMLElement;
      expect(scrollContainer.style.overflowY).toBe("auto");
      expect(scrollContainer.style.height).toBe("100%");
    });
  });

  describe("onScrollRefChange callback", () => {
    test("calls onScrollRefChange with the scroll container element on mount", () => {
      const onScrollRefChange = vi.fn();
      const props = createProps({ onScrollRefChange });

      render(<MarkdownView {...props} />);

      expect(onScrollRefChange).toHaveBeenCalledTimes(1);
      expect(onScrollRefChange).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
      );
    });

    test("calls onScrollRefChange with null on unmount", () => {
      const onScrollRefChange = vi.fn();
      const props = createProps({ onScrollRefChange });

      const { unmount } = render(<MarkdownView {...props} />);
      onScrollRefChange.mockClear();

      unmount();

      expect(onScrollRefChange).toHaveBeenCalledWith(null);
    });
  });

  describe("line selection (existing behaviour)", () => {
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
