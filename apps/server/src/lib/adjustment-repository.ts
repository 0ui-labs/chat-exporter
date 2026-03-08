import type {
  AdjustmentMessage,
  AdjustmentSession,
  AdjustmentSessionDetail,
  AdjustmentSelection,
  AdjustmentTargetFormat,
  FormatRule
} from "@chat-exporter/shared";
import {
  adjustmentMessageSchema,
  adjustmentSessionDetailSchema,
  adjustmentSessionSchema,
  formatRuleSchema
} from "@chat-exporter/shared";

import { db } from "./database.js";

type AdjustmentSessionRow = {
  id: string;
  import_id: string;
  target_format: string;
  status: string;
  selection_json: string;
  preview_artifact_json: string | null;
  created_at: string;
  updated_at: string;
};

type AdjustmentMessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
};

type FormatRuleRow = {
  id: string;
  import_id: string;
  target_format: string;
  kind: string;
  scope: string;
  status: string;
  selector_json: string;
  instruction: string;
  compiled_rule_json: string | null;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
};

type CreateAdjustmentSessionInput = {
  importId: string;
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
};

const insertAdjustmentSessionStatement = db.prepare(`
  INSERT INTO adjustment_sessions (
    id,
    import_id,
    target_format,
    status,
    selection_json,
    preview_artifact_json,
    created_at,
    updated_at
  ) VALUES (
    @id,
    @import_id,
    @target_format,
    @status,
    @selection_json,
    @preview_artifact_json,
    @created_at,
    @updated_at
  )
`);

const selectAdjustmentSessionStatement = db.prepare<unknown[], AdjustmentSessionRow>(
  `SELECT * FROM adjustment_sessions WHERE id = ?`
);

const listAdjustmentSessionsStatement = db.prepare<unknown[], AdjustmentSessionRow>(
  `SELECT * FROM adjustment_sessions WHERE import_id = ? ORDER BY created_at DESC`
);

const listAdjustmentSessionsByFormatStatement = db.prepare<unknown[], AdjustmentSessionRow>(
  `SELECT * FROM adjustment_sessions WHERE import_id = ? AND target_format = ? ORDER BY created_at DESC`
);

const insertAdjustmentMessageStatement = db.prepare(`
  INSERT INTO adjustment_messages (
    id,
    session_id,
    role,
    content,
    created_at
  ) VALUES (
    @id,
    @session_id,
    @role,
    @content,
    @created_at
  )
`);

const listAdjustmentMessagesStatement = db.prepare<unknown[], AdjustmentMessageRow>(
  `SELECT * FROM adjustment_messages WHERE session_id = ? ORDER BY created_at ASC`
);

const updateAdjustmentSessionTimestampStatement = db.prepare(`
  UPDATE adjustment_sessions
  SET updated_at = @updated_at
  WHERE id = @id
`);

const listFormatRulesStatement = db.prepare<unknown[], FormatRuleRow>(
  `SELECT * FROM format_rules WHERE import_id = ? ORDER BY created_at DESC`
);

const listFormatRulesByFormatStatement = db.prepare<unknown[], FormatRuleRow>(
  `SELECT * FROM format_rules WHERE import_id = ? AND target_format = ? ORDER BY created_at DESC`
);

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function deserializeAdjustmentSession(row: AdjustmentSessionRow): AdjustmentSession {
  return adjustmentSessionSchema.parse({
    id: row.id,
    importId: row.import_id,
    targetFormat: row.target_format,
    status: row.status,
    selection: parseJson<AdjustmentSelection>(row.selection_json),
    previewArtifact: parseJson<unknown>(row.preview_artifact_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function deserializeAdjustmentMessage(row: AdjustmentMessageRow): AdjustmentMessage {
  return adjustmentMessageSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  });
}

function deserializeFormatRule(row: FormatRuleRow): FormatRule {
  return formatRuleSchema.parse({
    id: row.id,
    importId: row.import_id,
    targetFormat: row.target_format,
    kind: row.kind,
    scope: row.scope,
    status: row.status,
    selector: parseJson<unknown>(row.selector_json),
    instruction: row.instruction,
    compiledRule: parseJson<unknown>(row.compiled_rule_json),
    sourceSessionId: row.source_session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

export function createAdjustmentSession(input: CreateAdjustmentSessionInput) {
  const timestamp = now();
  const session: AdjustmentSession = adjustmentSessionSchema.parse({
    id: crypto.randomUUID(),
    importId: input.importId,
    targetFormat: input.targetFormat,
    status: "open",
    selection: input.selection,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  insertAdjustmentSessionStatement.run({
    id: session.id,
    import_id: session.importId,
    target_format: session.targetFormat,
    status: session.status,
    selection_json: JSON.stringify(session.selection),
    preview_artifact_json: null,
    created_at: session.createdAt,
    updated_at: session.updatedAt
  });

  return session;
}

export function getAdjustmentSession(sessionId: string) {
  const row = selectAdjustmentSessionStatement.get(sessionId);
  return row ? deserializeAdjustmentSession(row) : undefined;
}

export function listAdjustmentSessions(importId: string, targetFormat?: AdjustmentTargetFormat) {
  const rows = targetFormat
    ? listAdjustmentSessionsByFormatStatement.all(importId, targetFormat)
    : listAdjustmentSessionsStatement.all(importId);

  return rows.map(deserializeAdjustmentSession);
}

export function appendAdjustmentMessage(sessionId: string, content: string) {
  const timestamp = now();

  insertAdjustmentMessageStatement.run({
    id: crypto.randomUUID(),
    session_id: sessionId,
    role: "user",
    content,
    created_at: timestamp
  });

  updateAdjustmentSessionTimestampStatement.run({
    id: sessionId,
    updated_at: timestamp
  });

  const row = listAdjustmentMessagesStatement.all(sessionId).at(-1);
  return row ? deserializeAdjustmentMessage(row) : undefined;
}

export function listAdjustmentMessages(sessionId: string) {
  return listAdjustmentMessagesStatement.all(sessionId).map(deserializeAdjustmentMessage);
}

export function getAdjustmentSessionDetail(sessionId: string): AdjustmentSessionDetail | undefined {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    return undefined;
  }

  return adjustmentSessionDetailSchema.parse({
    messages: listAdjustmentMessages(sessionId),
    session
  });
}

export function listFormatRules(importId: string, targetFormat?: AdjustmentTargetFormat) {
  const rows = targetFormat
    ? listFormatRulesByFormatStatement.all(importId, targetFormat)
    : listFormatRulesStatement.all(importId);

  return rows.map(deserializeFormatRule);
}
