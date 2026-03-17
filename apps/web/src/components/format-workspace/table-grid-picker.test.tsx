// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TableGridPicker } from "./table-grid-picker";

// ---------------------------------------------------------------------------
// Radix UI polyfills (project convention)
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi
    .fn()
    .mockReturnValue(false) as Element["hasPointerCapture"];
  Element.prototype.setPointerCapture ??=
    vi.fn() as Element["setPointerCapture"];
  Element.prototype.releasePointerCapture ??=
    vi.fn() as Element["releasePointerCapture"];
  Element.prototype.scrollIntoView ??= vi.fn() as Element["scrollIntoView"];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TableGridPicker", () => {
  test("renders all 48 grid cells (8×6)", () => {
    render(<TableGridPicker onSelect={vi.fn()} />);

    const cells: HTMLElement[] = [];
    for (let row = 1; row <= 6; row++) {
      for (let col = 1; col <= 8; col++) {
        const cell = screen.getByTestId(`grid-cell-${col}-${row}`);
        expect(cell).toBeInTheDocument();
        cells.push(cell);
      }
    }
    expect(cells).toHaveLength(48);
  });

  test("shows label '2 × 3' when hovering cell (2,3)", async () => {
    const user = userEvent.setup();
    render(<TableGridPicker onSelect={vi.fn()} />);

    expect(screen.queryByText("2 × 3")).not.toBeInTheDocument();

    const cell = screen.getByTestId("grid-cell-2-3");
    await user.hover(cell);

    expect(screen.getByText("2 × 3")).toBeInTheDocument();
  });

  test("calls onSelect(2, 3) when clicking cell (2,3)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TableGridPicker onSelect={onSelect} />);

    const cell = screen.getByTestId("grid-cell-2-3");
    await user.click(cell);

    expect(onSelect).toHaveBeenCalledWith(2, 3);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("highlights cells up to hovered position", async () => {
    const user = userEvent.setup();
    render(<TableGridPicker onSelect={vi.fn()} />);

    const cell = screen.getByTestId("grid-cell-2-3");
    await user.hover(cell);

    // Cells within the selection (col <= 2, row <= 3) should be highlighted
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 2; col++) {
        const highlighted = screen.getByTestId(`grid-cell-${col}-${row}`);
        expect(highlighted.className).toMatch(/bg-primary/);
      }
    }

    // A cell outside the selection should NOT be highlighted
    const outside = screen.getByTestId("grid-cell-3-3");
    expect(outside.className).not.toMatch(/bg-primary/);
  });

  test("no label shown in default state (no hover)", () => {
    render(<TableGridPicker onSelect={vi.fn()} />);

    // No dimension label should be visible
    expect(screen.queryByText(/\d+ × \d+/)).not.toBeInTheDocument();
  });
});
