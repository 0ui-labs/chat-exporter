import type {
  Block,
  Conversation,
  FormatRule,
  RuleEffect,
} from "@chat-exporter/shared";
import { ruleEffectSchema, ruleSelectorSchema } from "@chat-exporter/shared";

import { cn } from "@/lib/utils";

export function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [
        block.headers.join(" "),
        ...block.rows.map((row) => row.join(" ")),
      ].join(" ");
  }
}

function renderTextWithBoldPrefix(text: string) {
  const match = text.match(/^([^:\n]{1,120}:)(\s*)(.*)$/);

  if (!match) {
    return text;
  }

  return (
    <>
      <strong>{match[1]}</strong>
      {match[2]}
      {match[3]}
    </>
  );
}

function renderTextWithMarkdownStrong(text: string) {
  const parts = text.split(/(\*\*[^*\n][^*\n]*\*\*|__[^_\n][^_\n]*__)/g);

  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, index) => {
    const strongMatch =
      part.match(/^\*\*([^*\n][^*\n]*)\*\*$/) ??
      part.match(/^__([^_\n][^_\n]*)__$/);

    if (!strongMatch) {
      return part;
    }

    return <strong key={`strong-${index}`}>{strongMatch[1]}</strong>;
  });
}

function renderReaderInlineText(text: string, effects: RuleEffect[]) {
  const hasMarkdownStrongEffect = effects.some(
    (effect) => effect.type === "render_markdown_strong",
  );
  const hasBoldPrefixEffect = effects.some(
    (effect) => effect.type === "bold_prefix_before_colon",
  );

  if (hasMarkdownStrongEffect) {
    return renderTextWithMarkdownStrong(text);
  }

  if (hasBoldPrefixEffect) {
    return renderTextWithBoldPrefix(text);
  }

  return text;
}

function matchesReaderRule(
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
      const block = message.blocks[blockIndex]!;

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

export function hasReaderSpacingEffect(effects: RuleEffect[]) {
  return effects.some((effect) => effect.type === "adjust_block_spacing");
}

export function hasReaderRefineEffect(effects: RuleEffect[]) {
  return effects.some(
    (effect) => effect.type === "refine_selected_block_presentation",
  );
}

export function getReaderBlockClassName(params: {
  adjustModeEnabled?: boolean;
  effects: RuleEffect[];
  isHighlighted?: boolean;
  isSelected?: boolean;
}) {
  const {
    adjustModeEnabled = false,
    effects,
    isHighlighted = false,
    isSelected = false,
  } = params;

  return cn(
    "rounded-2xl transition",
    hasReaderSpacingEffect(effects) ? "mb-4 md:mb-6" : null,
    hasReaderRefineEffect(effects) ? "bg-primary/5" : null,
    adjustModeEnabled
      ? "cursor-pointer ring-1 ring-transparent hover:bg-primary/5 hover:ring-primary/20"
      : null,
    isHighlighted && !isSelected ? "bg-primary/8 ring-1 ring-primary/20" : null,
    isSelected ? "bg-primary/8 ring-2 ring-primary/40" : null,
  );
}

export function renderReaderBlock(block: Block, effects: RuleEffect[]) {
  const hasHeadingEmphasis = effects.some(
    (effect) => effect.type === "increase_heading_emphasis",
  );

  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-sm leading-7 text-foreground/90">
          {renderReaderInlineText(block.text, effects)}
        </p>
      );
    case "heading": {
      const Tag =
        `h${Math.min(block.level + 1, 6)}` as keyof JSX.IntrinsicElements;
      return (
        <Tag
          className={cn(
            "font-semibold text-foreground",
            hasHeadingEmphasis ? "text-lg" : null,
          )}
        >
          {renderReaderInlineText(block.text, effects)}
        </Tag>
      );
    }
    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">
          {block.items.map((item) => (
            <li key={item}>{renderReaderInlineText(item, effects)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-4 text-sm italic leading-7 text-foreground/80">
          {renderReaderInlineText(block.text, effects)}
        </blockquote>
      );
    case "code":
      return (
        <div className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-sm text-zinc-100">
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
            {block.language}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
            <code>{block.text}</code>
          </pre>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/70 text-secondary-foreground">
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={`${rowIndex}-${row.join("-")}`}
                  className="border-t border-border/80"
                >
                  {row.map((cell) => (
                    <td
                      key={`${rowIndex}-${cell}`}
                      className="px-4 py-3 align-top text-muted-foreground"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
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
