import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { db } from "../db/client.js";
import { imports, messageDeletions } from "../db/schema.js";
import {
  isMessageDeleted,
  listDeletions,
  restoreMessage,
  softDeleteMessage,
  softDeleteRound,
} from "./delete-repository.js";

function insertTestImport(
  id: string,
  messages: Array<{ id: string; role: string }>,
) {
  db.insert(imports)
    .values({
      id,
      sourceUrl: "https://chatgpt.com/share/test",
      sourcePlatform: "chatgpt",
      mode: "archive",
      status: "completed",
      currentStage: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      warningsJson: "[]",
      conversationJson: JSON.stringify({
        id: "conv-1",
        title: "Test",
        source: {
          url: "https://chatgpt.com/share/test",
          platform: "chatgpt",
        },
        messages: messages.map((m) => ({ ...m, blocks: [] })),
      }),
    })
    .run();
}

const createdImportIds: string[] = [];

afterEach(() => {
  // Clean up deletions first (FK constraint), then imports
  for (const id of createdImportIds) {
    db.delete(messageDeletions).where(eq(messageDeletions.importId, id)).run();
    db.delete(imports).where(eq(imports.id, id)).run();
  }
  createdImportIds.length = 0;
});

function trackImport(
  id: string,
  messages: Array<{ id: string; role: string }>,
) {
  insertTestImport(id, messages);
  createdImportIds.push(id);
}

describe("listDeletions", () => {
  test("returns empty array for unknown importId", () => {
    const result = listDeletions("nonexistent");

    expect(result).toEqual([]);
  });

  test("returns all deletions for an import", () => {
    trackImport("del-test-1", [{ id: "msg-1", role: "user" }]);
    softDeleteMessage("del-test-1", "msg-1", "test reason");

    const result = listDeletions("del-test-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      importId: "del-test-1",
      messageId: "msg-1",
      reason: "test reason",
    });
  });
});

describe("softDeleteMessage", () => {
  test("creates a deletion record and returns it", () => {
    trackImport("del-test-2", [{ id: "msg-1", role: "user" }]);

    const deletion = softDeleteMessage("del-test-2", "msg-1", "spam");

    expect(deletion).toMatchObject({
      importId: "del-test-2",
      messageId: "msg-1",
      reason: "spam",
    });
    expect(deletion.id).toBeTruthy();
    expect(deletion.deletedAt).toBeTruthy();
  });

  test("throws on duplicate import+message combination", () => {
    trackImport("del-test-3", [{ id: "msg-1", role: "user" }]);
    softDeleteMessage("del-test-3", "msg-1");

    expect(() => softDeleteMessage("del-test-3", "msg-1")).toThrow();
  });

  test("stores undefined reason as absent in result", () => {
    trackImport("del-test-4", [{ id: "msg-1", role: "user" }]);

    const deletion = softDeleteMessage("del-test-4", "msg-1");

    expect(deletion.reason).toBeUndefined();
  });
});

describe("restoreMessage", () => {
  test("removes the deletion record and returns true", () => {
    trackImport("del-test-5", [{ id: "msg-1", role: "user" }]);
    softDeleteMessage("del-test-5", "msg-1");

    const removed = restoreMessage("del-test-5", "msg-1");

    expect(removed).toBe(true);
    expect(listDeletions("del-test-5")).toHaveLength(0);
  });

  test("returns false for non-existent deletion", () => {
    const removed = restoreMessage("del-test-5-none", "msg-1");

    expect(removed).toBe(false);
  });
});

describe("isMessageDeleted", () => {
  test("returns true when message is deleted", () => {
    trackImport("del-test-6", [{ id: "msg-1", role: "user" }]);
    softDeleteMessage("del-test-6", "msg-1");

    expect(isMessageDeleted("del-test-6", "msg-1")).toBe(true);
  });

  test("returns false when message is not deleted", () => {
    expect(isMessageDeleted("del-test-6-none", "msg-1")).toBe(false);
  });
});

describe("softDeleteRound", () => {
  test("deletes user message and following assistant messages", () => {
    const messages = [
      { id: "msg-u1", role: "user" },
      { id: "msg-a1", role: "assistant" },
      { id: "msg-t1", role: "tool" },
      { id: "msg-u2", role: "user" },
    ];
    trackImport("del-test-7", messages);

    const deletions = softDeleteRound("del-test-7", "msg-u1", "cleanup");

    expect(deletions).toHaveLength(3);
    const deletedIds = deletions.map((d) => d.messageId);
    expect(deletedIds).toEqual(["msg-u1", "msg-a1", "msg-t1"]);
    expect(deletions.every((d) => d.reason === "cleanup")).toBe(true);
  });

  test("throws when user message is not found", () => {
    trackImport("del-test-8", [{ id: "msg-1", role: "user" }]);

    expect(() => softDeleteRound("del-test-8", "nonexistent")).toThrow(
      "User-Message nicht gefunden.",
    );
  });

  test("throws when import has no conversation", () => {
    expect(() => softDeleteRound("nonexistent", "msg-1")).toThrow(
      "Import oder Conversation nicht gefunden.",
    );
  });

  test("skips already-deleted messages in the round", () => {
    const messages = [
      { id: "msg-u1", role: "user" },
      { id: "msg-a1", role: "assistant" },
      { id: "msg-a2", role: "assistant" },
    ];
    trackImport("del-test-9", messages);

    // Pre-delete one assistant message
    softDeleteMessage("del-test-9", "msg-a1", "earlier");

    const deletions = softDeleteRound("del-test-9", "msg-u1", "round cleanup");

    // Should only return newly created deletions (user + second assistant)
    expect(deletions).toHaveLength(2);
    const deletedIds = deletions.map((d) => d.messageId);
    expect(deletedIds).toEqual(["msg-u1", "msg-a2"]);

    // Total deletions should be 3
    expect(listDeletions("del-test-9")).toHaveLength(3);
  });

  test("handles round at end of conversation (no next user message)", () => {
    const messages = [
      { id: "msg-u1", role: "user" },
      { id: "msg-a1", role: "assistant" },
    ];
    trackImport("del-test-10", messages);

    const deletions = softDeleteRound("del-test-10", "msg-u1");

    expect(deletions).toHaveLength(2);
    expect(deletions.map((d) => d.messageId)).toEqual(["msg-u1", "msg-a1"]);
  });
});
