import type { Block } from "@chat-exporter/shared";

export type ViewMode = "reader" | "markdown" | "handover" | "json";

export type AdjustmentSelection = {
  blockIndex: number;
  blockType: Block["type"] | "markdown-lines";
  lineEnd?: number;
  lineStart?: number;
  messageId: string;
  messageIndex: number;
  messageRole: string;
  selectedText: string;
  textQuote: string;
};
