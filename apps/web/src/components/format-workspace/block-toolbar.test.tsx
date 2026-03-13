// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { Block } from "@chat-exporter/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { BlockToolbar, convertBlockType, getBlockText } from "./block-toolbar";

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
// getBlockText
// ---------------------------------------------------------------------------

describe("getBlockText", () => {
  test("returns text from paragraph block", () => {
    const block: Block = { type: "paragraph", text: "Hello world" };

    const result = getBlockText(block);

    expect(result).toBe("Hello world");
  });

  test("returns text from heading block", () => {
    const block: Block = { type: "heading", level: 2, text: "My Heading" };

    const result = getBlockText(block);

    expect(result).toBe("My Heading");
  });

  test("returns text from quote block", () => {
    const block: Block = { type: "quote", text: "A wise quote" };

    const result = getBlockText(block);

    expect(result).toBe("A wise quote");
  });

  test("returns text from code block", () => {
    const block: Block = { type: "code", language: "ts", text: "const x = 1;" };

    const result = getBlockText(block);

    expect(result).toBe("const x = 1;");
  });

  test("joins list items with newline", () => {
    const block: Block = {
      type: "list",
      ordered: false,
      items: ["Item 1", "Item 2", "Item 3"],
    };

    const result = getBlockText(block);

    expect(result).toBe("Item 1\nItem 2\nItem 3");
  });

  test("joins table headers with comma-space", () => {
    const block: Block = {
      type: "table",
      headers: ["Name", "Age", "City"],
      rows: [["Alice", "30", "Berlin"]],
    };

    const result = getBlockText(block);

    expect(result).toBe("Name, Age, City");
  });
});

// ---------------------------------------------------------------------------
// convertBlockType
// ---------------------------------------------------------------------------

describe("convertBlockType", () => {
  test("paragraph to heading preserves text and sets level 2", () => {
    const block: Block = { type: "paragraph", text: "Some text" };

    const result = convertBlockType(block, "heading");

    expect(result).toEqual({ type: "heading", level: 2, text: "Some text" });
  });

  test("heading to paragraph preserves text", () => {
    const block: Block = { type: "heading", level: 3, text: "Title" };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ type: "paragraph", text: "Title" });
  });

  test("paragraph to quote preserves text", () => {
    const block: Block = { type: "paragraph", text: "Quoted text" };

    const result = convertBlockType(block, "quote");

    expect(result).toEqual({ type: "quote", text: "Quoted text" });
  });

  test("heading to quote preserves text", () => {
    const block: Block = { type: "heading", level: 1, text: "Big heading" };

    const result = convertBlockType(block, "quote");

    expect(result).toEqual({ type: "quote", text: "Big heading" });
  });

  test("paragraph to list makes text a single item", () => {
    const block: Block = { type: "paragraph", text: "Single item" };

    const result = convertBlockType(block, "list");

    expect(result).toEqual({
      type: "list",
      ordered: false,
      items: ["Single item"],
    });
  });

  test("heading to list makes text a single item", () => {
    const block: Block = { type: "heading", level: 2, text: "Heading text" };

    const result = convertBlockType(block, "list");

    expect(result).toEqual({
      type: "list",
      ordered: false,
      items: ["Heading text"],
    });
  });

  test("list to paragraph joins items with newline", () => {
    const block: Block = {
      type: "list",
      ordered: true,
      items: ["First", "Second"],
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ type: "paragraph", text: "First\nSecond" });
  });

  test("quote to paragraph preserves text", () => {
    const block: Block = { type: "quote", text: "Wise words" };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ type: "paragraph", text: "Wise words" });
  });

  test("code to paragraph preserves text", () => {
    const block: Block = { type: "code", language: "js", text: "let x = 1" };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ type: "paragraph", text: "let x = 1" });
  });

  test("table to paragraph uses headers as text", () => {
    const block: Block = {
      type: "table",
      headers: ["Col A", "Col B"],
      rows: [["1", "2"]],
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ type: "paragraph", text: "Col A, Col B" });
  });
});

// ---------------------------------------------------------------------------
// BlockToolbar component
// ---------------------------------------------------------------------------

describe("BlockToolbar", () => {
  const defaultProps = {
    block: { type: "paragraph" as const, text: "Test" },
    blockIndex: 1,
    totalBlocks: 5,
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onTypeChange: vi.fn(),
  };

  function renderToolbar(overrides: Partial<typeof defaultProps> = {}) {
    const props = { ...defaultProps, ...overrides };
    // Reset mocks for each render
    for (const fn of [
      props.onDelete,
      props.onDuplicate,
      props.onMoveUp,
      props.onMoveDown,
      props.onTypeChange,
    ]) {
      fn.mockClear();
    }
    return render(<BlockToolbar {...props} />);
  }

  test("delete button calls onDelete with blockIndex", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderToolbar({ onDelete, blockIndex: 2 });

    await user.click(screen.getByRole("button", { name: /block löschen/i }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  test("duplicate button calls onDuplicate with blockIndex", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    renderToolbar({ onDuplicate, blockIndex: 3 });

    await user.click(
      screen.getByRole("button", { name: /block duplizieren/i }),
    );

    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledWith(3);
  });

  test("move up button calls onMoveUp with blockIndex", async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    renderToolbar({ onMoveUp, blockIndex: 2 });

    await user.click(screen.getByRole("button", { name: /block nach oben/i }));

    expect(onMoveUp).toHaveBeenCalledOnce();
    expect(onMoveUp).toHaveBeenCalledWith(2);
  });

  test("move down button calls onMoveDown with blockIndex", async () => {
    const user = userEvent.setup();
    const onMoveDown = vi.fn();
    renderToolbar({ onMoveDown, blockIndex: 1 });

    await user.click(screen.getByRole("button", { name: /block nach unten/i }));

    expect(onMoveDown).toHaveBeenCalledOnce();
    expect(onMoveDown).toHaveBeenCalledWith(1);
  });

  test("move up is disabled for first block", () => {
    renderToolbar({ blockIndex: 0 });

    expect(
      screen.getByRole("button", { name: /block nach oben/i }),
    ).toBeDisabled();
  });

  test("move down is disabled for last block", () => {
    renderToolbar({ blockIndex: 4, totalBlocks: 5 });

    expect(
      screen.getByRole("button", { name: /block nach unten/i }),
    ).toBeDisabled();
  });

  test("move up is enabled for non-first block", () => {
    renderToolbar({ blockIndex: 1 });

    expect(
      screen.getByRole("button", { name: /block nach oben/i }),
    ).toBeEnabled();
  });

  test("move down is enabled for non-last block", () => {
    renderToolbar({ blockIndex: 2, totalBlocks: 5 });

    expect(
      screen.getByRole("button", { name: /block nach unten/i }),
    ).toBeEnabled();
  });

  test("type dropdown shows convertible type options", async () => {
    const user = userEvent.setup();
    renderToolbar({
      block: { type: "paragraph", text: "Test" },
    });

    await user.click(screen.getByRole("button", { name: /blocktyp ändern/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /paragraph/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /heading/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /quote/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /list/i })).toBeInTheDocument();
  });

  test("selecting a type from dropdown calls onTypeChange", async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    renderToolbar({
      onTypeChange,
      blockIndex: 1,
      block: { type: "paragraph", text: "Hello" },
    });

    await user.click(screen.getByRole("button", { name: /blocktyp ändern/i }));
    await user.click(screen.getByRole("menuitem", { name: /heading/i }));

    expect(onTypeChange).toHaveBeenCalledOnce();
    expect(onTypeChange).toHaveBeenCalledWith(1, {
      type: "heading",
      level: 2,
      text: "Hello",
    });
  });
});
