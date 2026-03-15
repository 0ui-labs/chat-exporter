import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { db } from "../db/client.js";
import { conversationSnapshots, imports, messageEdits } from "../db/schema.js";
import {
  countEdits,
  deleteAllEditsForSnapshot,
  deleteMessageEdit,
  getMessageEdit,
  listMessageEdits,
  saveMessageEdit,
} from "./edit-repository.js";

// --- Test helpers ---

const createdImportIds: string[] = [];
const createdSnapshotIds: string[] = [];

function insertTestImport(id: string) {
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
    })
    .run();
  createdImportIds.push(id);
}

function insertTestSnapshot(id: string, importId: string) {
  db.insert(conversationSnapshots)
    .values({
      id,
      importId,
      label: "Test Snapshot",
      isActive: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
  createdSnapshotIds.push(id);
}

afterEach(() => {
  // Clean up in correct FK order: edits → snapshots → imports
  for (const sid of createdSnapshotIds) {
    db.delete(messageEdits).where(eq(messageEdits.snapshotId, sid)).run();
    db.delete(conversationSnapshots)
      .where(eq(conversationSnapshots.id, sid))
      .run();
  }
  for (const iid of createdImportIds) {
    db.delete(imports).where(eq(imports.id, iid)).run();
  }
  createdImportIds.length = 0;
  createdSnapshotIds.length = 0;
});

const BLOCKS_JSON = JSON.stringify([
  { type: "paragraph", content: "Edited content" },
]);

const BLOCKS_JSON_V2 = JSON.stringify([
  { type: "paragraph", content: "Updated content" },
]);

describe("saveMessageEdit", () => {
  test("saves a new edit and returns the record", () => {
    insertTestImport("edit-imp-1");
    insertTestSnapshot("edit-snap-1", "edit-imp-1");

    const result = saveMessageEdit(
      "edit-imp-1",
      "edit-snap-1",
      "msg-1",
      BLOCKS_JSON,
    );

    expect(result).toMatchObject({
      importId: "edit-imp-1",
      snapshotId: "edit-snap-1",
      messageId: "msg-1",
      editedBlocksJson: BLOCKS_JSON,
    });
    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(result.annotation).toBeNull();
  });

  test("saves edit with annotation", () => {
    insertTestImport("edit-imp-2");
    insertTestSnapshot("edit-snap-2", "edit-imp-2");

    const result = saveMessageEdit(
      "edit-imp-2",
      "edit-snap-2",
      "msg-1",
      BLOCKS_JSON,
      "Fixed typo",
    );

    expect(result.annotation).toBe("Fixed typo");
  });

  test("upserts when same snapshotId+messageId already exists", () => {
    insertTestImport("edit-imp-3");
    insertTestSnapshot("edit-snap-3", "edit-imp-3");

    saveMessageEdit(
      "edit-imp-3",
      "edit-snap-3",
      "msg-1",
      BLOCKS_JSON,
      "First version",
    );
    const second = saveMessageEdit(
      "edit-imp-3",
      "edit-snap-3",
      "msg-1",
      BLOCKS_JSON_V2,
      "Second version",
    );

    // Should have replaced, not duplicated
    const all = listMessageEdits("edit-snap-3");
    expect(all).toHaveLength(1);
    expect(all[0]?.editedBlocksJson).toBe(BLOCKS_JSON_V2);
    expect(all[0]?.annotation).toBe("Second version");
    // ID may change on upsert (INSERT OR REPLACE), that's fine
    expect(second.editedBlocksJson).toBe(BLOCKS_JSON_V2);
  });
});

describe("getMessageEdit", () => {
  test("returns the edit for existing snapshotId+messageId", () => {
    insertTestImport("edit-imp-4");
    insertTestSnapshot("edit-snap-4", "edit-imp-4");
    saveMessageEdit("edit-imp-4", "edit-snap-4", "msg-1", BLOCKS_JSON);

    const result = getMessageEdit("edit-snap-4", "msg-1");

    expect(result).toBeDefined();
    expect(result?.messageId).toBe("msg-1");
    expect(result?.editedBlocksJson).toBe(BLOCKS_JSON);
  });

  test("returns undefined for non-existent edit", () => {
    const result = getMessageEdit("nonexistent", "msg-1");

    expect(result).toBeUndefined();
  });
});

describe("listMessageEdits", () => {
  test("returns all edits for a snapshot", () => {
    insertTestImport("edit-imp-5");
    insertTestSnapshot("edit-snap-5", "edit-imp-5");
    saveMessageEdit("edit-imp-5", "edit-snap-5", "msg-1", BLOCKS_JSON);
    saveMessageEdit("edit-imp-5", "edit-snap-5", "msg-2", BLOCKS_JSON_V2);

    const result = listMessageEdits("edit-snap-5");

    expect(result).toHaveLength(2);
    const messageIds = result.map((r) => r.messageId).sort();
    expect(messageIds).toEqual(["msg-1", "msg-2"]);
  });

  test("returns empty array for snapshot with no edits", () => {
    const result = listMessageEdits("nonexistent-snap");

    expect(result).toEqual([]);
  });
});

describe("deleteMessageEdit", () => {
  test("deletes existing edit and returns true", () => {
    insertTestImport("edit-imp-6");
    insertTestSnapshot("edit-snap-6", "edit-imp-6");
    saveMessageEdit("edit-imp-6", "edit-snap-6", "msg-1", BLOCKS_JSON);

    const deleted = deleteMessageEdit("edit-snap-6", "msg-1");

    expect(deleted).toBe(true);
    expect(getMessageEdit("edit-snap-6", "msg-1")).toBeUndefined();
  });

  test("returns false for non-existent edit", () => {
    const deleted = deleteMessageEdit("nonexistent", "msg-1");

    expect(deleted).toBe(false);
  });
});

describe("deleteAllEditsForSnapshot", () => {
  test("deletes all edits and returns count", () => {
    insertTestImport("edit-imp-7");
    insertTestSnapshot("edit-snap-7", "edit-imp-7");
    saveMessageEdit("edit-imp-7", "edit-snap-7", "msg-1", BLOCKS_JSON);
    saveMessageEdit("edit-imp-7", "edit-snap-7", "msg-2", BLOCKS_JSON);
    saveMessageEdit("edit-imp-7", "edit-snap-7", "msg-3", BLOCKS_JSON);

    const count = deleteAllEditsForSnapshot("edit-snap-7");

    expect(count).toBe(3);
    expect(listMessageEdits("edit-snap-7")).toEqual([]);
  });

  test("returns 0 for snapshot with no edits", () => {
    const count = deleteAllEditsForSnapshot("nonexistent-snap");

    expect(count).toBe(0);
  });
});

describe("countEdits", () => {
  test("returns correct count of edits", () => {
    insertTestImport("edit-imp-8");
    insertTestSnapshot("edit-snap-8", "edit-imp-8");
    saveMessageEdit("edit-imp-8", "edit-snap-8", "msg-1", BLOCKS_JSON);
    saveMessageEdit("edit-imp-8", "edit-snap-8", "msg-2", BLOCKS_JSON);

    const result = countEdits("edit-snap-8");

    expect(result).toBe(2);
  });

  test("returns 0 for snapshot with no edits", () => {
    const result = countEdits("nonexistent-snap");

    expect(result).toBe(0);
  });
});
