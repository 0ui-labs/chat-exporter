import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderReaderBlock } from "@/components/format-workspace/rule-engine";
import { ReaderView } from "./reader-view";
import type { AdjustmentSelection, ViewportAnchor } from "./types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/format-workspace/labels", () => ({
  getRoleLabel: (role: string) => role.toUpperCase(),
}));

vi.mock("@/components/format-workspace/rule-engine", () => ({
  blockToPlainText: (block: { text?: string }) => block.text ?? "",
  collectInserts: () => ({ insertBefore: null, insertAfter: null }),
  getBlocksMatchingRule: () => [],
  getReaderBlockClassName: () => "mock-block-class",
  getReaderBlockStyle: () => ({}),
  renderReaderBlock: vi.fn((block: { text?: string }) => (
    <span>{block.text ?? ""}</span>
  )),
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
    effectsMap: new Map(),
    highlightedRuleId: null,
    onSelectBlock: vi.fn<(s: AdjustmentSelection, a: ViewportAnchor) => void>(),
    selectedBlock: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReaderView", () => {
  describe("rendering", () => {
    test("renders all messages from the conversation", () => {
      render(<ReaderView {...defaultProps()} />);

      const articles = screen.getAllByRole("article");
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

  describe("block-level error boundaries", () => {
    test("shows fallback for a broken block while rendering other blocks normally", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.mocked(renderReaderBlock).mockImplementation(
        (block: { type: string }) => {
          if (block.type === "broken") {
            throw new Error("Render failed");
          }
          return <span data-testid="rendered-block">{block.type}</span>;
        },
      );

      const conversation = createConversation({
        messages: [
          {
            id: "msg-1",
            role: "user",
            blocks: [
              { type: "broken", content: "will crash" } as never,
              { type: "paragraph", text: "normal text" },
            ],
          },
        ],
      });

      render(<ReaderView {...defaultProps({ conversation })} />);

      // The broken block should show the German fallback message
      expect(
        screen.getByText(
          /Block \u201Ebroken\u201C konnte nicht dargestellt werden/,
        ),
      ).toBeInTheDocument();

      // The paragraph block should render normally
      expect(screen.getByText("paragraph")).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
