import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { buildReaderEffectsMap } from "./rule-engine";

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
    compiledRule: { type: "bold_prefix_before_colon" },
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
        blocks: [{ type: "paragraph", text: "Hello world" }],
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
          blocks: [{ type: "paragraph", text: "No heading here" }],
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

    expect(result.has("msg-1:0")).toBe(true);
    const effects = result.get("msg-1:0");
    expect(effects).toBeDefined();
    expect(effects).toEqual([{ type: "bold_prefix_before_colon" }]);
  });

  test("filters only active rules, ignoring inactive ones", () => {
    const rules = [
      createRule({ id: "active-rule", status: "active" }),
      createRule({ id: "disabled-rule", status: "disabled" }),
      createRule({ id: "draft-rule", status: "draft" }),
    ];
    const conversation = createConversation();

    const result = buildReaderEffectsMap(rules, conversation);

    const effects = result.get("msg-1:0");
    expect(effects).toBeDefined();
    expect(effects).toHaveLength(1);
    expect(effects).toEqual([{ type: "bold_prefix_before_colon" }]);
  });

  test("handles conversation with multiple messages and blocks", () => {
    const rules = [createRule()];
    const conversation = createConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [
            { type: "paragraph", text: "First block" },
            { type: "paragraph", text: "Second block" },
          ],
        },
        {
          id: "msg-2",
          role: "assistant",
          blocks: [
            { type: "paragraph", text: "Reply block" },
            { type: "heading", level: 1, text: "A heading" },
          ],
        },
      ],
    });

    const result = buildReaderEffectsMap(rules, conversation);

    expect(result.has("msg-1:0")).toBe(true);
    expect(result.has("msg-1:1")).toBe(true);
    expect(result.has("msg-2:0")).toBe(true);
    // heading block should not match the paragraph rule
    expect(result.has("msg-2:1")).toBe(false);
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
          blocks: [{ type: "paragraph", text: "No match" }],
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
