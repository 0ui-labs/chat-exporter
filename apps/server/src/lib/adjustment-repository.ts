import type {
  AdjustmentEventType,
  AdjustmentMessage,
  AdjustmentMetrics,
  AdjustmentSelection,
  AdjustmentSession,
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  CustomStyleEffect,
  FormatRule,
  Role,
} from "@chat-exporter/shared";
import {
  adjustmentMessageSchema,
  adjustmentMetricsSchema,
  adjustmentSessionDetailSchema,
  adjustmentSessionSchema,
  formatRuleSchema,
} from "@chat-exporter/shared";
import type { RunResult } from "better-sqlite3";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { db, withTransaction } from "../db/client.js";
import type * as schema from "../db/schema.js";
import {
  adjustmentEvents,
  adjustmentMessages,
  adjustmentSessions,
  formatRules,
} from "../db/schema.js";

type DbOrTx = BaseSQLiteDatabase<
  "sync",
  RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

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

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function deserializeAdjustmentSession(
  row: typeof adjustmentSessions.$inferSelect,
): AdjustmentSession {
  return adjustmentSessionSchema.parse({
    id: row.id,
    importId: row.importId,
    targetFormat: row.targetFormat,
    status: row.status,
    selection: parseJson<AdjustmentSelection>(row.selectionJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function deserializeAdjustmentMessage(
  row: typeof adjustmentMessages.$inferSelect,
): AdjustmentMessage {
  return adjustmentMessageSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  });
}

function deserializeFormatRule(
  row: typeof formatRules.$inferSelect,
): FormatRule {
  return formatRuleSchema.parse({
    id: row.id,
    importId: row.importId,
    targetFormat: row.targetFormat,
    kind: row.kind,
    scope: row.scope,
    status: row.status,
    selector: parseJson<unknown>(row.selectorJson),
    instruction: row.instruction,
    compiledRule: parseJson<unknown>(row.compiledRuleJson),
    sourceSessionId: row.sourceSessionId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toCount(value: number | null) {
  return value ?? 0;
}

function selectionsMatch(
  left: AdjustmentSelection,
  right: AdjustmentSelection,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function recordAdjustmentEvent(
  input: RecordAdjustmentEventInput,
  tx?: DbOrTx,
) {
  const timestamp = now();
  const target = tx ?? db;

  target
    .insert(adjustmentEvents)
    .values({
      id: crypto.randomUUID(),
      importId: input.importId,
      sessionId: input.sessionId ?? null,
      ruleId: input.ruleId ?? null,
      targetFormat: input.targetFormat,
      eventType: input.type,
      payloadJson:
        input.payload === undefined ? null : JSON.stringify(input.payload),
      createdAt: timestamp,
    })
    .run();
}

export function createAdjustmentSession(input: CreateAdjustmentSessionInput): {
  session: AdjustmentSession;
  reused: boolean;
} {
  const existing = findReusableAdjustmentSession(input);

  if (existing) {
    return { session: existing, reused: true };
  }

  const timestamp = now();
  const session: AdjustmentSession = adjustmentSessionSchema.parse({
    id: crypto.randomUUID(),
    importId: input.importId,
    targetFormat: input.targetFormat,
    status: "open",
    selection: input.selection,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  db.transaction((tx) => {
    tx.insert(adjustmentSessions)
      .values({
        id: session.id,
        importId: session.importId,
        targetFormat: session.targetFormat,
        status: session.status,
        selectionJson: JSON.stringify(session.selection),
        previewArtifactJson: null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .run();

    recordAdjustmentEvent(
      {
        importId: session.importId,
        sessionId: session.id,
        targetFormat: session.targetFormat,
        type: "session_created",
      },
      tx,
    );
  });

  return { session, reused: false };
}

export function getAdjustmentSession(sessionId: string) {
  const row = db
    .select()
    .from(adjustmentSessions)
    .where(eq(adjustmentSessions.id, sessionId))
    .get();

  return row ? deserializeAdjustmentSession(row) : undefined;
}

export function listAdjustmentSessions(
  importId: string,
  targetFormat?: AdjustmentTargetFormat,
) {
  const conditions = [eq(adjustmentSessions.importId, importId)];

  if (targetFormat) {
    conditions.push(eq(adjustmentSessions.targetFormat, targetFormat));
  }

  const rows = db
    .select()
    .from(adjustmentSessions)
    .where(and(...conditions))
    .orderBy(desc(adjustmentSessions.createdAt))
    .all();

  return rows.map(deserializeAdjustmentSession);
}

export function findReusableAdjustmentSession(
  input: CreateAdjustmentSessionInput,
) {
  return listAdjustmentSessions(input.importId, input.targetFormat).find(
    (session) =>
      session.status === "open" &&
      selectionsMatch(session.selection, input.selection),
  );
}

export function appendAdjustmentMessage(
  sessionId: string,
  role: Role,
  content: string,
) {
  const timestamp = now();

  withTransaction(() => {
    db.insert(adjustmentMessages)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        role,
        content,
        createdAt: timestamp,
      })
      .run();

    db.update(adjustmentSessions)
      .set({ updatedAt: timestamp })
      .where(eq(adjustmentSessions.id, sessionId))
      .run();
  });

  const rows = db
    .select()
    .from(adjustmentMessages)
    .where(eq(adjustmentMessages.sessionId, sessionId))
    .orderBy(asc(adjustmentMessages.createdAt))
    .all();

  const row = rows.at(-1);
  return row ? deserializeAdjustmentMessage(row) : undefined;
}

type CreateFormatRuleDirectInput = {
  importId: string;
  targetFormat: AdjustmentTargetFormat;
  selector: Record<string, unknown>;
  effect: CustomStyleEffect;
  instruction: string;
  sourceSessionId: string;
};

export function createFormatRuleDirect(
  input: CreateFormatRuleDirectInput,
): FormatRule {
  const timestamp = now();
  const ruleId = crypto.randomUUID();

  const rule = formatRuleSchema.parse({
    id: ruleId,
    importId: input.importId,
    targetFormat: input.targetFormat,
    kind: "render",
    scope: "import_local",
    status: "active",
    selector: input.selector,
    instruction: input.instruction,
    compiledRule: input.effect,
    sourceSessionId: input.sourceSessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  db.transaction((tx) => {
    tx.insert(formatRules)
      .values({
        id: rule.id,
        importId: rule.importId,
        targetFormat: rule.targetFormat,
        kind: rule.kind,
        scope: rule.scope,
        status: rule.status,
        selectorJson: JSON.stringify(rule.selector),
        instruction: rule.instruction,
        compiledRuleJson: JSON.stringify(rule.compiledRule),
        sourceSessionId: rule.sourceSessionId ?? null,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      })
      .run();

    recordAdjustmentEvent(
      {
        importId: input.importId,
        ruleId: rule.id,
        sessionId: input.sourceSessionId,
        targetFormat: input.targetFormat,
        type: "rule_applied",
      },
      tx,
    );
  });

  return rule;
}

export function updateFormatRuleEffect(
  ruleId: string,
  effect: CustomStyleEffect,
  instruction?: string,
): FormatRule {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  const timestamp = now();
  const updates: Record<string, unknown> = {
    compiledRuleJson: JSON.stringify(effect),
    updatedAt: timestamp,
  };

  if (instruction !== undefined) {
    updates.instruction = instruction;
  }

  db.update(formatRules).set(updates).where(eq(formatRules.id, ruleId)).run();

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }

  return nextRule;
}

export function updateFormatRuleSelector(
  ruleId: string,
  selector: Record<string, unknown>,
): FormatRule {
  const existingRule = getFormatRule(ruleId);
  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  const timestamp = now();
  db.update(formatRules)
    .set({
      selectorJson: JSON.stringify(selector),
      updatedAt: timestamp,
    })
    .where(eq(formatRules.id, ruleId))
    .run();

  const nextRule = getFormatRule(ruleId);
  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }
  return nextRule;
}

export function discardAdjustmentSession(sessionId: string) {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    throw new Error("Anpassungssession nicht gefunden.");
  }

  if (session.status === "applied") {
    throw new Error(
      "Bereits angewendete Anpassungssessions können nicht verworfen werden.",
    );
  }

  if (session.status === "discarded") {
    throw new Error("Diese Anpassungssession wurde bereits verworfen.");
  }

  const timestamp = now();

  db.transaction((tx) => {
    const result = tx
      .update(adjustmentSessions)
      .set({
        status: "discarded",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(adjustmentSessions.id, sessionId),
          inArray(adjustmentSessions.status, ["open"]),
        ),
      )
      .run();

    if (result.changes === 0) {
      throw new Error(
        "Status-Transition fehlgeschlagen: Session ist nicht mehr in einem verwerfbaren Zustand.",
      );
    }

    recordAdjustmentEvent(
      {
        importId: session.importId,
        sessionId: session.id,
        targetFormat: session.targetFormat,
        type: "session_discarded",
      },
      tx,
    );
  });

  const nextDetail = getAdjustmentSessionDetail(sessionId);

  if (!nextDetail) {
    throw new Error("Anpassungssession konnte nicht neu geladen werden.");
  }

  return nextDetail;
}

export function markSessionApplied(sessionId: string) {
  db.update(adjustmentSessions)
    .set({ status: "applied", updatedAt: now() })
    .where(eq(adjustmentSessions.id, sessionId))
    .run();
}

export function reopenAdjustmentSession(sessionId: string) {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    throw new Error("Anpassungssession nicht gefunden.");
  }

  db.update(adjustmentSessions)
    .set({
      status: "open",
      previewArtifactJson: null,
      updatedAt: now(),
    })
    .where(eq(adjustmentSessions.id, sessionId))
    .run();

  const updated = getAdjustmentSession(sessionId);

  if (!updated) {
    throw new Error("Anpassungssession konnte nicht neu geladen werden.");
  }

  return updated;
}

export function listAdjustmentMessages(sessionId: string) {
  return db
    .select()
    .from(adjustmentMessages)
    .where(eq(adjustmentMessages.sessionId, sessionId))
    .orderBy(asc(adjustmentMessages.createdAt))
    .all()
    .map(deserializeAdjustmentMessage);
}

export function listSessionEvents(sessionId: string) {
  return db
    .select({
      id: adjustmentEvents.id,
      eventType: adjustmentEvents.eventType,
      ruleId: adjustmentEvents.ruleId,
      payloadJson: adjustmentEvents.payloadJson,
      createdAt: adjustmentEvents.createdAt,
    })
    .from(adjustmentEvents)
    .where(eq(adjustmentEvents.sessionId, sessionId))
    .orderBy(asc(adjustmentEvents.createdAt))
    .all();
}

export function getFormatRule(ruleId: string) {
  const row = db
    .select()
    .from(formatRules)
    .where(eq(formatRules.id, ruleId))
    .get();

  return row ? deserializeFormatRule(row) : undefined;
}

export function getAdjustmentSessionDetail(
  sessionId: string,
): AdjustmentSessionDetail | undefined {
  const session = getAdjustmentSession(sessionId);

  if (!session) {
    return undefined;
  }

  return adjustmentSessionDetailSchema.parse({
    messages: listAdjustmentMessages(sessionId),
    session,
  });
}

export function listFormatRules(
  importId: string,
  targetFormat?: AdjustmentTargetFormat,
) {
  const localConditions = [eq(formatRules.importId, importId)];
  const profileConditions = [
    isNull(formatRules.importId),
    eq(formatRules.scope, "format_profile"),
  ];

  if (targetFormat) {
    localConditions.push(eq(formatRules.targetFormat, targetFormat));
    profileConditions.push(eq(formatRules.targetFormat, targetFormat));
  }

  const profileRows = db
    .select()
    .from(formatRules)
    .where(and(...profileConditions))
    .orderBy(desc(formatRules.createdAt))
    .all();

  const localRows = db
    .select()
    .from(formatRules)
    .where(and(...localConditions))
    .orderBy(desc(formatRules.createdAt))
    .all();

  return [...profileRows, ...localRows].map(deserializeFormatRule);
}

export function getAdjustmentMetrics(
  importId: string,
  targetFormat: AdjustmentTargetFormat,
): AdjustmentMetrics {
  const row = db.get<{
    sessions_created: number | null;
    clarifications: number | null;
    previews_generated: number | null;
    preview_failures: number | null;
    rules_applied: number | null;
    rules_disabled: number | null;
    sessions_discarded: number | null;
    updated_at: string | null;
  }>(sql`
    SELECT
      SUM(CASE WHEN event_type = 'session_created' THEN 1 ELSE 0 END) AS sessions_created,
      SUM(CASE WHEN event_type = 'clarification_requested' THEN 1 ELSE 0 END) AS clarifications,
      SUM(CASE WHEN event_type = 'preview_generated' THEN 1 ELSE 0 END) AS previews_generated,
      SUM(CASE WHEN event_type = 'preview_failed' THEN 1 ELSE 0 END) AS preview_failures,
      SUM(CASE WHEN event_type = 'rule_applied' THEN 1 ELSE 0 END) AS rules_applied,
      SUM(CASE WHEN event_type = 'rule_disabled' THEN 1 ELSE 0 END) AS rules_disabled,
      SUM(CASE WHEN event_type = 'session_discarded' THEN 1 ELSE 0 END) AS sessions_discarded,
      MAX(created_at) AS updated_at
    FROM ${adjustmentEvents}
    WHERE ${adjustmentEvents.importId} = ${importId}
      AND ${adjustmentEvents.targetFormat} = ${targetFormat}
  `);

  return adjustmentMetricsSchema.parse({
    counts: {
      clarifications: toCount(row?.clarifications ?? 0),
      previewFailures: toCount(row?.preview_failures ?? 0),
      previewsGenerated: toCount(row?.previews_generated ?? 0),
      rulesApplied: toCount(row?.rules_applied ?? 0),
      rulesDisabled: toCount(row?.rules_disabled ?? 0),
      sessionsCreated: toCount(row?.sessions_created ?? 0),
      sessionsDiscarded: toCount(row?.sessions_discarded ?? 0),
    },
    importId,
    targetFormat,
    updatedAt: row?.updated_at ?? null,
  });
}

export function updateFormatRuleStatus(
  ruleId: string,
  status: FormatRule["status"],
) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  const timestamp = now();

  db.update(formatRules)
    .set({
      status,
      updatedAt: timestamp,
    })
    .where(eq(formatRules.id, ruleId))
    .run();

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }

  return nextRule;
}

export function promoteRuleToProfile(ruleId: string) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  if (existingRule.scope === "format_profile") {
    throw new Error("Regel ist bereits eine Profil-Regel.");
  }

  const originalImportId = existingRule.importId;
  const timestamp = now();

  db.transaction((tx) => {
    tx.update(formatRules)
      .set({
        scope: "format_profile",
        importId: null,
        updatedAt: timestamp,
      })
      .where(eq(formatRules.id, ruleId))
      .run();

    if (!originalImportId) {
      throw new Error(
        "Regel hat keine gültige importId – Promote nicht möglich.",
      );
    }

    recordAdjustmentEvent(
      {
        importId: originalImportId,
        ruleId: existingRule.id,
        sessionId: existingRule.sourceSessionId,
        targetFormat: existingRule.targetFormat,
        type: "rule_promoted",
      },
      tx,
    );
  });

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }

  return nextRule;
}

export function demoteRuleToLocal(ruleId: string, importId: string) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  if (existingRule.scope !== "format_profile") {
    throw new Error("Regel ist bereits lokal.");
  }

  const timestamp = now();

  db.transaction((tx) => {
    tx.update(formatRules)
      .set({
        scope: "import_local",
        importId,
        updatedAt: timestamp,
      })
      .where(eq(formatRules.id, ruleId))
      .run();
  });

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }

  return nextRule;
}

export function disableFormatRule(ruleId: string, importId?: string) {
  const existingRule = getFormatRule(ruleId);

  if (!existingRule) {
    throw new Error("Formatregel nicht gefunden.");
  }

  if (existingRule.status !== "active") {
    throw new Error("Nur aktive Regeln können deaktiviert werden.");
  }

  const resolvedImportId = existingRule.importId ?? importId;

  if (!resolvedImportId) {
    throw new Error(
      "Für Profil-Regeln muss eine gültige importId angegeben werden.",
    );
  }

  db.transaction((tx) => {
    const timestamp = now();

    tx.update(formatRules)
      .set({
        status: "disabled",
        updatedAt: timestamp,
      })
      .where(eq(formatRules.id, ruleId))
      .run();

    recordAdjustmentEvent(
      {
        importId: resolvedImportId,
        ruleId: existingRule.id,
        sessionId: existingRule.sourceSessionId,
        targetFormat: existingRule.targetFormat,
        type: "rule_disabled",
      },
      tx,
    );
  });

  const nextRule = getFormatRule(ruleId);

  if (!nextRule) {
    throw new Error("Formatregel konnte nicht neu geladen werden.");
  }

  return nextRule;
}
