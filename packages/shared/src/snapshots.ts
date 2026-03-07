import { z } from "zod";

export const importSnapshotMetadataSchema = z.object({
  articleCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  rawHtmlBytes: z.number().int().nonnegative()
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
  normalizedPayload: z.unknown(),
  fetchMetadata: importSnapshotMetadataSchema
});

export type ImportSnapshot = z.infer<typeof importSnapshotSchema>;
export type ImportSnapshotMetadata = z.infer<typeof importSnapshotMetadataSchema>;
