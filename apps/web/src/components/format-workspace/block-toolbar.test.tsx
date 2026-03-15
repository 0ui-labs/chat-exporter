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
    const block: Block = { id: "b1", type: "paragraph", text: "Hello world" };

    const result = getBlockText(block);

    expect(result).toBe("Hello world");
  });

  test("returns text from heading block", () => {
    const block: Block = {
      id: "b2",
      type: "heading",
      level: 2,
      text: "My Heading",
    };

    const result = getBlockText(block);

    expect(result).toBe("My Heading");
  });

  test("returns text from quote block", () => {
    const block: Block = { id: "b3", type: "quote", text: "A wise quote" };

    const result = getBlockText(block);

    expect(result).toBe("A wise quote");
  });

  test("returns text from code block", () => {
    const block: Block = {
      id: "b4",
      type: "code",
      language: "ts",
      text: "const x = 1;",
    };

    const result = getBlockText(block);

    expect(result).toBe("const x = 1;");
  });

  test("joins list items with newline", () => {
    const block: Block = {
      id: "b5",
      type: "list",
      ordered: false,
      items: ["Item 1", "Item 2", "Item 3"],
    };

    const result = getBlockText(block);

    expect(result).toBe("Item 1\nItem 2\nItem 3");
  });

  test("joins table headers with pipe separator and includes rows", () => {
    const block: Block = {
      id: "b6",
      type: "table",
      headers: ["Name", "Age", "City"],
      rows: [["Alice", "30", "Berlin"]],
    };

    const result = getBlockText(block);

    expect(result).toBe("Name | Age | City\nAlice | 30 | Berlin");
  });

  test("table with no rows returns only headers", () => {
    const block: Block = {
      id: "b7",
      type: "table",
      headers: ["Col A", "Col B"],
      rows: [],
    };

    const result = getBlockText(block);

    expect(result).toBe("Col A | Col B");
  });

  test("table with multiple rows includes all rows", () => {
    const block: Block = {
      id: "b8",
      type: "table",
      headers: ["Name", "Score"],
      rows: [
        ["Alice", "100"],
        ["Bob", "85"],
      ],
    };

    const result = getBlockText(block);

    expect(result).toBe("Name | Score\nAlice | 100\nBob | 85");
  });
});

// ---------------------------------------------------------------------------
// convertBlockType
// ---------------------------------------------------------------------------

describe("convertBlockType", () => {
  test("paragraph to heading preserves text and sets level 2", () => {
    const block: Block = { id: "b9", type: "paragraph", text: "Some text" };

    const result = convertBlockType(block, "heading");

    expect(result).toEqual({
      id: "b9",
      type: "heading",
      level: 2,
      text: "Some text",
    });
  });

  test("heading to paragraph preserves text", () => {
    const block: Block = {
      id: "b10",
      type: "heading",
      level: 3,
      text: "Title",
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ id: "b10", type: "paragraph", text: "Title" });
  });

  test("paragraph to quote preserves text", () => {
    const block: Block = { id: "b11", type: "paragraph", text: "Quoted text" };

    const result = convertBlockType(block, "quote");

    expect(result).toEqual({ id: "b11", type: "quote", text: "Quoted text" });
  });

  test("heading to quote preserves text", () => {
    const block: Block = {
      id: "b12",
      type: "heading",
      level: 1,
      text: "Big heading",
    };

    const result = convertBlockType(block, "quote");

    expect(result).toEqual({ id: "b12", type: "quote", text: "Big heading" });
  });

  test("paragraph to list makes text a single item", () => {
    const block: Block = { id: "b13", type: "paragraph", text: "Single item" };

    const result = convertBlockType(block, "list");

    expect(result).toEqual({
      id: "b13",
      type: "list",
      ordered: false,
      items: ["Single item"],
    });
  });

  test("heading to list makes text a single item", () => {
    const block: Block = {
      id: "b14",
      type: "heading",
      level: 2,
      text: "Heading text",
    };

    const result = convertBlockType(block, "list");

    expect(result).toEqual({
      id: "b14",
      type: "list",
      ordered: false,
      items: ["Heading text"],
    });
  });

  test("list to paragraph joins items with newline", () => {
    const block: Block = {
      id: "b15",
      type: "list",
      ordered: true,
      items: ["First", "Second"],
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({
      id: "b15",
      type: "paragraph",
      text: "First\nSecond",
    });
  });

  test("quote to paragraph preserves text", () => {
    const block: Block = { id: "b16", type: "quote", text: "Wise words" };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({
      id: "b16",
      type: "paragraph",
      text: "Wise words",
    });
  });

  test("code to paragraph preserves text", () => {
    const block: Block = {
      id: "b17",
      type: "code",
      language: "js",
      text: "let x = 1",
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({ id: "b17", type: "paragraph", text: "let x = 1" });
  });

  test("table to paragraph includes headers and rows separated by pipe", () => {
    const block: Block = {
      id: "b18",
      type: "table",
      headers: ["Col A", "Col B"],
      rows: [["1", "2"]],
    };

    const result = convertBlockType(block, "paragraph");

    expect(result).toEqual({
      id: "b18",
      type: "paragraph",
      text: "Col A | Col B\n1 | 2",
    });
  });
});

// ---------------------------------------------------------------------------
// BlockToolbar component
// ---------------------------------------------------------------------------

describe("BlockToolbar", () => {
  const defaultProps = {
    block: { id: "b0", type: "paragraph" as const, text: "Test" },
    blockIndex: 1,
    totalBlocks: 5,
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onInsertBlock: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
  };

  function renderToolbar(overrides: Partial<typeof defaultProps> = {}) {
    const props = { ...defaultProps, ...overrides };
    // Reset mocks for each render
    for (const fn of [
      props.onDelete,
      props.onDuplicate,
      props.onMoveUp,
      props.onMoveDown,
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
});
