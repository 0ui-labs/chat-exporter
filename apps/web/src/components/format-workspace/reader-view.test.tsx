import type { Block, Conversation, FormatRule } from "@chat-exporter/shared";
import { act, render, screen } from "@testing-library/react";
import type React from "react";
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

// Captures the onBlockChange callback so tests can trigger block edits directly.
let capturedOnBlockChange:
  | ((messageId: string, blockIndex: number, newBlock: Block) => void)
  | undefined;

vi.mock("@/components/format-workspace/editable-block", () => ({
  EditableBlock: ({
    blockIndex,
    messageId,
    onBlockChange,
    children,
  }: {
    blockIndex: number;
    messageId: string;
    onBlockChange: (
      messageId: string,
      blockIndex: number,
      newBlock: Block,
    ) => void;
    children: React.ReactNode;
  }) => {
    capturedOnBlockChange = onBlockChange;
    return (
      <div data-testid={`editable-${messageId}-${blockIndex}`}>{children}</div>
    );
  },
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
        blocks: [{ id: "b1", type: "paragraph", text: "Hello" }],
      },
      {
        id: "msg-2",
        role: "assistant",
        blocks: [{ id: "b2", type: "paragraph", text: "Hi there" }],
      },
      {
        id: "msg-3",
        role: "user",
        blocks: [{ id: "b3", type: "paragraph", text: "How are you?" }],
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

  describe("handleBlockChange — stale props fix", () => {
    test("consecutive edits on different blocks accumulate instead of overwriting each other", () => {
      // Arrange: message with two blocks; parent props will NOT update between
      // the two edits (simulates the debounce window where props stay stale).
      const conversation = createConversation({
        messages: [
          {
            id: "msg-1",
            role: "user",
            blocks: [
              { id: "b4", type: "paragraph", text: "Block A" },
              { id: "b5", type: "paragraph", text: "Block B" },
            ],
          },
        ],
      });

      const onBlocksChange =
        vi.fn<(messageId: string, blocks: Block[]) => void>();

      render(
        <ReaderView
          {...defaultProps({ conversation, onBlocksChange, editMode: true })}
        />,
      );

      // Act: edit block 0 and block 1 in sequence without props updating in between
      act(() => {
        capturedOnBlockChange?.("msg-1", 0, {
          id: "b4",
          type: "paragraph",
          text: "Block A — edited",
        });
      });

      act(() => {
        capturedOnBlockChange?.("msg-1", 1, {
          id: "b5",
          type: "paragraph",
          text: "Block B — edited",
        });
      });

      // Assert: the second call must include BOTH edits, not revert the first
      const calls = onBlocksChange.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const lastBlocks = calls[calls.length - 1]?.[1];
      expect(lastBlocks).toHaveLength(2);
      expect((lastBlocks?.[0] as { text: string } | undefined)?.text).toBe(
        "Block A — edited",
      );
      expect((lastBlocks?.[1] as { text: string } | undefined)?.text).toBe(
        "Block B — edited",
      );
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
              { id: "b6", type: "broken", content: "will crash" } as never,
              { id: "b7", type: "paragraph", text: "normal text" },
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
