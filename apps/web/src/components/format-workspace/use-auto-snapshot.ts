import type { ConversationSnapshot } from "@chat-exporter/shared";
import { useCallback, useRef } from "react";

type UseAutoSnapshotOptions = {
  activeSnapshot: ConversationSnapshot | null;
  create: (label: string) => Promise<ConversationSnapshot>;
  activate: (snapshotId: string) => Promise<unknown>;
};

/**
 * Ensures a snapshot exists and is active before an edit is saved.
 * On the first edit (when no snapshot is active), automatically creates
 * a "Bearbeitet" snapshot and activates it.
 */
export function useAutoSnapshot({
  activeSnapshot,
  create,
  activate,
}: UseAutoSnapshotOptions) {
  const creatingRef = useRef(false);

  const ensureSnapshot = useCallback(async (): Promise<boolean> => {
    if (activeSnapshot) return true;
    if (creatingRef.current) return true;

    creatingRef.current = true;
    try {
      const snapshot = await create("Bearbeitet");
      await activate(snapshot.id);
      return true;
    } catch {
      return false;
    } finally {
      creatingRef.current = false;
    }
  }, [activeSnapshot, create, activate]);

  return { ensureSnapshot };
}
