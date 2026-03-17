import { describe, expect, test } from "vitest";

import {
  blockSchema,
  codeBlockSchema,
  generateBlockId,
  headingBlockSchema,
  listBlockSchema,
  paragraphBlockSchema,
  quoteBlockSchema,
  sourcePlatformSchema,
  tableBlockSchema,
} from "./conversation.js";

describe("generateBlockId", () => {
  test("returns an 8-character string", () => {
    const id = generateBlockId();

    expect(id).toHaveLength(8);
    expect(typeof id).toBe("string");
  });

  test("generates unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateBlockId()));

    expect(ids.size).toBe(100);
  });
});

describe("block schema id field", () => {
  test("paragraph block without id gets an auto-generated id", () => {
    const result = paragraphBlockSchema.parse({
      type: "paragraph",
      text: "hello",
    });

    expect(result.id).toHaveLength(8);
  });

  test("paragraph block with explicit id preserves it", () => {
    const result = paragraphBlockSchema.parse({
      type: "paragraph",
      text: "hello",
      id: "custom01",
    });

    expect(result.id).toBe("custom01");
  });

  test("heading block without id gets an auto-generated id", () => {
    const result = headingBlockSchema.parse({
      type: "heading",
      level: 2,
      text: "title",
    });

    expect(result.id).toHaveLength(8);
  });

  test("list block without id gets an auto-generated id", () => {
    const result = listBlockSchema.parse({
      type: "list",
      ordered: false,
      items: ["a"],
    });

    expect(result.id).toHaveLength(8);
  });

  test("code block without id gets an auto-generated id", () => {
    const result = codeBlockSchema.parse({ type: "code", text: "x = 1" });

    expect(result.id).toHaveLength(8);
  });

  test("quote block without id gets an auto-generated id", () => {
    const result = quoteBlockSchema.parse({
      type: "quote",
      text: "wise words",
    });

    expect(result.id).toHaveLength(8);
  });

  test("table block without id gets an auto-generated id", () => {
    const result = tableBlockSchema.parse({
      type: "table",
      headers: ["a"],
      rows: [["1"]],
    });

    expect(result.id).toHaveLength(8);
  });

  test("discriminated union blockSchema parses blocks without id", () => {
    const result = blockSchema.parse({ type: "paragraph", text: "test" });

    expect(result.id).toHaveLength(8);
  });

  test("two blocks parsed without id get different ids", () => {
    const a = blockSchema.parse({ type: "paragraph", text: "a" });
    const b = blockSchema.parse({ type: "paragraph", text: "b" });

    expect(a.id).not.toBe(b.id);
  });
});

describe("sourcePlatformSchema", () => {
  test.each([
    "chatgpt",
    "claude",
    "gemini",
    "grok",
    "deepseek",
    "notebooklm",
    "aistudio",
    "perplexity",
    "lechat",
    "kimi",
    "unknown",
  ])("accepts valid platform: %s", (platform) => {
    const result = sourcePlatformSchema.safeParse(platform);

    expect(result.success).toBe(true);
  });

  test("rejects invalid platform string", () => {
    const result = sourcePlatformSchema.safeParse("nonexistent");

    expect(result.success).toBe(false);
  });
});
