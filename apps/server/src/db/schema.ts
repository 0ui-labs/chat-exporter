import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    sourcePlatform: text("source_platform").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    currentStage: text("current_stage").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    warningsJson: text("warnings_json").notNull().default("[]"),
    error: text("error"),
    errorStage: text("error_stage"),
    summaryJson: text("summary_json"),
    conversationJson: text("conversation_json"),
    artifactsJson: text("artifacts_json"),
  },
  (table) => [
    index("idx_imports_created_at").on(table.createdAt),
    index("idx_imports_status").on(table.status),
  ],
);

export const importSnapshots = sqliteTable("import_snapshots", {
  importId: text("import_id")
    .primaryKey()
    .references(() => imports.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  finalUrl: text("final_url").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  pageTitle: text("page_title").notNull(),
  rawHtml: text("raw_html").notNull(),
  normalizedPayloadJson: text("normalized_payload_json").notNull(),
  fetchMetadataJson: text("fetch_metadata_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adjustmentSessions = sqliteTable(
  "adjustment_sessions",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    targetFormat: text("target_format").notNull(),
    status: text("status").notNull(),
    selectionJson: text("selection_json").notNull(),
    previewArtifactJson: text("preview_artifact_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_adjustment_sessions_import_id").on(
      table.importId,
      table.createdAt,
    ),
    index("idx_adjustment_sessions_target_format").on(
      table.targetFormat,
      table.updatedAt,
    ),
  ],
);

export const adjustmentMessages = sqliteTable(
  "adjustment_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => adjustmentSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_adjustment_messages_session_id").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const formatRules = sqliteTable(
  "format_rules",
  {
    id: text("id").primaryKey(),
    importId: text("import_id").references(() => imports.id, {
      onDelete: "cascade",
    }),
    targetFormat: text("target_format").notNull(),
    kind: text("kind").notNull(),
    scope: text("scope").notNull(),
    status: text("status").notNull(),
    selectorJson: text("selector_json").notNull(),
    instruction: text("instruction").notNull(),
    compiledRuleJson: text("compiled_rule_json"),
    sourceSessionId: text("source_session_id").references(
      () => adjustmentSessions.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_format_rules_import_id").on(
      table.importId,
      table.targetFormat,
      table.status,
      table.createdAt,
    ),
    index("idx_format_rules_profile").on(
      table.targetFormat,
      table.status,
      table.createdAt,
    ),
  ],
);

export const adjustmentEvents = sqliteTable(
  "adjustment_events",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => adjustmentSessions.id, {
      onDelete: "set null",
    }),
    ruleId: text("rule_id").references(() => formatRules.id, {
      onDelete: "set null",
    }),
    targetFormat: text("target_format").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_adjustment_events_import_id").on(
      table.importId,
      table.targetFormat,
      table.createdAt,
    ),
    index("idx_adjustment_events_session_id").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const messageDeletions = sqliteTable(
  "message_deletions",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    reason: text("reason"),
    deletedAt: text("deleted_at").notNull(),
  },
  (table) => [
    index("idx_message_deletions_import_message").on(
      table.importId,
      table.messageId,
    ),
  ],
);

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
export type ImportSnapshot = typeof importSnapshots.$inferSelect;
export type NewImportSnapshot = typeof importSnapshots.$inferInsert;
export type AdjustmentSessionRecord = typeof adjustmentSessions.$inferSelect;
export type AdjustmentMessageRecord = typeof adjustmentMessages.$inferSelect;
export type FormatRuleRecord = typeof formatRules.$inferSelect;
export type AdjustmentEventRecord = typeof adjustmentEvents.$inferSelect;
export type MessageDeletionRecord = typeof messageDeletions.$inferSelect;
