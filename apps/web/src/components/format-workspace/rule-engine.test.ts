import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import {
  applyMarkdownRules,
  buildReaderEffectsMap,
  canApplyRule,
} from "./rule-engine";

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
    selector: { strategy: "block_type", blockType: "paragraph" },
    instruction: "Bold prefix before colon",
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
        role: "user",
        blocks: [{ id: "b1", type: "paragraph", text: "Hello world" }],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildReaderEffectsMap", () => {
  test("returns empty map when no rules match", () => {
    const rules = [
      createRule({
        selector: { strategy: "block_type", blockType: "heading" },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [{ id: "b2", type: "paragraph", text: "No heading here" }],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.size).toBe(0);
  });

  test("returns effects for matching blocks with correct key format", () => {
    const rules = [createRule()];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b1")).toBe(true);
    const effects = result.get("msg-1:b1");
    expect(effects).toBeDefined();
    expect(effects).toEqual([
      { type: "custom_style", textTransform: "bold_prefix_before_colon" },
    ]);
  });

  test("filters only active rules, ignoring inactive ones", () => {
    const rules = [
      createRule({ id: "active-rule", status: "active" }),
      createRule({ id: "disabled-rule", status: "disabled" }),
      createRule({ id: "draft-rule", status: "draft" }),
    ];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);

    const effects = result.get("msg-1:b1");
    expect(effects).toBeDefined();
    expect(effects).toHaveLength(1);
    expect(effects).toEqual([
      { type: "custom_style", textTransform: "bold_prefix_before_colon" },
    ]);
  });

  test("handles conversation with multiple messages and blocks", () => {
    const rules = [createRule()];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [
            { id: "b3", type: "paragraph", text: "First block" },
            { id: "b4", type: "paragraph", text: "Second block" },
          ],
        },
        {
          id: "msg-2",
          role: "assistant",
          blocks: [
            { id: "b5", type: "paragraph", text: "Reply block" },
            { id: "b6", type: "heading", level: 1, text: "A heading" },
          ],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b3")).toBe(true);
    expect(result.has("msg-1:b4")).toBe(true);
    expect(result.has("msg-2:b5")).toBe(true);
    // heading block should not match the paragraph rule
    expect(result.has("msg-2:b6")).toBe(false);
    expect(result.size).toBe(3);
  });

  test("does not include entries with empty effects arrays", () => {
    const rules = [
      createRule({
        selector: { strategy: "block_type", blockType: "heading" },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [{ id: "b7", type: "paragraph", text: "No match" }],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    for (const [, effects] of result) {
      expect(effects.length).toBeGreaterThan(0);
    }
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Legacy effect normalization in buildReaderEffectsMap
// ---------------------------------------------------------------------------

describe("buildReaderEffectsMap — legacy normalization", () => {
  test("normalizes legacy adjust_block_spacing to custom_style", () => {
    const rules = [
      createRule({
        compiledRule: {
          type: "adjust_block_spacing",
          amount: "lg",
          direction: "after",
        },
      }),
    ];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);
    const effects = result.get("msg-1:b1");

    expect(effects).toBeDefined();
    expect(effects?.[0]).toMatchObject({
      type: "custom_style",
      containerStyle: { marginBottom: "2rem" },
    });
  });

  test("normalizes legacy bold_prefix_before_colon to custom_style", () => {
    const rules = [
      createRule({
        compiledRule: { type: "bold_prefix_before_colon" },
      }),
    ];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);
    const effects = result.get("msg-1:b1");

    expect(effects).toBeDefined();
    expect(effects?.[0]).toMatchObject({
      type: "custom_style",
      textTransform: "bold_prefix_before_colon",
    });
  });

  test("passes through custom_style effects unchanged", () => {
    const customEffect = {
      type: "custom_style" as const,
      containerStyle: { color: "red" },
      headingLevel: 2,
    };
    const rules = [createRule({ compiledRule: customEffect })];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);
    const effects = result.get("msg-1:b1");

    expect(effects).toBeDefined();
    expect(effects?.[0]).toMatchObject(customEffect);
  });
});

// ---------------------------------------------------------------------------
// applyMarkdownRules — compound strategy
// ---------------------------------------------------------------------------

describe("applyMarkdownRules — compound strategy", () => {
  test("compound with textPattern applies transform only to matching lines", () => {
    const content = "Title Line\nRegular line\nAnother Title Line";
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          textPattern: "^Title",
        },
        compiledRule: {
          type: "custom_style",
          markdownTransform: "promote_to_heading",
        },
      }),
    ];

    const result = applyMarkdownRules(content, rules);

    expect(result).toBe("## Title Line\nRegular line\nAnother Title Line");
  });

  test("compound without textPattern applies transform to all lines", () => {
    const content = "First line\nSecond line\nThird line";
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
        },
        compiledRule: {
          type: "custom_style",
          markdownTransform: "reshape_markdown_block",
        },
      }),
    ];

    const result = applyMarkdownRules(content, rules);

    expect(result).toBe("First line\nSecond line\nThird line");
  });

  test("compound with bold_prefix_before_colon on matching lines", () => {
    const content = "Name: John\nNo colon here\nAge: 30";
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          textPattern: ":",
        },
        compiledRule: {
          type: "custom_style",
          markdownTransform: "bold_prefix_before_colon",
        },
      }),
    ];

    const result = applyMarkdownRules(content, rules);

    expect(result).toBe("**Name:** John\nNo colon here\n**Age:** 30");
  });

  test("compound with invalid regex skips line without crash", () => {
    const content = "Hello world\nTest line";
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          textPattern: "[invalid",
        },
        compiledRule: {
          type: "custom_style",
          markdownTransform: "promote_to_heading",
        },
      }),
    ];

    const result = applyMarkdownRules(content, rules);

    // Invalid regex means no lines match, so content unchanged
    expect(result).toBe("Hello world\nTest line");
  });

  test("compound without markdownTransform produces no change", () => {
    const content = "Hello world\nTest line";
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          textPattern: "Hello",
        },
        compiledRule: {
          type: "custom_style",
          containerStyle: { color: "red" },
        },
      }),
    ];

    const result = applyMarkdownRules(content, rules);

    expect(result).toBe("Hello world\nTest line");
  });
});

// ---------------------------------------------------------------------------
// buildReaderEffectsMap — compound selectors
// ---------------------------------------------------------------------------

describe("buildReaderEffectsMap — compound selectors", () => {
  test("compound blockType filter matches correct blocks", () => {
    const rules = [
      createRule({
        selector: { strategy: "compound", blockType: "heading" },
        compiledRule: {
          type: "custom_style",
          textStyle: { fontSize: "2rem" },
        },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          blocks: [
            { id: "b8", type: "paragraph", text: "Intro" },
            { id: "b9", type: "heading", level: 2, text: "Title" },
          ],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b8")).toBe(false);
    expect(result.has("msg-1:b9")).toBe(true);
  });

  test("compound messageRole filter matches only assistant messages", () => {
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          messageRole: "assistant",
        },
        compiledRule: {
          type: "custom_style",
          containerStyle: { marginBottom: "1rem" },
        },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [{ id: "b10", type: "paragraph", text: "User text" }],
        },
        {
          id: "msg-2",
          role: "assistant",
          blocks: [{ id: "b11", type: "paragraph", text: "Assistant text" }],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b10")).toBe(false);
    expect(result.has("msg-2:b11")).toBe(true);
  });

  test("compound context.previousSibling matches paragraph after heading", () => {
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          context: { previousSibling: { blockType: "heading" } },
        },
        compiledRule: {
          type: "custom_style",
          containerStyle: { paddingLeft: "1.5rem" },
        },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          blocks: [
            { id: "b12", type: "heading", level: 1, text: "Title" },
            { id: "b13", type: "paragraph", text: "After heading" },
            { id: "b14", type: "paragraph", text: "Not after heading" },
          ],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b12")).toBe(false);
    expect(result.has("msg-1:b13")).toBe(true);
    expect(result.has("msg-1:b14")).toBe(false);
  });

  test("compound position: first matches only first block per message", () => {
    const rules = [
      createRule({
        selector: {
          strategy: "compound",
          blockType: "paragraph",
          position: "first",
        },
        compiledRule: {
          type: "custom_style",
          textStyle: { fontWeight: "700" },
        },
      }),
    ];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [
            { id: "b15", type: "paragraph", text: "First" },
            { id: "b16", type: "paragraph", text: "Second" },
          ],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:b15")).toBe(true);
    expect(result.has("msg-1:b16")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canApplyRule — registry-aware rule applicability
// ---------------------------------------------------------------------------

describe("canApplyRule", () => {
  test("returns true for reader format with custom_style effect", () => {
    const result = canApplyRule("reader", { type: "custom_style" });

    expect(result).toBe(true);
  });

  test("returns false for json format with custom_style effect", () => {
    const result = canApplyRule("json", { type: "custom_style" });

    expect(result).toBe(false);
  });

  test("returns true for reader with legacy adjust_block_spacing effect", () => {
    const result = canApplyRule("reader", {
      type: "adjust_block_spacing",
      amount: "lg",
      direction: "after",
    });

    expect(result).toBe(true);
  });

  test("returns true for markdown format with custom_style effect", () => {
    const result = canApplyRule("markdown", { type: "custom_style" });

    expect(result).toBe(true);
  });

  test("returns false for unknown format", () => {
    const result = canApplyRule("nonexistent", { type: "custom_style" });

    expect(result).toBe(false);
  });

  test("returns false for handover format with custom_style effect", () => {
    const result = canApplyRule("handover", { type: "custom_style" });

    expect(result).toBe(false);
  });
});
