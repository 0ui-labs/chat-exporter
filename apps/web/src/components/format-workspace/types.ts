import type { Block } from "@chat-exporter/shared";

export type ViewMode = "reader" | "markdown" | "handover" | "json";

export type AdjustmentSelection = {
  blockIndex: number;
  blockType: Block["type"];
  messageId: string;
  messageIndex: number;
  messageRole: string;
  selectedText: string;
  textQuote: string;
};
