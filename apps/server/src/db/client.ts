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

// Note: sqlite.exec() here is the better-sqlite3 API for executing DDL statements,
// not Node.js child_process.exec(). This is safe - no shell invocation.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    mode TEXT NOT NULL,
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
`);

// Migration: make format_rules.import_id nullable (SQLite cannot ALTER COLUMN)
// Uses a new temp table to avoid FK issues with rename-based approach.
const importIdColumn = sqlite
  .prepare(
    `SELECT "notnull" FROM pragma_table_info('format_rules') WHERE name = 'import_id'`,
  )
  .get() as { notnull: number } | undefined;

if (importIdColumn && importIdColumn.notnull === 1) {
  // Note: sqlite.exec() here is the better-sqlite3 API for executing DDL statements,
  // not Node.js child_process.exec(). This is safe - no shell invocation.
  sqlite.exec(`
    -- Temporarily disable FK enforcement during migration
    PRAGMA foreign_keys = OFF;

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

    -- Re-enable FK enforcement
    PRAGMA foreign_keys = ON;
  `);

  // Verify FK integrity after migration
  const fkErrors = sqlite.pragma("foreign_key_check") as unknown[];
  if (fkErrors.length > 0) {
    throw new Error(
      `FK-Integritätsprüfung nach Migration fehlgeschlagen: ${JSON.stringify(fkErrors)}`,
    );
  }
}
