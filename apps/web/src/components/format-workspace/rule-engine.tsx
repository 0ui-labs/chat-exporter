import type {
  Block,
  Conversation,
  FormatRule,
  RuleEffect,
} from "@chat-exporter/shared";
import { ruleEffectSchema, ruleSelectorSchema } from "@chat-exporter/shared";

import { blockToPlainText } from "./reader-block-render";
import { matchesReaderRule } from "./rule-matching";

// Re-exports for backward compatibility
export {
  blockToPlainText,
  getReaderBlockClassName,
  renderReaderBlock,
} from "./reader-block-render";
export { getBlocksMatchingRule } from "./rule-matching";

export function resolveReaderBlockEffects(
  rules: FormatRule[],
  messageId: string,
  blockIndex: number,
  blockType: Block["type"],
  blockText: string,
) {
  return rules
    .filter(
      (rule) =>
        rule.status === "active" &&
        matchesReaderRule(rule, messageId, blockIndex, blockType, blockText),
    )
    .map((rule) => rule.compiledRule)
    .filter((effect): effect is RuleEffect => effect !== undefined);
}

export function buildReaderEffectsMap(
  rules: FormatRule[],
  conversation: Conversation,
): Map<string, RuleEffect[]> {
  const activeRules = rules.filter((r) => r.status === "active");
  const effectsMap = new Map<string, RuleEffect[]>();

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

      const effects = activeRules
        .filter((rule) =>
          matchesReaderRule(
            rule,
            message.id,
            blockIndex,
            block.type,
            blockToPlainText(block),
          ),
        )
        .map((rule) => rule.compiledRule)
        .filter((effect): effect is RuleEffect => effect !== undefined);

      if (effects.length > 0) {
        effectsMap.set(`${message.id}:${blockIndex}`, effects);
      }
    }
  }

  return effectsMap;
}

export function applyMarkdownRules(content: string, rules: FormatRule[]) {
  const lines = content.split("\n");
  const nextLines = [...lines];

  for (const rule of rules) {
    if (rule.status !== "active") {
      continue;
    }

    const parsedSelector = ruleSelectorSchema.safeParse(rule.selector);
    const parsedEffect = ruleEffectSchema.safeParse(rule.compiledRule);

    if (!parsedSelector.success || !parsedEffect.success) {
      continue;
    }

    const selector = parsedSelector.data;
    const effect = parsedEffect.data;

    const strategy = "strategy" in selector ? selector.strategy : undefined;
    const effectType = effect.type;

    if (
      strategy === "prefix_before_colon" &&
      effectType === "bold_prefix_before_colon"
    ) {
      for (let index = 0; index < nextLines.length; index += 1) {
        const line = nextLines[index] ?? "";
        nextLines[index] = line.replace(/^([^:\n]{1,120}:)(?!\*)/, "**$1**");
      }
      continue;
    }

    if (
      strategy === "markdown_table" &&
      effectType === "normalize_markdown_table"
    ) {
      for (let index = 0; index < nextLines.length; index += 1) {
        const line = nextLines[index] ?? "";

        if (!line.includes("|")) {
          continue;
        }

        nextLines[index] = line
          .split("|")
          .map((cell) => cell.trim())
          .join(" | ")
          .trim();
      }
      continue;
    }

    const lineStart = "lineStart" in selector ? selector.lineStart : null;
    const lineEnd = "lineEnd" in selector ? selector.lineEnd : lineStart;

    if (!lineStart || !lineEnd) {
      continue;
    }

    const startIndex = Math.max(0, lineStart - 1);
    const endIndex = Math.min(nextLines.length - 1, lineEnd - 1);

    switch (effectType) {
      case "promote_to_heading":
        nextLines[startIndex] =
          `## ${nextLines[startIndex]?.replace(/^#+\s*/, "") ?? ""}`.trimEnd();
        break;
      case "bold_prefix_before_colon":
        for (let index = startIndex; index <= endIndex; index += 1) {
          const line = nextLines[index] ?? "";
          nextLines[index] = line.replace(/^([^:\n]{1,120}:)(?!\*)/, "**$1**");
        }
        break;
      case "normalize_list_structure":
        for (let index = startIndex; index <= endIndex; index += 1) {
          const line = nextLines[index] ?? "";
          const trimmedLine = line.trim();

          if (!trimmedLine) {
            continue;
          }

          nextLines[index] = /^[-*]\s/.test(trimmedLine)
            ? trimmedLine
            : `- ${trimmedLine}`;
        }
        break;
      case "normalize_markdown_table":
        for (let index = startIndex; index <= endIndex; index += 1) {
          const line = nextLines[index] ?? "";
          nextLines[index] = line
            .split("|")
            .map((cell) => cell.trim())
            .join(" | ")
            .trim();
        }
        break;
      case "reshape_markdown_block":
        for (let index = startIndex; index <= endIndex; index += 1) {
          nextLines[index] = (nextLines[index] ?? "").trimEnd();
        }
        break;
      default:
        break;
    }
  }

  return nextLines.join("\n");
}
