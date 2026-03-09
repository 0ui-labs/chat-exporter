import type {
  Conversation,
  ImportArtifacts,
  ImportJob,
} from "@chat-exporter/shared";
import { importJobSchema } from "@chat-exporter/shared";

import { db } from "./database.js";

type ImportRow = {
  id: string;
  source_url: string;
  source_platform: string;
  mode: string;
  status: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
  warnings_json: string;
  error: string | null;
  summary_json: string | null;
  conversation_json: string | null;
  artifacts_json: string | null;
};

type SnapshotInput = {
  importId: string;
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  pageTitle: string;
  rawHtml: string;
  normalizedPayload: unknown;
  fetchMetadata: Record<string, unknown>;
};

type SnapshotRow = {
  import_id: string;
  source_url: string;
  final_url: string;
  fetched_at: string;
  page_title: string;
  raw_html: string;
  normalized_payload_json: string;
  fetch_metadata_json: string;
  updated_at: string;
};

const insertImportStatement = db.prepare(`
  INSERT INTO imports (
    id,
    source_url,
    source_platform,
    mode,
    status,
    current_stage,
    created_at,
    updated_at,
    warnings_json,
    error,
    summary_json,
    conversation_json,
    artifacts_json
  ) VALUES (
    @id,
    @source_url,
    @source_platform,
    @mode,
    @status,
    @current_stage,
    @created_at,
    @updated_at,
    @warnings_json,
    @error,
    @summary_json,
    @conversation_json,
    @artifacts_json
  )
`);

const updateImportStatement = db.prepare(`
  UPDATE imports
  SET
    source_url = @source_url,
    source_platform = @source_platform,
    mode = @mode,
    status = @status,
    current_stage = @current_stage,
    created_at = @created_at,
    updated_at = @updated_at,
    warnings_json = @warnings_json,
    error = @error,
    summary_json = @summary_json,
    conversation_json = @conversation_json,
    artifacts_json = @artifacts_json
  WHERE id = @id
`);

const selectImportStatement = db.prepare<unknown[], ImportRow>(
  `SELECT * FROM imports WHERE id = ?`,
);

const listImportsStatement = db.prepare<unknown[], ImportRow>(
  `SELECT * FROM imports ORDER BY created_at DESC`,
);

const saveSnapshotStatement = db.prepare(`
  INSERT INTO import_snapshots (
    import_id,
    source_url,
    final_url,
    fetched_at,
    page_title,
    raw_html,
    normalized_payload_json,
    fetch_metadata_json,
    updated_at
  ) VALUES (
    @import_id,
    @source_url,
    @final_url,
    @fetched_at,
    @page_title,
    @raw_html,
    @normalized_payload_json,
    @fetch_metadata_json,
    @updated_at
  )
  ON CONFLICT(import_id) DO UPDATE SET
    source_url = excluded.source_url,
    final_url = excluded.final_url,
    fetched_at = excluded.fetched_at,
    page_title = excluded.page_title,
    raw_html = excluded.raw_html,
    normalized_payload_json = excluded.normalized_payload_json,
    fetch_metadata_json = excluded.fetch_metadata_json,
    updated_at = excluded.updated_at
`);

const selectSnapshotStatement = db.prepare<unknown[], SnapshotRow>(
  `SELECT * FROM import_snapshots WHERE import_id = ?`,
);

function serializeImport(job: ImportJob) {
  return {
    id: job.id,
    source_url: job.sourceUrl,
    source_platform: job.sourcePlatform,
    mode: job.mode,
    status: job.status,
    current_stage: job.currentStage,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    warnings_json: JSON.stringify(job.warnings),
    error: job.error ?? null,
    summary_json: job.summary ? JSON.stringify(job.summary) : null,
    conversation_json: job.conversation
      ? JSON.stringify(job.conversation)
      : null,
    artifacts_json: job.artifacts ? JSON.stringify(job.artifacts) : null,
  };
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function deserializeImport(row: ImportRow) {
  return importJobSchema.parse({
    id: row.id,
    sourceUrl: row.source_url,
    sourcePlatform: row.source_platform,
    mode: row.mode,
    status: row.status,
    currentStage: row.current_stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    warnings: parseJson<string[]>(row.warnings_json) ?? [],
    error: row.error ?? undefined,
    summary: parseJson<ImportJob["summary"]>(row.summary_json),
    conversation: parseJson<Conversation>(row.conversation_json),
    artifacts: parseJson<ImportArtifacts>(row.artifacts_json),
  });
}

export function insertImport(job: ImportJob) {
  insertImportStatement.run(serializeImport(job));
}

export function replaceImport(job: ImportJob) {
  updateImportStatement.run(serializeImport(job));
}

export function getPersistedImport(id: string) {
  const row = selectImportStatement.get(id);
  return row ? deserializeImport(row) : undefined;
}

export function listPersistedImports() {
  return listImportsStatement.all().map(deserializeImport);
}

export function saveImportSnapshot(input: SnapshotInput) {
  saveSnapshotStatement.run({
    import_id: input.importId,
    source_url: input.sourceUrl,
    final_url: input.finalUrl,
    fetched_at: input.fetchedAt,
    page_title: input.pageTitle,
    raw_html: input.rawHtml,
    normalized_payload_json: JSON.stringify(input.normalizedPayload),
    fetch_metadata_json: JSON.stringify(input.fetchMetadata),
    updated_at: input.fetchedAt,
  });
}

export function getPersistedImportSnapshot(importId: string) {
  const row = selectSnapshotStatement.get(importId);

  if (!row) {
    return undefined;
  }

  return {
    importId: row.import_id,
    sourceUrl: row.source_url,
    finalUrl: row.final_url,
    fetchedAt: row.fetched_at,
    pageTitle: row.page_title,
    rawHtml: row.raw_html,
    normalizedPayload: JSON.parse(row.normalized_payload_json) as unknown,
    fetchMetadata: JSON.parse(row.fetch_metadata_json) as Record<
      string,
      unknown
    >,
  };
}
