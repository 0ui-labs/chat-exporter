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
  importClaudeSharePage,
  MESSAGE_WAIT_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  PAGE_STABILIZATION_MS,
} from "./claude-share-import.js";

describe("claude-share-import constants", () => {
  test("PAGE_LOAD_TIMEOUT_MS is exported with value 30_000", () => {
    expect(PAGE_LOAD_TIMEOUT_MS).toBe(30_000);
  });

  test("MESSAGE_WAIT_TIMEOUT_MS is exported with value 20_000", () => {
    expect(MESSAGE_WAIT_TIMEOUT_MS).toBe(20_000);
  });

  test("PAGE_STABILIZATION_MS is exported with value 1_000", () => {
    expect(PAGE_STABILIZATION_MS).toBe(1_000);
  });
});

describe("importClaudeSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("acquires context from browser-pool instead of launching chromium", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://claude.ai/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importClaudeSharePage("https://claude.ai/share/test").catch(() => {});

    // Assert
    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("releases context in finally block on success path", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://claude.ai/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importClaudeSharePage("https://claude.ai/share/test").catch(() => {});

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledOnce();
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("releases context even when page creation fails", async () => {
    // Arrange
    mockContext.newPage.mockRejectedValueOnce(
      new Error("page creation failed"),
    );

    // Act
    await expect(
      importClaudeSharePage("https://claude.ai/share/test"),
    ).rejects.toThrow("page creation failed");

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("applies resource blocking for non-essential resources", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://claude.ai/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importClaudeSharePage("https://claude.ai/share/test").catch(() => {});

    // Assert — context.route should have been called (resource blocking applied)
    expect(mockContext.route).toHaveBeenCalled();
  });
});
