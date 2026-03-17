import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import "../load-env.js";
import * as schema from "./schema.js";

const defaultDbPath = fileURLToPath(
  new URL("../../../../data/chat-exporter.db", import.meta.url),
);

export const databasePath =
  process.env.CHAT_EXPORTER_DB_PATH &&
  process.env.CHAT_EXPORTER_DB_PATH.trim().length > 0
    ? path.resolve(process.env.CHAT_EXPORTER_DB_PATH)
    : defaultDbPath;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export const rawDb = sqlite;

export function withTransaction<T>(fn: () => T): T {
  return rawDb.transaction(fn)();
}

// Note: sqlite.exec is the better-sqlite3 API for DDL — no shell invocation.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    mode TEXT NOT NULL,
    import_method TEXT NOT NULL DEFAULT 'share-link',
    status TEXT NOT NULL,
    current_stage TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    summary_json TEXT,
    conversation_json TEXT,
    artifacts_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_imports_status ON imports (status);

  CREATE TABLE IF NOT EXISTS import_snapshots (
    import_id TEXT PRIMARY KEY REFERENCES imports(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    final_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    page_title TEXT NOT NULL,
    raw_html TEXT NOT NULL,
    normalized_payload_json TEXT NOT NULL,
    fetch_metadata_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS adjustment_sessions (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    target_format TEXT NOT NULL,
    status TEXT NOT NULL,
    selection_json TEXT NOT NULL,
    preview_artifact_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_adjustment_sessions_import_id
    ON adjustment_sessions (import_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_adjustment_sessions_target_format
    ON adjustment_sessions (target_format, updated_at DESC);

  CREATE TABLE IF NOT EXISTS adjustment_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES adjustment_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_adjustment_messages_session_id
    ON adjustment_messages (session_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS format_rules (
    id TEXT PRIMARY KEY,
    import_id TEXT REFERENCES imports(id) ON DELETE CASCADE,
    target_format TEXT NOT NULL,
    kind TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    selector_json TEXT NOT NULL,
    instruction TEXT NOT NULL,
    compiled_rule_json TEXT,
    source_session_id TEXT REFERENCES adjustment_sessions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_format_rules_import_id
    ON format_rules (import_id, target_format, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_format_rules_profile
    ON format_rules (target_format, status, created_at DESC);

  CREATE TABLE IF NOT EXISTS adjustment_events (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES adjustment_sessions(id) ON DELETE SET NULL,
    rule_id TEXT REFERENCES format_rules(id) ON DELETE SET NULL,
    target_format TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_adjustment_events_import_id
    ON adjustment_events (import_id, target_format, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_adjustment_events_session_id
    ON adjustment_events (session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS message_deletions (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    reason TEXT,
    deleted_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_message_deletions_import_message
    ON message_deletions (import_id, message_id);

  CREATE TABLE IF NOT EXISTS conversation_snapshots (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_import_id
    ON conversation_snapshots (import_id);

  CREATE TABLE IF NOT EXISTS message_edits (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES conversation_snapshots(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    edited_blocks_json TEXT NOT NULL,
    annotation TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_message_edits_snapshot_message
    ON message_edits (snapshot_id, message_id);
`);

// Migration: make format_rules.import_id nullable (SQLite cannot ALTER COLUMN)
// Uses a table-rebuild approach because SQLite does not support DROP NOT NULL.
const importIdColumn = sqlite
  .prepare(
    `SELECT "notnull" FROM pragma_table_info('format_rules') WHERE name = 'import_id'`,
  )
  .get() as { notnull: number } | undefined;

if (importIdColumn && importIdColumn.notnull === 1) {
  // Per SQLite docs, PRAGMA foreign_keys is a no-op inside a transaction, so it
  // must be issued outside one. We therefore split the migration into three
  // separate sqlite.exec calls:
  //   1. Pragma off  (outside transaction)
  //   2. DDL block wrapped in BEGIN/COMMIT — crash-safe: a failure between
  //      DROP TABLE and RENAME rolls back automatically, preserving all data.
  //   3. Pragma on   (outside transaction)
  sqlite.exec("PRAGMA foreign_keys = OFF;");

  sqlite.exec(`
    BEGIN;

    -- Create the new table with nullable import_id
    CREATE TABLE format_rules_new (
      id TEXT PRIMARY KEY,
      import_id TEXT REFERENCES imports(id) ON DELETE CASCADE,
      target_format TEXT NOT NULL,
      kind TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      selector_json TEXT NOT NULL,
      instruction TEXT NOT NULL,
      compiled_rule_json TEXT,
      source_session_id TEXT REFERENCES adjustment_sessions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Copy data from old table to new
    INSERT INTO format_rules_new SELECT * FROM format_rules;

    -- Drop original and rename new to final name
    DROP TABLE format_rules;
    ALTER TABLE format_rules_new RENAME TO format_rules;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_format_rules_import_id
      ON format_rules (import_id, target_format, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_format_rules_profile
      ON format_rules (target_format, status, created_at DESC);

    COMMIT;
  `);

  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Verify FK integrity after migration
  const fkErrors = sqlite.pragma("foreign_key_check") as unknown[];
  if (fkErrors.length > 0) {
    throw new Error(
      `FK-Integritätsprüfung nach Migration fehlgeschlagen: ${JSON.stringify(fkErrors)}`,
    );
  }
}

// Migration: add error_stage column to imports table
// Note: sqlite.exec is the better-sqlite3 DDL API — no shell invocation.
const errorStageColumn = sqlite
  .prepare(
    `SELECT name FROM pragma_table_info('imports') WHERE name = 'error_stage'`,
  )
  .get() as { name: string } | undefined;

if (!errorStageColumn) {
  sqlite.exec(`ALTER TABLE imports ADD COLUMN error_stage TEXT`);
}

// Migration: rebuild conversation_snapshots to fix schema
// (remove conversation_json column, change is_active from TEXT to INTEGER)
const csConversationJsonCol = sqlite
  .prepare(
    `SELECT name FROM pragma_table_info('conversation_snapshots') WHERE name = 'conversation_json'`,
  )
  .get() as { name: string } | undefined;

if (csConversationJsonCol) {
  sqlite.exec("PRAGMA foreign_keys = OFF;");

  sqlite.exec(`
    BEGIN;

    CREATE TABLE conversation_snapshots_new (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO conversation_snapshots_new (id, import_id, label, is_active, created_at, updated_at)
      SELECT id, import_id, label, CAST(is_active AS INTEGER), created_at, updated_at
      FROM conversation_snapshots;

    DROP TABLE conversation_snapshots;
    ALTER TABLE conversation_snapshots_new RENAME TO conversation_snapshots;

    CREATE INDEX IF NOT EXISTS idx_conversation_snapshots_import_id
      ON conversation_snapshots (import_id);

    COMMIT;
  `);

  sqlite.exec("PRAGMA foreign_keys = ON;");

  const fkErrors = sqlite.pragma("foreign_key_check") as unknown[];
  if (fkErrors.length > 0) {
    throw new Error(
      `FK integrity check failed after conversation_snapshots migration: ${JSON.stringify(fkErrors)}`,
    );
  }
}

// Migration: add import_method column to imports table
const importMethodColumn = sqlite
  .prepare(
    `SELECT name FROM pragma_table_info('imports') WHERE name = 'import_method'`,
  )
  .get() as { name: string } | undefined;

if (!importMethodColumn) {
  sqlite.exec(
    `ALTER TABLE imports ADD COLUMN import_method TEXT NOT NULL DEFAULT 'share-link'`,
  );
}
