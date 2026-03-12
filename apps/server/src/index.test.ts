import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./lib/browser-pool.js", () => ({
  shutdownPool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

vi.mock("./app.js", () => ({
  app: { fetch: vi.fn() },
}));

vi.mock("./load-env.js", () => ({}));

import { handleShutdown } from "./index.js";
import { shutdownPool } from "./lib/browser-pool.js";

describe("graceful shutdown", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test("handleShutdown calls shutdownPool then exits with code 0", async () => {
    await handleShutdown();

    expect(shutdownPool).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test("handleShutdown exits with 0 after shutdownPool resolves", async () => {
    const order: string[] = [];
    vi.mocked(shutdownPool).mockImplementation(async () => {
      order.push("shutdownPool");
    });
    exitSpy.mockImplementation((() => {
      order.push("exit");
    }) as never);

    await handleShutdown();

    expect(order).toEqual(["shutdownPool", "exit"]);
  });

  test("SIGTERM and SIGINT handlers are registered", async () => {
    const onSpy = vi.spyOn(process, "on");

    // Re-import to trigger handler registration
    vi.resetModules();
    vi.mock("./lib/browser-pool.js", () => ({
      shutdownPool: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("@hono/node-server", () => ({ serve: vi.fn() }));
    vi.mock("./app.js", () => ({ app: { fetch: vi.fn() } }));
    vi.mock("./load-env.js", () => ({}));

    await import("./index.js");

    const registeredSignals = onSpy.mock.calls.map((call) => call[0]);
    expect(registeredSignals).toContain("SIGTERM");
    expect(registeredSignals).toContain("SIGINT");

    onSpy.mockRestore();
  });
});
