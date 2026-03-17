import { describe, expect, test } from "vitest";

import { classifySourcePlatform } from "./source-platform.js";

describe("classifySourcePlatform", () => {
  describe("existing platforms", () => {
    test.each([
      ["https://chatgpt.com/share/abc", "chatgpt"],
      ["https://chat.openai.com/share/abc", "chatgpt"],
      ["https://claude.ai/chat/abc", "claude"],
      ["https://gemini.google.com/share/abc", "gemini"],
      ["https://grok.com/share/abc", "grok"],
      ["https://chat.deepseek.com/share/abc", "deepseek"],
      ["https://notebooklm.google.com/share/abc", "notebooklm"],
    ])("classifies %s as %s", (url, expected) => {
      expect(classifySourcePlatform(url)).toBe(expected);
    });
  });

  describe("new platforms", () => {
    test("classifies aistudio.google.com as aistudio", () => {
      const result = classifySourcePlatform(
        "https://aistudio.google.com/app/prompts",
      );

      expect(result).toBe("aistudio");
    });

    test("classifies subdomain of aistudio.google.com as aistudio", () => {
      const result = classifySourcePlatform(
        "https://sub.aistudio.google.com/app/prompts",
      );

      expect(result).toBe("aistudio");
    });

    test("classifies www.perplexity.ai as perplexity", () => {
      const result = classifySourcePlatform(
        "https://www.perplexity.ai/search/abc",
      );

      expect(result).toBe("perplexity");
    });

    test("classifies perplexity.ai as perplexity", () => {
      const result = classifySourcePlatform("https://perplexity.ai/search/abc");

      expect(result).toBe("perplexity");
    });

    test("classifies chat.mistral.ai as lechat", () => {
      const result = classifySourcePlatform("https://chat.mistral.ai/chat/abc");

      expect(result).toBe("lechat");
    });

    test("does not classify non-chat subdomains of mistral.ai as lechat", () => {
      const result = classifySourcePlatform("https://api.mistral.ai/v1/chat");

      expect(result).toBe("unknown");
    });

    test("classifies kimi.moonshot.cn as kimi", () => {
      const result = classifySourcePlatform(
        "https://kimi.moonshot.cn/share/abc",
      );

      expect(result).toBe("kimi");
    });

    test("classifies subdomain of moonshot.cn as kimi", () => {
      const result = classifySourcePlatform(
        "https://sub.moonshot.cn/share/abc",
      );

      expect(result).toBe("kimi");
    });
  });

  test("returns unknown for unrecognized URLs", () => {
    const result = classifySourcePlatform("https://example.com/chat");

    expect(result).toBe("unknown");
  });
});
