import { z } from "zod";

export const messageDeletionSchema = z.object({
  id: z.string(),
  importId: z.string(),
  messageId: z.string(),
  reason: z.string().optional(),
  deletedAt: z.string(),
});

export const deleteMessageRequestSchema = z.object({
  importId: z.string(),
  messageId: z.string(),
  reason: z.string().optional(),
});

export const deleteRoundRequestSchema = z.object({
  importId: z.string(),
  messageId: z.string(), // ID der User-Message, die den Round startet
  reason: z.string().optional(),
});

export const restoreMessageRequestSchema = z.object({
  importId: z.string(),
  messageId: z.string(),
});

export type MessageDeletion = z.infer<typeof messageDeletionSchema>;
export type DeleteMessageRequest = z.infer<typeof deleteMessageRequestSchema>;
export type DeleteRoundRequest = z.infer<typeof deleteRoundRequestSchema>;
export type RestoreMessageRequest = z.infer<typeof restoreMessageRequestSchema>;
