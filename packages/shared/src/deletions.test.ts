import { describe, expect, test } from "vitest";

import {
  deleteMessageRequestSchema,
  deleteRoundRequestSchema,
  messageDeletionSchema,
  restoreMessageRequestSchema,
} from "./deletions.js";

describe("messageDeletionSchema", () => {
  test("accepts valid input with all fields", () => {
    const result = messageDeletionSchema.safeParse({
      id: "del-1",
      importId: "imp-1",
      messageId: "msg-1",
      reason: "duplicate message",
      deletedAt: "2026-03-10T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("accepts input without optional reason", () => {
    const result = messageDeletionSchema.safeParse({
      id: "del-1",
      importId: "imp-1",
      messageId: "msg-1",
      deletedAt: "2026-03-10T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  test("rejects input missing required importId", () => {
    const result = messageDeletionSchema.safeParse({
      id: "del-1",
      messageId: "msg-1",
      deletedAt: "2026-03-10T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteMessageRequestSchema", () => {
  test("accepts valid input", () => {
    const result = deleteMessageRequestSchema.safeParse({
      importId: "imp-1",
      messageId: "msg-1",
      reason: "not relevant",
    });
    expect(result.success).toBe(true);
  });

  test("rejects input missing messageId", () => {
    const result = deleteMessageRequestSchema.safeParse({
      importId: "imp-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteRoundRequestSchema", () => {
  test("accepts valid input with reason", () => {
    const result = deleteRoundRequestSchema.safeParse({
      importId: "imp-1",
      messageId: "msg-1",
      reason: "entire round is off-topic",
    });
    expect(result.success).toBe(true);
  });

  test("accepts valid input without reason", () => {
    const result = deleteRoundRequestSchema.safeParse({
      importId: "imp-1",
      messageId: "msg-1",
    });
    expect(result.success).toBe(true);
  });
});

describe("restoreMessageRequestSchema", () => {
  test("accepts valid input", () => {
    const result = restoreMessageRequestSchema.safeParse({
      importId: "imp-1",
      messageId: "msg-1",
    });
    expect(result.success).toBe(true);
  });

  test("rejects input missing importId", () => {
    const result = restoreMessageRequestSchema.safeParse({
      messageId: "msg-1",
    });
    expect(result.success).toBe(false);
  });
});
