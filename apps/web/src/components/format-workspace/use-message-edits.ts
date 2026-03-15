import type { Block } from "@chat-exporter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { orpc } from "@/lib/orpc";

const DEBOUNCE_MS = 500;

export function useMessageEdits(importId: string, snapshotId?: string) {
  const queryClient = useQueryClient();
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Ref tracks the latest snapshotId so that saveEdit/deleteEdit always read
  // the current value, even when called from a stale closure (e.g. after
  // ensureSnapshot() creates a new snapshot but before React re-renders).
  const snapshotIdRef = useRef(snapshotId);
  snapshotIdRef.current = snapshotId;
  // pendingTimerCount triggers re-renders when debounce timers are added or
  // removed so that hasPendingEdits reflects the current state synchronously.
  const [pendingTimerCount, setPendingTimerCount] = useState(0);

  // inFlightMutationCount tracks every active saveMutation.mutate() call
  // individually. useMutation.isPending only reflects the LATEST mutate() call,
  // so if two saves overlap (e.g. editing msg-1 and msg-2 rapidly), an older
  // in-flight save is invisible to isPending once a newer one starts. The
  // counter increments on each mutate() and decrements in onSettled, ensuring
  // hasPendingEdits stays true until every in-flight call has settled.
  const [inFlightMutationCount, setInFlightMutationCount] = useState(0);

  const editsQuery = useQuery({
    ...orpc.edits.listForSnapshot.queryOptions({
      input: { snapshotId: snapshotId as string },
    }),
    enabled: !!snapshotId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.edits.listForSnapshot.key(),
    });

  const saveMutation = useMutation(
    orpc.edits.save.mutationOptions({
      onSuccess: () => invalidate(),
      onSettled: () => setInFlightMutationCount((c) => c - 1),
    }),
  );

  const deleteMutation = useMutation(
    orpc.edits.delete.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  const editedMessagesMap = useMemo(() => {
    const map = new Map<string, Block[]>();
    if (!editsQuery.data) return map;
    for (const edit of editsQuery.data) {
      map.set(edit.messageId, edit.editedBlocks);
    }
    return map;
  }, [editsQuery.data]);

  const saveEdit = useCallback(
    (
      messageId: string,
      blocks: Block[],
      annotation?: string,
      snapshotIdOverride?: string,
    ) => {
      // Use explicit override (from ensureSnapshot result) or fall back to ref.
      const currentSnapshotId = snapshotIdOverride ?? snapshotIdRef.current;
      if (!currentSnapshotId) return;

      const existing = debounceTimers.current.get(messageId);
      if (existing) {
        clearTimeout(existing);
        // Timer is being replaced — count stays the same, no net change needed
      } else {
        // New timer being added
        setPendingTimerCount((c) => c + 1);
      }

      const timer = setTimeout(() => {
        // Re-read ref at fire time — snapshotId may have arrived between
        // scheduling and firing.
        const sid = snapshotIdRef.current;
        if (!sid) {
          debounceTimers.current.delete(messageId);
          setPendingTimerCount((c) => c - 1);
          return;
        }
        debounceTimers.current.delete(messageId);
        setPendingTimerCount((c) => c - 1);
        setInFlightMutationCount((c) => c + 1);
        saveMutation.mutate({
          importId,
          snapshotId: sid,
          messageId,
          editedBlocks: blocks,
          annotation,
        });
      }, DEBOUNCE_MS);

      debounceTimers.current.set(messageId, timer);
    },
    [importId, saveMutation.mutate],
  );

  const deleteEdit = useCallback(
    (messageId: string) => {
      const currentSnapshotId = snapshotIdRef.current;
      if (!currentSnapshotId) return;

      // Cancel any pending debounced save for this message
      const existing = debounceTimers.current.get(messageId);
      if (existing) {
        clearTimeout(existing);
        debounceTimers.current.delete(messageId);
        setPendingTimerCount((c) => c - 1);
      }

      return deleteMutation.mutateAsync({
        importId,
        snapshotId: currentSnapshotId,
        messageId,
      });
    },
    [importId, deleteMutation.mutateAsync],
  );

  return {
    edits: editsQuery.data ?? [],
    editedMessagesMap,
    isLoading: editsQuery.isLoading,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    hasPendingEdits: pendingTimerCount > 0 || inFlightMutationCount > 0,
    saveEdit,
    deleteEdit,
  };
}
