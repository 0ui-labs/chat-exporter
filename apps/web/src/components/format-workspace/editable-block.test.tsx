// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { Block } from "@chat-exporter/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EditableBlock } from "./editable-block";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function paragraphBlock(text = "Hello world"): Block {
  return { type: "paragraph", text };
}

function headingBlock(text = "My Heading", level = 2): Block {
  return { type: "heading", level, text };
}

function quoteBlock(text = "A quote"): Block {
  return { type: "quote", text };
}

function codeBlock(text = 'console.log("hi")', language = "typescript"): Block {
  return { type: "code", language, text };
}

function listBlock(
  items = ["Item 1", "Item 2", "Item 3"],
  ordered = false,
): Block {
  return { type: "list", ordered, items };
}

function tableBlock(): Block {
  return {
    type: "table",
    headers: ["Name", "Age"],
    rows: [
      ["Alice", "30"],
      ["Bob", "25"],
    ],
  };
}

function renderEditable(
  block: Block,
  overrides?: Partial<{
    blockIndex: number;
    messageId: string;
    onBlockChange: (
      messageId: string,
      blockIndex: number,
      newBlock: Block,
    ) => void;
  }>,
) {
  const props = {
    block,
    blockIndex: overrides?.blockIndex ?? 0,
    messageId: overrides?.messageId ?? "msg-1",
    onBlockChange: overrides?.onBlockChange ?? vi.fn(),
  };

  return render(
    <EditableBlock {...props}>
      <span data-testid="block-content">{JSON.stringify(block)}</span>
    </EditableBlock>,
  );
}

// ---------------------------------------------------------------------------
// Helpers — build DOM structures for list/table blur tests
// ---------------------------------------------------------------------------

function setListDom(element: HTMLElement, items: string[]) {
  while (element.firstChild) element.removeChild(element.firstChild);
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  element.appendChild(ul);
}

function setTableDom(
  element: HTMLElement,
  headers: string[],
  rows: string[][],
) {
  while (element.firstChild) element.removeChild(element.firstChild);
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  element.appendChild(table);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EditableBlock", () => {
  describe("contentEditable attribute", () => {
    test("wraps children in a contentEditable div", () => {
      renderEditable(paragraphBlock());

      const editable = screen.getByTestId("editable-block");
      expect(editable).toHaveAttribute("contenteditable", "true");
    });

    test("renders children inside the editable wrapper", () => {
      renderEditable(paragraphBlock());

      expect(screen.getByTestId("block-content")).toBeInTheDocument();
    });
  });

  describe("onPaste strips HTML and inserts plain text only", () => {
    test("prevents default paste and uses plain text from clipboard", () => {
      renderEditable(paragraphBlock());

      const editable = screen.getByTestId("editable-block");

      const preventDefault = vi.fn();
      const pasteEvent = new Event("paste", { bubbles: true }) as Event & {
        clipboardData: { getData: (type: string) => string };
      };
      Object.defineProperty(pasteEvent, "preventDefault", {
        value: preventDefault,
      });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          getData: (type: string) =>
            type === "text/plain" ? "plain text only" : "<b>bold</b>",
        },
      });

      editable.dispatchEvent(pasteEvent);

      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe("onKeyDown: Escape triggers blur", () => {
    test("pressing Escape blurs the editable element", async () => {
      const user = userEvent.setup();
      renderEditable(paragraphBlock());

      const editable = screen.getByTestId("editable-block");
      editable.focus();

      await user.keyboard("{Escape}");

      expect(document.activeElement).not.toBe(editable);
    });
  });

  describe("onBlur fires onBlockChange with correct block data", () => {
    test("paragraph block reads textContent on blur", () => {
      const onBlockChange = vi.fn();
      renderEditable(paragraphBlock("Original text"), { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      editable.textContent = "Updated text";
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "paragraph",
        text: "Updated text",
      });
    });

    test("heading block preserves level on blur", () => {
      const onBlockChange = vi.fn();
      renderEditable(headingBlock("Old heading", 3), { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      editable.textContent = "New heading";
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "heading",
        level: 3,
        text: "New heading",
      });
    });

    test("quote block reads textContent on blur", () => {
      const onBlockChange = vi.fn();
      renderEditable(quoteBlock("Old quote"), { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      editable.textContent = "New quote";
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "quote",
        text: "New quote",
      });
    });

    test("code block preserves language on blur", () => {
      const onBlockChange = vi.fn();
      renderEditable(codeBlock("old code", "python"), { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      editable.textContent = "new code";
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "code",
        language: "python",
        text: "new code",
      });
    });

    test("list block reads li elements on blur", () => {
      const onBlockChange = vi.fn();
      const block = listBlock(["A", "B"]);
      renderEditable(block, { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      setListDom(editable, ["X", "Y", "Z"]);
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "list",
        ordered: false,
        items: ["X", "Y", "Z"],
      });
    });

    test("table block reads cells on blur", () => {
      const onBlockChange = vi.fn();
      renderEditable(tableBlock(), { onBlockChange });

      const editable = screen.getByTestId("editable-block");
      setTableDom(
        editable,
        ["Col1", "Col2"],
        [
          ["R1C1", "R1C2"],
          ["R2C1", "R2C2"],
        ],
      );
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-1", 0, {
        type: "table",
        headers: ["Col1", "Col2"],
        rows: [
          ["R1C1", "R1C2"],
          ["R2C1", "R2C2"],
        ],
      });
    });
  });

  describe("passes messageId and blockIndex correctly", () => {
    test("uses provided messageId and blockIndex in onBlockChange", () => {
      const onBlockChange = vi.fn();
      renderEditable(paragraphBlock("text"), {
        onBlockChange,
        messageId: "msg-42",
        blockIndex: 7,
      });

      const editable = screen.getByTestId("editable-block");
      editable.textContent = "changed";
      fireEvent.blur(editable);

      expect(onBlockChange).toHaveBeenCalledWith("msg-42", 7, {
        type: "paragraph",
        text: "changed",
      });
    });
  });
});
