import type { Block, Conversation, FormatRule } from "@chat-exporter/shared";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("./reader-block-render", () => ({
  blockToPlainText: (block: Block) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
      case "quote":
      case "code":
        return block.text;
      case "list":
        return block.items.join("\n");
      case "table":
        return [
          block.headers.join(" | "),
          ...block.rows.map((row) => row.join(" | ")),
        ].join("\n");
    }
  },
}));

import type { ReaderMatchContext } from "./rule-matching";
import { getBlocksMatchingRule, matchesReaderRule } from "./rule-matching";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createRule(overrides?: Partial<FormatRule>): FormatRule {
  return {
    id: "rule-1",
    importId: null,
    targetFormat: "reader",
    kind: "inline_semantics",
    scope: "import_local",
    status: "active",
    selector: { strategy: "compound" },
    instruction: "compound rule",
    compiledRule: {
      type: "custom_style",
      textTransform: "bold_prefix_before_colon",
    },
    sourceSessionId: undefined,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "conv-1",
    title: "Test Conversation",
    source: { url: "https://example.com/chat", platform: "chatgpt" },
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        blocks: [
          { id: "b1", type: "heading", text: "Title", level: 1 },
          { id: "b2", type: "paragraph", text: "Hello world" },
        ],
      },
    ],
    ...overrides,
  };
}

function createContext(
  overrides?: Partial<ReaderMatchContext>,
): ReaderMatchContext {
  return {
    messageRole: "assistant",
    blocks: [
      { id: "b1", type: "heading", text: "Title", level: 1 },
      { id: "b2", type: "paragraph", text: "Hello world" },
      { id: "b3", type: "code", text: "const x = 1", language: "ts" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — matchesReaderRule compound strategy
// ---------------------------------------------------------------------------

describe("matchesReaderRule — compound strategy", () => {
  // Block-Filter
  test("matches by blockType alone", () => {
    const rule = createRule({
      selector: { strategy: "compound", blockType: "paragraph" },
    });

    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(true);
  });

  test("matches by messageRole alone", () => {
    const rule = createRule({
      selector: { strategy: "compound", messageRole: "assistant" },
    });
    const ctx = createContext({ messageRole: "assistant" });

    const result = matchesReaderRule(
      rule,
      "msg-1",
      0,
      "paragraph",
      "text",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("matches by headingLevel alone", () => {
    const rule = createRule({
      selector: { strategy: "compound", headingLevel: 2 },
    });
    const blocks: Block[] = [
      { id: "b4", type: "heading", text: "Sub", level: 2 },
    ];
    const ctx = createContext({ blocks });

    const result = matchesReaderRule(rule, "msg-1", 0, "heading", "Sub", ctx);

    expect(result).toBe(true);
  });

  test("matches by position: first", () => {
    const rule = createRule({
      selector: { strategy: "compound", position: "first" },
    });
    const ctx = createContext();

    const result = matchesReaderRule(rule, "msg-1", 0, "heading", "Title", ctx);

    expect(result).toBe(true);
  });

  test("matches by position: last", () => {
    const rule = createRule({
      selector: { strategy: "compound", position: "last" },
    });
    const ctx = createContext(); // 3 blocks

    const result = matchesReaderRule(
      rule,
      "msg-1",
      2,
      "code",
      "const x = 1",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("matches by textPattern (regex)", () => {
    const rule = createRule({
      selector: { strategy: "compound", textPattern: "^Hello" },
    });

    const result = matchesReaderRule(
      rule,
      "msg-1",
      0,
      "paragraph",
      "Hello world",
    );

    expect(result).toBe(true);
  });

  // AND-Verknüpfung
  test("AND: blockType + messageRole — both match → true", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        messageRole: "assistant",
      },
    });
    const ctx = createContext({ messageRole: "assistant" });

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("AND: blockType + messageRole — role mismatch → false", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        messageRole: "user",
      },
    });
    const ctx = createContext({ messageRole: "assistant" });

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(false);
  });

  test("AND: blockType + textPattern — pattern mismatch → false", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        textPattern: "^Goodbye",
      },
    });

    const result = matchesReaderRule(
      rule,
      "msg-1",
      0,
      "paragraph",
      "Hello world",
    );

    expect(result).toBe(false);
  });

  // Context-Awareness
  test("context: previousSibling blockType matches", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: { previousSibling: { blockType: "heading" } },
      },
    });
    const ctx = createContext(); // [heading, paragraph, code]

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("context: previousSibling blockType mismatch → false", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: { previousSibling: { blockType: "code" } },
      },
    });
    const ctx = createContext(); // [heading, paragraph, code]

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(false);
  });

  test("context: previousSibling headingLevel matches", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        context: { previousSibling: { headingLevel: 1 } },
      },
    });
    const ctx = createContext(); // [heading(level:1), paragraph, code]

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("context: previousSibling textPattern matches", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        context: { previousSibling: { textPattern: "^Title" } },
      },
    });
    const ctx = createContext(); // heading text = "Title"

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("context: nextSibling blockType matches", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: { nextSibling: { blockType: "code" } },
      },
    });
    const ctx = createContext(); // [heading, paragraph, code]

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  test("context: first block has no previousSibling → false if required", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        context: { previousSibling: { blockType: "paragraph" } },
      },
    });
    const ctx = createContext();

    const result = matchesReaderRule(rule, "msg-1", 0, "heading", "Title", ctx);

    expect(result).toBe(false);
  });

  test("context: last block has no nextSibling → false if required", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        context: { nextSibling: { blockType: "paragraph" } },
      },
    });
    const ctx = createContext(); // 3 blocks, last index = 2

    const result = matchesReaderRule(
      rule,
      "msg-1",
      2,
      "code",
      "const x = 1",
      ctx,
    );

    expect(result).toBe(false);
  });

  test("context: both siblings specified, both match → true", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: {
          previousSibling: { blockType: "heading" },
          nextSibling: { blockType: "code" },
        },
      },
    });
    const ctx = createContext(); // [heading, paragraph, code]

    const result = matchesReaderRule(
      rule,
      "msg-1",
      1,
      "paragraph",
      "Hello world",
      ctx,
    );

    expect(result).toBe(true);
  });

  // Edge Cases
  test("invalid textPattern regex → returns false (no crash)", () => {
    const rule = createRule({
      selector: { strategy: "compound", textPattern: "[invalid(" },
    });

    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(false);
  });

  test("compound without any filters → matches everything", () => {
    const rule = createRule({
      selector: { strategy: "compound" },
    });

    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "anything");

    expect(result).toBe(true);
  });

  test("compound without context → skips context check", () => {
    const rule = createRule({
      selector: { strategy: "compound", blockType: "paragraph" },
    });

    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(true);
  });

  test("messageRole set but context undefined → returns false (cannot verify role)", () => {
    const rule = createRule({
      selector: { strategy: "compound", messageRole: "assistant" },
    });

    // No context passed — role cannot be verified, must not silently match
    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(false);
  });

  test("messageRole set but context undefined → false even when blockType matches", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        messageRole: "user",
      },
    });

    // No context passed — blockType matches but role cannot be verified
    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(false);
  });

  test("no context parameter passed → skips compound context checks", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: { previousSibling: { blockType: "heading" } },
      },
    });

    // No context parameter — should skip context checks, only match blockType
    const result = matchesReaderRule(rule, "msg-1", 0, "paragraph", "text");

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — getBlocksMatchingRule compound integration
// ---------------------------------------------------------------------------

describe("getBlocksMatchingRule — compound integration", () => {
  test("finds all paragraphs after headings across messages", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        context: { previousSibling: { blockType: "heading" } },
      },
    });
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          blocks: [
            { id: "b5", type: "heading", text: "Title", level: 1 },
            { id: "b6", type: "paragraph", text: "After heading" },
            { id: "b7", type: "paragraph", text: "Not after heading" },
          ],
        },
        {
          id: "msg-2",
          role: "user",
          blocks: [
            { id: "b8", type: "heading", text: "Question", level: 2 },
            { id: "b9", type: "paragraph", text: "After heading 2" },
          ],
        },
      ],
    });

    const matches = getBlocksMatchingRule(rule, conversation);

    expect(matches).toEqual([
      { messageId: "msg-1", blockIndex: 1, blockId: "b6" },
      { messageId: "msg-2", blockIndex: 1, blockId: "b9" },
    ]);
  });

  test("finds only assistant blocks with messageRole filter", () => {
    const rule = createRule({
      selector: {
        strategy: "compound",
        blockType: "paragraph",
        messageRole: "assistant",
      },
    });
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          blocks: [{ id: "b10", type: "paragraph", text: "Assistant text" }],
        },
        {
          id: "msg-2",
          role: "user",
          blocks: [{ id: "b11", type: "paragraph", text: "User text" }],
        },
      ],
    });

    const matches = getBlocksMatchingRule(rule, conversation);

    expect(matches).toEqual([
      { messageId: "msg-1", blockIndex: 0, blockId: "b10" },
    ]);
  });
});
