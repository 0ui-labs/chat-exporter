import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { useMemo, useRef } from "react";

import { getRoleLabel } from "@/components/format-workspace/labels";
import {
  blockToPlainText,
  getBlocksMatchingRule,
  getReaderBlockClassName,
  renderReaderBlock,
  resolveReaderBlockEffects,
} from "@/components/format-workspace/rule-engine";
import type {
  AdjustmentSelection,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

type ReaderViewProps = {
  activeRules: FormatRule[];
  adjustModeEnabled: boolean;
  conversation: Conversation | undefined;
  highlightedRuleId: string | null;
  onSelectBlock: (
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) => void;
  selectedBlock: AdjustmentSelection | null;
};

function truncateSelectionText(value: string) {
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
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

export function ReaderView({
  activeRules,
  adjustModeEnabled,
  conversation,
  highlightedRuleId,
  onSelectBlock,
  selectedBlock,
}: ReaderViewProps) {
  const lastSelectionInteractionAt = useRef(0);

  const highlightedBlocks = useMemo(() => {
    if (!highlightedRuleId || !conversation) {
      return new Set<string>();
    }

    const rule = activeRules.find(
      (r) => r.id === highlightedRuleId && r.status === "active",
    );

    if (!rule) {
      return new Set<string>();
    }

    const matches = getBlocksMatchingRule(rule, conversation);
    return new Set(matches.map((m) => `${m.messageId}:${m.blockIndex}`));
  }, [highlightedRuleId, activeRules, conversation]);

  if (!conversation?.messages.length) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/75 px-4 py-5 text-sm text-muted-foreground">
        Für diesen Import ist noch kein Transkriptinhalt verfügbar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversation.messages.map((message, index) => (
        <article
          key={message.id}
          className={cn(
            "rounded-[1.55rem] border border-border/80 px-4 py-5 sm:px-5",
            message.role === "assistant" ? "bg-card/92" : "bg-secondary/30",
          )}
        >
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{getRoleLabel(message.role)}</span>
            <span>{index + 1}</span>
          </div>
          <div className="space-y-4">
            {message.blocks.map((block, blockIndex) => {
              const blockText = blockToPlainText(block);
              const blockEffects = resolveReaderBlockEffects(
                activeRules,
                message.id,
                blockIndex,
                block.type,
                blockText,
              );
              const isSelected =
                selectedBlock?.messageId === message.id &&
                selectedBlock.blockIndex === blockIndex;
              const isHighlighted = highlightedBlocks.has(
                `${message.id}:${blockIndex}`,
              );
              const emitSelection = (
                anchor: ViewportAnchor,
                selectedText: string,
              ) => {
                lastSelectionInteractionAt.current = Date.now();

                onSelectBlock(
                  {
                    blockIndex,
                    blockType: block.type,
                    messageId: message.id,
                    messageIndex: index,
                    messageRole: message.role,
                    selectedText,
                    textQuote: truncateSelectionText(selectedText),
                  },
                  anchor,
                );
              };

              return (
                <div
                  key={`${message.id}-${block.type}-${blockIndex}`}
                  data-testid={`reader-block-${message.id}-${blockIndex}`}
                  className={getReaderBlockClassName({
                    adjustModeEnabled,
                    effects: blockEffects,
                    isHighlighted,
                    isSelected,
                  })}
                  data-selected={isSelected ? "true" : "false"}
                  onPointerUp={(event) => {
                    if (!adjustModeEnabled) {
                      return;
                    }

                    const selection = window.getSelection();
                    const range =
                      selection && selection.rangeCount > 0
                        ? selection.getRangeAt(0)
                        : null;
                    const selectedText = selection?.toString().trim() ?? "";
                    const container = event.currentTarget;
                    const rangeStartContainer = range?.startContainer ?? null;
                    const rangeEndContainer = range?.endContainer ?? null;
                    const hasLocalTextSelection =
                      Boolean(selectedText) &&
                      Boolean(rangeStartContainer) &&
                      Boolean(rangeEndContainer) &&
                      container.contains(rangeStartContainer) &&
                      container.contains(rangeEndContainer);
                    const anchorRect =
                      hasLocalTextSelection && range
                        ? range.getBoundingClientRect()
                        : container.getBoundingClientRect();

                    emitSelection(
                      toViewportAnchor(anchorRect),
                      hasLocalTextSelection ? selectedText : blockText,
                    );

                    if (selection && hasLocalTextSelection) {
                      selection.removeAllRanges();
                    }
                  }}
                  onClick={(event) => {
                    if (!adjustModeEnabled) {
                      return;
                    }

                    if (Date.now() - lastSelectionInteractionAt.current < 250) {
                      return;
                    }

                    emitSelection(
                      toViewportAnchor(
                        event.currentTarget.getBoundingClientRect(),
                      ),
                      blockText,
                    );
                  }}
                >
                  {renderReaderBlock(block, blockEffects)}
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
