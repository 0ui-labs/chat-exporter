import { z } from "zod";

import { roleSchema } from "./conversation.js";

export const adjustmentTargetFormatSchema = z.enum([
  "reader",
  "markdown",
  "handover",
  "json",
  "html",
  "rich_text",
  "clipboard_html",
]);

export const adjustmentSessionStatusSchema = z.enum([
  "open",
  "applied",
  "discarded",
  "failed",
]);

export const formatRuleKindSchema = z.enum([
  "structure",
  "inline_semantics",
  "render",
  "export_profile",
  "clipboard",
]);

export const formatRuleScopeSchema = z.enum([
  "import_local",
  "format_profile",
  "workspace_global",
]);

export const formatRuleStatusSchema = z.enum([
  "draft",
  "active",
  "disabled",
  "rejected",
]);

export const adjustmentEventTypeSchema = z.enum([
  "session_created",
  "clarification_requested",
  "preview_generated",
  "preview_failed",
  "rule_applied",
  "rule_disabled",
  "rule_promoted",
  "session_discarded",
  "message_deleted",
  "round_deleted",
  "message_restored",
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
  textQuote: z.string(),
});

export const createAdjustmentSessionRequestSchema = z.object({
  selection: adjustmentSelectionSchema,
  targetFormat: adjustmentTargetFormatSchema,
});

export const appendAdjustmentMessageRequestSchema = z.object({
  content: z.string().trim().min(1),
});

// --- Selector schemas ---

export const exactReaderSelectorSchema = z
  .object({
    blockIndex: z.number().int().nonnegative(),
    blockType: z.string(),
    messageId: z.string(),
    strategy: z.literal("exact"),
  })
  .strict();

export const exactMarkdownSelectorSchema = z
  .object({
    blockIndex: z.number().int().nonnegative(),
    blockType: z.literal("markdown-lines"),
    lineEnd: z.number().int().positive(),
    lineStart: z.number().int().positive(),
    messageId: z.string(),
    strategy: z.literal("exact"),
  })
  .strict();

export const blockTypeSelectorSchema = z
  .object({
    blockType: z.string(),
    strategy: z.literal("block_type"),
  })
  .strict();

export const readerPrefixSelectorSchema = z
  .object({
    blockType: z.string(),
    strategy: z.literal("prefix_before_colon"),
  })
  .strict();

export const markdownPrefixSelectorSchema = z
  .object({
    strategy: z.literal("prefix_before_colon"),
  })
  .strict();

export const markdownTableSelectorSchema = z
  .object({
    strategy: z.literal("markdown_table"),
  })
  .strict();

export const compoundContextSiblingSchema = z.object({
  blockType: z.string().optional(),
  headingLevel: z.number().int().min(1).max(6).optional(),
  textPattern: z.string().optional(),
});

export const compoundSelectorSchema = z.object({
  strategy: z.literal("compound"),
  blockType: z.string().optional(),
  messageRole: z.enum(["user", "assistant", "system", "tool"]).optional(),
  headingLevel: z.number().int().min(1).max(6).optional(),
  position: z.enum(["first", "last"]).optional(),
  textPattern: z.string().optional(),
  context: z
    .object({
      previousSibling: compoundContextSiblingSchema.optional(),
      nextSibling: compoundContextSiblingSchema.optional(),
    })
    .optional(),
});

export const readerRuleSelectorSchema = z.union([
  exactReaderSelectorSchema,
  blockTypeSelectorSchema,
  readerPrefixSelectorSchema,
  compoundSelectorSchema,
]);

export const markdownRuleSelectorSchema = z.union([
  exactMarkdownSelectorSchema,
  markdownPrefixSelectorSchema,
  markdownTableSelectorSchema,
]);

export const ruleSelectorSchema = z.union([
  readerRuleSelectorSchema,
  markdownRuleSelectorSchema,
]);

// --- Effect schemas ---

export const adjustBlockSpacingEffectSchema = z.object({
  amount: z.enum(["sm", "md", "lg"]),
  direction: z.literal("after"),
  type: z.literal("adjust_block_spacing"),
});

export const increaseHeadingEmphasisEffectSchema = z.object({
  amount: z.enum(["sm", "md", "lg"]),
  type: z.literal("increase_heading_emphasis"),
});

export const refineBlockPresentationEffectSchema = z.object({
  emphasis: z.enum(["balanced", "subtle", "strong"]),
  type: z.literal("refine_selected_block_presentation"),
});

export const boldPrefixEffectSchema = z.object({
  type: z.literal("bold_prefix_before_colon"),
});

export const renderMarkdownStrongEffectSchema = z.object({
  type: z.literal("render_markdown_strong"),
});

export const promoteToHeadingEffectSchema = z.object({
  level: z.number().int().min(1).max(6),
  type: z.literal("promote_to_heading"),
});

export const normalizeListStructureEffectSchema = z.object({
  type: z.literal("normalize_list_structure"),
});

export const normalizeMarkdownTableEffectSchema = z.object({
  type: z.literal("normalize_markdown_table"),
});

export const reshapeMarkdownBlockEffectSchema = z.object({
  type: z.literal("reshape_markdown_block"),
});

export const customStyleEffectSchema = z.object({
  type: z.literal("custom_style"),
  /** CSS properties applied to the block container element (React style object). */
  containerStyle: z.record(z.string()).optional(),
  /** CSS properties applied to child items (list items, table cells, etc.). */
  itemStyle: z.record(z.string()).optional(),
  /** CSS properties applied to text elements within the block. */
  textStyle: z.record(z.string()).optional(),
  /** Optional text rendering transformation. */
  textTransform: z
    .enum(["bold_prefix_before_colon", "render_markdown_strong"])
    .nullish(),
  /** For markdown view: structural text transformation to apply. */
  markdownTransform: z
    .enum([
      "promote_to_heading",
      "normalize_list_structure",
      "normalize_markdown_table",
      "reshape_markdown_block",
      "bold_prefix_before_colon",
    ])
    .nullish(),
  /** Human-readable description of the visual change. */
  description: z.string().optional(),
  /** Override heading level (1-6) for heading blocks. */
  headingLevel: z.number().int().min(1).max(6).optional(),
  /** Insert an element before the block. */
  insertBefore: z.enum(["hr", "spacer"]).nullish(),
  /** Insert an element after the block. */
  insertAfter: z.enum(["hr", "spacer"]).nullish(),
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
  reshapeMarkdownBlockEffectSchema,
  customStyleEffectSchema,
]);

// --- Session and rule schemas ---

export const adjustmentSessionSchema = z.object({
  id: z.string(),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  status: adjustmentSessionStatusSchema,
  selection: adjustmentSelectionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adjustmentMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: roleSchema,
  content: z.string(),
  createdAt: z.string(),
});

export const adjustmentSessionDetailSchema = z.object({
  messages: z.array(adjustmentMessageSchema),
  session: adjustmentSessionSchema,
});

export const formatRuleSchema = z.object({
  id: z.string(),
  importId: z.string().nullable(),
  targetFormat: adjustmentTargetFormatSchema,
  kind: formatRuleKindSchema,
  scope: formatRuleScopeSchema,
  status: formatRuleStatusSchema,
  selector: ruleSelectorSchema,
  instruction: z.string(),
  compiledRule: ruleEffectSchema.optional(),
  sourceSessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adjustmentMetricsSchema = z.object({
  counts: z.object({
    clarifications: z.number().int().nonnegative(),
    previewFailures: z.number().int().nonnegative(),
    previewsGenerated: z.number().int().nonnegative(),
    rulesApplied: z.number().int().nonnegative(),
    rulesDisabled: z.number().int().nonnegative(),
    sessionsCreated: z.number().int().nonnegative(),
    sessionsDiscarded: z.number().int().nonnegative(),
  }),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  updatedAt: z.string().nullable(),
});

export type AdjustmentTargetFormat = z.infer<
  typeof adjustmentTargetFormatSchema
>;
export type AdjustmentSessionStatus = z.infer<
  typeof adjustmentSessionStatusSchema
>;
export type FormatRuleKind = z.infer<typeof formatRuleKindSchema>;
export type FormatRuleScope = z.infer<typeof formatRuleScopeSchema>;
export type FormatRuleStatus = z.infer<typeof formatRuleStatusSchema>;
export type AdjustmentEventType = z.infer<typeof adjustmentEventTypeSchema>;
export type AdjustmentSelection = z.infer<typeof adjustmentSelectionSchema>;
export type CreateAdjustmentSessionRequest = z.infer<
  typeof createAdjustmentSessionRequestSchema
>;
export type AppendAdjustmentMessageRequest = z.infer<
  typeof appendAdjustmentMessageRequestSchema
>;
export type AdjustmentSession = z.infer<typeof adjustmentSessionSchema>;
export type AdjustmentMessage = z.infer<typeof adjustmentMessageSchema>;
export type AdjustmentSessionDetail = z.infer<
  typeof adjustmentSessionDetailSchema
>;
export type FormatRule = z.infer<typeof formatRuleSchema>;
export type AdjustmentMetrics = z.infer<typeof adjustmentMetricsSchema>;
export type RuleSelector = z.infer<typeof ruleSelectorSchema>;
export type RuleEffect = z.infer<typeof ruleEffectSchema>;
export type CustomStyleEffect = z.infer<typeof customStyleEffectSchema>;
export type CompoundSelector = z.infer<typeof compoundSelectorSchema>;
export type CompoundContextSibling = z.infer<
  typeof compoundContextSiblingSchema
>;

/**
 * Converts legacy effect types into a unified `custom_style` effect.
 * Already-`custom_style` effects are returned as-is.
 */
export function normalizeLegacyEffect(effect: RuleEffect): CustomStyleEffect {
  if (effect.type === "custom_style") {
    return effect;
  }

  switch (effect.type) {
    case "adjust_block_spacing":
      return {
        type: "custom_style",
        containerStyle: {
          marginBottom:
            effect.amount === "lg"
              ? "2rem"
              : effect.amount === "md"
                ? "1.5rem"
                : "1rem",
        },
      };
    case "increase_heading_emphasis":
      return {
        type: "custom_style",
        textStyle: {
          fontSize:
            effect.amount === "lg"
              ? "1.25rem"
              : effect.amount === "md"
                ? "1.125rem"
                : "1rem",
          fontWeight: "600",
        },
      };
    case "refine_selected_block_presentation":
      return {
        type: "custom_style",
        containerStyle: {
          backgroundColor: "hsl(var(--accent) / 0.08)",
          padding: "0.5rem",
        },
      };
    case "bold_prefix_before_colon":
      return {
        type: "custom_style",
        textTransform: "bold_prefix_before_colon",
        markdownTransform: "bold_prefix_before_colon",
      };
    case "render_markdown_strong":
      return {
        type: "custom_style",
        textTransform: "render_markdown_strong",
      };
    case "promote_to_heading":
      return {
        type: "custom_style",
        markdownTransform: "promote_to_heading",
        headingLevel: effect.level,
      };
    case "normalize_list_structure":
      return {
        type: "custom_style",
        markdownTransform: "normalize_list_structure",
      };
    case "normalize_markdown_table":
      return {
        type: "custom_style",
        markdownTransform: "normalize_markdown_table",
      };
    case "reshape_markdown_block":
      return {
        type: "custom_style",
        markdownTransform: "reshape_markdown_block",
      };
  }
}
