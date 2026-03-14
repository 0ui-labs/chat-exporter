import type { ConversationSnapshot } from "@chat-exporter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/lib/orpc";

export function useSnapshots(importId: string) {
  const queryClient = useQueryClient();

  const snapshotsQuery = useQuery({
    ...orpc.snapshots.list.queryOptions({ input: { importId } }),
  });

  const snapshots: ConversationSnapshot[] = snapshotsQuery.data ?? [];

  const activeSnapshot = useMemo(
    () => snapshots.find((s) => s.isActive) ?? null,
    [snapshots],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.snapshots.list.key() });

  const createSnapshot = useMutation(
    orpc.snapshots.create.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  const activateSnapshot = useMutation(
    orpc.snapshots.activate.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  const deactivateSnapshot = useMutation(
    orpc.snapshots.deactivate.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  const deleteSnapshot = useMutation(
    orpc.snapshots.delete.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  const renameSnapshot = useMutation(
    orpc.snapshots.rename.mutationOptions({
      onSuccess: () => invalidate(),
    }),
  );

  return {
    snapshots,
    activeSnapshot,
    isLoading: snapshotsQuery.isLoading,
    create: (label: string) => createSnapshot.mutateAsync({ importId, label }),
    activate: (snapshotId: string) =>
      activateSnapshot.mutateAsync({ importId, snapshotId }),
    deactivate: () => deactivateSnapshot.mutateAsync({ importId }),
    delete: (snapshotId: string) =>
      deleteSnapshot.mutateAsync({ importId, snapshotId }),
    rename: (snapshotId: string, label: string) =>
      renameSnapshot.mutateAsync({ importId, snapshotId, label }),
    isCreating: createSnapshot.isPending,
    isActivating: activateSnapshot.isPending,
    isDeactivating: deactivateSnapshot.isPending,
    isDeleting: deleteSnapshot.isPending,
    isRenaming: renameSnapshot.isPending,
  };
}
