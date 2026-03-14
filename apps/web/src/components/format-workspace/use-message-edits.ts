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
  // pendingTimerCount triggers re-renders when debounce timers are added or
  // removed so that hasPendingEdits reflects the current state synchronously.
  const [pendingTimerCount, setPendingTimerCount] = useState(0);

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
    (messageId: string, blocks: Block[], annotation?: string) => {
      if (!snapshotId) return;

      const existing = debounceTimers.current.get(messageId);
      if (existing) {
        clearTimeout(existing);
        // Timer is being replaced — count stays the same, no net change needed
      } else {
        // New timer being added
        setPendingTimerCount((c) => c + 1);
      }

      const timer = setTimeout(() => {
        debounceTimers.current.delete(messageId);
        setPendingTimerCount((c) => c - 1);
        saveMutation.mutate({
          importId,
          snapshotId,
          messageId,
          editedBlocks: blocks,
          annotation,
        });
      }, DEBOUNCE_MS);

      debounceTimers.current.set(messageId, timer);
    },
    [importId, snapshotId, saveMutation.mutate],
  );

  const deleteEdit = useCallback(
    (messageId: string) => {
      if (!snapshotId) return;

      // Cancel any pending debounced save for this message
      const existing = debounceTimers.current.get(messageId);
      if (existing) {
        clearTimeout(existing);
        debounceTimers.current.delete(messageId);
        setPendingTimerCount((c) => c - 1);
      }

      return deleteMutation.mutateAsync({
        importId,
        snapshotId,
        messageId,
      });
    },
    [importId, snapshotId, deleteMutation.mutateAsync],
  );

  return {
    edits: editsQuery.data ?? [],
    editedMessagesMap,
    isLoading: editsQuery.isLoading,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    hasPendingEdits: pendingTimerCount > 0 || saveMutation.isPending,
    saveEdit,
    deleteEdit,
  };
}
