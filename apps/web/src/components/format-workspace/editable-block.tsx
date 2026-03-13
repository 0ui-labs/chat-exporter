import type { Block } from "@chat-exporter/shared";
import { useCallback, useRef } from "react";

interface EditableBlockProps {
  block: Block;
  blockIndex: number;
  messageId: string;
  onBlockChange: (
    messageId: string,
    blockIndex: number,
    newBlock: Block,
  ) => void;
  children: React.ReactNode;
}

/**
 * Read the DOM content of the editable element and construct a new Block
 * that matches the original block's type, preserving type-specific fields
 * (e.g. heading level, code language, list ordered flag).
 */
function readBlockFromDom(element: HTMLElement, original: Block): Block {
  switch (original.type) {
    case "paragraph":
      return { type: "paragraph", text: element.textContent ?? "" };

    case "heading":
      return {
        type: "heading",
        level: original.level,
        text: element.textContent ?? "",
      };

    case "quote":
      return { type: "quote", text: element.textContent ?? "" };

    case "code":
      return {
        type: "code",
        language: original.language,
        text: element.textContent ?? "",
      };

    case "list": {
      const listItems = element.querySelectorAll("li");
      const items = Array.from(listItems).map((li) => li.textContent ?? "");
      return {
        type: "list",
        ordered: original.ordered,
        items: items.length > 0 ? items : [element.textContent ?? ""],
      };
    }

    case "table": {
      const thElements = element.querySelectorAll("th");
      const headers = Array.from(thElements).map((th) => th.textContent ?? "");

      const bodyRows = element.querySelectorAll("tbody tr");
      const rows = Array.from(bodyRows).map((tr) => {
        const cells = tr.querySelectorAll("td");
        return Array.from(cells).map((td) => td.textContent ?? "");
      });

      return { type: "table", headers, rows };
    }

    default:
      return original;
  }
}

export function EditableBlock({
  block,
  blockIndex,
  messageId,
  onBlockChange,
  children,
}: EditableBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    const newBlock = readBlockFromDom(element, block);
    onBlockChange(messageId, blockIndex, newBlock);
  }, [block, blockIndex, messageId, onBlockChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.currentTarget.blur();
      }
    },
    [],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const plainText = event.clipboardData.getData("text/plain");
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(plainText));
        range.collapse(false);
      }
    },
    [],
  );

  return (
    /* biome-ignore lint/a11y/useSemanticElements: contentEditable div wraps arbitrary block content, not a simple text input */
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      data-testid="editable-block"
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className="outline-none rounded-md ring-0 focus:ring-1 focus:ring-blue-300 transition-shadow"
    >
      {children}
    </div>
  );
}
