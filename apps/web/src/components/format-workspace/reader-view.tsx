import {
  type Block,
  type Conversation,
  type FormatRule,
  generateBlockId,
  type Message,
  type RuleEffect,
} from "@chat-exporter/shared";
import { ClipboardCopy } from "lucide-react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { BlockErrorFallback } from "@/components/format-workspace/block-error-fallback";
import { BlockToolbar } from "@/components/format-workspace/block-toolbar";
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
import { TableEditor } from "@/components/format-workspace/table-editor";
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
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(
    null,
  );
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarMenuOpen = useRef(false);
  const blocksRef = useRef(message.blocks);
  blocksRef.current = message.blocks;
  const handleToolbarMenuOpenChange = useCallback((open: boolean) => {
    toolbarMenuOpen.current = open;
  }, []);

  const handleBlockMouseEnter = useCallback(
    (blockIndex: number) => {
      if (!editMode) return;
      if (hoverLeaveTimer.current) {
        clearTimeout(hoverLeaveTimer.current);
        hoverLeaveTimer.current = null;
      }
      setHoveredBlockIndex(blockIndex);
    },
    [editMode],
  );

  const handleBlockMouseLeave = useCallback(() => {
    if (!editMode) return;
    if (toolbarMenuOpen.current) return;
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredBlockIndex(null);
      hoverLeaveTimer.current = null;
    }, 150);
  }, [editMode]);

  const handleDeleteBlock = useCallback(
    (blockIndex: number) => {
      if (!onBlocksChange) return;
      const updatedBlocks = [...blocksRef.current];
      updatedBlocks.splice(blockIndex, 1);
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.id, onBlocksChange],
  );

  const handleDuplicateBlock = useCallback(
    (blockIndex: number) => {
      if (!onBlocksChange) return;
      const updatedBlocks = [...blocksRef.current];
      const original = updatedBlocks[blockIndex];
      if (!original) return;
      const copy = { ...original, id: generateBlockId() } as Block;
      updatedBlocks.splice(blockIndex + 1, 0, copy);
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.id, onBlocksChange],
  );

  const handleMoveUp = useCallback(
    (blockIndex: number) => {
      if (!onBlocksChange || blockIndex === 0) return;
      const updatedBlocks = [...blocksRef.current];
      const current = updatedBlocks[blockIndex];
      const above = updatedBlocks[blockIndex - 1];
      if (!current || !above) return;
      updatedBlocks[blockIndex - 1] = current;
      updatedBlocks[blockIndex] = above;
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.id, onBlocksChange],
  );

  const handleMoveDown = useCallback(
    (blockIndex: number) => {
      if (!onBlocksChange || blockIndex >= blocksRef.current.length - 1) return;
      const updatedBlocks = [...blocksRef.current];
      const current = updatedBlocks[blockIndex];
      const below = updatedBlocks[blockIndex + 1];
      if (!current || !below) return;
      updatedBlocks[blockIndex] = below;
      updatedBlocks[blockIndex + 1] = current;
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.id, onBlocksChange],
  );

  const handleInsertBlock = useCallback(
    (blockIndex: number, block: Block) => {
      if (!onBlocksChange) return;
      const updatedBlocks = [...blocksRef.current];
      updatedBlocks.splice(blockIndex, 0, block);
      onBlocksChange(message.id, updatedBlocks);
    },
    [message.id, onBlocksChange],
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
        {message.blocks.map((block, blockIndex) => {
          const blockText = blockToPlainText(block);
          const blockEffects =
            effectsMap.get(`${message.id}:${block.id}`) ?? [];
          const isSelected =
            selectedBlock?.messageId === message.id &&
            selectedBlock.blockIndex === blockIndex;
          const isHighlighted = highlightedBlocks.has(
            `${message.id}:${block.id}`,
          );
          const emitSelection = (
            anchor: ViewportAnchor,
            selectedText: string,
          ) => {
            lastSelectionInteractionAt.current = Date.now();

            onSelectBlock(
              {
                blockId: block.id,
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
            <React.Fragment key={block.id}>
              {inserts.insertBefore === "hr" && (
                <hr className="border-border/40" />
              )}
              {inserts.insertBefore === "spacer" && <div className="h-6" />}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: hover tracking for block toolbar */}
              <div
                className="relative"
                onMouseEnter={() => handleBlockMouseEnter(blockIndex)}
                onMouseLeave={handleBlockMouseLeave}
              >
                {editMode &&
                  onBlocksChange &&
                  hoveredBlockIndex === blockIndex && (
                    <BlockToolbar
                      block={block}
                      blockIndex={blockIndex}
                      totalBlocks={message.blocks.length}
                      onDelete={handleDeleteBlock}
                      onDuplicate={handleDuplicateBlock}
                      onInsertBlock={handleInsertBlock}
                      onMenuOpenChange={handleToolbarMenuOpenChange}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  )}
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
                    {editMode && onBlockChange && block.type === "table" ? (
                      <TableEditor
                        block={block}
                        messageId={message.id}
                        blockIndex={blockIndex}
                        effects={blockEffects}
                        onBlockChange={onBlockChange}
                      />
                    ) : editMode && onBlockChange ? (
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
                {/* BlockInserter removed — insert is now in BlockToolbar */}
              </div>
              {inserts.insertAfter === "hr" && (
                <hr className="border-border/40" />
              )}
              {inserts.insertAfter === "spacer" && <div className="h-6" />}
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

  // Tracks the latest in-progress blocks per message so that consecutive edits
  // within the same debounce window build on top of each other rather than on
  // stale props (which would cause earlier edits to be overwritten).
  const pendingBlocksRef = useRef<Map<string, Block[]>>(new Map());

  // When the conversation prop updates (i.e. the parent has persisted the edit
  // and passed the new data back down), clear any pending entries whose blocks
  // now match the incoming props — they are no longer "in-flight".
  useEffect(() => {
    if (!conversation) return;
    const pending = pendingBlocksRef.current;
    for (const [messageId] of pending) {
      const message = conversation.messages.find((m) => m.id === messageId);
      if (!message) {
        pending.delete(messageId);
        continue;
      }
      // If the prop blocks now reflect our last pending write, the save has
      // been acknowledged — remove the entry so the next edit starts fresh.
      const pendingBlocks = pending.get(messageId);
      if (
        pendingBlocks &&
        pendingBlocks.length === message.blocks.length &&
        pendingBlocks.every((b, i) => b === message.blocks[i])
      ) {
        pending.delete(messageId);
      }
    }
  }, [conversation]);

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
    return new Set(matches.map((m) => `${m.messageId}:${m.blockId}`));
  }, [highlightedRuleId, activeRules, conversation]);

  const handleBlockChange = useCallback(
    (messageId: string, blockIndex: number, newBlock: Block) => {
      if (!onBlocksChange || !conversation) return;
      const message = conversation.messages.find((m) => m.id === messageId);
      if (!message) return;

      // Use pending blocks as the base if present (prevents stale-closure
      // overwrites when the user edits multiple blocks before the debounced
      // save propagates updated props back down).
      const baseBlocks =
        pendingBlocksRef.current.get(messageId) ?? message.blocks;

      const updatedBlocks = baseBlocks.map((b, i) =>
        i === blockIndex ? newBlock : b,
      );

      pendingBlocksRef.current.set(messageId, updatedBlocks);
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
