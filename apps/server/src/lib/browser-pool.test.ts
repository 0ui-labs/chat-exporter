import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock playwright before importing browser-pool
vi.mock("playwright", () => {
  const mockContext = {
    close: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue({}),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

import { chromium } from "playwright";
import {
  acquireContext,
  getPoolStats,
  MAX_CONTEXTS_PER_BROWSER,
  releaseContext,
  shutdownPool,
} from "./browser-pool.js";

describe("browser-pool constants", () => {
  test("MAX_CONTEXTS_PER_BROWSER is exported with value 50", () => {
    expect(MAX_CONTEXTS_PER_BROWSER).toBe(50);
  });
});

describe("browser-pool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await shutdownPool();
    vi.clearAllMocks();
  });

  test("acquireContext launches browser lazily and returns a context", async () => {
    const ctx = await acquireContext();

    expect(chromium.launch).toHaveBeenCalledOnce();
    expect(ctx).toBeDefined();
    expect(ctx.close).toBeDefined();

    await releaseContext(ctx);
  });

  test("acquireContext reuses existing browser for subsequent calls", async () => {
    const ctx1 = await acquireContext();
    const ctx2 = await acquireContext();

    expect(chromium.launch).toHaveBeenCalledOnce();

    await releaseContext(ctx1);
    await releaseContext(ctx2);
  });

  test("releaseContext closes the context and decrements active count", async () => {
    const ctx = await acquireContext();

    expect(getPoolStats().activeContexts).toBe(1);

    await releaseContext(ctx);

    expect(ctx.close).toHaveBeenCalledOnce();
    expect(getPoolStats().activeContexts).toBe(0);
  });

  test("getPoolStats returns correct initial state", () => {
    const stats = getPoolStats();

    expect(stats).toEqual({
      activeContexts: 0,
      queueLength: 0,
      browserConnected: false,
      totalContextsServed: 0,
    });
  });

  test("getPoolStats reflects active contexts accurately", async () => {
    const ctx1 = await acquireContext();
    const ctx2 = await acquireContext();

    const stats = getPoolStats();

    expect(stats.activeContexts).toBe(2);
    expect(stats.browserConnected).toBe(true);
    expect(stats.totalContextsServed).toBe(2);

    await releaseContext(ctx1);
    await releaseContext(ctx2);
  });

  test("queues requests when max concurrent contexts reached", async () => {
    const ctx1 = await acquireContext();
    const ctx2 = await acquireContext();
    const ctx3 = await acquireContext();

    // 4th request should be queued (MAX_CONCURRENT_CONTEXTS = 3)
    const ctx4Promise = acquireContext();

    expect(getPoolStats().queueLength).toBe(1);
    expect(getPoolStats().activeContexts).toBe(3);

    // Release one to unblock queued request
    await releaseContext(ctx1);
    const ctx4 = await ctx4Promise;

    expect(getPoolStats().queueLength).toBe(0);
    expect(getPoolStats().activeContexts).toBe(3);

    await releaseContext(ctx2);
    await releaseContext(ctx3);
    await releaseContext(ctx4);
  });

  test("schedules idle shutdown after all contexts released", async () => {
    const ctx = await acquireContext();
    await releaseContext(ctx);

    expect(getPoolStats().browserConnected).toBe(true);

    // Advance past idle timeout (60s)
    await vi.advanceTimersByTimeAsync(60_000);

    const launchMock = chromium.launch as ReturnType<typeof vi.fn>;
    const mockBrowser = await launchMock.mock.results[0]?.value;
    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });

  test("cancels idle shutdown when new context acquired", async () => {
    const ctx1 = await acquireContext();
    await releaseContext(ctx1);

    // Advance partway through idle timeout
    await vi.advanceTimersByTimeAsync(30_000);

    const ctx2 = await acquireContext();

    // Advance past original timeout — browser should still be open
    await vi.advanceTimersByTimeAsync(30_001);

    const launchMock = chromium.launch as ReturnType<typeof vi.fn>;
    const mockBrowser = await launchMock.mock.results[0]?.value;
    expect(mockBrowser.close).not.toHaveBeenCalled();

    await releaseContext(ctx2);
  });

  test("shutdownPool rejects queued entries and closes browser", async () => {
    await acquireContext();
    await acquireContext();
    await acquireContext();

    const ctx4Promise = acquireContext();

    expect(getPoolStats().queueLength).toBe(1);

    await shutdownPool();

    await expect(ctx4Promise).rejects.toThrow(/pool.*shut.*down/i);

    expect(getPoolStats()).toEqual({
      activeContexts: 0,
      queueLength: 0,
      browserConnected: false,
      totalContextsServed: expect.any(Number),
    });
  });

  test("totalContextsServed increments across multiple acquire/release cycles", async () => {
    const ctx1 = await acquireContext();
    await releaseContext(ctx1);

    const ctx2 = await acquireContext();
    await releaseContext(ctx2);

    const ctx3 = await acquireContext();
    await releaseContext(ctx3);

    expect(getPoolStats().totalContextsServed).toBe(3);
  });
});
