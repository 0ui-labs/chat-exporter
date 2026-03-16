import type { Block, RuleEffect } from "@chat-exporter/shared";
import { useCallback, useEffect, useRef } from "react";

import { getReaderBlockStyle } from "@/components/format-workspace/rule-engine";

import type { TableBlock } from "./table-utils";
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  canRemoveColumn,
  canRemoveRow,
  removeColumn,
  removeRow,
} from "./table-utils";

interface TableEditorProps {
  block: TableBlock;
  messageId: string;
  blockIndex: number;
  effects: RuleEffect[];
  onBlockChange: (messageId: string, blockIndex: number, block: Block) => void;
}

// ---------------------------------------------------------------------------
// EditableCell — uncontrolled contentEditable div
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    /* biome-ignore lint/a11y/useSemanticElements: contentEditable div wraps arbitrary block content, not a simple text input */
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      onBlur={() => {
        const text = ref.current?.textContent ?? "";
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      className="min-w-[2rem] px-1 outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// TableEditor
// ---------------------------------------------------------------------------

export function TableEditor({
  block,
  messageId,
  blockIndex,
  effects,
  onBlockChange,
}: TableEditorProps) {
  const tableRef = useRef<HTMLDivElement>(null);

  const handleHeaderChange = useCallback(
    (colIndex: number, value: string) => {
      const newHeaders = [...block.headers];
      newHeaders[colIndex] = value;
      onBlockChange(messageId, blockIndex, { ...block, headers: newHeaders });
    },
    [block, messageId, blockIndex, onBlockChange],
  );

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      const newRows = block.rows.map((row, ri) =>
        ri === rowIndex
          ? row.map((cell, ci) => (ci === colIndex ? value : cell))
          : row,
      );
      onBlockChange(messageId, blockIndex, { ...block, rows: newRows });
    },
    [block, messageId, blockIndex, onBlockChange],
  );

  const handleAddRow = useCallback(
    () => onBlockChange(messageId, blockIndex, addRow(block)),
    [block, messageId, blockIndex, onBlockChange],
  );

  const handleAddColumn = useCallback(
    () => onBlockChange(messageId, blockIndex, addColumn(block)),
    [block, messageId, blockIndex, onBlockChange],
  );

  const handleRemoveRow = useCallback(
    (rowIndex: number) =>
      onBlockChange(messageId, blockIndex, removeRow(block, rowIndex)),
    [block, messageId, blockIndex, onBlockChange],
  );

  const handleRemoveColumn = useCallback(
    (colIndex: number) =>
      onBlockChange(messageId, blockIndex, removeColumn(block, colIndex)),
    [block, messageId, blockIndex, onBlockChange],
  );

  // Tab navigation across all editable cells in the table
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      if (!tableRef.current) return;

      const cells = tableRef.current.querySelectorAll("[contenteditable]");
      if (cells.length === 0) return;

      const currentIndex = Array.from(cells).indexOf(
        document.activeElement as Element,
      );
      if (currentIndex === -1) return;

      e.preventDefault();

      const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex >= 0 && nextIndex < cells.length) {
        (cells[nextIndex] as HTMLElement).focus();
      }
    },
    [],
  );

  const containerStyle = getReaderBlockStyle(effects);
  const showRemoveCol = canRemoveColumn(block);
  const showRemoveRow = canRemoveRow(block);
  const showAddCol = canAddColumn(block);
  const showAddRow = canAddRow(block);

  return (
    /* biome-ignore lint/a11y/useSemanticElements: div container for table with keyboard navigation */
    <div
      ref={tableRef}
      role="group"
      style={containerStyle}
      className="overflow-x-auto rounded-2xl border border-border/80"
      onKeyDown={handleTableKeyDown}
    >
      <table className="min-w-full table-fixed text-left text-sm">
        <thead className="bg-secondary/70 text-secondary-foreground">
          <tr>
            {block.headers.map((header, colIndex) => (
              <th
                key={`h-${colIndex}`}
                className="group relative px-4 py-3 font-medium"
              >
                <EditableCell
                  value={header}
                  onCommit={(v) => handleHeaderChange(colIndex, v)}
                />
                {showRemoveCol && (
                  <button
                    type="button"
                    className="absolute -top-2 right-1 hidden rounded-full bg-destructive/80 px-1.5 text-xs text-destructive-foreground group-hover:block"
                    onClick={() => handleRemoveColumn(colIndex)}
                    aria-label="Spalte entfernen"
                  >
                    &times;
                  </button>
                )}
              </th>
            ))}
            {showAddCol && (
              <th className="w-8">
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={handleAddColumn}
                  aria-label="Spalte hinzufügen"
                >
                  +
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr
              key={`r-${rowIndex}`}
              className="group border-t border-border/80"
            >
              {row.map((cell, colIndex) => (
                <td
                  key={`c-${rowIndex}-${colIndex}`}
                  className="px-4 py-3 align-top text-muted-foreground"
                >
                  <EditableCell
                    value={cell}
                    onCommit={(v) => handleCellChange(rowIndex, colIndex, v)}
                  />
                </td>
              ))}
              {showRemoveRow && (
                <td className="px-1 py-3">
                  <button
                    type="button"
                    className="hidden rounded-full bg-destructive/80 px-1.5 text-xs text-destructive-foreground group-hover:block"
                    onClick={() => handleRemoveRow(rowIndex)}
                    aria-label="Zeile entfernen"
                  >
                    &times;
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {showAddRow && (
        <button
          type="button"
          className="w-full border-t border-dashed border-border/80 py-2 text-center text-sm text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
          onClick={handleAddRow}
          aria-label="Zeile hinzufügen"
        >
          + Zeile
        </button>
      )}
    </div>
  );
}
