import { z } from "zod";

import { roleSchema } from "./conversation.js";

export const adjustmentTargetFormatSchema = z.enum([
  "reader",
  "markdown",
  "handover",
  "json",
  "html",
  "rich_text",
  "clipboard_html"
]);

export const adjustmentSessionStatusSchema = z.enum([
  "open",
  "preview_ready",
  "applied",
  "discarded",
  "failed"
]);

export const formatRuleKindSchema = z.enum([
  "structure",
  "inline_semantics",
  "render",
  "export_profile",
  "clipboard"
]);

export const formatRuleScopeSchema = z.enum([
  "import_local",
  "format_profile",
  "workspace_global"
]);

export const formatRuleStatusSchema = z.enum([
  "draft",
  "active",
  "disabled",
  "rejected"
]);

export const adjustmentEventTypeSchema = z.enum([
  "session_created",
  "clarification_requested",
  "preview_generated",
  "preview_failed",
  "rule_applied",
  "rule_disabled",
  "session_discarded"
]);

export const adjustmentSelectionSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  blockType: z.string(),
  lineEnd: z.number().int().positive().optional(),
  lineStart: z.number().int().positive().optional(),
  messageId: z.string(),
  messageIndex: z.number().int().nonnegative(),
  messageRole: z.string(),
  selectedText: z.string(),
  textQuote: z.string()
});

export const createAdjustmentSessionRequestSchema = z.object({
  selection: adjustmentSelectionSchema,
  targetFormat: adjustmentTargetFormatSchema
});

export const appendAdjustmentMessageRequestSchema = z.object({
  content: z.string().trim().min(1)
});

// --- Selector schemas ---

export const exactReaderSelectorSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  blockType: z.string(),
  messageId: z.string(),
  strategy: z.literal("exact").optional()
});

export const exactMarkdownSelectorSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  blockType: z.literal("markdown-lines"),
  lineEnd: z.number().int().positive(),
  lineStart: z.number().int().positive(),
  messageId: z.string(),
  strategy: z.literal("exact").optional()
});

export const blockTypeSelectorSchema = z.object({
  blockType: z.string(),
  strategy: z.literal("block_type")
});

export const readerPrefixSelectorSchema = z.object({
  blockType: z.string(),
  strategy: z.literal("prefix_before_colon")
});

export const markdownPrefixSelectorSchema = z.object({
  strategy: z.literal("prefix_before_colon")
});

export const markdownTableSelectorSchema = z.object({
  strategy: z.literal("markdown_table")
});

export const readerRuleSelectorSchema = z.union([
  exactReaderSelectorSchema,
  blockTypeSelectorSchema,
  readerPrefixSelectorSchema
]);

export const markdownRuleSelectorSchema = z.union([
  exactMarkdownSelectorSchema,
  markdownPrefixSelectorSchema,
  markdownTableSelectorSchema
]);

export const ruleSelectorSchema = z.union([
  readerRuleSelectorSchema,
  markdownRuleSelectorSchema
]);

// --- Effect schemas ---

export const adjustBlockSpacingEffectSchema = z.object({
  amount: z.enum(["sm", "md", "lg"]),
  direction: z.literal("after"),
  type: z.literal("adjust_block_spacing")
});

export const increaseHeadingEmphasisEffectSchema = z.object({
  amount: z.enum(["sm", "md", "lg"]),
  type: z.literal("increase_heading_emphasis")
});

export const refineBlockPresentationEffectSchema = z.object({
  emphasis: z.enum(["balanced", "subtle", "strong"]),
  type: z.literal("refine_selected_block_presentation")
});

export const boldPrefixEffectSchema = z.object({
  type: z.literal("bold_prefix_before_colon")
});

export const renderMarkdownStrongEffectSchema = z.object({
  type: z.literal("render_markdown_strong")
});

export const promoteToHeadingEffectSchema = z.object({
  level: z.number().int().min(1).max(6),
  type: z.literal("promote_to_heading")
});

export const normalizeListStructureEffectSchema = z.object({
  type: z.literal("normalize_list_structure")
});

export const normalizeMarkdownTableEffectSchema = z.object({
  type: z.literal("normalize_markdown_table")
});

export const reshapeMarkdownBlockEffectSchema = z.object({
  type: z.literal("reshape_markdown_block")
});

export const ruleEffectSchema = z.discriminatedUnion("type", [
  adjustBlockSpacingEffectSchema,
  increaseHeadingEmphasisEffectSchema,
  refineBlockPresentationEffectSchema,
  boldPrefixEffectSchema,
  renderMarkdownStrongEffectSchema,
  promoteToHeadingEffectSchema,
  normalizeListStructureEffectSchema,
  normalizeMarkdownTableEffectSchema,
  reshapeMarkdownBlockEffectSchema
]);

// --- Preview and rule schemas ---

export const adjustmentPreviewSchema = z.object({
  draftRule: z.object({
    effect: ruleEffectSchema,
    kind: formatRuleKindSchema,
    scope: formatRuleScopeSchema,
    selector: ruleSelectorSchema
  }),
  limitations: z.array(z.string()),
  rationale: z.string(),
  sessionId: z.string(),
  summary: z.string(),
  targetFormat: adjustmentTargetFormatSchema
});

export const adjustmentSessionSchema = z.object({
  id: z.string(),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  status: adjustmentSessionStatusSchema,
  selection: adjustmentSelectionSchema,
  previewArtifact: adjustmentPreviewSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const adjustmentMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: roleSchema,
  content: z.string(),
  createdAt: z.string()
});

export const adjustmentSessionDetailSchema = z.object({
  messages: z.array(adjustmentMessageSchema),
  session: adjustmentSessionSchema
});

export const applyAdjustmentSessionResponseSchema = z.object({
  rule: z.lazy(() => formatRuleSchema),
  session: adjustmentSessionSchema
});

export const formatRuleSchema = z.object({
  id: z.string(),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  kind: formatRuleKindSchema,
  scope: formatRuleScopeSchema,
  status: formatRuleStatusSchema,
  selector: ruleSelectorSchema,
  instruction: z.string(),
  compiledRule: ruleEffectSchema.optional(),
  sourceSessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const adjustmentMetricsSchema = z.object({
  counts: z.object({
    clarifications: z.number().int().nonnegative(),
    previewFailures: z.number().int().nonnegative(),
    previewsGenerated: z.number().int().nonnegative(),
    rulesApplied: z.number().int().nonnegative(),
    rulesDisabled: z.number().int().nonnegative(),
    sessionsCreated: z.number().int().nonnegative(),
    sessionsDiscarded: z.number().int().nonnegative()
  }),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  updatedAt: z.string().nullable()
});

export type AdjustmentTargetFormat = z.infer<typeof adjustmentTargetFormatSchema>;
export type AdjustmentSessionStatus = z.infer<typeof adjustmentSessionStatusSchema>;
export type FormatRuleKind = z.infer<typeof formatRuleKindSchema>;
export type FormatRuleScope = z.infer<typeof formatRuleScopeSchema>;
export type FormatRuleStatus = z.infer<typeof formatRuleStatusSchema>;
export type AdjustmentEventType = z.infer<typeof adjustmentEventTypeSchema>;
export type AdjustmentSelection = z.infer<typeof adjustmentSelectionSchema>;
export type CreateAdjustmentSessionRequest = z.infer<typeof createAdjustmentSessionRequestSchema>;
export type AppendAdjustmentMessageRequest = z.infer<typeof appendAdjustmentMessageRequestSchema>;
export type AdjustmentPreview = z.infer<typeof adjustmentPreviewSchema>;
export type AdjustmentSession = z.infer<typeof adjustmentSessionSchema>;
export type AdjustmentMessage = z.infer<typeof adjustmentMessageSchema>;
export type AdjustmentSessionDetail = z.infer<typeof adjustmentSessionDetailSchema>;
export type ApplyAdjustmentSessionResponse = z.infer<typeof applyAdjustmentSessionResponseSchema>;
export type FormatRule = z.infer<typeof formatRuleSchema>;
export type AdjustmentMetrics = z.infer<typeof adjustmentMetricsSchema>;
export type RuleSelector = z.infer<typeof ruleSelectorSchema>;
export type RuleEffect = z.infer<typeof ruleEffectSchema>;
