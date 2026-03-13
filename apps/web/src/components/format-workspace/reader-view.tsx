import type {
  Block,
  Conversation,
  FormatRule,
  Message,
  RuleEffect,
} from "@chat-exporter/shared";
import { ClipboardCopy } from "lucide-react";
import React, { memo, useCallback, useMemo, useRef } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { BlockErrorFallback } from "@/components/format-workspace/block-error-fallback";
import { BlockInserter } from "@/components/format-workspace/block-inserter";
import { EditableBlock } from "@/components/format-workspace/editable-block";
import { getRoleLabel } from "@/components/format-workspace/labels";
import { MessageDeleteMenu } from "@/components/format-workspace/message-delete-menu";
import {
  blockToPlainText,
  collectInserts,
  getBlocksMatchingRule,
  getReaderBlockClassName,
  getReaderBlockStyle,
  renderReaderBlock,
} from "@/components/format-workspace/rule-engine";
import type {
  AdjustmentSelection,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

import {
  SELECTION_DEBOUNCE_MS,
  TEXT_PREVIEW_LIMIT,
  TEXT_TRUNCATION_LIMIT,
} from "./constants";

/** Thin wrapper so that errors thrown by renderReaderBlock are caught by ErrorBoundary. */
function BlockRenderer({
  block,
  effects,
}: {
  block: Block;
  effects: RuleEffect[];
}) {
  return <>{renderReaderBlock(block, effects)}</>;
}

type ReaderViewProps = {
  activeRules: FormatRule[];
  adjustModeEnabled: boolean;
  conversation: Conversation | undefined;
  deletedMessageIds?: Set<string>;
  editMode?: boolean;
  effectsMap: Map<string, RuleEffect[]>;
  highlightedRuleId: string | null;
  onBlocksChange?: (messageId: string, blocks: Block[]) => void;
  onCopyMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onDeleteRound?: (messageId: string) => void;
  onRestoreMessage?: (messageId: string) => Promise<{ restored: boolean }>;
  onSelectBlock: (
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) => void;
  selectedBlock: AdjustmentSelection | null;
  showDeleted?: boolean;
};

function truncateSelectionText(value: string) {
  return value.length > TEXT_TRUNCATION_LIMIT
    ? `${value.slice(0, TEXT_PREVIEW_LIMIT).trimEnd()}...`
    : value;
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

type ReaderMessageProps = {
  adjustModeEnabled: boolean;
  editMode?: boolean;
  effectsMap: Map<string, RuleEffect[]>;
  highlightedBlocks: Set<string>;
  isDeleted?: boolean;
  message: Message;
  messageIndex: number;
  onBlockChange?: (
    messageId: string,
    blockIndex: number,
    newBlock: Block,
  ) => void;
  onBlocksChange?: (messageId: string, blocks: Block[]) => void;
  onCopyMessage?: () => void;
  onDeleteMessage?: () => void;
  onDeleteRound?: () => void;
  onRestore?: () => void;
  onSelectBlock: ReaderViewProps["onSelectBlock"];
  selectedBlock: AdjustmentSelection | null;
};

const ReaderMessage = memo(function ReaderMessage({
  adjustModeEnabled,
  editMode,
  effectsMap,
  highlightedBlocks,
  isDeleted,
  message,
  messageIndex,
  onBlockChange,
  onBlocksChange,
  onCopyMessage,
  onDeleteMessage,
  onDeleteRound,
  onRestore,
  onSelectBlock,
  selectedBlock,
}: ReaderMessageProps) {
  const lastSelectionInteractionAt = useRef(0);

  const handleInsertBlock = useCallback(
    (blockIndex: number, block: Block) => {
      if (!onBlocksChange) return;
      const updatedBlocks = [...message.blocks];
      updatedBlocks.splice(blockIndex, 0, block);
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.blocks, message.id, onBlocksChange],
  );

  return (
    <article
      className={cn(
        "rounded-[1.55rem] border border-border/80 px-4 py-5 sm:px-5",
        message.role === "assistant" ? "bg-card/92" : "bg-secondary/30",
        isDeleted && "opacity-50",
      )}
    >
      {isDeleted && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-red-50 border border-red-200/60 px-3 py-2 text-xs text-red-700">
          <span>Gelöscht</span>
          {onRestore && (
            <button
              type="button"
              className="text-red-600 hover:text-red-800 underline"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
            >
              Wiederherstellen
            </button>
          )}
        </div>
      )}
      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>{getRoleLabel(message.role)}</span>
        <span>{messageIndex + 1}</span>
        {!isDeleted && (onDeleteMessage || onCopyMessage) && (
          <span className="ml-auto flex items-center gap-1">
            {onCopyMessage && (
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyMessage();
                }}
                aria-label="Nachricht kopieren"
                data-testid={`copy-message-${message.id}`}
              >
                <ClipboardCopy className="h-4 w-4" />
              </button>
            )}
            {onDeleteMessage && onDeleteRound && (
              <MessageDeleteMenu
                onDeleteMessage={onDeleteMessage}
                onDeleteRound={onDeleteRound}
              />
            )}
          </span>
        )}
      </div>
      <div className="space-y-4">
        {editMode && onBlocksChange && (
          <BlockInserter blockIndex={0} onInsertBlock={handleInsertBlock} />
        )}
        {message.blocks.map((block, blockIndex) => {
          const blockText = blockToPlainText(block);
          const blockEffects =
            effectsMap.get(`${message.id}:${blockIndex}`) ?? [];
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
                messageIndex,
                messageRole: message.role,
                selectedText,
                textQuote: truncateSelectionText(selectedText),
              },
              anchor,
            );
          };

          const inserts = collectInserts(blockEffects);

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: block identity is message.id + blockIndex
            <React.Fragment key={`${message.id}-${blockIndex}`}>
              {inserts.insertBefore === "hr" && (
                <hr className="border-border/40" />
              )}
              {inserts.insertBefore === "spacer" && <div className="h-6" />}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: block selection is pointer-only by design */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: block selection uses onPointerUp + onClick */}
              <div
                data-testid={`reader-block-${message.id}-${blockIndex}`}
                className={getReaderBlockClassName({
                  adjustModeEnabled,
                  effects: blockEffects,
                  isHighlighted,
                  isSelected,
                })}
                style={getReaderBlockStyle(blockEffects)}
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

                  if (
                    Date.now() - lastSelectionInteractionAt.current <
                    SELECTION_DEBOUNCE_MS
                  ) {
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
                <ErrorBoundary
                  fallback={<BlockErrorFallback blockType={block.type} />}
                >
                  {editMode && onBlockChange ? (
                    <EditableBlock
                      block={block}
                      blockIndex={blockIndex}
                      messageId={message.id}
                      onBlockChange={onBlockChange}
                    >
                      <BlockRenderer block={block} effects={blockEffects} />
                    </EditableBlock>
                  ) : (
                    <BlockRenderer block={block} effects={blockEffects} />
                  )}
                </ErrorBoundary>
              </div>
              {inserts.insertAfter === "hr" && (
                <hr className="border-border/40" />
              )}
              {inserts.insertAfter === "spacer" && <div className="h-6" />}
              {editMode && onBlocksChange && (
                <BlockInserter
                  blockIndex={blockIndex + 1}
                  onInsertBlock={handleInsertBlock}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </article>
  );
});

export function ReaderView({
  activeRules,
  adjustModeEnabled,
  conversation,
  deletedMessageIds,
  editMode,
  effectsMap,
  highlightedRuleId,
  onBlocksChange,
  onCopyMessage,
  onDeleteMessage,
  onDeleteRound,
  onRestoreMessage,
  onSelectBlock,
  selectedBlock,
  showDeleted,
}: ReaderViewProps) {
  const visibleMessages = useMemo(() => {
    if (!conversation?.messages) return [];
    if (!deletedMessageIds?.size) return conversation.messages;
    if (showDeleted) return conversation.messages;
    return conversation.messages.filter((m) => !deletedMessageIds.has(m.id));
  }, [conversation?.messages, deletedMessageIds, showDeleted]);

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

  const handleBlockChange = useCallback(
    (messageId: string, blockIndex: number, newBlock: Block) => {
      if (!onBlocksChange || !conversation) return;
      const message = conversation.messages.find((m) => m.id === messageId);
      if (!message) return;
      const updatedBlocks = message.blocks.map((b, i) =>
        i === blockIndex ? newBlock : b,
      );
      onBlocksChange(messageId, updatedBlocks);
    },
    [onBlocksChange, conversation],
  );

  if (!conversation?.messages.length) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/75 px-4 py-5 text-sm text-muted-foreground">
        Für diesen Import ist noch kein Transkriptinhalt verfügbar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleMessages.map((message, index) => (
        <ReaderMessage
          key={message.id}
          adjustModeEnabled={adjustModeEnabled}
          editMode={editMode}
          effectsMap={effectsMap}
          highlightedBlocks={highlightedBlocks}
          message={message}
          messageIndex={index}
          onBlockChange={editMode ? handleBlockChange : undefined}
          onBlocksChange={editMode ? onBlocksChange : undefined}
          onCopyMessage={
            onCopyMessage ? () => onCopyMessage(message.id) : undefined
          }
          onSelectBlock={onSelectBlock}
          selectedBlock={selectedBlock}
          isDeleted={deletedMessageIds?.has(message.id)}
          onDeleteMessage={
            onDeleteMessage ? () => onDeleteMessage(message.id) : undefined
          }
          onDeleteRound={
            onDeleteRound ? () => onDeleteRound(message.id) : undefined
          }
          onRestore={
            onRestoreMessage
              ? () => {
                  void onRestoreMessage(message.id);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
