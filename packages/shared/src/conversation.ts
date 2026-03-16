import { nanoid } from "nanoid";
import { z } from "zod";

export const generateBlockId = () => nanoid(8);

const blockIdField = { id: z.string().default(() => nanoid(8)) };

export const sourcePlatformSchema = z.enum([
  "chatgpt",
  "claude",
  "gemini",
  "grok",
  "deepseek",
  "notebooklm",
  "aistudio",
  "perplexity",
  "lechat",
  "kimi",
  "unknown",
]);

export const roleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
  "unknown",
]);

export const paragraphBlockSchema = z
  .object({
    type: z.literal("paragraph"),
    text: z.string(),
  })
  .extend(blockIdField);

export const headingBlockSchema = z
  .object({
    type: z.literal("heading"),
    level: z.number().int().min(1).max(6),
    text: z.string(),
  })
  .extend(blockIdField);

export const listBlockSchema = z
  .object({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.string()),
  })
  .extend(blockIdField);

export const codeBlockSchema = z
  .object({
    type: z.literal("code"),
    language: z.string().default("text"),
    text: z.string(),
  })
  .extend(blockIdField);

export const quoteBlockSchema = z
  .object({
    type: z.literal("quote"),
    text: z.string(),
  })
  .extend(blockIdField);

export const tableBlockSchema = z
  .object({
    type: z.literal("table"),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  })
  .extend(blockIdField);

export const blockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  listBlockSchema,
  codeBlockSchema,
  quoteBlockSchema,
  tableBlockSchema,
]);

export const messageSchema = z.object({
  id: z.string(),
  role: roleSchema,
  blocks: z.array(blockSchema),
});

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.object({
    url: z.string().url(),
    platform: sourcePlatformSchema,
  }),
  messages: z.array(messageSchema),
});

export type SourcePlatform = z.infer<typeof sourcePlatformSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
