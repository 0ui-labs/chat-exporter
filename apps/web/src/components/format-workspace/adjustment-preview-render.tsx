import type {
  AdjustmentTargetFormat,
  Conversation,
  FormatRule,
  RuleEffect,
  RuleSelector,
} from "@chat-exporter/shared";

// Local type replacing the removed AdjustmentPreview from shared
type AdjustmentPreview = {
  sessionId: string;
  targetFormat: AdjustmentTargetFormat;
  summary: string;
  rationale: string;
  limitations: string[];
  draftRule: {
    kind: FormatRule["kind"];
    scope: FormatRule["scope"];
    selector: RuleSelector;
    effect: RuleEffect;
  };
};

import {
  applyMarkdownRules,
  blockToPlainText,
  getReaderBlockClassName,
  renderReaderBlock,
  resolveReaderBlockEffects,
} from "@/components/format-workspace/rule-engine";
import type { AdjustmentSelection } from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

type AdjustmentPreviewRenderProps = {
  activeRules: FormatRule[];
  conversation: Conversation | undefined;
  markdownContent: string;
  preview: AdjustmentPreview;
  selection: AdjustmentSelection;
};

function buildPreviewRule(preview: AdjustmentPreview): FormatRule {
  const timestamp = new Date(0).toISOString();

  return {
    id: `preview:${preview.sessionId}`,
    importId: `preview:${preview.sessionId}`,
    targetFormat: preview.targetFormat,
    kind: preview.draftRule.kind,
    scope: preview.draftRule.scope,
    status: "active",
    selector: preview.draftRule.selector,
    instruction: preview.summary,
    compiledRule: preview.draftRule.effect,
    sourceSessionId: preview.sessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function formatLineNumber(value: number) {
  return String(value).padStart(2, "0");
}

function MarkdownPreviewDiff(props: {
  activeRules: FormatRule[];
  content: string;
  preview: AdjustmentPreview;
  selection: AdjustmentSelection;
}) {
  const { activeRules, content, preview, selection } = props;
  const previewRule = buildPreviewRule(preview);
  const beforeContent = applyMarkdownRules(content, activeRules);
  const afterContent = applyMarkdownRules(content, [
    ...activeRules,
    previewRule,
  ]);
  const beforeLines = beforeContent.split("\n");
  const afterLines = afterContent.split("\n");
  const lineStart = selection.lineStart ?? 1;
  const lineEnd = selection.lineEnd ?? lineStart;
  const contextStart = Math.max(1, lineStart - 1);
  const contextEnd = Math.min(afterLines.length, lineEnd + 1);
  const lineNumbers = Array.from(
    { length: contextEnd - contextStart + 1 },
    (_, index) => contextStart + index,
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2 rounded-2xl border border-border/80 bg-background/85 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Aktuelle Ausgabe
        </p>
        <div className="space-y-1 rounded-2xl bg-zinc-950 p-3">
          {lineNumbers.map((lineNumber) => {
            const isSelectedLine =
              lineNumber >= lineStart && lineNumber <= lineEnd;

            return (
              <div
                key={`before-${lineNumber}`}
                className={cn(
                  "grid grid-cols-[auto_1fr] gap-3 rounded-lg px-2 py-1 font-mono text-xs text-zinc-100",
                  isSelectedLine
                    ? "bg-primary/15 ring-1 ring-primary/30"
                    : null,
                )}
              >
                <span className="select-none text-zinc-500">
                  {formatLineNumber(lineNumber)}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {beforeLines[lineNumber - 1] ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          Vorschau nach Anwendung
        </p>
        <div className="space-y-1 rounded-2xl bg-zinc-950 p-3">
          {lineNumbers.map((lineNumber) => {
            const isSelectedLine =
              lineNumber >= lineStart && lineNumber <= lineEnd;
            const hasChanged =
              (beforeLines[lineNumber - 1] ?? "") !==
              (afterLines[lineNumber - 1] ?? "");

            return (
              <div
                key={`after-${lineNumber}`}
                className={cn(
                  "grid grid-cols-[auto_1fr] gap-3 rounded-lg px-2 py-1 font-mono text-xs text-zinc-100",
                  isSelectedLine
                    ? "bg-primary/15 ring-1 ring-primary/30"
                    : null,
                  hasChanged
                    ? "border border-emerald-400/30 bg-emerald-500/10"
                    : null,
                )}
              >
                <span className="select-none text-zinc-500">
                  {formatLineNumber(lineNumber)}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {afterLines[lineNumber - 1] ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReaderPreviewDiff(props: {
  activeRules: FormatRule[];
  conversation: Conversation | undefined;
  preview: AdjustmentPreview;
  selection: AdjustmentSelection;
}) {
  const { activeRules, conversation, preview, selection } = props;

  if (!conversation) {
    return null;
  }

  const previewRule = buildPreviewRule(preview);
  const messageIndex = conversation.messages.findIndex(
    (message) => message.id === selection.messageId,
  );
  const message =
    messageIndex >= 0 ? conversation.messages[messageIndex] : undefined;

  if (!message) {
    return null;
  }

  const selectedMessage = message;
  const selectedBlock = selectedMessage.blocks[selection.blockIndex];
  const nextBlock = selectedMessage.blocks[selection.blockIndex + 1];

  if (!selectedBlock) {
    return null;
  }

  const previewBlocks = [
    {
      block: selectedBlock,
      blockIndex: selection.blockIndex,
      label: "Ausgewählter Block",
    },
    nextBlock
      ? {
          block: nextBlock,
          blockIndex: selection.blockIndex + 1,
          label: "Folgender Block",
        }
      : null,
  ].filter(Boolean) as Array<{
    block: typeof selectedBlock;
    blockIndex: number;
    label: string;
  }>;

  function renderVariant(
    title: string,
    rules: FormatRule[],
    accentClassName: string,
  ) {
    return (
      <div className={cn("space-y-2 rounded-2xl border p-3", accentClassName)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </p>
        <div className="space-y-3 rounded-2xl bg-background/80 p-3">
          {previewBlocks.map(({ block, blockIndex, label }) => {
            const blockText = blockToPlainText(block);
            const effects = resolveReaderBlockEffects(
              rules,
              selectedMessage.id,
              blockIndex,
              block.type,
              blockText,
              {
                messageRole: selectedMessage.role,
                blocks: selectedMessage.blocks,
              },
            );

            return (
              <div key={`${title}-${blockIndex}`} className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </p>
                <div
                  className={getReaderBlockClassName({
                    effects,
                    isSelected: blockIndex === selection.blockIndex,
                  })}
                >
                  {renderReaderBlock(block, effects)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {renderVariant(
        "Aktuelle Ausgabe",
        activeRules,
        "border-border/80 bg-background/85",
      )}
      {renderVariant(
        "Vorschau nach Anwendung",
        [...activeRules, previewRule],
        "border-primary/20 bg-primary/5",
      )}
    </div>
  );
}

export function AdjustmentPreviewRender(props: AdjustmentPreviewRenderProps) {
  const { activeRules, conversation, markdownContent, preview, selection } =
    props;

  if (preview.targetFormat === "markdown") {
    return (
      <MarkdownPreviewDiff
        activeRules={activeRules}
        content={markdownContent}
        preview={preview}
        selection={selection}
      />
    );
  }

  if (preview.targetFormat === "reader") {
    return (
      <ReaderPreviewDiff
        activeRules={activeRules}
        conversation={conversation}
        preview={preview}
        selection={selection}
      />
    );
  }

  return null;
}
