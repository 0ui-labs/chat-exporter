import { z } from "zod";

import { conversationSchema, sourcePlatformSchema } from "./conversation.js";

export const importModeSchema = z.enum(["archive", "handover"]);

export const importStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed"
]);

export const importStageSchema = z.enum([
  "validate",
  "fetch",
  "extract",
  "normalize",
  "structure",
  "render",
  "done"
]);

export const importRequestSchema = z.object({
  url: z.string().url(),
  mode: importModeSchema.default("archive")
});

export const importArtifactsSchema = z.object({
  markdown: z.string(),
  handover: z.string(),
  json: z.string()
});

export const importJobSchema = z.object({
  id: z.string(),
  sourceUrl: z.string().url(),
  sourcePlatform: sourcePlatformSchema,
  mode: importModeSchema,
  status: importStatusSchema,
  currentStage: importStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional(),
  summary: z
    .object({
      messageCount: z.number().int().nonnegative(),
      transcriptWords: z.number().int().nonnegative()
    })
    .optional(),
  conversation: conversationSchema.optional(),
  artifacts: importArtifactsSchema.optional()
});

export type ImportMode = z.infer<typeof importModeSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportStage = z.infer<typeof importStageSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportArtifacts = z.infer<typeof importArtifactsSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
