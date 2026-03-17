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
 *
 * Concurrent calls are safe: if creation is already in-flight, subsequent
 * callers await the same Promise rather than returning true prematurely.
 */
export function useAutoSnapshot({
  activeSnapshot,
  create,
  activate,
}: UseAutoSnapshotOptions) {
  const creatingPromiseRef = useRef<Promise<string | false> | null>(null);

  const ensureSnapshot = useCallback(async (): Promise<string | false> => {
    if (activeSnapshot) return activeSnapshot.id;

    // If creation is already in-flight, wait for the same Promise.
    // This prevents the race condition where a concurrent caller would return
    // before activate() completes, leaving snapshotId undefined in the
    // caller and causing saveEdit to silently discard the edit.
    if (creatingPromiseRef.current) return creatingPromiseRef.current;

    const promise = (async () => {
      try {
        const snapshot = await create("Bearbeitet");
        await activate(snapshot.id);
        return snapshot.id;
      } catch {
        return false as const;
      } finally {
        creatingPromiseRef.current = null;
      }
    })();

    creatingPromiseRef.current = promise;
    return promise;
  }, [activeSnapshot, create, activate]);

  return { ensureSnapshot };
}
