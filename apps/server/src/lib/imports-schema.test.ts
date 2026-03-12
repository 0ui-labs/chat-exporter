import {
  importListRequestSchema,
  importSummarySchema,
} from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";

describe("importSummarySchema", () => {
  const validSummary = {
    id: "test-id",
    sourceUrl: "https://chatgpt.com/share/test",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "completed",
    currentStage: "done",
    createdAt: "2026-03-10T10:00:00.000Z",
    updatedAt: "2026-03-10T10:00:00.000Z",
    warnings: [],
    summary: { messageCount: 5, transcriptWords: 100 },
    pageTitle: "Test Chat",
  };

  test("parses valid summary data", () => {
    const result = importSummarySchema.safeParse(validSummary);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("test-id");
      expect(result.data.pageTitle).toBe("Test Chat");
      expect(result.data.summary?.messageCount).toBe(5);
    }
  });

  test("defaults warnings to empty array", () => {
    const { warnings: _, ...withoutWarnings } = validSummary;

    const result = importSummarySchema.safeParse(withoutWarnings);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.warnings).toEqual([]);
    }
  });

  test("allows optional fields to be omitted", () => {
    const { summary: _s, pageTitle: _p, ...minimal } = validSummary;

    const result = importSummarySchema.safeParse(minimal);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBeUndefined();
      expect(result.data.pageTitle).toBeUndefined();
    }
  });

  test("rejects invalid sourcePlatform", () => {
    const result = importSummarySchema.safeParse({
      ...validSummary,
      sourcePlatform: "invalid-platform",
    });

    expect(result.success).toBe(false);
  });

  test("does not include conversation or artifacts fields", () => {
    const result = importSummarySchema.safeParse({
      ...validSummary,
      conversation: { id: "conv" },
      artifacts: { markdown: "" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("conversation" in result.data).toBe(false);
      expect("artifacts" in result.data).toBe(false);
    }
  });
});

describe("importListRequestSchema", () => {
  test("parses empty object with defaults", () => {
    const result = importListRequestSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe("createdAt");
      expect(result.data.sortOrder).toBe("desc");
      expect(result.data.search).toBeUndefined();
      expect(result.data.status).toBeUndefined();
      expect(result.data.platform).toBeUndefined();
    }
  });

  test("accepts all valid filter combinations", () => {
    const result = importListRequestSchema.safeParse({
      search: "test query",
      status: "completed",
      platform: "chatgpt",
      sortBy: "updatedAt",
      sortOrder: "asc",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("test query");
      expect(result.data.status).toBe("completed");
      expect(result.data.platform).toBe("chatgpt");
      expect(result.data.sortBy).toBe("updatedAt");
      expect(result.data.sortOrder).toBe("asc");
    }
  });

  test("rejects invalid status value", () => {
    const result = importListRequestSchema.safeParse({
      status: "invalid-status",
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid sortBy value", () => {
    const result = importListRequestSchema.safeParse({
      sortBy: "invalid-sort",
    });

    expect(result.success).toBe(false);
  });

  test.each([
    "createdAt",
    "updatedAt",
    "sourcePlatform",
    "status",
  ])("accepts sortBy value: %s", (sortBy) => {
    const result = importListRequestSchema.safeParse({ sortBy });

    expect(result.success).toBe(true);
  });
});
