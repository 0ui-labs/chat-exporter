import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./chatgpt-share-import.js", () => ({
  importChatGptSharePage: vi.fn().mockResolvedValue({
    conversation: { id: "chatgpt-conv" },
    warnings: [],
    snapshot: { finalUrl: "https://chatgpt.com/share/abc" },
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
    snapshot: { finalUrl: "https://claude.ai/share/xyz" },
  }),
}));

vi.mock("./source-platform.js", () => ({
  classifySourcePlatform: vi.fn().mockReturnValue("unknown"),
}));

import { importChatGptSharePage } from "./chatgpt-share-import.js";
import { importGeminiSharePage } from "./gemini-share-import.js";
import { importGenericSharePage } from "./generic-share-import.js";
import { importSharePage } from "./share-import.js";
import { classifySourcePlatform } from "./source-platform.js";

const mockChatGptParser = vi.mocked(importChatGptSharePage);
const mockGeminiParser = vi.mocked(importGeminiSharePage);
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

  test("routes unknown platforms to the generic parser", async () => {
    mockClassify.mockReturnValue("claude");

    const result = await importSharePage("https://claude.ai/share/xyz");

    expect(mockGenericParser).toHaveBeenCalledOnce();
    expect(mockGenericParser).toHaveBeenCalledWith(
      "https://claude.ai/share/xyz",
      {
        onStage: undefined,
        sourcePlatform: "claude",
      },
    );
    expect(mockChatGptParser).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: "generic-conv" },
      warnings: [],
      snapshot: { finalUrl: "https://claude.ai/share/xyz" },
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

  test("passes onStage callback to the generic parser", async () => {
    mockClassify.mockReturnValue("claude");
    const onStage = vi.fn();

    await importSharePage("https://claude.ai/share/xyz", { onStage });

    expect(mockGenericParser).toHaveBeenCalledWith(
      "https://claude.ai/share/xyz",
      {
        onStage,
        sourcePlatform: "claude",
      },
    );
  });
});
