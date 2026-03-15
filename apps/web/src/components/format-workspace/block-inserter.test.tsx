// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { BLOCK_DEFAULTS, BlockInserter } from "./block-inserter";

// ---------------------------------------------------------------------------
// Radix UI Polyfills (required for jsdom)
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture ??= vi.fn();
  Element.prototype.releasePointerCapture ??= vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BlockInserter", () => {
  test("renders add-block button", () => {
    render(<BlockInserter blockIndex={0} onInsertBlock={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /block hinzufügen/i }),
    ).toBeInTheDocument();
  });

  test("click on + button opens block type menu", async () => {
    const user = userEvent.setup();
    render(<BlockInserter blockIndex={0} onInsertBlock={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /paragraph/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /heading.*h2/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /heading.*h3/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /list/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /code/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /quote/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /table/i }),
    ).toBeInTheDocument();
  });

  test("selecting paragraph calls onInsertBlock with correct default", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={3} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /paragraph/i }));

    expect(onInsertBlock).toHaveBeenCalledOnce();
    expect(onInsertBlock).toHaveBeenCalledWith(
      3,
      expect.objectContaining(BLOCK_DEFAULTS.paragraph),
    );
    const insertedBlock = onInsertBlock.mock.calls[0]?.[1];
    expect(insertedBlock.id).toHaveLength(8);
  });

  test("selecting heading h2 calls onInsertBlock with heading level 2", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={1} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /heading.*h2/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      1,
      expect.objectContaining(BLOCK_DEFAULTS.h2),
    );
  });

  test("selecting heading h3 calls onInsertBlock with heading level 3", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={0} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /heading.*h3/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      0,
      expect.objectContaining(BLOCK_DEFAULTS.h3),
    );
  });

  test("selecting list calls onInsertBlock with unordered list default", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={2} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /list/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      2,
      expect.objectContaining(BLOCK_DEFAULTS.list),
    );
  });

  test("selecting code calls onInsertBlock with code default", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={0} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /code/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      0,
      expect.objectContaining(BLOCK_DEFAULTS.code),
    );
  });

  test("selecting quote calls onInsertBlock with quote default", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={0} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /quote/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      0,
      expect.objectContaining(BLOCK_DEFAULTS.quote),
    );
  });

  test("selecting table calls onInsertBlock with table default", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={0} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /table/i }));

    expect(onInsertBlock).toHaveBeenCalledWith(
      0,
      expect.objectContaining(BLOCK_DEFAULTS.table),
    );
  });

  test("inserted blocks get unique IDs", async () => {
    const user = userEvent.setup();
    const onInsertBlock = vi.fn();
    render(<BlockInserter blockIndex={0} onInsertBlock={onInsertBlock} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /paragraph/i }));

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /paragraph/i }));

    const id1 = onInsertBlock.mock.calls[0]?.[1].id;
    const id2 = onInsertBlock.mock.calls[1]?.[1].id;
    expect(id1).toHaveLength(8);
    expect(id2).toHaveLength(8);
    expect(id1).not.toBe(id2);
  });

  test("each block type default has non-empty example content", () => {
    expect(BLOCK_DEFAULTS.paragraph.type).toBe("paragraph");
    expect(BLOCK_DEFAULTS.paragraph.text.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.h2.type).toBe("heading");
    expect(BLOCK_DEFAULTS.h2.text.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.h3.type).toBe("heading");
    expect(BLOCK_DEFAULTS.h3.text.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.list.type).toBe("list");
    expect(BLOCK_DEFAULTS.list.items.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.code.type).toBe("code");
    expect(BLOCK_DEFAULTS.code.text.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.quote.type).toBe("quote");
    expect(BLOCK_DEFAULTS.quote.text.length).toBeGreaterThan(0);
    expect(BLOCK_DEFAULTS.table.type).toBe("table");
    expect(BLOCK_DEFAULTS.table.rows[0].length).toBeGreaterThan(0);
  });

  test("menu closes after selecting a block type", async () => {
    const user = userEvent.setup();
    render(<BlockInserter blockIndex={0} onInsertBlock={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /block hinzufügen/i }));
    await user.click(screen.getByRole("menuitem", { name: /paragraph/i }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
