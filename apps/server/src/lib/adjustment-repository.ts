import type {
  AdjustmentEventType,
  AdjustmentMetrics,
  AdjustmentMessage,
  AdjustmentPreview,
  AdjustmentSession,
  AdjustmentSessionDetail,
  AdjustmentSelection,
  AdjustmentTargetFormat,
  FormatRule,
  Role
} from "@chat-exporter/shared";
import {
  adjustmentMetricsSchema,
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

type AdjustmentMetricsRow = {
  clarifications: number | null;
  preview_failures: number | null;
  previews_generated: number | null;
  rules_applied: number | null;
  rules_disabled: number | null;
  sessions_created: number | null;
  sessions_discarded: number | null;
  updated_at: string | null;
};

type CreateAdjustmentSessionInput = {
  importId: string;
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
};

type RecordAdjustmentEventInput = {
  importId: string;
  payload?: unknown;
  ruleId?: string;
  sessionId?: string;
  targetFormat: AdjustmentTargetFormat;
  type: AdjustmentEventType;
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

const updateAdjustmentSessionPreviewStatement = db.prepare(`
  UPDATE adjustment_sessions
  SET
    status = @status,
    preview_artifact_json = @preview_artifact_json,
    updated_at = @updated_at
  WHERE id = @id
`);

const updateAdjustmentSessionStatusStatement = db.prepare(`
  UPDATE adjustment_sessions
  SET
    status = @status,
    updated_at = @updated_at
  WHERE id = @id
`);

const insertFormatRuleStatement = db.prepare(`
  INSERT INTO format_rules (
    id,
    import_id,
    target_format,
    kind,
    scope,
    status,
    selector_json,
    instruction,
    compiled_rule_json,
    source_session_id,
    created_at,
    updated_at
  ) VALUES (
    @id,
    @import_id,
    @target_format,
    @kind,
    @scope,
    @status,
    @selector_json,
    @instruction,
    @compiled_rule_json,
    @source_session_id,
    @created_at,
    @updated_at
  )
`);

const insertAdjustmentEventStatement = db.prepare(`
  INSERT INTO adjustment_events (
    id,
    import_id,
    session_id,
    rule_id,
    target_format,
    event_type,
    payload_json,
    created_at
  ) VALUES (
    @id,
    @import_id,
    @session_id,
    @rule_id,
    @target_format,
    @event_type,
    @payload_json,
    @created_at
  )
`);

const selectFormatRuleStatement = db.prepare<unknown[], FormatRuleRow>(
  `SELECT * FROM format_rules WHERE id = ?`
);

const updateFormatRuleStatusStatement = db.prepare(`
  UPDATE format_rules
  SET
    status = @status,
    updated_at = @updated_at
  WHERE id = @id
`);

const listFormatRulesStatement = db.prepare<unknown[], FormatRuleRow>(
  `SELECT * FROM format_rules WHERE import_id = ? ORDER BY created_at DESC`
);

const listFormatRulesByFormatStatement = db.prepare<unknown[], FormatRuleRow>(
  `SELECT * FROM format_rules WHERE import_id = ? AND target_format = ? ORDER BY created_at DESC`
);

const summarizeAdjustmentMetricsStatement = db.prepare<
  [string, string],
  AdjustmentMetricsRow
>(`
  SELECT
    SUM(CASE WHEN event_type = 'session_created' THEN 1 ELSE 0 END) AS sessions_created,
    SUM(CASE WHEN event_type = 'clarification_requested' THEN 1 ELSE 0 END) AS clarifications,
    SUM(CASE WHEN event_type = 'preview_generated' THEN 1 ELSE 0 END) AS previews_generated,
    SUM(CASE WHEN event_type = 'preview_failed' THEN 1 ELSE 0 END) AS preview_failures,
    SUM(CASE WHEN event_type = 'rule_applied' THEN 1 ELSE 0 END) AS rules_applied,
    SUM(CASE WHEN event_type = 'rule_disabled' THEN 1 ELSE 0 END) AS rules_disabled,
    SUM(CASE WHEN event_type = 'session_discarded' THEN 1 ELSE 0 END) AS sessions_discarded,
    MAX(created_at) AS updated_at
  FROM adjustment_events
  WHERE import_id = ? AND target_format = ?
`);

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

function toCount(value: number | null) {
  return value ?? 0;
}

function selectionsMatch(left: AdjustmentSelection, right: AdjustmentSelection) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function recordAdjustmentEvent(input: RecordAdjustmentEventInput) {
  const timestamp = now();

  insertAdjustmentEventStatement.run({
    id: crypto.randomUUID(),
    import_id: input.importId,
    session_id: input.sessionId ?? null,
    rule_id: input.ruleId ?? null,
    target_format: input.targetFormat,
    event_type: input.type,
    payload_json: input.payload === undefined ? null : JSON.stringify(input.payload),
    created_at: timestamp
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

  recordAdjustmentEvent({
    importId: session.importId,
    sessionId: session.id,
    targetFormat: session.targetFormat,
    type: "session_created"
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

export function findReusableAdjustmentSession(input: CreateAdjustmentSessionInput) {
  return listAdjustmentSessions(input.importId, input.targetFormat).find(
    (session) =>
      (session.status === "open" || session.status === "preview_ready") &&
      selectionsMatch(session.selection, input.selection)
  );
}

export function appendAdjustmentMessage(sessionId: string, role: Role, content: string) {
  const timestamp = now();

  insertAdjustmentMessageStatement.run({
    id: crypto.randomUUID(),
    session_id: sessionId,
    role,
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

export function saveAdjustmentPreview(sessionId: string, preview: AdjustmentPreview) {
  const timestamp = now();

  updateAdjustmentSessionPreviewStatement.run({
    id: sessionId,
    status: "preview_ready",
    preview_artifact_json: JSON.stringify(preview),
    updated_at: timestamp
  });
}

export function applyAdjustmentPreview(sessionId: string) {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    throw new Error("Adjustment session not found.");
  }

  if (!session.previewArtifact) {
    throw new Error("Generate a preview before applying a rule.");
  }

  if (session.status === "applied") {
    throw new Error("This adjustment session has already been applied.");
  }

  const timestamp = now();
  const rule = formatRuleSchema.parse({
    id: crypto.randomUUID(),
    importId: session.importId,
    targetFormat: session.targetFormat,
    kind: session.previewArtifact.draftRule.kind,
    scope: session.previewArtifact.draftRule.scope,
    status: "active",
    selector: session.previewArtifact.draftRule.selector,
    instruction: session.previewArtifact.summary,
    compiledRule: session.previewArtifact.draftRule.effect,
    sourceSessionId: session.id,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  insertFormatRuleStatement.run({
    id: rule.id,
    import_id: rule.importId,
    target_format: rule.targetFormat,
    kind: rule.kind,
    scope: rule.scope,
    status: rule.status,
    selector_json: JSON.stringify(rule.selector),
    instruction: rule.instruction,
    compiled_rule_json: JSON.stringify(rule.compiledRule),
    source_session_id: rule.sourceSessionId ?? null,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt
  });

  updateAdjustmentSessionStatusStatement.run({
    id: sessionId,
    status: "applied",
    updated_at: timestamp
  });

  const nextSession = getAdjustmentSession(sessionId);

  if (!nextSession) {
    throw new Error("Adjustment session could not be reloaded.");
  }

  recordAdjustmentEvent({
    importId: session.importId,
    ruleId: rule.id,
    sessionId: session.id,
    targetFormat: session.targetFormat,
    type: "rule_applied"
  });

  return {
    rule,
    session: nextSession
  };
}

export function discardAdjustmentSession(sessionId: string) {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    throw new Error("Adjustment session not found.");
  }

  if (session.status === "applied") {
    throw new Error("Applied adjustment sessions cannot be discarded.");
  }

  if (session.status === "discarded") {
    throw new Error("This adjustment session has already been discarded.");
  }

  const timestamp = now();

  updateAdjustmentSessionStatusStatement.run({
    id: sessionId,
    status: "discarded",
    updated_at: timestamp
  });

  const nextDetail = getAdjustmentSessionDetail(sessionId);

  if (!nextDetail) {
    throw new Error("Adjustment session could not be reloaded.");
  }

  recordAdjustmentEvent({
    importId: session.importId,
    sessionId: session.id,
    targetFormat: session.targetFormat,
    type: "session_discarded"
  });

  return nextDetail;
}

export function listAdjustmentMessages(sessionId: string) {
  return listAdjustmentMessagesStatement.all(sessionId).map(deserializeAdjustmentMessage);
}

export function getFormatRule(ruleId: string) {
  const row = selectFormatRuleStatement.get(ruleId);
  return row ? deserializeFormatRule(row) : undefined;
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

export function getAdjustmentMetrics(
  importId: string,
  targetFormat: AdjustmentTargetFormat
): AdjustmentMetrics {
  const row = summarizeAdjustmentMetricsStatement.get(importId, targetFormat);

  return adjustmentMetricsSchema.parse({
    counts: {
      clarifications: toCount(row?.clarifications ?? 0),
      previewFailures: toCount(row?.preview_failures ?? 0),
      previewsGenerated: toCount(row?.previews_generated ?? 0),
      rulesApplied: toCount(row?.rules_applied ?? 0),
      rulesDisabled: toCount(row?.rules_disabled ?? 0),
      sessionsCreated: toCount(row?.sessions_created ?? 0),
      sessionsDiscarded: toCount(row?.sessions_discarded ?? 0)
    },
    importId,
    targetFormat,
    updatedAt: row?.updated_at ?? null
  });
}

export function updateFormatRuleStatus(ruleId: string, status: FormatRule["status"]) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Format rule not found.");
  }

  const timestamp = now();

  updateFormatRuleStatusStatement.run({
    id: ruleId,
    status,
    updated_at: timestamp
  });

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Format rule could not be reloaded.");
  }

  return nextRule;
}

export function disableFormatRule(ruleId: string) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Format rule not found.");
  }

  if (existingRule.status !== "active") {
    throw new Error("Only active rules can be disabled.");
  }

  const nextRule = updateFormatRuleStatus(ruleId, "disabled");

  recordAdjustmentEvent({
    importId: nextRule.importId,
    ruleId: nextRule.id,
    sessionId: nextRule.sourceSessionId,
    targetFormat: nextRule.targetFormat,
    type: "rule_disabled"
  });

  return nextRule;
}
