import { z } from "zod";

import { blockSchema, roleSchema } from "./conversation.js";

export const importSnapshotMetadataSchema = z.object({
  articleCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  rawHtmlBytes: z.number().int().nonnegative(),
});

export const normalizedSnapshotStructuringSchema = z.object({
  status: z.enum(["disabled", "skipped", "applied", "partial", "failed"]),
  provider: z.string(),
  model: z.string().optional(),
  candidateCount: z.number().int().nonnegative(),
  attemptedCount: z.number().int().nonnegative(),
  repairedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  skippedReason: z.string().optional(),
});

export const normalizedSnapshotParserSchema = z.object({
  source: z.string().optional(),
  blockCount: z.number().int().nonnegative().optional(),
  usedFallback: z.boolean().optional(),
  strategy: z.enum(["deterministic", "ai-repair", "fallback"]).optional(),
  model: z.string().optional(),
});

export const normalizedSnapshotMessageSchema = z.object({
  id: z.string(),
  role: roleSchema,
  blocks: z.array(blockSchema),
  rawText: z.string().optional(),
  rawHtml: z.string().optional(),
  parser: normalizedSnapshotParserSchema.optional(),
});

export const normalizedSnapshotPayloadSchema = z.object({
  title: z.string(),
  messages: z.array(normalizedSnapshotMessageSchema),
  warnings: z.array(z.string()),
  structuring: normalizedSnapshotStructuringSchema.optional(),
});

export const importSnapshotSchema = z.object({
  importId: z.string(),
  sourceUrl: z.string().url(),
  finalUrl: z.string().url(),
  fetchedAt: z.string(),
  pageTitle: z.string(),
  rawHtmlBytes: z.number().int().nonnegative(),
  rawHtmlPreview: z.string(),
  rawHtmlTruncated: z.boolean(),
  normalizedPayload: normalizedSnapshotPayloadSchema,
  fetchMetadata: importSnapshotMetadataSchema,
});

export type ImportSnapshot = z.infer<typeof importSnapshotSchema>;
export type ImportSnapshotMetadata = z.infer<
  typeof importSnapshotMetadataSchema
>;
export type NormalizedSnapshotMessage = z.infer<
  typeof normalizedSnapshotMessageSchema
>;
export type NormalizedSnapshotParser = z.infer<
  typeof normalizedSnapshotParserSchema
>;
export type NormalizedSnapshotPayload = z.infer<
  typeof normalizedSnapshotPayloadSchema
>;
export type NormalizedSnapshotStructuring = z.infer<
  typeof normalizedSnapshotStructuringSchema
>;
