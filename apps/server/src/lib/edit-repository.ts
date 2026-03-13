import { and, count, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import type { MessageEditRecord } from "../db/schema.js";
import { messageEdits } from "../db/schema.js";

export function saveMessageEdit(
  importId: string,
  snapshotId: string,
  messageId: string,
  editedBlocksJson: string,
  annotation?: string,
): MessageEditRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.insert(messageEdits)
    .values({
      id,
      importId,
      snapshotId,
      messageId,
      editedBlocksJson,
      annotation: annotation ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [messageEdits.snapshotId, messageEdits.messageId],
      set: {
        editedBlocksJson,
        annotation: annotation ?? null,
        updatedAt: now,
      },
    })
    .run();

  // Return the current state (may be the upserted row with a different id)
  const row = db
    .select()
    .from(messageEdits)
    .where(
      and(
        eq(messageEdits.snapshotId, snapshotId),
        eq(messageEdits.messageId, messageId),
      ),
    )
    .get();

  // Row is guaranteed to exist after the upsert above
  return row as MessageEditRecord;
}

export function getMessageEdit(
  snapshotId: string,
  messageId: string,
): MessageEditRecord | undefined {
  return db
    .select()
    .from(messageEdits)
    .where(
      and(
        eq(messageEdits.snapshotId, snapshotId),
        eq(messageEdits.messageId, messageId),
      ),
    )
    .get();
}

export function listMessageEdits(snapshotId: string): MessageEditRecord[] {
  return db
    .select()
    .from(messageEdits)
    .where(eq(messageEdits.snapshotId, snapshotId))
    .all();
}

export function deleteMessageEdit(
  snapshotId: string,
  messageId: string,
): boolean {
  const result = db
    .delete(messageEdits)
    .where(
      and(
        eq(messageEdits.snapshotId, snapshotId),
        eq(messageEdits.messageId, messageId),
      ),
    )
    .run();

  return result.changes > 0;
}

export function deleteAllEditsForSnapshot(snapshotId: string): number {
  const result = db
    .delete(messageEdits)
    .where(eq(messageEdits.snapshotId, snapshotId))
    .run();

  return result.changes;
}

export function countEdits(snapshotId: string): number {
  const row = db
    .select({ value: count() })
    .from(messageEdits)
    .where(eq(messageEdits.snapshotId, snapshotId))
    .get();

  return row?.value ?? 0;
}
