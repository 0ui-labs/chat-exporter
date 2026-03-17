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
  applyOpenAiStructuring: vi.fn().mockImplementation((messages) => ({
    messages,
    warnings: [],
    structuring: {
      status: "skipped",
      provider: "deterministic",
      candidateCount: 0,
      attemptedCount: 0,
      repairedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  })),
}));

import {
  GEMINI_DOM_CONTENT_LOADED_TIMEOUT_MS,
  GEMINI_FUNCTION_WAIT_TIMEOUT_MS,
  GEMINI_NAVIGATION_TIMEOUT_MS,
  GEMINI_NETWORK_IDLE_TIMEOUT_MS,
  GEMINI_PAGE_STABILIZATION_DELAY_MS,
  importGeminiSharePage,
} from "./gemini-share-import.js";

describe("gemini-share-import constants", () => {
  test("GEMINI_NAVIGATION_TIMEOUT_MS is exported with value 60_000", () => {
    expect(GEMINI_NAVIGATION_TIMEOUT_MS).toBe(60_000);
  });

  test("GEMINI_NETWORK_IDLE_TIMEOUT_MS is exported with value 5_000", () => {
    expect(GEMINI_NETWORK_IDLE_TIMEOUT_MS).toBe(5_000);
  });

  test("GEMINI_PAGE_STABILIZATION_DELAY_MS is exported with value 1_200", () => {
    expect(GEMINI_PAGE_STABILIZATION_DELAY_MS).toBe(1_200);
  });

  test("GEMINI_FUNCTION_WAIT_TIMEOUT_MS is exported with value 20_000", () => {
    expect(GEMINI_FUNCTION_WAIT_TIMEOUT_MS).toBe(20_000);
  });

  test("GEMINI_DOM_CONTENT_LOADED_TIMEOUT_MS is exported with value 20_000", () => {
    expect(GEMINI_DOM_CONTENT_LOADED_TIMEOUT_MS).toBe(20_000);
  });
});

describe("importGeminiSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("acquires context from browser-pool instead of launching chromium", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://gemini.google.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(false),
        }),
      }),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importGeminiSharePage("https://gemini.google.com/share/test").catch(
      () => {},
    );

    // Assert
    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("releases context in finally block on error path", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://gemini.google.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(false),
        }),
      }),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importGeminiSharePage("https://gemini.google.com/share/test").catch(
      () => {},
    );

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
      importGeminiSharePage("https://gemini.google.com/share/test"),
    ).rejects.toThrow("page creation failed");

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("does not block non-essential resources because Google needs full CSS/JS", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://gemini.google.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(false),
        }),
      }),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importGeminiSharePage("https://gemini.google.com/share/test").catch(
      () => {},
    );

    // Assert — verify the import function actually ran (positive guard)
    // then confirm resource blocking was intentionally skipped for Gemini
    expect(mockContext.newPage).toHaveBeenCalledOnce();
    expect(mockContext.route).not.toHaveBeenCalled();
  });

  test("navigates with 60s timeout for Google pages", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://gemini.google.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(false),
        }),
      }),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    // Act
    await importGeminiSharePage("https://gemini.google.com/share/test").catch(
      () => {},
    );

    // Assert
    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://gemini.google.com/share/test",
      expect.objectContaining({ timeout: 60_000 }),
    );
  });
});
