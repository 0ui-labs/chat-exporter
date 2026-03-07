import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import "../load-env.js";

const defaultDbPath = fileURLToPath(
  new URL("../../../../data/chat-exporter.db", import.meta.url)
);

export const databasePath =
  process.env.CHAT_EXPORTER_DB_PATH && process.env.CHAT_EXPORTER_DB_PATH.trim().length > 0
    ? path.resolve(process.env.CHAT_EXPORTER_DB_PATH)
    : defaultDbPath;

fs.mkdirSync(path.dirname(databasePath), {
  recursive: true
});

export const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
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
`);
