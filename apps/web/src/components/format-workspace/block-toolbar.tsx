import { type Block, generateBlockId } from "@chat-exporter/shared";
import {
  ArrowDown,
  ArrowUp,
  Code,
  Copy,
  Heading2,
  Heading3,
  List,
  Pilcrow,
  Plus,
  Quote,
  Table,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  const id = block.id ?? generateBlockId();
  switch (targetType) {
    case "paragraph":
      return { id, type: "paragraph", text };
    case "heading":
      return { id, type: "heading", level: 2, text };
    case "quote":
      return { id, type: "quote", text };
    case "list":
      return { id, type: "list", ordered: false, items: [text] };
  }
}

// ---------------------------------------------------------------------------
// Insert-block menu items
// ---------------------------------------------------------------------------

const INSERT_BLOCK_ITEMS = [
  { key: "paragraph", label: "Paragraph", icon: Pilcrow },
  { key: "h2", label: "Heading (H2)", icon: Heading2 },
  { key: "h3", label: "Heading (H3)", icon: Heading3 },
  { key: "list", label: "List", icon: List },
  { key: "code", label: "Code", icon: Code },
  { key: "quote", label: "Quote", icon: Quote },
  { key: "table", label: "Table", icon: Table },
] as const;

const BLOCK_DEFAULTS: Record<string, Record<string, unknown>> = {
  paragraph: {
    type: "paragraph",
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  h2: { type: "heading", level: 2, text: "Neue Überschrift" },
  h3: { type: "heading", level: 3, text: "Neue Unterüberschrift" },
  list: {
    type: "list",
    ordered: false,
    items: ["Erster Punkt", "Zweiter Punkt", "Dritter Punkt"],
  },
  code: {
    type: "code",
    language: "text",
    text: "// Code hier eingeben",
  },
  quote: { type: "quote", text: "Zitat hier eingeben" },
  table: {
    type: "table",
    headers: ["Spalte 1", "Spalte 2"],
    rows: [["Wert 1", "Wert 2"]],
  },
};

// ---------------------------------------------------------------------------
// BlockToolbar component
// ---------------------------------------------------------------------------

export interface BlockToolbarProps {
  block: Block;
  blockIndex: number;
  totalBlocks: number;
  onDelete: (blockIndex: number) => void;
  onDuplicate: (blockIndex: number) => void;
  onInsertBlock: (blockIndex: number, block: Block) => void;
  onMenuOpenChange?: (open: boolean) => void;
  onMoveUp: (blockIndex: number) => void;
  onMoveDown: (blockIndex: number) => void;
}

export function BlockToolbar({
  block: _block,
  blockIndex,
  totalBlocks,
  onDelete,
  onDuplicate,
  onInsertBlock,
  onMenuOpenChange,
  onMoveUp,
  onMoveDown,
}: BlockToolbarProps) {
  const isFirst = blockIndex === 0;
  const isLast = blockIndex === totalBlocks - 1;

  // Track how many dropdowns are open so the parent can prevent unmounting
  const [, setOpenCount] = useState(0);
  const handleDropdownOpenChange = useCallback(
    (open: boolean) => {
      setOpenCount((c) => {
        const next = c + (open ? 1 : -1);
        onMenuOpenChange?.(next > 0);
        return next;
      });
    },
    [onMenuOpenChange],
  );

  const handleInsertSelect = useCallback(
    (key: string) => {
      const template = BLOCK_DEFAULTS[key];
      if (template) {
        onInsertBlock(blockIndex + 1, {
          ...template,
          id: generateBlockId(),
        } as Block);
      }
    },
    [blockIndex, onInsertBlock],
  );

  return (
    <div className="absolute -top-8 left-0 z-10 flex items-center gap-0.5 rounded-lg border border-border/60 bg-background px-1 py-0.5 shadow-sm">
      {/* Insert block dropdown */}
      <DropdownMenu onOpenChange={handleDropdownOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Block einfügen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="text-xs">
            Einfügen nach
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {INSERT_BLOCK_ITEMS.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem
              key={key}
              onSelect={() => handleInsertSelect(key)}
            >
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
