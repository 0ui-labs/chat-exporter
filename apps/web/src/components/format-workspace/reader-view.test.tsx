import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ReaderView } from "./reader-view";
import type { AdjustmentSelection, ViewportAnchor } from "./types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useVirtualizer to return all items (jsdom has no layout engine)
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
    const estimatedHeight = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      key: i,
      start: i * estimatedHeight,
      end: (i + 1) * estimatedHeight,
      size: estimatedHeight,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * estimatedHeight,
      measureElement: () => {},
    };
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/format-workspace/labels", () => ({
  getRoleLabel: (role: string) => role.toUpperCase(),
}));

vi.mock("@/components/format-workspace/rule-engine", () => ({
  blockToPlainText: (block: { text?: string }) => block.text ?? "",
  getBlocksMatchingRule: () => [],
  getReaderBlockClassName: () => "mock-block-class",
  renderReaderBlock: (block: { text?: string }) => (
    <span>{block.text ?? ""}</span>
  ),
  resolveReaderBlockEffects: () => ({}),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "conv-1",
    title: "Test Conversation",
    source: { url: "https://example.com/chat", platform: "chatgpt" },
    messages: [
      {
        id: "msg-1",
        role: "user",
        blocks: [{ type: "paragraph", text: "Hello" }],
      },
      {
        id: "msg-2",
        role: "assistant",
        blocks: [{ type: "paragraph", text: "Hi there" }],
      },
      {
        id: "msg-3",
        role: "user",
        blocks: [{ type: "paragraph", text: "How are you?" }],
      },
    ],
    ...overrides,
  };
}

function defaultProps(overrides?: Partial<Parameters<typeof ReaderView>[0]>) {
  return {
    activeRules: [] as FormatRule[],
    adjustModeEnabled: false,
    conversation: createConversation(),
    highlightedRuleId: null,
    onScrollRefChange: vi.fn(),
    onSelectBlock: vi.fn<(s: AdjustmentSelection, a: ViewportAnchor) => void>(),
    selectedBlock: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReaderView", () => {
  describe("virtualisation", () => {
    test("accepts onScrollRefChange prop and calls it with scroll element", () => {
      const onScrollRefChange = vi.fn();

      render(<ReaderView {...defaultProps({ onScrollRefChange })} />);

      expect(onScrollRefChange).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
      );
    });

    test("renders scroll container with overflow-y auto and height 100%", () => {
      const onScrollRefChange = vi.fn();

      render(<ReaderView {...defaultProps({ onScrollRefChange })} />);

      const scrollEl = onScrollRefChange.mock.calls[0]?.[0] as HTMLDivElement;
      expect(scrollEl.style.overflowY).toBe("auto");
      expect(scrollEl.style.height).toBe("100%");
    });

    test("renders inner sizing div with position relative", () => {
      const onScrollRefChange = vi.fn();

      render(<ReaderView {...defaultProps({ onScrollRefChange })} />);

      const scrollEl = onScrollRefChange.mock.calls[0]?.[0] as HTMLDivElement;
      const innerDiv = scrollEl.firstElementChild as HTMLElement;
      expect(innerDiv).toBeTruthy();
      expect(innerDiv.style.position).toBe("relative");
    });

    test("renders message articles with absolute positioning", () => {
      render(<ReaderView {...defaultProps()} />);

      const articles = screen.getAllByRole("article");
      expect(articles.length).toBeGreaterThan(0);

      for (const article of articles) {
        expect(article.style.position).toBe("absolute");
        expect(article.style.width).toBe("100%");
      }
    });

    test("renders message articles with data-index attributes", () => {
      render(<ReaderView {...defaultProps()} />);

      const articles = screen.getAllByRole("article");
      for (const article of articles) {
        expect(article.dataset.index).toBeDefined();
      }
    });

    test("renders all visible messages from the conversation", () => {
      const conversation = createConversation();

      render(<ReaderView {...defaultProps({ conversation })} />);

      const articles = screen.getAllByRole("article");
      // With overscan=5 and 3 messages, all should render
      expect(articles).toHaveLength(3);
    });
  });

  describe("empty state", () => {
    test("renders empty message when conversation has no messages", () => {
      render(
        <ReaderView
          {...defaultProps({
            conversation: createConversation({ messages: [] }),
          })}
        />,
      );

      expect(screen.queryAllByRole("article")).toHaveLength(0);
    });
  });

  describe("message content", () => {
    test("displays message index (1-based) in header", () => {
      render(<ReaderView {...defaultProps()} />);

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });
});
