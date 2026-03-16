import { describe, expect, test } from "vitest";

import {
  clipboardImportRequestSchema,
  importJobSchema,
  importMethodSchema,
  importSummarySchema,
} from "../imports.js";

describe("importMethodSchema", () => {
  test("accepts 'share-link'", () => {
    const result = importMethodSchema.safeParse("share-link");
    expect(result.success).toBe(true);
    expect(result.data).toBe("share-link");
  });

  test("accepts 'clipboard'", () => {
    const result = importMethodSchema.safeParse("clipboard");
    expect(result.success).toBe(true);
    expect(result.data).toBe("clipboard");
  });

  test("rejects invalid values", () => {
    const result = importMethodSchema.safeParse("email");
    expect(result.success).toBe(false);
  });
});

describe("clipboardImportRequestSchema", () => {
  test("accepts html only", () => {
    const result = clipboardImportRequestSchema.safeParse({
      html: "<p>Hello</p>",
    });
    expect(result.success).toBe(true);
  });

  test("accepts plainText only", () => {
    const result = clipboardImportRequestSchema.safeParse({
      plainText: "Hello world",
    });
    expect(result.success).toBe(true);
  });

  test("accepts both html and plainText", () => {
    const result = clipboardImportRequestSchema.safeParse({
      html: "<p>Hello</p>",
      plainText: "Hello",
    });
    expect(result.success).toBe(true);
  });

  test("rejects when neither html nor plainText is provided", () => {
    const result = clipboardImportRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Either html or plainText must be provided",
      );
    }
  });

  test("defaults mode to 'archive'", () => {
    const result = clipboardImportRequestSchema.safeParse({
      html: "<p>Hello</p>",
    });
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe("archive");
  });

  test("accepts explicit mode 'handover'", () => {
    const result = clipboardImportRequestSchema.safeParse({
      html: "<p>Hello</p>",
      mode: "handover",
    });
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe("handover");
  });
});

describe("importJobSchema — importMethod field", () => {
  const validJob = {
    id: "job-1",
    sourceUrl: "https://example.com/chat",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "queued",
    currentStage: "validate",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  test("defaults importMethod to 'share-link' when omitted", () => {
    const result = importJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
    expect(result.data?.importMethod).toBe("share-link");
  });

  test("accepts explicit importMethod 'clipboard'", () => {
    const result = importJobSchema.safeParse({
      ...validJob,
      importMethod: "clipboard",
    });
    expect(result.success).toBe(true);
    expect(result.data?.importMethod).toBe("clipboard");
  });
});

describe("importSummarySchema — importMethod field", () => {
  const validSummary = {
    id: "job-1",
    sourceUrl: "https://example.com/chat",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "queued",
    currentStage: "validate",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  test("defaults importMethod to 'share-link' when omitted", () => {
    const result = importSummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
    expect(result.data?.importMethod).toBe("share-link");
  });

  test("accepts explicit importMethod 'clipboard'", () => {
    const result = importSummarySchema.safeParse({
      ...validSummary,
      importMethod: "clipboard",
    });
    expect(result.success).toBe(true);
    expect(result.data?.importMethod).toBe("clipboard");
  });
});
