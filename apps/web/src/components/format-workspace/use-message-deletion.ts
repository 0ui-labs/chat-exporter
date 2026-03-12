import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { orpc } from "@/lib/orpc";
import { rpc } from "@/lib/rpc";

export function useMessageDeletion(importId: string) {
  const queryClient = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);

  const deletionsQuery = useQuery({
    ...orpc.deletions.list.queryOptions({ input: { importId } }),
  });

  const deletedMessageIds = useMemo(
    () => new Set(deletionsQuery.data?.map((d) => d.messageId)),
    [deletionsQuery.data],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: orpc.deletions.list.key() });
  }, [queryClient]);

  const deleteMessage = useCallback(
    async (messageId: string, reason?: string) => {
      const result = await rpc.deletions.delete({
        importId,
        messageId,
        reason,
      });
      invalidate();
      return result;
    },
    [importId, invalidate],
  );

  const deleteRound = useCallback(
    async (messageId: string, reason?: string) => {
      const result = await rpc.deletions.deleteRound({
        importId,
        messageId,
        reason,
      });
      invalidate();
      return result;
    },
    [importId, invalidate],
  );

  const restoreMessage = useCallback(
    async (messageId: string) => {
      const result = await rpc.deletions.restore({ importId, messageId });
      invalidate();
      return result;
    },
    [importId, invalidate],
  );

  return {
    deletedMessageIds,
    deletionsCount: deletedMessageIds.size,
    isLoading: deletionsQuery.isLoading,
    showDeleted,
    setShowDeleted,
    deleteMessage,
    deleteRound,
    restoreMessage,
  };
}
