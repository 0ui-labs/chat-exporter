// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, type Mock, test, vi } from "vitest";

import { TableEditor } from "./table-editor";

// ---------------------------------------------------------------------------
// Radix UI polyfills
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture ??= vi.fn();
  Element.prototype.releasePointerCapture ??= vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTableBlock(
  overrides: { headers?: string[]; rows?: string[][] } = {},
) {
  return {
    id: "block-1",
    type: "table" as const,
    headers: overrides.headers ?? ["Name", "Age"],
    rows: overrides.rows ?? [
      ["Alice", "30"],
      ["Bob", "25"],
    ],
  };
}

function createMaxTable() {
  return createTableBlock({
    headers: Array.from({ length: 10 }, (_, i) => `Col ${i + 1}`),
    rows: Array.from({ length: 10 }, (_, ri) =>
      Array.from({ length: 10 }, (_, ci) => `r${ri}c${ci}`),
    ),
  });
}

function createMinTable() {
  return createTableBlock({
    headers: ["Only"],
    rows: [["Cell"]],
  });
}

function renderTableEditor(
  overrides: {
    block?: ReturnType<typeof createTableBlock>;
    effects?: [];
    onBlockChange?: Mock;
  } = {},
) {
  const block = overrides.block ?? createTableBlock();
  const onBlockChange = overrides.onBlockChange ?? vi.fn();
  const effects = overrides.effects ?? [];

  const result = render(
    <TableEditor
      block={block}
      messageId="msg-1"
      blockIndex={0}
      effects={effects}
      onBlockChange={onBlockChange}
    />,
  );

  return { ...result, block, onBlockChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TableEditor", () => {
  describe("cell editing", () => {
    test("editing a body cell and blurring calls onBlockChange with updated data", () => {
      const { onBlockChange, container } = renderTableEditor();

      const cells = container.querySelectorAll("[contenteditable]");
      // First 2 cells are headers, next are body cells
      const bodyCell = cells[2] as HTMLDivElement; // Alice

      bodyCell.textContent = "Charlie";
      fireEvent.blur(bodyCell);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Name", "Age"],
        rows: [
          ["Charlie", "30"],
          ["Bob", "25"],
        ],
      });
    });

    test("editing a header cell and blurring calls onBlockChange with updated headers", () => {
      const { onBlockChange, container } = renderTableEditor();

      const cells = container.querySelectorAll("[contenteditable]");
      const headerCell = cells[0] as HTMLDivElement; // Name

      headerCell.textContent = "Full Name";
      fireEvent.blur(headerCell);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Full Name", "Age"],
        rows: [
          ["Alice", "30"],
          ["Bob", "25"],
        ],
      });
    });

    test("blurring a cell without changes does not call onBlockChange", () => {
      const { onBlockChange, container } = renderTableEditor();

      const cells = container.querySelectorAll("[contenteditable]");
      const headerCell = cells[0] as HTMLDivElement;

      fireEvent.blur(headerCell);

      expect(onBlockChange).not.toHaveBeenCalled();
    });
  });

  describe("add row", () => {
    test("clicking add row button calls onBlockChange with an additional row", async () => {
      const user = userEvent.setup();
      const { onBlockChange } = renderTableEditor();

      const addRowBtn = screen.getByRole("button", {
        name: /zeile hinzufügen/i,
      });
      await user.click(addRowBtn);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Name", "Age"],
        rows: [
          ["Alice", "30"],
          ["Bob", "25"],
          ["", ""],
        ],
      });
    });
  });

  describe("add column", () => {
    test("clicking add column button calls onBlockChange with an additional column", async () => {
      const user = userEvent.setup();
      const { onBlockChange } = renderTableEditor();

      const addColBtn = screen.getByRole("button", {
        name: /spalte hinzufügen/i,
      });
      await user.click(addColBtn);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Name", "Age", "Spalte 3"],
        rows: [
          ["Alice", "30", ""],
          ["Bob", "25", ""],
        ],
      });
    });
  });

  describe("remove column", () => {
    test("clicking remove column button calls onBlockChange without that column", async () => {
      const user = userEvent.setup();
      const { onBlockChange } = renderTableEditor();

      const removeColBtns = screen.getAllByRole("button", {
        name: /spalte entfernen/i,
      });
      // Remove first column ("Name")
      await user.click(removeColBtns[0] as HTMLElement);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Age"],
        rows: [["30"], ["25"]],
      });
    });
  });

  describe("remove row", () => {
    test("clicking remove row button calls onBlockChange without that row", async () => {
      const user = userEvent.setup();
      const { onBlockChange } = renderTableEditor();

      const removeRowBtns = screen.getAllByRole("button", {
        name: /zeile entfernen/i,
      });
      // Remove first row
      await user.click(removeRowBtns[0] as HTMLElement);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        id: "block-1",
        type: "table",
        headers: ["Name", "Age"],
        rows: [["Bob", "25"]],
      });
    });
  });

  describe("limits", () => {
    test("add row button is not rendered when table has 10 rows", () => {
      renderTableEditor({ block: createMaxTable() });

      expect(
        screen.queryByRole("button", { name: /zeile hinzufügen/i }),
      ).not.toBeInTheDocument();
    });

    test("add column button is not rendered when table has 10 columns", () => {
      renderTableEditor({ block: createMaxTable() });

      expect(
        screen.queryByRole("button", { name: /spalte hinzufügen/i }),
      ).not.toBeInTheDocument();
    });

    test("remove row buttons are not rendered when table has 1 row", () => {
      renderTableEditor({ block: createMinTable() });

      expect(
        screen.queryByRole("button", { name: /zeile entfernen/i }),
      ).toBeNull();
    });

    test("remove column buttons are not rendered when table has 1 column", () => {
      renderTableEditor({ block: createMinTable() });

      expect(
        screen.queryByRole("button", { name: /spalte entfernen/i }),
      ).toBeNull();
    });
  });

  describe("tab navigation", () => {
    test("Tab moves focus to the next editable cell", () => {
      const { container } = renderTableEditor();

      const cells = container.querySelectorAll(
        "[contenteditable]",
      ) as NodeListOf<HTMLDivElement>;
      const firstCell = cells.item(0);
      const secondCell = cells.item(1);

      firstCell.focus();
      expect(document.activeElement).toBe(firstCell);

      fireEvent.keyDown(firstCell, { key: "Tab" });

      expect(document.activeElement).toBe(secondCell);
    });

    test("Shift+Tab moves focus to the previous editable cell", () => {
      const { container } = renderTableEditor();

      const cells = container.querySelectorAll(
        "[contenteditable]",
      ) as NodeListOf<HTMLDivElement>;
      const firstCell = cells.item(0);
      const secondCell = cells.item(1);

      secondCell.focus();
      expect(document.activeElement).toBe(secondCell);

      fireEvent.keyDown(secondCell, { key: "Tab", shiftKey: true });

      expect(document.activeElement).toBe(firstCell);
    });
  });
});
