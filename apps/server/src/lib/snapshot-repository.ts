import type { ConversationSnapshot } from "@chat-exporter/shared";
import { and, eq } from "drizzle-orm";
import { db, withTransaction } from "../db/client.js";
import { conversationSnapshots } from "../db/schema.js";

type SnapshotRow = typeof conversationSnapshots.$inferSelect;

function toApiSnapshot(row: SnapshotRow): ConversationSnapshot {
  return {
    id: row.id,
    importId: row.importId,
    label: row.label,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSnapshot(
  importId: string,
  label: string,
): ConversationSnapshot {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(conversationSnapshots)
    .values({
      id,
      importId,
      label,
      isActive: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    importId,
    label,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function listSnapshots(importId: string): ConversationSnapshot[] {
  const rows = db
    .select()
    .from(conversationSnapshots)
    .where(eq(conversationSnapshots.importId, importId))
    .orderBy(conversationSnapshots.createdAt)
    .all();

  return rows.map(toApiSnapshot);
}

export function getSnapshotById(
  snapshotId: string,
): ConversationSnapshot | null {
  const row = db
    .select()
    .from(conversationSnapshots)
    .where(eq(conversationSnapshots.id, snapshotId))
    .get();

  return row ? toApiSnapshot(row) : null;
}

export function getActiveSnapshot(
  importId: string,
): ConversationSnapshot | null {
  const row = db
    .select()
    .from(conversationSnapshots)
    .where(eq(conversationSnapshots.importId, importId))
    .all()
    .find((r) => r.isActive === 1);

  return row ? toApiSnapshot(row) : null;
}

export function activateSnapshot(
  snapshotId: string,
  importId: string,
): ConversationSnapshot {
  return withTransaction(() => {
    const snapshot = db
      .select()
      .from(conversationSnapshots)
      .where(eq(conversationSnapshots.id, snapshotId))
      .get();

    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    if (snapshot.importId !== importId) {
      throw new Error(
        `Snapshot ${snapshotId} does not belong to import ${importId}`,
      );
    }

    const now = new Date().toISOString();

    // Deactivate all snapshots of the same import
    db.update(conversationSnapshots)
      .set({ isActive: 0, updatedAt: now })
      .where(eq(conversationSnapshots.importId, snapshot.importId))
      .run();

    // Activate this snapshot
    db.update(conversationSnapshots)
      .set({ isActive: 1, updatedAt: now })
      .where(eq(conversationSnapshots.id, snapshotId))
      .run();

    const updated = db
      .select()
      .from(conversationSnapshots)
      .where(eq(conversationSnapshots.id, snapshotId))
      .get();

    if (!updated) {
      throw new Error(`Snapshot not found after activation: ${snapshotId}`);
    }

    return toApiSnapshot(updated);
  });
}

export function deactivateAllSnapshots(importId: string): void {
  withTransaction(() => {
    const now = new Date().toISOString();
    db.update(conversationSnapshots)
      .set({ isActive: 0, updatedAt: now })
      .where(eq(conversationSnapshots.importId, importId))
      .run();
  });
}

export function deleteSnapshot(snapshotId: string, importId: string): boolean {
  // Only delete the snapshot if it belongs to the specified import
  const result = db
    .delete(conversationSnapshots)
    .where(
      and(
        eq(conversationSnapshots.id, snapshotId),
        eq(conversationSnapshots.importId, importId),
      ),
    )
    .run();

  return result.changes > 0;
}

export function renameSnapshot(
  snapshotId: string,
  importId: string,
  label: string,
): ConversationSnapshot {
  // Verify the snapshot belongs to the specified import before renaming
  const existing = db
    .select()
    .from(conversationSnapshots)
    .where(eq(conversationSnapshots.id, snapshotId))
    .get();

  if (!existing) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  if (existing.importId !== importId) {
    throw new Error(
      `Snapshot ${snapshotId} does not belong to import ${importId}`,
    );
  }

  const now = new Date().toISOString();

  db.update(conversationSnapshots)
    .set({ label, updatedAt: now })
    .where(eq(conversationSnapshots.id, snapshotId))
    .run();

  const updated = db
    .select()
    .from(conversationSnapshots)
    .where(eq(conversationSnapshots.id, snapshotId))
    .get();

  if (!updated) {
    throw new Error(`Snapshot not found after rename: ${snapshotId}`);
  }

  return toApiSnapshot(updated);
}
