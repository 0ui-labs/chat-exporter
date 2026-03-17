import type { NormalizedSnapshotPayload } from "@chat-exporter/shared";
import { describe, expect, test, vi } from "vitest";

describe("parser-page-utils", () => {
  describe("blockNonEssentialResources", () => {
    test("registers route handler that aborts image, media, and font requests", async () => {
      const { blockNonEssentialResources } = await import(
        "./parser-page-utils.js"
      );

      const mockContext = { route: vi.fn() };

      await blockNonEssentialResources(
        mockContext as unknown as import("playwright").BrowserContext,
      );

      expect(mockContext.route).toHaveBeenCalledOnce();
      expect(mockContext.route).toHaveBeenCalledWith(
        "**/*",
        expect.any(Function),
      );
    });

    test("route handler aborts image requests", async () => {
      const { blockNonEssentialResources } = await import(
        "./parser-page-utils.js"
      );

      const mockContext = { route: vi.fn() };
      await blockNonEssentialResources(
        mockContext as unknown as import("playwright").BrowserContext,
      );

      const routeHandler = mockContext.route.mock.calls[0]![1];
      const mockRoute = {
        request: () => ({ resourceType: () => "image" }),
        abort: vi.fn(),
        continue: vi.fn(),
      };

      await routeHandler(mockRoute);

      expect(mockRoute.abort).toHaveBeenCalledOnce();
      expect(mockRoute.continue).not.toHaveBeenCalled();
    });

    test("route handler aborts media requests", async () => {
      const { blockNonEssentialResources } = await import(
        "./parser-page-utils.js"
      );

      const mockContext = { route: vi.fn() };
      await blockNonEssentialResources(
        mockContext as unknown as import("playwright").BrowserContext,
      );

      const routeHandler = mockContext.route.mock.calls[0]![1];
      const mockRoute = {
        request: () => ({ resourceType: () => "media" }),
        abort: vi.fn(),
        continue: vi.fn(),
      };

      await routeHandler(mockRoute);

      expect(mockRoute.abort).toHaveBeenCalledOnce();
    });

    test("route handler aborts font requests", async () => {
      const { blockNonEssentialResources } = await import(
        "./parser-page-utils.js"
      );

      const mockContext = { route: vi.fn() };
      await blockNonEssentialResources(
        mockContext as unknown as import("playwright").BrowserContext,
      );

      const routeHandler = mockContext.route.mock.calls[0]![1];
      const mockRoute = {
        request: () => ({ resourceType: () => "font" }),
        abort: vi.fn(),
        continue: vi.fn(),
      };

      await routeHandler(mockRoute);

      expect(mockRoute.abort).toHaveBeenCalledOnce();
    });

    test("route handler continues non-blocked resource types", async () => {
      const { blockNonEssentialResources } = await import(
        "./parser-page-utils.js"
      );

      const mockContext = { route: vi.fn() };
      await blockNonEssentialResources(
        mockContext as unknown as import("playwright").BrowserContext,
      );

      const routeHandler = mockContext.route.mock.calls[0]![1];
      const mockRoute = {
        request: () => ({ resourceType: () => "document" }),
        abort: vi.fn(),
        continue: vi.fn(),
      };

      await routeHandler(mockRoute);

      expect(mockRoute.continue).toHaveBeenCalledOnce();
      expect(mockRoute.abort).not.toHaveBeenCalled();
    });
  });

  describe("preparePageScripts", () => {
    test("calls addInitScript twice for safety polyfill and dom kit", async () => {
      const { preparePageScripts } = await import("./parser-page-utils.js");

      const mockPage = { addInitScript: vi.fn() };

      await preparePageScripts(
        mockPage as unknown as import("playwright").Page,
      );

      expect(mockPage.addInitScript).toHaveBeenCalledTimes(2);
    });

    test("first call injects __name polyfill", async () => {
      const { preparePageScripts } = await import("./parser-page-utils.js");

      const mockPage = { addInitScript: vi.fn() };

      await preparePageScripts(
        mockPage as unknown as import("playwright").Page,
      );

      const firstCall = mockPage.addInitScript.mock.calls[0]![0];
      expect(firstCall).toEqual({
        content: "globalThis.__name = (value) => value;",
      });
    });

    test("second call injects DOM_KIT_SCRIPT content", async () => {
      const { preparePageScripts } = await import("./parser-page-utils.js");
      const { DOM_KIT_SCRIPT } = await import("./parser-dom-kit.js");

      const mockPage = { addInitScript: vi.fn() };

      await preparePageScripts(
        mockPage as unknown as import("playwright").Page,
      );

      const secondCall = mockPage.addInitScript.mock.calls[1]![0];
      expect(secondCall).toEqual({ content: DOM_KIT_SCRIPT });
    });
  });

  describe("truncateMessagesIfNeeded", () => {
    function makePayload(messageCount: number): NormalizedSnapshotPayload {
      return {
        title: "Test Chat",
        messages: Array.from({ length: messageCount }, (_, i) => ({
          id: `msg-${i}`,
          role: "user" as const,
          blocks: [],
        })),
        warnings: [],
      };
    }

    test("does not modify payload when message count is under limit", async () => {
      const { truncateMessagesIfNeeded } = await import(
        "./parser-page-utils.js"
      );

      const payload = makePayload(5);

      truncateMessagesIfNeeded(payload, 10);

      expect(payload.messages).toHaveLength(5);
      expect(payload.warnings).toHaveLength(0);
    });

    test("does not modify payload when message count equals limit", async () => {
      const { truncateMessagesIfNeeded } = await import(
        "./parser-page-utils.js"
      );

      const payload = makePayload(10);

      truncateMessagesIfNeeded(payload, 10);

      expect(payload.messages).toHaveLength(10);
      expect(payload.warnings).toHaveLength(0);
    });

    test("truncates messages to last N when over limit", async () => {
      const { truncateMessagesIfNeeded } = await import(
        "./parser-page-utils.js"
      );

      const payload = makePayload(15);

      truncateMessagesIfNeeded(payload, 10);

      expect(payload.messages).toHaveLength(10);
      expect(payload.messages[0]!.id).toBe("msg-5");
      expect(payload.messages[9]!.id).toBe("msg-14");
    });

    test("adds warning with original and truncated count", async () => {
      const { truncateMessagesIfNeeded } = await import(
        "./parser-page-utils.js"
      );

      const payload = makePayload(25);

      truncateMessagesIfNeeded(payload, 10);

      expect(payload.warnings).toHaveLength(1);
      expect(payload.warnings[0]).toContain("25");
      expect(payload.warnings[0]).toContain("10");
    });

    test("mutates the payload in-place when truncating", async () => {
      const { truncateMessagesIfNeeded } = await import(
        "./parser-page-utils.js"
      );

      const payload = makePayload(15);

      truncateMessagesIfNeeded(payload, 10);

      expect(payload.messages).toHaveLength(10);
      expect(payload.warnings).toHaveLength(1);
    });
  });

  describe("validateRawHtmlSize", () => {
    test("returns byte size for HTML within limit", async () => {
      const { validateRawHtmlSize } = await import("./parser-page-utils.js");

      const html = "<html><body>Hello</body></html>";
      const maxBytes = 1024;

      const result = validateRawHtmlSize(html, maxBytes);

      expect(result).toBe(Buffer.byteLength(html, "utf8"));
    });

    test("correctly measures multi-byte characters", async () => {
      const { validateRawHtmlSize } = await import("./parser-page-utils.js");

      const html = "Überschrift mit Ümlauten";
      const expectedBytes = Buffer.byteLength(html, "utf8");

      const result = validateRawHtmlSize(html, 1024);

      expect(result).toBe(expectedBytes);
      expect(result).toBeGreaterThan(html.length);
    });

    test("throws when HTML exceeds byte limit", async () => {
      const { validateRawHtmlSize } = await import("./parser-page-utils.js");

      const html = "x".repeat(2 * 1024 * 1024);
      const maxBytes = 1 * 1024 * 1024;

      expect(() => validateRawHtmlSize(html, maxBytes)).toThrow(
        /HTML-Größe überschritten/,
      );
    });

    test("error message includes actual and limit sizes in MB", async () => {
      const { validateRawHtmlSize } = await import("./parser-page-utils.js");

      const html = "x".repeat(2 * 1024 * 1024);
      const maxBytes = 1 * 1024 * 1024;

      expect(() => validateRawHtmlSize(html, maxBytes)).toThrow(/2\.0 MB/);
      expect(() => validateRawHtmlSize(html, maxBytes)).toThrow(/1\.0 MB/);
    });

    test("does not throw when HTML is exactly at limit", async () => {
      const { validateRawHtmlSize } = await import("./parser-page-utils.js");

      const html = "x".repeat(100);
      const maxBytes = Buffer.byteLength(html, "utf8");

      expect(() => validateRawHtmlSize(html, maxBytes)).not.toThrow();
    });
  });
});
