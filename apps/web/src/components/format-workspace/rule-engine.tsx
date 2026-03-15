import type {
  Block,
  Conversation,
  FormatRule,
  RuleEffect,
} from "@chat-exporter/shared";
import {
  defaultRegistry,
  normalizeLegacyEffect,
  ruleEffectSchema,
  ruleSelectorSchema,
} from "@chat-exporter/shared";

import { blockToPlainText } from "./reader-block-render";
import { matchesReaderRule, type ReaderMatchContext } from "./rule-matching";

// Re-exports for backward compatibility
export {
  blockToPlainText,
  collectInserts,
  getReaderBlockClassName,
  getReaderBlockStyle,
  renderReaderBlock,
} from "./reader-block-render";
export { getBlocksMatchingRule } from "./rule-matching";

export function canApplyRule(
  formatId: string,
  ruleEffect: RuleEffect,
): boolean {
  return defaultRegistry.supportsRuleKind(formatId, ruleEffect.type);
}

export function resolveReaderBlockEffects(
  rules: FormatRule[],
  messageId: string,
  blockIndex: number,
  blockType: Block["type"],
  blockText: string,
  context?: ReaderMatchContext,
) {
  return rules
    .filter(
      (rule) =>
        rule.status === "active" &&
        matchesReaderRule(
          rule,
          messageId,
          blockIndex,
          blockType,
          blockText,
          context,
        ),
    )
    .map((rule) => rule.compiledRule)
    .filter((effect): effect is RuleEffect => effect !== undefined)
    .map(normalizeLegacyEffect);
}

export function buildReaderEffectsMap(
  rules: FormatRule[],
  conversation: Conversation,
): Map<string, RuleEffect[]> {
  const activeRules = rules.filter((r) => r.status === "active");
  const effectsMap = new Map<string, RuleEffect[]>();

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

      const effects = activeRules
        .filter((rule) =>
          matchesReaderRule(
            rule,
            message.id,
            blockIndex,
            block.type,
            blockToPlainText(block),
            context,
          ),
        )
        .map((rule) => rule.compiledRule)
        .filter((effect): effect is RuleEffect => effect !== undefined)
        .map(normalizeLegacyEffect);

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
    const effect = normalizeLegacyEffect(parsedEffect.data);

    const strategy = "strategy" in selector ? selector.strategy : undefined;

    if (strategy === "compound") {
      const transform = effect.markdownTransform;
      if (!transform) continue;

      // Compound in Markdown: textPattern match on each line
      // blockType/messageRole/context not relevant for Markdown (line-based only)
      const textPattern =
        "textPattern" in selector ? selector.textPattern : null;

      for (let index = 0; index < nextLines.length; index += 1) {
        const line = nextLines[index] ?? "";

        // If textPattern set: only transform matching lines
        if (textPattern) {
          try {
            if (!new RegExp(textPattern).test(line)) continue;
          } catch {
            continue;
          }
        }

        // Apply transform (same switch logic as for exact)
        switch (transform) {
          case "promote_to_heading":
            nextLines[index] = `## ${line.replace(/^#+\s*/, "")}`.trimEnd();
            break;
          case "bold_prefix_before_colon":
            nextLines[index] = line.replace(
              /^([^:\n]{1,120}:)(?!\*)/,
              "**$1**",
            );
            break;
          case "normalize_list_structure": {
            const trimmedLine = line.trim();
            if (!trimmedLine) break;
            nextLines[index] = /^[-*]\s/.test(trimmedLine)
              ? trimmedLine
              : `- ${trimmedLine}`;
            break;
          }
          case "normalize_markdown_table":
            if (line.includes("|")) {
              nextLines[index] = line
                .split("|")
                .map((cell) => cell.trim())
                .join(" | ")
                .trim();
            }
            break;
          case "reshape_markdown_block":
            nextLines[index] = line.trimEnd();
            break;
        }
      }
      continue;
    }

    // All effects are now custom_style after normalization
    {
      const transform = effect.markdownTransform;
      if (!transform) continue;

      if (
        strategy === "prefix_before_colon" &&
        transform === "bold_prefix_before_colon"
      ) {
        for (let index = 0; index < nextLines.length; index += 1) {
          const line = nextLines[index] ?? "";
          nextLines[index] = line.replace(/^([^:\n]{1,120}:)(?!\*)/, "**$1**");
        }
        continue;
      }

      if (
        strategy === "markdown_table" &&
        transform === "normalize_markdown_table"
      ) {
        for (let index = 0; index < nextLines.length; index += 1) {
          const line = nextLines[index] ?? "";
          if (!line.includes("|")) continue;
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
      if (!lineStart || !lineEnd) continue;
      const startIndex = Math.max(0, lineStart - 1);
      const endIndex = Math.min(nextLines.length - 1, lineEnd - 1);

      switch (transform) {
        case "promote_to_heading":
          nextLines[startIndex] =
            `## ${nextLines[startIndex]?.replace(/^#+\s*/, "") ?? ""}`.trimEnd();
          break;
        case "bold_prefix_before_colon":
          for (let index = startIndex; index <= endIndex; index += 1) {
            const line = nextLines[index] ?? "";
            nextLines[index] = line.replace(
              /^([^:\n]{1,120}:)(?!\*)/,
              "**$1**",
            );
          }
          break;
        case "normalize_list_structure":
          for (let index = startIndex; index <= endIndex; index += 1) {
            const line = nextLines[index] ?? "";
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
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
      }
    }
  }

  return nextLines.join("\n");
}
