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

describe("importGenericSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("acquires context from browser-pool instead of launching chromium", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importGenericSharePage } = await import(
      "./generic-share-import.js"
    );

    // Act
    await importGenericSharePage("https://example.com/share/test", {
      sourcePlatform: "unknown",
    }).catch(() => {});

    // Assert
    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("releases context in finally block on error path", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importGenericSharePage } = await import(
      "./generic-share-import.js"
    );

    // Act
    await importGenericSharePage("https://example.com/share/test", {
      sourcePlatform: "unknown",
    }).catch(() => {});

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledOnce();
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("releases context even when page creation fails", async () => {
    // Arrange
    mockContext.newPage.mockRejectedValueOnce(
      new Error("page creation failed"),
    );

    const { importGenericSharePage } = await import(
      "./generic-share-import.js"
    );

    // Act
    await expect(
      importGenericSharePage("https://example.com/share/test", {
        sourcePlatform: "unknown",
      }),
    ).rejects.toThrow("page creation failed");

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });
});
