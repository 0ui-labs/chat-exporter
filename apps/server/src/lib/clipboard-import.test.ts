import { describe, expect, test } from "vitest";
import {
  type ClipboardImportResult,
  detectPlatformFromHtml,
  importFromClipboard,
} from "./clipboard-import.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectValidResult(result: ClipboardImportResult) {
  expect(result.conversation.id).toBeTruthy();
  expect(result.conversation.source.url).toBe("clipboard://paste");
  expect(Array.isArray(result.warnings)).toBe(true);
}

// ---------------------------------------------------------------------------
// detectPlatformFromHtml
// ---------------------------------------------------------------------------

describe("detectPlatformFromHtml", () => {
  test.each([
    ['<div data-message-author-role="user">Hi</div>', "chatgpt"],
    ['<div class="font-claude-message">Hello</div>', "claude"],
    ['<a href="https://claude.ai/share/abc">link</a>', "claude"],
    ['<div class="share-turn-viewer">content</div>', "gemini"],
    ['<div class="grok-response">response</div>', "grok"],
    ['<div class="deepseek-chat">chat</div>', "deepseek"],
    ['<div class="perplexity-answer">answer</div>', "perplexity"],
    ['<div class="mistral-ui">chat</div>', "lechat"],
    ['<div class="lechat-turn">turn</div>', "lechat"],
    ["<div>generic html</div>", "unknown"],
  ] as const)("detects %s as %s", (html: string, expected: string) => {
    expect(detectPlatformFromHtml(html)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// importFromClipboard — plain text path
// ---------------------------------------------------------------------------

describe("importFromClipboard — plain text", () => {
  test("parses text with You/ChatGPT role headers into messages", async () => {
    const text = `You:
What is 2+2?

ChatGPT:
2+2 equals 4.`;

    const result = await importFromClipboard({ plainText: text });

    expectValidResult(result);
    const msgs = result.conversation.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.blocks[0]).toMatchObject({
      type: "paragraph",
      text: expect.stringContaining("What is 2+2?"),
    });
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[1]?.blocks[0]).toMatchObject({
      type: "paragraph",
      text: expect.stringContaining("2+2 equals 4"),
    });
    expect(result.detectedPlatform).toBe("chatgpt");
  });

  test("parses text with Human/Claude role headers", async () => {
    const text = `Human:
Tell me a joke.

Claude:
Why did the chicken cross the road?`;

    const result = await importFromClipboard({ plainText: text });

    expectValidResult(result);
    const msgs = result.conversation.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[1]?.role).toBe("assistant");
    expect(result.detectedPlatform).toBe("claude");
  });

  test("creates single unknown message when no role headers found", async () => {
    const text = "Just some random text without any role markers.";

    const result = await importFromClipboard({ plainText: text });

    expectValidResult(result);
    const msgs = result.conversation.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe("unknown");
    expect(msgs[0]?.blocks[0]).toMatchObject({
      type: "paragraph",
      text: expect.stringContaining("Just some random text"),
    });
  });

  test("throws error when neither html nor plainText provided", async () => {
    await expect(importFromClipboard({})).rejects.toThrow(
      /either html or plainText/i,
    );
  });

  test("detects platform from role header names", async () => {
    const text = `User:
Hello

Gemini:
Hi there!`;

    const result = await importFromClipboard({ plainText: text });
    expect(result.detectedPlatform).toBe("gemini");
  });
});

// ---------------------------------------------------------------------------
// importFromClipboard — HTML path
// ---------------------------------------------------------------------------

describe("importFromClipboard — HTML", () => {
  test("extracts blocks from simple HTML paragraphs", async () => {
    const html = `<html><body>
      <p>Hello world</p>
      <p>Second paragraph</p>
    </body></html>`;

    const result = await importFromClipboard({ html });

    expectValidResult(result);
    expect(result.conversation.messages.length).toBeGreaterThanOrEqual(1);
    const allText = result.conversation.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === "paragraph")
      .map((b) => (b as { text: string }).text)
      .join(" ");
    expect(allText).toContain("Hello world");
    expect(allText).toContain("Second paragraph");
  });

  test("falls back to text extraction when HTML has no parseable structure", async () => {
    const html = "<html><body>Just plain text in body</body></html>";

    const result = await importFromClipboard({ html });

    expectValidResult(result);
    expect(result.conversation.messages.length).toBeGreaterThanOrEqual(1);
    const text = result.conversation.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === "paragraph")
      .map((b) => (b as { text: string }).text)
      .join(" ");
    expect(text).toContain("Just plain text in body");
  });

  test("detects ChatGPT platform from HTML attributes", async () => {
    const html = `<html><body>
      <div data-message-author-role="user"><p>Hello</p></div>
      <div data-message-author-role="assistant"><p>Hi!</p></div>
    </body></html>`;

    const result = await importFromClipboard({ html });

    expect(result.detectedPlatform).toBe("chatgpt");
  });
});

// ---------------------------------------------------------------------------
// importFromClipboard — integration / preference
// ---------------------------------------------------------------------------

describe("importFromClipboard — integration", () => {
  test("prefers HTML over plainText when both provided", async () => {
    const html = "<html><body><p>From HTML</p></body></html>";
    const plainText = "From plain text";

    const result = await importFromClipboard({ html, plainText });

    const allText = result.conversation.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === "paragraph")
      .map((b) => (b as { text: string }).text)
      .join(" ");
    expect(allText).toContain("From HTML");
    expect(allText).not.toContain("From plain text");
  });

  test("uses plainText path when only plainText provided", async () => {
    const result = await importFromClipboard({
      plainText: "User:\nHello\n\nAssistant:\nHi!",
    });

    const msgs = result.conversation.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[1]?.role).toBe("assistant");
  });

  test("result conversation passes schema validation", async () => {
    const { conversationSchema } = await import("@chat-exporter/shared");

    const result = await importFromClipboard({
      plainText: "User:\nHello\n\nAssistant:\nWorld",
    });

    const parsed = conversationSchema.safeParse(result.conversation);
    expect(parsed.success).toBe(true);
  });
});
