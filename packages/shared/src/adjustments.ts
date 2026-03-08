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

export const adjustmentPreviewSchema = z.object({
  draftRule: z.object({
    effect: z.record(z.unknown()),
    kind: formatRuleKindSchema,
    scope: formatRuleScopeSchema,
    selector: z.record(z.unknown())
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

export const formatRuleSchema = z.object({
  id: z.string(),
  importId: z.string(),
  targetFormat: adjustmentTargetFormatSchema,
  kind: formatRuleKindSchema,
  scope: formatRuleScopeSchema,
  status: formatRuleStatusSchema,
  selector: z.unknown(),
  instruction: z.string(),
  compiledRule: z.unknown().optional(),
  sourceSessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type AdjustmentTargetFormat = z.infer<typeof adjustmentTargetFormatSchema>;
export type AdjustmentSessionStatus = z.infer<typeof adjustmentSessionStatusSchema>;
export type FormatRuleKind = z.infer<typeof formatRuleKindSchema>;
export type FormatRuleScope = z.infer<typeof formatRuleScopeSchema>;
export type FormatRuleStatus = z.infer<typeof formatRuleStatusSchema>;
export type AdjustmentSelection = z.infer<typeof adjustmentSelectionSchema>;
export type CreateAdjustmentSessionRequest = z.infer<typeof createAdjustmentSessionRequestSchema>;
export type AppendAdjustmentMessageRequest = z.infer<typeof appendAdjustmentMessageRequestSchema>;
export type AdjustmentPreview = z.infer<typeof adjustmentPreviewSchema>;
export type AdjustmentSession = z.infer<typeof adjustmentSessionSchema>;
export type AdjustmentMessage = z.infer<typeof adjustmentMessageSchema>;
export type AdjustmentSessionDetail = z.infer<typeof adjustmentSessionDetailSchema>;
export type FormatRule = z.infer<typeof formatRuleSchema>;
