import type {
  Block,
  CompoundContextSibling,
  CompoundSelector,
  Conversation,
  FormatRule,
} from "@chat-exporter/shared";
import { ruleSelectorSchema } from "@chat-exporter/shared";

import { blockToPlainText } from "./reader-block-render";

export type ReaderMatchContext = {
  messageRole: string;
  blocks: Block[];
};

export function matchesReaderRule(
  rule: FormatRule,
  messageId: string,
  blockIndex: number,
  blockType: Block["type"],
  blockText: string,
  context?: ReaderMatchContext,
  blockId?: string,
) {
  const parsed = ruleSelectorSchema.safeParse(rule.selector);

  if (!parsed.success) {
    return false;
  }

  const selector = parsed.data;

  if ("strategy" in selector && selector.strategy === "compound") {
    return matchesCompoundSelector(
      selector,
      blockType,
      blockText,
      blockIndex,
      context,
    );
  }

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
  // Prefer blockId match when available; fall back to blockIndex for legacy rules
  const blockMatch =
    "blockId" in selector && selector.blockId && blockId
      ? selector.blockId === blockId
      : "blockIndex" in selector && selector.blockIndex === blockIndex;

  return (
    "messageId" in selector &&
    selector.messageId === messageId &&
    blockMatch &&
    "blockType" in selector &&
    selector.blockType === blockType
  );
}

function matchesCompoundSelector(
  selector: CompoundSelector,
  blockType: Block["type"],
  blockText: string,
  blockIndex: number,
  context?: ReaderMatchContext,
): boolean {
  if (selector.blockType !== undefined && selector.blockType !== blockType) {
    return false;
  }

  if (selector.messageRole !== undefined) {
    if (context === undefined || selector.messageRole !== context.messageRole) {
      return false;
    }
  }

  if (selector.headingLevel !== undefined) {
    if (blockType !== "heading") {
      return false;
    }
    if (context !== undefined) {
      const block = context.blocks[blockIndex];
      if (
        block === undefined ||
        block.type !== "heading" ||
        block.level !== selector.headingLevel
      ) {
        return false;
      }
    }
  }

  if (selector.position !== undefined && context !== undefined) {
    if (selector.position === "first" && blockIndex !== 0) {
      return false;
    }
    if (
      selector.position === "last" &&
      blockIndex !== context.blocks.length - 1
    ) {
      return false;
    }
  }

  if (selector.textPattern !== undefined) {
    if (!matchesTextPattern(blockText, selector.textPattern)) {
      return false;
    }
  }

  if (selector.context !== undefined && context !== undefined) {
    if (selector.context.previousSibling !== undefined) {
      const prevBlock = context.blocks[blockIndex - 1];
      if (!matchesSiblingFilter(prevBlock, selector.context.previousSibling)) {
        return false;
      }
    }

    if (selector.context.nextSibling !== undefined) {
      const nextBlock = context.blocks[blockIndex + 1];
      if (!matchesSiblingFilter(nextBlock, selector.context.nextSibling)) {
        return false;
      }
    }
  }

  return true;
}

function matchesTextPattern(text: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return false;
  }
}

function matchesSiblingFilter(
  block: Block | undefined,
  filter: CompoundContextSibling,
): boolean {
  if (block === undefined) {
    return false;
  }

  if (filter.blockType !== undefined && block.type !== filter.blockType) {
    return false;
  }

  if (filter.headingLevel !== undefined) {
    if (block.type !== "heading" || block.level !== filter.headingLevel) {
      return false;
    }
  }

  if (filter.textPattern !== undefined) {
    const text =
      block.type === "list"
        ? block.items.join("\n")
        : block.type === "table"
          ? [
              block.headers.join(" | "),
              ...block.rows.map((row) => row.join(" | ")),
            ].join("\n")
          : block.text;

    if (!matchesTextPattern(text, filter.textPattern)) {
      return false;
    }
  }

  return true;
}

export function getBlocksMatchingRule(
  rule: FormatRule,
  conversation: Conversation,
): Array<{ messageId: string; blockIndex: number; blockId: string }> {
  const matches: Array<{
    messageId: string;
    blockIndex: number;
    blockId: string;
  }> = [];

  for (const message of conversation.messages) {
    const context: ReaderMatchContext = {
      messageRole: message.role,
      blocks: message.blocks,
    };

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
          context,
          block.id,
        )
      ) {
        matches.push({
          messageId: message.id,
          blockIndex,
          blockId: block.id ?? "",
        });
      }
    }
  }

  return matches;
}
