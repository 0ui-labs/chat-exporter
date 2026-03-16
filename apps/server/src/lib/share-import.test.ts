import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./chatgpt-share-import.js", () => ({
  importChatGptSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "chatgpt-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://chatgpt.com/share/abc" },
  }),
}));

vi.mock("./claude-share-import.js", () => ({
  importClaudeSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "claude-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://claude.ai/share/xyz" },
  }),
}));

vi.mock("./deepseek-share-import.js", () => ({
  importDeepSeekSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "deepseek-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://chat.deepseek.com/a/s/abc123" },
  }),
}));

vi.mock("./gemini-share-import.js", () => ({
  importGeminiSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "gemini-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://gemini.google.com/share/123" },
  }),
}));

vi.mock("./generic-share-import.js", () => ({
  importGenericSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "generic-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://example.com/share/xyz" },
  }),
}));

vi.mock("./grok-share-import.js", () => ({
  importGrokSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "grok-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://grok.com/share/abc123" },
  }),
}));

vi.mock("./source-platform.js", () => ({
  classifySourcePlatform: vi.fn().mockReturnValue("unknown"),
}));

import { importChatGptSharePage } from "./chatgpt-share-import.js";
import { importClaudeSharePage } from "./claude-share-import.js";
import { importDeepSeekSharePage } from "./deepseek-share-import.js";
import { importGeminiSharePage } from "./gemini-share-import.js";
import { importGenericSharePage } from "./generic-share-import.js";
import { importGrokSharePage } from "./grok-share-import.js";
import { importSharePage } from "./share-import.js";
import { classifySourcePlatform } from "./source-platform.js";

const mockChatGptParser = vi.mocked(importChatGptSharePage);
const mockClaudeParser = vi.mocked(importClaudeSharePage);
const mockDeepSeekParser = vi.mocked(importDeepSeekSharePage);
const mockGeminiParser = vi.mocked(importGeminiSharePage);
const mockGrokParser = vi.mocked(importGrokSharePage);
const mockGenericParser = vi.mocked(importGenericSharePage);
const mockClassify = vi.mocked(classifySourcePlatform);

describe("importSharePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("routes chatgpt URLs to the chatgpt parser via registry", async () => {
    mockClassify.mockReturnValue("chatgpt");

    const result = await importSharePage("https://chatgpt.com/share/abc");

    expect(mockChatGptParser).toHaveBeenCalledOnce();
    expect(mockChatGptParser).toHaveBeenCalledWith(
      "https://chatgpt.com/share/abc",
      {
        onStage: undefined,
      },
    );
    expect(result).toEqual({
      conversation: { id: "chatgpt-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://chatgpt.com/share/abc" },
    });
  });

  test("routes claude URLs to the claude parser via registry", async () => {
    mockClassify.mockReturnValue("claude");

    const result = await importSharePage("https://claude.ai/share/xyz");

    expect(mockClaudeParser).toHaveBeenCalledOnce();
    expect(mockClaudeParser).toHaveBeenCalledWith(
      "https://claude.ai/share/xyz",
      {
        onStage: undefined,
      },
    );
    expect(mockGenericParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "claude-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://claude.ai/share/xyz" },
    });
  });

  test("routes deepseek URLs to the deepseek parser via registry", async () => {
    mockClassify.mockReturnValue("deepseek");

    const result = await importSharePage(
      "https://chat.deepseek.com/a/s/abc123",
    );

    expect(mockDeepSeekParser).toHaveBeenCalledOnce();
    expect(mockDeepSeekParser).toHaveBeenCalledWith(
      "https://chat.deepseek.com/a/s/abc123",
      {
        onStage: undefined,
      },
    );
    expect(mockGenericParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "deepseek-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://chat.deepseek.com/a/s/abc123" },
    });
  });

  test("routes grok URLs to the grok parser via registry", async () => {
    mockClassify.mockReturnValue("grok");

    const result = await importSharePage("https://grok.com/share/abc123");

    expect(mockGrokParser).toHaveBeenCalledOnce();
    expect(mockGrokParser).toHaveBeenCalledWith(
      "https://grok.com/share/abc123",
      {
        onStage: undefined,
      },
    );
    expect(mockGenericParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "grok-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://grok.com/share/abc123" },
    });
  });

  test("routes unknown platforms to the generic parser", async () => {
    mockClassify.mockReturnValue("perplexity");

    const result = await importSharePage("https://example.com/share/xyz");

    expect(mockGenericParser).toHaveBeenCalledOnce();
    expect(mockGenericParser).toHaveBeenCalledWith(
      "https://example.com/share/xyz",
      {
        onStage: undefined,
        sourcePlatform: "perplexity",
      },
    );
    expect(mockChatGptParser).not.toHaveBeenCalled();
    expect(mockClaudeParser).not.toHaveBeenCalled();
    expect(mockDeepSeekParser).not.toHaveBeenCalled();
    expect(mockGrokParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "generic-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://example.com/share/xyz" },
    });
  });

  test("routes gemini URLs to the gemini parser via registry", async () => {
    mockClassify.mockReturnValue("gemini");

    const result = await importSharePage("https://gemini.google.com/share/123");

    expect(mockGeminiParser).toHaveBeenCalledOnce();
    expect(mockGeminiParser).toHaveBeenCalledWith(
      "https://gemini.google.com/share/123",
      {
        onStage: undefined,
      },
    );
    expect(mockGenericParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "gemini-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://gemini.google.com/share/123" },
    });
  });

  test("detects platform from URL when sourcePlatform is not provided", async () => {
    mockClassify.mockReturnValue("gemini");

    await importSharePage("https://gemini.google.com/share/123");

    expect(mockClassify).toHaveBeenCalledWith(
      "https://gemini.google.com/share/123",
    );
    expect(mockGeminiParser).toHaveBeenCalledWith(
      "https://gemini.google.com/share/123",
      {
        onStage: undefined,
      },
    );
  });

  test("uses provided sourcePlatform instead of classifying from URL", async () => {
    await importSharePage("https://example.com/share/abc", {
      sourcePlatform: "chatgpt",
    });

    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockChatGptParser).toHaveBeenCalledOnce();
  });

  test("passes onStage callback to the chatgpt parser", async () => {
    mockClassify.mockReturnValue("chatgpt");
    const onStage = vi.fn();

    await importSharePage("https://chatgpt.com/share/abc", { onStage });

    expect(mockChatGptParser).toHaveBeenCalledWith(
      "https://chatgpt.com/share/abc",
      {
        onStage,
      },
    );
  });

  test("passes onStage callback to the claude parser", async () => {
    mockClassify.mockReturnValue("claude");
    const onStage = vi.fn();

    await importSharePage("https://claude.ai/share/xyz", { onStage });

    expect(mockClaudeParser).toHaveBeenCalledWith(
      "https://claude.ai/share/xyz",
      {
        onStage,
      },
    );
  });

  test("passes onStage callback to the grok parser", async () => {
    mockClassify.mockReturnValue("grok");
    const onStage = vi.fn();

    await importSharePage("https://grok.com/share/abc123", { onStage });

    expect(mockGrokParser).toHaveBeenCalledWith(
      "https://grok.com/share/abc123",
      {
        onStage,
      },
    );
  });

  test("passes onStage callback to the generic parser", async () => {
    mockClassify.mockReturnValue("perplexity");
    const onStage = vi.fn();

    await importSharePage("https://example.com/share/xyz", { onStage });

    expect(mockGenericParser).toHaveBeenCalledWith(
      "https://example.com/share/xyz",
      {
        onStage,
        sourcePlatform: "perplexity",
      },
    );
  });
});
