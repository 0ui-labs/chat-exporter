import type { MessageDeletion } from "@chat-exporter/shared";
import { and, eq } from "drizzle-orm";
import { db, withTransaction } from "../db/client.js";
import { imports, messageDeletions } from "../db/schema.js";

export function listDeletions(importId: string): MessageDeletion[] {
  const rows = db
    .select()
    .from(messageDeletions)
    .where(eq(messageDeletions.importId, importId))
    .all();

  return rows.map((r) => ({
    id: r.id,
    importId: r.importId,
    messageId: r.messageId,
    reason: r.reason ?? undefined,
    deletedAt: r.deletedAt,
  }));
}

export function softDeleteMessage(
  importId: string,
  messageId: string,
  reason?: string,
): MessageDeletion {
  const id = crypto.randomUUID();
  const deletedAt = new Date().toISOString();

  db.insert(messageDeletions)
    .values({ id, importId, messageId, reason: reason ?? null, deletedAt })
    .run();

  return { id, importId, messageId, reason, deletedAt };
}

export function softDeleteRound(
  importId: string,
  userMessageId: string,
  reason?: string,
): MessageDeletion[] {
  const row = db
    .select({ conversationJson: imports.conversationJson })
    .from(imports)
    .where(eq(imports.id, importId))
    .get();

  if (!row?.conversationJson) {
    throw new Error("Import oder Conversation nicht gefunden.");
  }

  const conversation = JSON.parse(row.conversationJson);
  const messages: Array<{ id: string; role: string }> = conversation.messages;

  const userIdx = messages.findIndex((m) => m.id === userMessageId);
  if (userIdx === -1) {
    throw new Error("User-Message nicht gefunden.");
  }

  // Collect user message + all following non-user messages (the "round")
  const roundMessageIds = [userMessageId];
  for (let i = userIdx + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || msg.role === "user") break;
    roundMessageIds.push(msg.id);
  }

  return withTransaction(() => {
    const deletions: MessageDeletion[] = [];
    for (const msgId of roundMessageIds) {
      // Skip if already deleted (unique constraint)
      const existing = db
        .select()
        .from(messageDeletions)
        .where(
          and(
            eq(messageDeletions.importId, importId),
            eq(messageDeletions.messageId, msgId),
          ),
        )
        .get();

      if (!existing) {
        deletions.push(softDeleteMessage(importId, msgId, reason));
      }
    }
    return deletions;
  });
}

export function restoreMessage(importId: string, messageId: string): boolean {
  const result = db
    .delete(messageDeletions)
    .where(
      and(
        eq(messageDeletions.importId, importId),
        eq(messageDeletions.messageId, messageId),
      ),
    )
    .run();

  return result.changes > 0;
}

export function isMessageDeleted(importId: string, messageId: string): boolean {
  const row = db
    .select()
    .from(messageDeletions)
    .where(
      and(
        eq(messageDeletions.importId, importId),
        eq(messageDeletions.messageId, messageId),
      ),
    )
    .get();

  return !!row;
}
