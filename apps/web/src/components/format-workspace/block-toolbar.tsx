import type { Block } from "@chat-exporter/shared";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Heading2,
  List,
  Pilcrow,
  Quote,
  Trash2,
  Type,
} from "lucide-react";
import { useCallback } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Pure utility: extract text from any block type
// ---------------------------------------------------------------------------

export function getBlockText(block: Block): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join("\n");
    case "table": {
      const headerLine = block.headers.join(" | ");
      const rows = block.rows.map((row) => row.join(" | ")).join("\n");
      return rows ? `${headerLine}\n${rows}` : headerLine;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure utility: convert a block to a different type
// ---------------------------------------------------------------------------

export type ConvertibleBlockType = "paragraph" | "heading" | "quote" | "list";

export function convertBlockType(
  block: Block,
  targetType: ConvertibleBlockType,
): Block {
  const text = getBlockText(block);
  switch (targetType) {
    case "paragraph":
      return { type: "paragraph", text };
    case "heading":
      return { type: "heading", level: 2, text };
    case "quote":
      return { type: "quote", text };
    case "list":
      return { type: "list", ordered: false, items: [text] };
  }
}

// ---------------------------------------------------------------------------
// Type-change menu items
// ---------------------------------------------------------------------------

const TYPE_CHANGE_ITEMS: {
  key: ConvertibleBlockType;
  label: string;
  icon: typeof Pilcrow;
}[] = [
  { key: "paragraph", label: "Paragraph", icon: Pilcrow },
  { key: "heading", label: "Heading", icon: Heading2 },
  { key: "quote", label: "Quote", icon: Quote },
  { key: "list", label: "List", icon: List },
];

// ---------------------------------------------------------------------------
// BlockToolbar component
// ---------------------------------------------------------------------------

export interface BlockToolbarProps {
  block: Block;
  blockIndex: number;
  totalBlocks: number;
  onDelete: (blockIndex: number) => void;
  onDuplicate: (blockIndex: number) => void;
  onMoveUp: (blockIndex: number) => void;
  onMoveDown: (blockIndex: number) => void;
  onTypeChange: (blockIndex: number, newBlock: Block) => void;
}

export function BlockToolbar({
  block,
  blockIndex,
  totalBlocks,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onTypeChange,
}: BlockToolbarProps) {
  const isFirst = blockIndex === 0;
  const isLast = blockIndex === totalBlocks - 1;

  const handleTypeSelect = useCallback(
    (targetType: ConvertibleBlockType) => {
      const converted = convertBlockType(block, targetType);
      onTypeChange(blockIndex, converted);
    },
    [block, blockIndex, onTypeChange],
  );

  return (
    <div className="absolute -top-8 left-0 z-10 flex items-center gap-0.5 rounded-lg border border-border/60 bg-background px-1 py-0.5 shadow-sm">
      {/* Type change dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Blocktyp ändern"
          >
            <Type className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {TYPE_CHANGE_ITEMS.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem key={key} onSelect={() => handleTypeSelect(key)}>
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move up */}
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Block nach oben"
        disabled={isFirst}
        onClick={() => onMoveUp(blockIndex)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>

      {/* Move down */}
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Block nach unten"
        disabled={isLast}
        onClick={() => onMoveDown(blockIndex)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>

      {/* Duplicate */}
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        aria-label="Block duplizieren"
        onClick={() => onDuplicate(blockIndex)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      {/* Delete */}
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"
        aria-label="Block löschen"
        onClick={() => onDelete(blockIndex)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
