import type {
  Block,
  CustomStyleEffect,
  RuleEffect,
} from "@chat-exporter/shared";

import { cn } from "@/lib/utils";

function collectCustomStyles(effects: RuleEffect[]) {
  const containerStyle: Record<string, string> = {};
  const itemStyle: Record<string, string> = {};
  const textStyle: Record<string, string> = {};
  let textTransform: CustomStyleEffect["textTransform"] = null;
  let headingLevel: number | undefined;

  for (const effect of effects) {
    if (effect.type !== "custom_style") continue;
    if (effect.containerStyle)
      Object.assign(containerStyle, effect.containerStyle);
    if (effect.itemStyle) Object.assign(itemStyle, effect.itemStyle);
    if (effect.textStyle) Object.assign(textStyle, effect.textStyle);
    if (effect.textTransform) textTransform = effect.textTransform;
    if (effect.headingLevel) headingLevel = effect.headingLevel;
  }

  return {
    containerStyle:
      Object.keys(containerStyle).length > 0 ? containerStyle : undefined,
    itemStyle: Object.keys(itemStyle).length > 0 ? itemStyle : undefined,
    textStyle: Object.keys(textStyle).length > 0 ? textStyle : undefined,
    textTransform,
    headingLevel,
  };
}

export function collectInserts(effects: RuleEffect[]) {
  let insertBefore: "hr" | "spacer" | null = null;
  let insertAfter: "hr" | "spacer" | null = null;

  for (const effect of effects) {
    if (effect.type !== "custom_style") continue;
    if (effect.insertBefore) insertBefore = effect.insertBefore;
    if (effect.insertAfter) insertAfter = effect.insertAfter;
  }

  return { insertBefore, insertAfter };
}

export function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return (block.items ?? []).join(" ");
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

function renderItalicSegments(
  text: string,
  keyPrefix: string,
): React.ReactNode[] {
  const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)\*(?!\*)|(?<!_)_(?!_)(.+?)_(?!_)/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;

  for (const match of text.matchAll(ITALIC_RE)) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push(text.slice(lastIndex, idx));
    }
    const content = match[1] ?? match[2];
    segments.push(<em key={`${keyPrefix}-em-${i++}`}>{content}</em>);
    lastIndex = idx + match[0].length;
  }

  if (lastIndex === 0) return [text];
  if (lastIndex < text.length) segments.push(text.slice(lastIndex));
  return segments;
}

function renderTextWithMarkdownStrong(
  text: string,
): React.ReactNode | React.ReactNode[] {
  const BOLD_RE = /\*\*((?:(?!\*\*)[^\n])+)\*\*|__((?:(?!__)[^\n])+)__/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;

  for (const match of text.matchAll(BOLD_RE)) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push(
        ...renderItalicSegments(text.slice(lastIndex, idx), `pre-${i}`),
      );
    }
    const content = (match[1] ?? match[2]) as string;
    const inner = renderItalicSegments(content, `b-${i}`);
    segments.push(<strong key={`strong-${i++}`}>{inner}</strong>);
    lastIndex = idx + match[0].length;
  }

  if (lastIndex === 0) {
    const italicResult = renderItalicSegments(text, "root");
    return italicResult.length === 1 && typeof italicResult[0] === "string"
      ? text
      : italicResult;
  }

  if (lastIndex < text.length) {
    segments.push(...renderItalicSegments(text.slice(lastIndex), `post-${i}`));
  }

  return segments;
}

function resolveTextTransform(effects: RuleEffect[]) {
  const custom = collectCustomStyles(effects);
  if (custom.textTransform) return custom.textTransform;
  // Default: render markdown strong (existing behavior)
  return "render_markdown_strong" as const;
}

function renderReaderInlineText(
  text: string,
  effects: RuleEffect[],
  textStyle?: React.CSSProperties,
) {
  const transform = resolveTextTransform(effects);

  const rendered =
    transform === "bold_prefix_before_colon"
      ? renderTextWithBoldPrefix(text)
      : renderTextWithMarkdownStrong(text);

  if (textStyle) {
    return <span style={textStyle}>{rendered}</span>;
  }
  return rendered;
}

export function getReaderBlockStyle(
  effects: RuleEffect[],
): React.CSSProperties | undefined {
  const custom = collectCustomStyles(effects);
  return custom.containerStyle as React.CSSProperties | undefined;
}

export function getReaderBlockClassName(params: {
  adjustModeEnabled?: boolean;
  effects: RuleEffect[];
  isHighlighted?: boolean;
  isSelected?: boolean;
}) {
  const {
    adjustModeEnabled = false,
    isHighlighted = false,
    isSelected = false,
  } = params;

  return cn(
    "rounded-2xl px-3 py-2 transition",
    adjustModeEnabled
      ? "cursor-pointer ring-1 ring-transparent hover:bg-primary/5 hover:ring-primary/20"
      : null,
    isHighlighted && !isSelected ? "bg-primary/8 ring-1 ring-primary/20" : null,
    isSelected ? "bg-primary/8 ring-2 ring-primary/40" : null,
  );
}

export function renderReaderBlock(block: Block, effects: RuleEffect[]) {
  const custom = collectCustomStyles(effects);
  const textStyle = custom.textStyle as React.CSSProperties | undefined;
  const itemStyle = custom.itemStyle as React.CSSProperties | undefined;

  switch (block.type) {
    case "paragraph": {
      const numberedBoldMatch = block.text.match(
        /^\*\*(\d+\.\s.+?)\*\*\s*([\s\S]*)$/,
      );

      if (numberedBoldMatch) {
        const heading = numberedBoldMatch[1];
        const rest = numberedBoldMatch[2]?.trim();

        return (
          <>
            <hr className="mt-8 border-border/40" />
            <h2
              className="mt-8 font-semibold text-foreground"
              style={textStyle}
            >
              {heading}
            </h2>
            {rest ? (
              <p
                className="text-sm leading-7 text-foreground/90"
                style={textStyle}
              >
                {renderReaderInlineText(rest, effects)}
              </p>
            ) : null}
          </>
        );
      }

      return (
        <p className="text-sm leading-7 text-foreground/90" style={textStyle}>
          {renderReaderInlineText(block.text, effects)}
        </p>
      );
    }
    case "heading": {
      const level = custom.headingLevel ?? block.level;
      const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      return (
        <Tag className="font-semibold text-foreground" style={textStyle}>
          {renderReaderInlineText(block.text, effects)}
        </Tag>
      );
    }
    case "list":
      return (
        <ul
          className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90"
          style={textStyle}
        >
          {(block.items ?? []).map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} style={itemStyle}>
              {renderReaderInlineText(item, effects)}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          className="border-l-2 border-accent pl-4 text-sm italic leading-7 text-foreground/80"
          style={textStyle}
        >
          {renderReaderInlineText(block.text, effects)}
        </blockquote>
      );
    case "code":
      return (
        <div
          className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-sm text-zinc-100"
          style={textStyle}
        >
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
          <table className="min-w-full text-left text-sm" style={textStyle}>
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
              {block.rows.map((row) => (
                <tr key={row.join("-")} className="border-t border-border/80">
                  {row.map((cell) => (
                    <td
                      key={cell}
                      className="px-4 py-3 align-top text-muted-foreground"
                      style={itemStyle}
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
