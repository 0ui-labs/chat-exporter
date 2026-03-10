import type { FormatRule } from "@chat-exporter/shared";
import { useMemo } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import type {
  AdjustmentSelection,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

type MarkdownViewProps = {
  activeRules: FormatRule[];
  adjustModeEnabled: boolean;
  content: string;
  highlightedRuleId: string | null;
  onSelectLines: (
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) => void;
  selectedRange: AdjustmentSelection | null;
};

function formatLineNumber(value: number) {
  return String(value).padStart(2, "0");
}

function LineContent({
  line,
  lineNumber,
}: {
  line: string;
  lineNumber: number;
}) {
  return (
    <>
      <span className="select-none pt-0.5 font-mono text-xs text-zinc-500">
        {formatLineNumber(lineNumber)}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words font-mono">
        {line.length > 0 ? line : " "}
      </span>
    </>
  );
}

function toViewportAnchor(rect: DOMRect): ViewportAnchor {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function MarkdownView({
  activeRules,
  adjustModeEnabled,
  content,
  highlightedRuleId,
  onSelectLines,
  selectedRange,
}: MarkdownViewProps) {
  const lines = content.split("\n");

  const highlightedLineRange = useMemo(() => {
    if (!highlightedRuleId) {
      return null;
    }

    const rule = activeRules.find(
      (r) => r.id === highlightedRuleId && r.status === "active",
    );

    if (!rule) {
      return null;
    }

    const selector =
      rule.selector && typeof rule.selector === "object"
        ? (rule.selector as Record<string, unknown>)
        : null;

    if (!selector) {
      return null;
    }

    const strategy =
      typeof selector.strategy === "string" ? selector.strategy : null;

    if (
      strategy === "prefix_before_colon" ||
      strategy === "block_type" ||
      strategy === "markdown_table"
    ) {
      return { start: 1, end: lines.length };
    }

    const lineStart =
      typeof selector.lineStart === "number" ? selector.lineStart : null;
    const lineEnd =
      typeof selector.lineEnd === "number" ? selector.lineEnd : lineStart;

    if (!lineStart || !lineEnd) {
      return null;
    }

    return { start: lineStart, end: lineEnd };
  }, [highlightedRuleId, activeRules, lines.length]);

  return (
    <div className="rounded-[1.6rem] border border-border/80 bg-zinc-950 p-3 text-sm text-zinc-100">
      <div className="space-y-1">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isSelected =
            selectedRange?.lineStart !== undefined &&
            selectedRange?.lineEnd !== undefined &&
            lineNumber >= selectedRange.lineStart &&
            lineNumber <= selectedRange.lineEnd;
          const isHighlighted =
            highlightedLineRange !== null &&
            lineNumber >= highlightedLineRange.start &&
            lineNumber <= highlightedLineRange.end;

          return (
            <button
              key={`${lineNumber}-${line}`}
              data-testid={`markdown-line-${lineNumber}`}
              className={cn(
                "grid w-full grid-cols-[auto_1fr] gap-3 rounded-xl px-3 py-2 text-left transition",
                adjustModeEnabled
                  ? "cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  : "cursor-text",
                isHighlighted && !isSelected
                  ? "bg-primary/10 ring-1 ring-primary/20"
                  : null,
                isSelected ? "bg-primary/15 ring-1 ring-primary/40" : null,
              )}
              type="button"
              onClick={(event) => {
                if (!adjustModeEnabled) {
                  return;
                }

                const canExpandExistingSelection =
                  selectedRange?.lineStart !== undefined &&
                  selectedRange?.lineEnd !== undefined &&
                  selectedRange.lineStart === selectedRange.lineEnd &&
                  selectedRange.lineStart !== lineNumber;
                const existingLineStart =
                  selectedRange?.lineStart ?? lineNumber;
                const nextStart = canExpandExistingSelection
                  ? Math.min(existingLineStart, lineNumber)
                  : lineNumber;
                const nextEnd = canExpandExistingSelection
                  ? Math.max(existingLineStart, lineNumber)
                  : lineNumber;
                const selectedLines = lines
                  .slice(nextStart - 1, nextEnd)
                  .join("\n");

                onSelectLines(
                  {
                    blockIndex: nextStart - 1,
                    blockType: "markdown-lines",
                    lineStart: nextStart,
                    lineEnd: nextEnd,
                    messageId: `markdown:${nextStart}-${nextEnd}`,
                    messageIndex: 0,
                    messageRole: "markdown",
                    selectedText: selectedLines,
                    textQuote:
                      selectedLines.length > 180
                        ? `${selectedLines.slice(0, 177).trimEnd()}...`
                        : selectedLines,
                  },
                  toViewportAnchor(event.currentTarget.getBoundingClientRect()),
                );
              }}
            >
              <ErrorBoundary
                fallback={
                  <>
                    <span className="select-none pt-0.5 font-mono text-xs text-zinc-500">
                      {"\u00A0"}
                    </span>
                    <span className="text-xs text-red-500">
                      Zeile konnte nicht dargestellt werden.
                    </span>
                  </>
                }
              >
                <LineContent line={line} lineNumber={lineNumber} />
              </ErrorBoundary>
            </button>
          );
        })}
      </div>
    </div>
  );
}
