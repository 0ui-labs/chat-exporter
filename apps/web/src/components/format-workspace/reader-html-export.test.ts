import type { RuleEffect } from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";
import { buildReaderHtml } from "./reader-html-export";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(
  blocks: Array<{ id: string; type: "paragraph"; text: string }> = [
    { id: "b1", type: "paragraph", text: "Hello world" },
  ],
) {
  return {
    id: "conv-1",
    title: "Test",
    source: {
      url: "https://example.com/share/abc",
      platform: "chatgpt" as const,
    },
    messages: [
      {
        id: "msg-1",
        role: "user" as const,
        blocks,
      },
    ],
  };
}

function makeEffectsMap(
  messageId: string,
  blockId: string,
  effects: RuleEffect[],
): Map<string, RuleEffect[]> {
  return new Map([[`${messageId}:${blockId}`, effects]]);
}

// ---------------------------------------------------------------------------
// buildReaderHtml — XSS / style attribute escaping
// ---------------------------------------------------------------------------

describe("buildReaderHtml style attribute XSS prevention", () => {
  test("escapes double quotes in containerStyle values to prevent attribute breakout", () => {
    // Arrange
    const maliciousEffect: RuleEffect = {
      type: "custom_style",
      containerStyle: {
        color: '"; onclick="alert(1)',
      },
    };
    const effectsMap = makeEffectsMap("msg-1", "b1", [maliciousEffect]);
    const conversation = makeConversation();

    // Act
    const html = buildReaderHtml(conversation, effectsMap);

    // Assert — the raw attack string must not appear verbatim in the output
    expect(html).not.toContain('" onclick="alert(1)');
    // The double-quote must be HTML-encoded
    expect(html).toContain("&quot;");
  });

  test("escapes angle brackets in containerStyle values to prevent tag injection", () => {
    // Arrange
    const maliciousEffect: RuleEffect = {
      type: "custom_style",
      containerStyle: {
        background: "red</style><script>alert(1)</script>",
      },
    };
    const effectsMap = makeEffectsMap("msg-1", "b1", [maliciousEffect]);
    const conversation = makeConversation();

    // Act
    const html = buildReaderHtml(conversation, effectsMap);

    // Assert — raw < and > must not appear inside the style attribute value
    expect(html).not.toContain("</style><script>");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });

  test("preserves safe containerStyle values after escaping", () => {
    // Arrange
    const safeEffect: RuleEffect = {
      type: "custom_style",
      containerStyle: {
        fontSize: "1.25rem",
        backgroundColor: "hsl(28 95% 58% / 0.12)",
      },
    };
    const effectsMap = makeEffectsMap("msg-1", "b1", [safeEffect]);
    const conversation = makeConversation();

    // Act
    const html = buildReaderHtml(conversation, effectsMap);

    // Assert — safe CSS values must survive unchanged
    expect(html).toContain("font-size: 1.25rem");
    expect(html).toContain("background-color: hsl(28 95% 58% / 0.12)");
  });

  test("renders no style attribute when there are no effects", () => {
    // Arrange
    const effectsMap: Map<string, RuleEffect[]> = new Map();
    const conversation = makeConversation();

    // Act
    const html = buildReaderHtml(conversation, effectsMap);

    // Assert
    expect(html).not.toContain('style="');
  });
});
