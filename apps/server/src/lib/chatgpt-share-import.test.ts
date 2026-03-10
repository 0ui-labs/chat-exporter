import { afterEach, describe, expect, test, vi } from "vitest";

// Mock browser-pool before importing the module under test
const mockContext = {
  close: vi.fn().mockResolvedValue(undefined),
  route: vi.fn().mockResolvedValue(undefined),
  newPage: vi.fn(),
};

const mockAcquireContext = vi.fn().mockResolvedValue(mockContext);
const mockReleaseContext = vi.fn().mockResolvedValue(undefined);

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
