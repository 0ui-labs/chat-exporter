import { importJobSchema } from "@chat-exporter/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./share-import.js", () => ({
  importSharePage: vi.fn(),
}));

import { createImportJob, getImportJob, runImportJob } from "./import-store.js";
import { importSharePage } from "./share-import.js";

const mockImportSharePage = vi.mocked(importSharePage);

function createImportResult() {
  return {
    conversation: {
      id: "conv-1",
      title: "Test conversation",
      source: {
        platform: "chatgpt" as const,
        url: "https://chatgpt.com/share/test-123",
      },
      messages: [
        {
          id: "msg-1",
          role: "user" as const,
          blocks: [{ type: "paragraph" as const, text: "Hello" }],
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          blocks: [{ type: "paragraph" as const, text: "Hi there" }],
        },
      ],
    },
    warnings: [] as string[],
    snapshot: {
      finalUrl: "https://chatgpt.com/share/test-123",
      fetchedAt: "2026-03-10T10:00:00.000Z",
      pageTitle: "Test conversation",
      rawHtml: "<html></html>",
      normalizedPayload: {
        title: "Test conversation",
        messages: [
          {
            id: "msg-1",
            role: "user" as const,
            blocks: [{ type: "paragraph" as const, text: "Hello" }],
          },
          {
            id: "msg-2",
            role: "assistant" as const,
            blocks: [{ type: "paragraph" as const, text: "Hi there" }],
          },
        ],
        warnings: [],
      },
      fetchMetadata: {
        articleCount: 1,
        messageCount: 2,
        rawHtmlBytes: 14,
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("importJobSchema", () => {
  test("accepts errorStage field", () => {
    const result = importJobSchema.safeParse({
      id: "test",
      sourceUrl: "https://example.com",
      sourcePlatform: "chatgpt",
      mode: "archive",
      status: "failed",
      currentStage: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      warnings: [],
      error: "test error",
      errorStage: "extract",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errorStage).toBe("extract");
    }
  });
});

describe("runImportJob", () => {
  test("successful import completes with status 'completed' and artifacts", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-123",
      mode: "archive",
    });
    mockImportSharePage.mockResolvedValue(createImportResult());

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    expect(result?.status).toBe("completed");
    expect(result?.currentStage).toBe("done");
    expect(result?.artifacts).toBeDefined();
    expect(result?.artifacts?.markdown).toContain("Hello");
  });

  test("artifacts contain all registered generator formats", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-formats",
      mode: "archive",
    });
    mockImportSharePage.mockResolvedValue(createImportResult());

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    expect(result?.artifacts).toBeDefined();
    expect(result?.artifacts).toHaveProperty("markdown");
    expect(result?.artifacts).toHaveProperty("handover");
    expect(result?.artifacts).toHaveProperty("json");
    expect(typeof result?.artifacts?.markdown).toBe("string");
    expect(typeof result?.artifacts?.handover).toBe("string");
    expect(typeof result?.artifacts?.json).toBe("string");
    // JSON artifact should be valid JSON of the conversation
    const parsedJson = JSON.parse(result?.artifacts?.json ?? "");
    expect(parsedJson.title).toBe("Test conversation");
  });

  test("successful import saves snapshot", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-snap",
      mode: "archive",
    });
    mockImportSharePage.mockResolvedValue(createImportResult());

    await runImportJob(job.id);

    const { getPersistedImportSnapshot } = await import(
      "./import-repository.js"
    );
    const snapshot = getPersistedImportSnapshot(job.id);
    expect(snapshot).toBeDefined();
    expect(snapshot?.pageTitle).toBe("Test conversation");
  });

  test("writes A, B, C happen inside a transaction", async () => {
    const transactionSpy = vi.spyOn(
      await import("../db/client.js"),
      "withTransaction",
    );
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-tx",
      mode: "archive",
    });
    mockImportSharePage.mockResolvedValue(createImportResult());

    await runImportJob(job.id);

    expect(transactionSpy).toHaveBeenCalledOnce();
  });

  test("transaction rollback on saveImportSnapshot failure leaves job in running state then catch sets failed", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-fail",
      mode: "archive",
    });
    mockImportSharePage.mockResolvedValue(createImportResult());

    const snapshotSpy = vi.spyOn(
      await import("./import-repository.js"),
      "saveImportSnapshot",
    );
    snapshotSpy.mockImplementation(() => {
      throw new Error("Simulated snapshot failure");
    });

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    // Transaction rolled back Write A, catch block set status to failed
    expect(result?.status).toBe("failed");
    expect(result?.currentStage).toBe("done");
    expect(result?.error).toBe("Simulated snapshot failure");
    // Conversation should NOT be set (Write A was rolled back)
    expect(result?.conversation).toBeUndefined();
  });

  test("importSharePage failure sets status to failed", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-err",
      mode: "archive",
    });
    mockImportSharePage.mockRejectedValue(new Error("Network error"));

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    expect(result?.status).toBe("failed");
    expect(result?.error).toBe("Network error");
  });

  test("failure captures errorStage from current stage at time of error", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-errorstage",
      mode: "archive",
    });
    mockImportSharePage.mockImplementation(async (_url, opts) => {
      opts?.onStage?.("extract");
      throw new Error("Extract failed");
    });

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    expect(result?.status).toBe("failed");
    expect(result?.error).toBe("Extract failed");
    expect(result?.errorStage).toBe("extract");
    expect(result?.currentStage).toBe("done");
  });

  test("failure preserves error message for non-Error throws", async () => {
    const job = createImportJob({
      url: "https://chatgpt.com/share/test-nonerror",
      mode: "archive",
    });
    mockImportSharePage.mockRejectedValue("string error");

    await runImportJob(job.id);

    const result = getImportJob(job.id);
    expect(result?.status).toBe("failed");
    expect(result?.error).toBeDefined();
    expect(result?.errorStage).toBe("validate");
  });

  test("non-existent job id returns early", async () => {
    mockImportSharePage.mockClear();

    await runImportJob("non-existent-id");

    expect(mockImportSharePage).not.toHaveBeenCalled();
  });

  describe("import timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("sets status to failed with timeout error when importSharePage exceeds 120s", async () => {
      const job = createImportJob({
        url: "https://chatgpt.com/share/test-timeout",
        mode: "archive",
      });
      mockImportSharePage.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const runPromise = runImportJob(job.id);
      await vi.advanceTimersByTimeAsync(120_000);
      await runPromise;

      const result = getImportJob(job.id);
      expect(result?.status).toBe("failed");
      expect(result?.currentStage).toBe("done");
      expect(result?.error).toMatch(/timed out/i);
    });

    test("completes normally when importSharePage resolves before timeout", async () => {
      const job = createImportJob({
        url: "https://chatgpt.com/share/test-no-timeout",
        mode: "archive",
      });
      mockImportSharePage.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createImportResult()), 1_000);
          }),
      );

      const runPromise = runImportJob(job.id);
      await vi.advanceTimersByTimeAsync(1_000);
      await runPromise;

      const result = getImportJob(job.id);
      expect(result?.status).toBe("completed");
      expect(result?.currentStage).toBe("done");
    });
  });
});
