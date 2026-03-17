import type {
  Conversation,
  NormalizedSnapshotPayload,
} from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";
import type {
  PlatformParser,
  PlatformParserResult,
  StageCallback,
} from "./parser-types.js";

describe("parser-types", () => {
  test("StageCallback accepts valid stage values", () => {
    const cb: StageCallback = (_stage) => {};

    // Verify callback can be called with each valid stage
    cb("fetch");
    cb("extract");
    cb("normalize");
    cb("structure");

    // If this compiles and runs, the type is correctly defined
    expect(true).toBe(true);
  });

  test("PlatformParserResult has the expected shape", () => {
    const result: PlatformParserResult = {
      conversation: {} as Conversation,
      warnings: ["test warning"],
      snapshot: {
        finalUrl: "https://example.com",
        fetchedAt: "2026-01-01T00:00:00Z",
        pageTitle: "Test",
        rawHtml: "<html></html>",
        normalizedPayload: {} as NormalizedSnapshotPayload,
        fetchMetadata: {
          articleCount: 1,
          messageCount: 2,
          rawHtmlBytes: 100,
        },
      },
    };

    expect(result.warnings).toEqual(["test warning"]);
    expect(result.snapshot.finalUrl).toBe("https://example.com");
    expect(result.snapshot.fetchMetadata.articleCount).toBe(1);
    expect(result.snapshot.fetchMetadata.messageCount).toBe(2);
    expect(result.snapshot.fetchMetadata.rawHtmlBytes).toBe(100);
  });

  test("PlatformParser signature matches expected contract", () => {
    // Verify the function type accepts (url, options?) and returns Promise<PlatformParserResult>
    const parser: PlatformParser = async (url, options) => {
      options?.onStage?.("fetch");
      return {
        conversation: {} as Conversation,
        warnings: [],
        snapshot: {
          finalUrl: url,
          fetchedAt: new Date().toISOString(),
          pageTitle: "Test",
          rawHtml: "",
          normalizedPayload: {} as NormalizedSnapshotPayload,
          fetchMetadata: {
            articleCount: 0,
            messageCount: 0,
            rawHtmlBytes: 0,
          },
        },
      };
    };

    // Parser should be callable and return a promise
    expect(typeof parser).toBe("function");
    expect(parser("https://test.com")).toBeInstanceOf(Promise);
  });

  test("PlatformParser can be called without options", async () => {
    const parser: PlatformParser = async (url) => ({
      conversation: {} as Conversation,
      warnings: [],
      snapshot: {
        finalUrl: url,
        fetchedAt: "",
        pageTitle: "",
        rawHtml: "",
        normalizedPayload: {} as NormalizedSnapshotPayload,
        fetchMetadata: { articleCount: 0, messageCount: 0, rawHtmlBytes: 0 },
      },
    });

    const result = await parser("https://test.com");
    expect(result.snapshot.finalUrl).toBe("https://test.com");
  });
});
