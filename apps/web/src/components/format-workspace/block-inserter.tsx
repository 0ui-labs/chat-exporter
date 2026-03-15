import { type Block, generateBlockId } from "@chat-exporter/shared";
import {
  Code,
  Heading2,
  Heading3,
  List,
  Pilcrow,
  Plus,
  Quote,
  Table,
} from "lucide-react";
import { useCallback } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Block defaults
// ---------------------------------------------------------------------------

export const BLOCK_DEFAULTS = {
  paragraph: {
    type: "paragraph" as const,
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  h2: {
    type: "heading" as const,
    level: 2 as const,
    text: "Neue Überschrift",
  },
  h3: {
    type: "heading" as const,
    level: 3 as const,
    text: "Neue Unterüberschrift",
  },
  list: {
    type: "list" as const,
    ordered: false,
    items: ["Erster Punkt", "Zweiter Punkt", "Dritter Punkt"],
  },
  code: {
    type: "code" as const,
    language: "text",
    text: "// Code hier eingeben",
  },
  quote: { type: "quote" as const, text: "Zitat hier eingeben" },
  table: {
    type: "table" as const,
    headers: ["Spalte 1", "Spalte 2"],
    rows: [["Wert 1", "Wert 2"]],
  },
} as const;

// ---------------------------------------------------------------------------
// Menu items configuration
// ---------------------------------------------------------------------------

const BLOCK_TYPE_ITEMS = [
  { key: "paragraph", label: "Paragraph", icon: Pilcrow },
  { key: "h2", label: "Heading (H2)", icon: Heading2 },
  { key: "h3", label: "Heading (H3)", icon: Heading3 },
  { key: "list", label: "List", icon: List },
  { key: "code", label: "Code", icon: Code },
  { key: "quote", label: "Quote", icon: Quote },
  { key: "table", label: "Table", icon: Table },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BlockInserterProps {
  blockIndex: number;
  onInsertBlock: (blockIndex: number, block: Block) => void;
  visible?: boolean;
}

export function BlockInserter({
  blockIndex,
  onInsertBlock,
  visible = false,
}: BlockInserterProps) {
  const handleSelect = useCallback(
    (key: keyof typeof BLOCK_DEFAULTS) => {
      onInsertBlock(blockIndex, {
        ...BLOCK_DEFAULTS[key],
        id: generateBlockId(),
      } as Block);
    },
    [blockIndex, onInsertBlock],
  );

  return (
    <div className="relative flex items-center justify-center pointer-events-none">
      {/* Hover line */}
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors",
          visible ? "bg-border/60" : "bg-border/0",
        )}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "pointer-events-auto relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-opacity hover:bg-secondary hover:text-foreground",
              visible ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-label="Block hinzufügen"
          >
            <Plus className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          {BLOCK_TYPE_ITEMS.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem key={key} onSelect={() => handleSelect(key)}>
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
