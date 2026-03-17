import type { Block, Message } from "@chat-exporter/shared";

import { copyMessageToClipboard } from "./message-clipboard";

// ---------------------------------------------------------------------------
// Mock navigator.clipboard
// ---------------------------------------------------------------------------

// jsdom does not provide ClipboardItem — polyfill for tests
if (typeof globalThis.ClipboardItem === "undefined") {
  globalThis.ClipboardItem = class ClipboardItem {
    private _items: Record<string, Blob>;
    constructor(items: Record<string, Blob>) {
      this._items = items;
    }
    get types() {
      return Object.keys(this._items);
    }
    async getType(type: string) {
      const blob = this._items[type];
      if (!blob) throw new Error(`Type ${type} not found`);
      return blob;
    }
  } as unknown as typeof ClipboardItem;
}

const mockWriteText = vi.fn().mockResolvedValue(undefined);
const mockWrite = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText, write: mockWrite },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function lastWriteTextArg(): string {
  const call = mockWriteText.mock.calls.at(0);
  if (!call) throw new Error("writeText was not called");
  return call[0] as string;
}

function lastWriteArg(): ClipboardItem[] {
  const call = mockWrite.mock.calls.at(0);
  if (!call) throw new Error("write was not called");
  return call[0] as ClipboardItem[];
}

function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: "msg-1",
    role: "assistant",
    blocks: [
      { id: "b1", type: "paragraph", text: "Hello world" },
      { id: "b2", type: "heading", level: 2, text: "Section" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("copyMessageToClipboard", () => {
  describe("markdown format", () => {
    test("copies blocks as markdown text", async () => {
      const message = createMessage({
        blocks: [
          { id: "b1", type: "paragraph", text: "Hello world" },
          { id: "b2", type: "heading", level: 2, text: "Section" },
        ],
      });

      await copyMessageToClipboard(message, "markdown", message.blocks);

      expect(mockWriteText).toHaveBeenCalledTimes(1);
      const text = lastWriteTextArg();
      expect(text).toContain("Hello world");
      expect(text).toContain("## Section");
    });

    test("renders code blocks with language fence", async () => {
      const blocks: Block[] = [
        {
          id: "b3",
          type: "code",
          language: "typescript",
          text: "const x = 1;",
        },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "markdown", blocks);

      const text = lastWriteTextArg();
      expect(text).toContain("```typescript");
      expect(text).toContain("const x = 1;");
      expect(text).toContain("```");
    });

    test("renders list blocks", async () => {
      const blocks: Block[] = [
        { id: "b4", type: "list", ordered: false, items: ["Item A", "Item B"] },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "markdown", blocks);

      const text = lastWriteTextArg();
      expect(text).toContain("- Item A");
      expect(text).toContain("- Item B");
    });

    test("renders ordered list blocks", async () => {
      const blocks: Block[] = [
        { id: "b5", type: "list", ordered: true, items: ["First", "Second"] },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "markdown", blocks);

      const text = lastWriteTextArg();
      expect(text).toContain("1. First");
      expect(text).toContain("2. Second");
    });

    test("renders quote blocks", async () => {
      const blocks: Block[] = [
        { id: "b6", type: "quote", text: "A wise saying" },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "markdown", blocks);

      const text = lastWriteTextArg();
      expect(text).toContain("> A wise saying");
    });

    test("renders table blocks", async () => {
      const blocks: Block[] = [
        {
          id: "b7",
          type: "table",
          headers: ["Name", "Age"],
          rows: [["Alice", "30"]],
        },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "markdown", blocks);

      const text = lastWriteTextArg();
      expect(text).toContain("| Name | Age |");
      expect(text).toContain("| Alice | 30 |");
    });
  });

  describe("json format", () => {
    test("copies message as JSON string", async () => {
      const message = createMessage();

      await copyMessageToClipboard(message, "json", message.blocks);

      expect(mockWriteText).toHaveBeenCalledTimes(1);
      const text = lastWriteTextArg();
      const parsed = JSON.parse(text);
      expect(parsed.id).toBe("msg-1");
      expect(parsed.role).toBe("assistant");
      expect(parsed.blocks).toHaveLength(2);
    });
  });

  describe("handover format", () => {
    test("copies blocks as plain text for handover", async () => {
      const message = createMessage({
        blocks: [
          { id: "b8", type: "paragraph", text: "Summary here" },
          { id: "b9", type: "heading", level: 2, text: "Context" },
        ],
      });

      await copyMessageToClipboard(message, "handover", message.blocks);

      expect(mockWriteText).toHaveBeenCalledTimes(1);
      const text = lastWriteTextArg();
      expect(text).toContain("Summary here");
      expect(text).toContain("Context");
    });
  });

  describe("reader format", () => {
    test("copies blocks as HTML using clipboard.write", async () => {
      const blocks: Block[] = [
        { id: "b10", type: "paragraph", text: "Hello world" },
        { id: "b11", type: "heading", level: 2, text: "Section" },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "reader", blocks);

      expect(mockWrite).toHaveBeenCalledTimes(1);
      const clipboardItems = lastWriteArg();
      expect(clipboardItems).toHaveLength(1);

      const item = clipboardItems[0] as ClipboardItem;
      const htmlBlob = await item.getType("text/html");
      const html = await htmlBlob.text();
      expect(html).toContain("<p");
      expect(html).toContain("Hello world");
      expect(html).toContain("<h2");
      expect(html).toContain("Section");
    });

    test("renders code blocks with pre/code tags", async () => {
      const blocks: Block[] = [
        { id: "b12", type: "code", language: "js", text: "const x = 1;" },
      ];
      const message = createMessage({ blocks });

      await copyMessageToClipboard(message, "reader", blocks);

      const clipboardItems = lastWriteArg();
      const item = clipboardItems[0] as ClipboardItem;
      const htmlBlob = await item.getType("text/html");
      const html = await htmlBlob.text();
      expect(html).toContain("<pre");
      expect(html).toContain("<code");
      expect(html).toContain("const x = 1;");
    });
  });
});
