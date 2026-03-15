import { describe, expect, test } from "vitest";

import { rawDb } from "./client.js";
import { conversationSnapshots, messageEdits } from "./schema.js";

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexInfo {
  name: string;
}

interface IndexSqlInfo {
  sql: string;
}

interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

interface SnapshotRow {
  label: string;
  is_active: number;
}

describe("conversationSnapshots table", () => {
  test("table exists in database with correct columns", () => {
    const columns = rawDb
      .prepare(
        "SELECT name, type, [notnull], dflt_value, pk FROM pragma_table_info('conversation_snapshots')",
      )
      .all() as ColumnInfo[];

    const columnMap = new Map(columns.map((c) => [c.name, c]));

    expect(columnMap.get("id")).toMatchObject({ type: "TEXT", pk: 1 });
    expect(columnMap.get("import_id")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("label")).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(columnMap.get("is_active")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
      dflt_value: "0",
    });
    expect(columnMap.get("created_at")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("updated_at")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
  });

  test("has index on import_id", () => {
    const indexes = rawDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'conversation_snapshots'",
      )
      .all() as IndexInfo[];

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_conversation_snapshots_import_id");
  });

  test("foreign key references imports(id) with CASCADE delete", () => {
    const fks = rawDb
      .prepare("PRAGMA foreign_key_list('conversation_snapshots')")
      .all() as ForeignKeyInfo[];

    const importFk = fks.find((fk) => fk.from === "import_id");
    expect(importFk).toBeDefined();
    expect(importFk?.table).toBe("imports");
    expect(importFk?.to).toBe("id");
    expect(importFk?.on_delete).toBe("CASCADE");
  });

  test("Drizzle schema exports conversationSnapshots table", () => {
    expect(conversationSnapshots).toBeDefined();
    // Verify the Drizzle table has the expected column keys
    expect(conversationSnapshots.id).toBeDefined();
    expect(conversationSnapshots.importId).toBeDefined();
    expect(conversationSnapshots.label).toBeDefined();
    expect(conversationSnapshots.isActive).toBeDefined();
  });

  test("can insert and query a row via raw SQL", () => {
    const now = new Date().toISOString();
    const importId = `_test_cs_${Date.now()}`;
    const snapshotId = `_test_snap_${Date.now()}`;

    rawDb
      .prepare(
        "INSERT INTO imports (id, source_url, source_platform, mode, status, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        importId,
        "https://test.com",
        "test",
        "full",
        "completed",
        "done",
        now,
        now,
      );

    try {
      rawDb
        .prepare(
          "INSERT INTO conversation_snapshots (id, import_id, label, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(snapshotId, importId, "Test Snapshot", 0, now, now);

      const row = rawDb
        .prepare("SELECT * FROM conversation_snapshots WHERE id = ?")
        .get(snapshotId) as SnapshotRow;
      expect(row.label).toBe("Test Snapshot");
      expect(row.is_active).toBe(0);
    } finally {
      rawDb.prepare("DELETE FROM imports WHERE id = ?").run(importId);
    }
  });
});

describe("messageEdits table", () => {
  test("table exists in database with correct columns", () => {
    const columns = rawDb
      .prepare(
        "SELECT name, type, [notnull], dflt_value, pk FROM pragma_table_info('message_edits')",
      )
      .all() as ColumnInfo[];

    const columnMap = new Map(columns.map((c) => [c.name, c]));

    expect(columnMap.get("id")).toMatchObject({ type: "TEXT", pk: 1 });
    expect(columnMap.get("import_id")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("snapshot_id")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("message_id")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("edited_blocks_json")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("annotation")).toMatchObject({
      type: "TEXT",
      notnull: 0,
    });
    expect(columnMap.get("created_at")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(columnMap.get("updated_at")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
  });

  test("has unique index on (snapshot_id, message_id)", () => {
    const indexes = rawDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'message_edits'",
      )
      .all() as IndexInfo[];

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_message_edits_snapshot_message");

    const indexSql = rawDb
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_message_edits_snapshot_message'",
      )
      .get() as IndexSqlInfo;
    expect(indexSql.sql).toContain("UNIQUE");
  });

  test("foreign key references imports(id) and conversation_snapshots(id) with CASCADE", () => {
    const fks = rawDb
      .prepare("PRAGMA foreign_key_list('message_edits')")
      .all() as ForeignKeyInfo[];

    const importFk = fks.find((fk) => fk.from === "import_id");
    expect(importFk).toBeDefined();
    expect(importFk?.table).toBe("imports");
    expect(importFk?.on_delete).toBe("CASCADE");

    const snapshotFk = fks.find((fk) => fk.from === "snapshot_id");
    expect(snapshotFk).toBeDefined();
    expect(snapshotFk?.table).toBe("conversation_snapshots");
    expect(snapshotFk?.on_delete).toBe("CASCADE");
  });

  test("Drizzle schema exports messageEdits table", () => {
    expect(messageEdits).toBeDefined();
    expect(messageEdits.id).toBeDefined();
    expect(messageEdits.snapshotId).toBeDefined();
    expect(messageEdits.editedBlocksJson).toBeDefined();
  });

  test("enforces unique constraint on (snapshot_id, message_id)", () => {
    const now = new Date().toISOString();
    const importId = `_test_me_${Date.now()}`;
    const snapshotId = `_test_snap_me_${Date.now()}`;
    const messageId = "msg-1";

    rawDb
      .prepare(
        "INSERT INTO imports (id, source_url, source_platform, mode, status, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        importId,
        "https://test.com",
        "test",
        "full",
        "completed",
        "done",
        now,
        now,
      );
    rawDb
      .prepare(
        "INSERT INTO conversation_snapshots (id, import_id, label, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(snapshotId, importId, "Test", 0, now, now);

    try {
      rawDb
        .prepare(
          "INSERT INTO message_edits (id, import_id, snapshot_id, message_id, edited_blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          `edit-1-${Date.now()}`,
          importId,
          snapshotId,
          messageId,
          "[]",
          now,
          now,
        );

      expect(() =>
        rawDb
          .prepare(
            "INSERT INTO message_edits (id, import_id, snapshot_id, message_id, edited_blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            `edit-2-${Date.now()}`,
            importId,
            snapshotId,
            messageId,
            "[]",
            now,
            now,
          ),
      ).toThrow();
    } finally {
      rawDb.prepare("DELETE FROM imports WHERE id = ?").run(importId);
    }
  });
});

describe("type exports", () => {
  test("schema module exports both new tables", async () => {
    const schemaModule = await import("./schema.js");

    expect(schemaModule.conversationSnapshots).toBeDefined();
    expect(schemaModule.messageEdits).toBeDefined();
  });
});
