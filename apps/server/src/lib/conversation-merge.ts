import type { Block, Conversation } from "@chat-exporter/shared";

export interface MessageEditEntry {
  messageId: string;
  editedBlocksJson: string;
}

/**
 * Merges message edits into a conversation, returning a new Conversation
 * with edited blocks replacing the originals. Does not mutate the input.
 *
 * When duplicate messageIds exist in edits, the last entry wins.
 */
export function mergeEditsIntoConversation(
  conversation: Conversation,
  edits: MessageEditEntry[],
): Conversation {
  if (edits.length === 0) return conversation;

  const editMap = new Map<string, Block[]>();
  for (const edit of edits) {
    editMap.set(edit.messageId, JSON.parse(edit.editedBlocksJson));
  }

  return {
    ...conversation,
    messages: conversation.messages.map((msg) => {
      const editedBlocks = editMap.get(msg.id);
      if (editedBlocks) {
        return { ...msg, blocks: editedBlocks };
      }
      return msg;
    }),
  };
}
