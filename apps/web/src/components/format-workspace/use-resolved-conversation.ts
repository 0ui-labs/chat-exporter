import type { Block, Conversation, Role } from "@chat-exporter/shared";
import { useMemo } from "react";

export type ResolvedMessage = {
  id: string;
  role: Role;
  blocks: Block[];
  isEdited: boolean;
};

export function useResolvedConversation(
  conversation: Conversation | undefined,
  editedMessagesMap: Map<string, Block[]>,
): ResolvedMessage[] {
  return useMemo(() => {
    if (!conversation) return [];

    return conversation.messages.map((message) => {
      const editedBlocks = editedMessagesMap.get(message.id);
      return {
        id: message.id,
        role: message.role,
        blocks: editedBlocks ?? message.blocks,
        isEdited: editedBlocks !== undefined,
      };
    });
  }, [conversation, editedMessagesMap]);
}
