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
  importLeChatSharePage,
  LECHAT_CONTENT_WAIT_TIMEOUT_MS,
  LECHAT_NETWORK_IDLE_TIMEOUT_MS,
  LECHAT_PAGE_STABILIZATION_MS,
  PAGE_LOAD_TIMEOUT_MS,
} from "./lechat-share-import.js";

describe("lechat-share-import constants", () => {
  test("PAGE_LOAD_TIMEOUT_MS is exported with value 30_000", () => {
    expect(PAGE_LOAD_TIMEOUT_MS).toBe(30_000);
  });

  test("LECHAT_CONTENT_WAIT_TIMEOUT_MS is exported with value 20_000", () => {
    expect(LECHAT_CONTENT_WAIT_TIMEOUT_MS).toBe(20_000);
  });

  test("LECHAT_NETWORK_IDLE_TIMEOUT_MS is exported with value 5_000", () => {
    expect(LECHAT_NETWORK_IDLE_TIMEOUT_MS).toBe(5_000);
  });

  test("LECHAT_PAGE_STABILIZATION_MS is exported with value 1_500", () => {
    expect(LECHAT_PAGE_STABILIZATION_MS).toBe(1_500);
  });
});

describe("importLeChatSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockPage(overrides?: Record<string, unknown>) {
    return {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://chat.mistral.ai/chat/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
      ...overrides,
    };
  }

  test("acquires context from browser-pool instead of launching chromium", async () => {
    mockContext.newPage.mockResolvedValue(createMockPage());

    await importLeChatSharePage(
      "https://chat.mistral.ai/chat/share/test",
    ).catch(() => {});

    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("blocks non-essential resources for Le Chat pages", async () => {
    mockContext.newPage.mockResolvedValue(createMockPage());

    await importLeChatSharePage(
      "https://chat.mistral.ai/chat/share/test",
    ).catch(() => {});

    expect(mockContext.route).toHaveBeenCalled();
  });

  test("releases context in finally block on error path", async () => {
    mockContext.newPage.mockResolvedValue(createMockPage());

    await importLeChatSharePage(
      "https://chat.mistral.ai/chat/share/test",
    ).catch(() => {});

    expect(mockReleaseContext).toHaveBeenCalledOnce();
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("releases context even when page creation fails", async () => {
    mockContext.newPage.mockRejectedValueOnce(
      new Error("page creation failed"),
    );

    await expect(
      importLeChatSharePage("https://chat.mistral.ai/chat/share/test"),
    ).rejects.toThrow("page creation failed");

    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("navigates with 30s timeout for Le Chat pages", async () => {
    const mockPage = createMockPage();
    mockContext.newPage.mockResolvedValue(mockPage);

    await importLeChatSharePage(
      "https://chat.mistral.ai/chat/share/test",
    ).catch(() => {});

    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://chat.mistral.ai/chat/share/test",
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  test("works with mistral.ai subdomain URLs", async () => {
    const mockPage = createMockPage({
      url: vi.fn().mockReturnValue("https://chat.mistral.ai/chat/abc123"),
    });
    mockContext.newPage.mockResolvedValue(mockPage);

    await importLeChatSharePage("https://chat.mistral.ai/chat/abc123").catch(
      () => {},
    );

    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://chat.mistral.ai/chat/abc123",
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});
