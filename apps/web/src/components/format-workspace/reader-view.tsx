import type { Block, Conversation } from "@chat-exporter/shared";

import type { AdjustmentSelection } from "@/components/format-workspace/types";
import { cn } from "@/lib/utils";

type ReaderViewProps = {
  adjustModeEnabled: boolean;
  conversation: Conversation | undefined;
  onSelectBlock: (selection: AdjustmentSelection) => void;
  selectedBlock: AdjustmentSelection | null;
};

function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [block.headers.join(" "), ...block.rows.map((row) => row.join(" "))].join(" ");
  }
}

function renderBlock(block: Block) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-7 text-foreground/90">{block.text}</p>;
    case "heading": {
      const Tag = `h${Math.min(block.level + 1, 6)}` as keyof JSX.IntrinsicElements;
      return <Tag className="font-semibold text-foreground">{block.text}</Tag>;
    }
    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-4 text-sm italic leading-7 text-foreground/80">
          {block.text}
        </blockquote>
      );
    case "code":
      return (
        <div className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-sm text-zinc-100">
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">{block.language}</p>
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
                <tr key={`${rowIndex}-${row.join("-")}`} className="border-t border-border/80">
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

export function ReaderView({
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
              const isSelected =
                selectedBlock?.messageId === message.id && selectedBlock.blockIndex === blockIndex;

              return (
                <div
                  key={`${message.id}-${block.type}-${blockIndex}`}
                  className={cn(
                    "rounded-2xl transition",
                    adjustModeEnabled
                      ? "cursor-pointer ring-1 ring-transparent hover:bg-primary/5 hover:ring-primary/20"
                      : null,
                    isSelected ? "bg-primary/8 ring-2 ring-primary/40" : null
                  )}
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
                  {renderBlock(block)}
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
