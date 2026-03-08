import type { Conversation, FormatRule } from "@chat-exporter/shared";

import {
  blockToPlainText,
  getReaderBlockClassName,
  renderReaderBlock,
  resolveReaderBlockEffects
} from "@/components/format-workspace/rule-engine";
import type { AdjustmentSelection } from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

type ReaderViewProps = {
  activeRules: FormatRule[];
  adjustModeEnabled: boolean;
  conversation: Conversation | undefined;
  onSelectBlock: (selection: AdjustmentSelection) => void;
  selectedBlock: AdjustmentSelection | null;
};

export function ReaderView({
  activeRules,
  adjustModeEnabled,
  conversation,
  onSelectBlock,
  selectedBlock
}: ReaderViewProps) {
  if (!conversation?.messages.length) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/75 px-4 py-5 text-sm text-muted-foreground">
        No transcript content is available for this import.
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
            message.role === "assistant" ? "bg-card/92" : "bg-secondary/30"
          )}
        >
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{message.role}</span>
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
                blockText
              );
              const isSelected =
                selectedBlock?.messageId === message.id && selectedBlock.blockIndex === blockIndex;

              return (
                <div
                  key={`${message.id}-${block.type}-${blockIndex}`}
                  className={getReaderBlockClassName({
                    adjustModeEnabled,
                    effects: blockEffects,
                    isSelected
                  })}
                  onClick={() => {
                    if (!adjustModeEnabled) {
                      return;
                    }

                    onSelectBlock({
                      blockIndex,
                      blockType: block.type,
                      messageId: message.id,
                      messageIndex: index,
                      messageRole: message.role,
                      selectedText: blockText,
                      textQuote:
                        blockText.length > 180 ? `${blockText.slice(0, 177).trimEnd()}...` : blockText
                    });
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
