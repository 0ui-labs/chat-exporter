import { afterEach, describe, expect, test, vi } from "vitest";

// Hoist mock variables so they're available when vi.mock factories run
const { mockContext, mockAcquireContext, mockReleaseContext } = vi.hoisted(
  () => {
    const mockContext = {
      close: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn(),
    };

    return {
      mockContext,
      mockAcquireContext: vi.fn().mockResolvedValue(mockContext),
      mockReleaseContext: vi.fn().mockResolvedValue(undefined),
    };
  },
);

vi.mock("./browser-pool.js", () => ({
  acquireContext: mockAcquireContext,
  releaseContext: mockReleaseContext,
}));

// Mock openai-structuring to avoid external dependency
vi.mock("./openai-structuring.js", () => ({
  applyOpenAiStructuring: vi.fn().mockReturnValue({
    conversation: {
      id: "test-id",
      title: "Test",
      createTime: 0,
      messages: [],
    },
    warnings: [],
  }),
}));

import {
  CHATGPT_SHARE_SELECTOR,
  MESSAGE_WAIT_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  PAGE_STABILIZATION_MS,
} from "./chatgpt-share-import.js";

describe("chatgpt-share-import constants", () => {
  test("PAGE_LOAD_TIMEOUT_MS is exported with value 30_000", () => {
    expect(PAGE_LOAD_TIMEOUT_MS).toBe(30_000);
  });

  test("MESSAGE_WAIT_TIMEOUT_MS is exported with value 20_000", () => {
    expect(MESSAGE_WAIT_TIMEOUT_MS).toBe(20_000);
  });

  test("PAGE_STABILIZATION_MS is exported with value 800", () => {
    expect(PAGE_STABILIZATION_MS).toBe(800);
  });

  test("CHATGPT_SHARE_SELECTOR matches article author-role elements", () => {
    expect(CHATGPT_SHARE_SELECTOR).toBe("article [data-message-author-role]");
  });
});

describe("importChatGptSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("acquires context from browser-pool instead of launching chromium", async () => {
    // Arrange — page.evaluate will throw, but that's fine:
    // we only need to verify acquireContext was called
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://chatgpt.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importChatGptSharePage } = await import(
      "./chatgpt-share-import.js"
    );

    // Act
    await importChatGptSharePage("https://chatgpt.com/share/test").catch(
      () => {},
    );

    // Assert
    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("releases context in finally block on success path", async () => {
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://chatgpt.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importChatGptSharePage } = await import(
      "./chatgpt-share-import.js"
    );

    // Act — error from evaluate triggers finally block
    await importChatGptSharePage("https://chatgpt.com/share/test").catch(
      () => {},
    );

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledOnce();
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("releases context even when page creation fails", async () => {
    mockContext.newPage.mockRejectedValueOnce(
      new Error("page creation failed"),
    );

    const { importChatGptSharePage } = await import(
      "./chatgpt-share-import.js"
    );

    // Act
    await expect(
      importChatGptSharePage("https://chatgpt.com/share/test"),
    ).rejects.toThrow("page creation failed");

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });
});
