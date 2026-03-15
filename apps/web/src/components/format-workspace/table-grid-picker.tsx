import { useState } from "react";

import { cn } from "@/lib/utils";

interface TableGridPickerProps {
  onSelect: (cols: number, rows: number) => void;
}

const MAX_COLS = 8;
const MAX_ROWS = 6;

function TableGridPicker({ onSelect }: TableGridPickerProps) {
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(
    null,
  );

  const cells: { col: number; row: number }[] = [];
  for (let row = 1; row <= MAX_ROWS; row++) {
    for (let col = 1; col <= MAX_COLS; col++) {
      cells.push({ col, row });
    }
  }

  return (
    <div className="p-2" onMouseLeave={() => setHovered(null)}>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}
      >
        {cells.map(({ col, row }) => {
          const isHighlighted =
            hovered !== null && col <= hovered.col && row <= hovered.row;

          return (
            <button
              key={`${col}-${row}`}
              type="button"
              data-testid={`grid-cell-${col}-${row}`}
              className={cn(
                "h-5 w-5 rounded-sm border border-border/60",
                isHighlighted
                  ? "bg-primary/20 border-primary/40"
                  : "bg-background",
              )}
              onMouseEnter={() => setHovered({ col, row })}
              onClick={() => onSelect(col, row)}
            />
          );
        })}
      </div>
      {hovered !== null && hovered.col > 0 && hovered.row > 0 && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          {hovered.col} × {hovered.row}
        </p>
      )}
    </div>
  );
}

export { TableGridPicker };
export type { TableGridPickerProps };
