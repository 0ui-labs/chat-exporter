import type { Block, Conversation, FormatRule } from "@chat-exporter/shared";
import { ruleSelectorSchema } from "@chat-exporter/shared";

import { blockToPlainText } from "./reader-block-render";

export function matchesReaderRule(
  rule: FormatRule,
  messageId: string,
  blockIndex: number,
  blockType: Block["type"],
  blockText: string,
) {
  const parsed = ruleSelectorSchema.safeParse(rule.selector);

  if (!parsed.success) {
    return false;
  }

  const selector = parsed.data;

  if ("strategy" in selector && selector.strategy === "block_type") {
    return selector.blockType === blockType;
  }

  if ("strategy" in selector && selector.strategy === "prefix_before_colon") {
    return (
      "blockType" in selector &&
      selector.blockType === blockType &&
      /^([^:\n]{1,120}:)(\s*)(.*)$/.test(blockText)
    );
  }

  // exact match (strategy === "exact")
  return (
    "messageId" in selector &&
    selector.messageId === messageId &&
    "blockIndex" in selector &&
    selector.blockIndex === blockIndex &&
    "blockType" in selector &&
    selector.blockType === blockType
  );
}

export function getBlocksMatchingRule(
  rule: FormatRule,
  conversation: Conversation,
): Array<{ messageId: string; blockIndex: number }> {
  const matches: Array<{ messageId: string; blockIndex: number }> = [];

  for (const message of conversation.messages) {
    for (
      let blockIndex = 0;
      blockIndex < message.blocks.length;
      blockIndex += 1
    ) {
      const block = message.blocks[blockIndex];

      if (!block) {
        continue;
      }

      if (
        matchesReaderRule(
          rule,
          message.id,
          blockIndex,
          block.type,
          blockToPlainText(block),
        )
      ) {
        matches.push({ messageId: message.id, blockIndex });
      }
    }
  }

  return matches;
}
