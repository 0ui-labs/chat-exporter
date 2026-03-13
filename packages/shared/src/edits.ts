import { z } from "zod";

import { blockSchema } from "./conversation.js";

// --- Entity Schemas (API-level representations) ---

export const conversationSnapshotSchema = z.object({
  id: z.string(),
  importId: z.string(),
  label: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const messageEditSchema = z.object({
  id: z.string(),
  importId: z.string(),
  snapshotId: z.string(),
  messageId: z.string(),
  annotation: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// --- Request Schemas ---

export const saveMessageEditRequestSchema = z.object({
  importId: z.string(),
  snapshotId: z.string(),
  messageId: z.string(),
  editedBlocks: z.array(blockSchema),
  annotation: z.string().optional(),
});

export const deleteMessageEditRequestSchema = z.object({
  importId: z.string(),
  snapshotId: z.string(),
  messageId: z.string(),
});

export const createSnapshotRequestSchema = z.object({
  importId: z.string(),
  label: z.string(),
});

export const activateSnapshotRequestSchema = z.object({
  snapshotId: z.string(),
});

export const renameSnapshotRequestSchema = z.object({
  snapshotId: z.string(),
  label: z.string(),
});

// --- Response Schemas ---

export const resolvedMessageSchema = z.object({
  messageId: z.string(),
  blocks: z.array(blockSchema),
  isEdited: z.boolean(),
});

// --- Inferred Types ---

export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
export type MessageEdit = z.infer<typeof messageEditSchema>;
export type SaveMessageEditRequest = z.infer<
  typeof saveMessageEditRequestSchema
>;
export type DeleteMessageEditRequest = z.infer<
  typeof deleteMessageEditRequestSchema
>;
export type CreateSnapshotRequest = z.infer<typeof createSnapshotRequestSchema>;
export type ActivateSnapshotRequest = z.infer<
  typeof activateSnapshotRequestSchema
>;
export type RenameSnapshotRequest = z.infer<typeof renameSnapshotRequestSchema>;
export type ResolvedMessage = z.infer<typeof resolvedMessageSchema>;
