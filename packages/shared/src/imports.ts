import { z } from "zod";

import { conversationSchema, sourcePlatformSchema } from "./conversation.js";

export const importModeSchema = z.enum(["archive", "handover"]);

export const importMethodSchema = z.enum(["share-link", "clipboard"]);
export type ImportMethod = z.infer<typeof importMethodSchema>;

export const importStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);

export const importStageSchema = z.enum([
  "validate",
  "fetch",
  "extract",
  "normalize",
  "structure",
  "render",
  "done",
]);

export const importRequestSchema = z.object({
  url: z.string().url(),
  mode: importModeSchema.default("archive"),
});

export const clipboardImportRequestSchema = z
  .object({
    html: z.string().optional(),
    plainText: z.string().optional(),
    mode: importModeSchema.default("archive"),
  })
  .refine((data) => data.html || data.plainText, {
    message: "Either html or plainText must be provided",
  });

export type ClipboardImportRequest = z.infer<
  typeof clipboardImportRequestSchema
>;

export const importArtifactsSchema = z.record(z.string(), z.string());

export const importJobSchema = z.object({
  id: z.string(),
  sourceUrl: z.string().url(),
  sourcePlatform: sourcePlatformSchema,
  mode: importModeSchema,
  importMethod: importMethodSchema.default("share-link"),
  status: importStatusSchema,
  currentStage: importStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional(),
  errorStage: importStageSchema.optional(),
  summary: z
    .object({
      messageCount: z.number().int().nonnegative(),
      transcriptWords: z.number().int().nonnegative(),
    })
    .optional(),
  conversation: conversationSchema.optional(),
  artifacts: importArtifactsSchema.optional(),
});

export type ImportMode = z.infer<typeof importModeSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportStage = z.infer<typeof importStageSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportArtifacts = z.infer<typeof importArtifactsSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;

export const importSummarySchema = z.object({
  id: z.string(),
  sourceUrl: z.string().url(),
  sourcePlatform: sourcePlatformSchema,
  mode: importModeSchema,
  importMethod: importMethodSchema.default("share-link"),
  status: importStatusSchema,
  currentStage: importStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional(),
  summary: z
    .object({
      messageCount: z.number().int().nonnegative(),
      transcriptWords: z.number().int().nonnegative(),
    })
    .optional(),
  pageTitle: z.string().optional(),
});

export type ImportSummary = z.infer<typeof importSummarySchema>;

export const importListRequestSchema = z.object({
  search: z.string().optional(),
  status: importStatusSchema.optional(),
  platform: sourcePlatformSchema.optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "sourcePlatform", "status"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ImportListRequest = z.infer<typeof importListRequestSchema>;
