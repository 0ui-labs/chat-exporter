import type { Block } from "@chat-exporter/shared";
import { generateBlockId } from "@chat-exporter/shared";

type TableBlock = Extract<Block, { type: "table" }>;

export function createEmptyTable(cols: number, rows: number): TableBlock {
  return {
    id: generateBlockId(),
    type: "table",
    headers: Array.from({ length: cols }, (_, i) => `Spalte ${i + 1}`),
    rows: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ""),
    ),
  };
}

export function addRow(table: TableBlock): TableBlock {
  const emptyRow = Array.from({ length: table.headers.length }, () => "");
  return { ...table, rows: [...table.rows, emptyRow] };
}

export function addColumn(table: TableBlock): TableBlock {
  const newHeader = `Spalte ${table.headers.length + 1}`;
  return {
    ...table,
    headers: [...table.headers, newHeader],
    rows: table.rows.map((row) => [...row, ""]),
  };
}

export function removeRow(table: TableBlock, rowIndex: number): TableBlock {
  if (table.rows.length <= 1) return table;
  return { ...table, rows: table.rows.filter((_, i) => i !== rowIndex) };
}

export function removeColumn(table: TableBlock, colIndex: number): TableBlock {
  if (table.headers.length <= 1) return table;
  return {
    ...table,
    headers: table.headers.filter((_, i) => i !== colIndex),
    rows: table.rows.map((row) => row.filter((_, i) => i !== colIndex)),
  };
}

export function canAddRow(table: TableBlock): boolean {
  return table.rows.length < 10;
}

export function canAddColumn(table: TableBlock): boolean {
  return table.headers.length < 10;
}

export function canRemoveRow(table: TableBlock): boolean {
  return table.rows.length > 1;
}

export function canRemoveColumn(table: TableBlock): boolean {
  return table.headers.length > 1;
}
