import assert from "node:assert/strict";
import test from "node:test";

import type { AdjustmentSelection } from "@chat-exporter/shared";

import { buildAdjustmentAssistantReply } from "./adjustment-assistant.js";

function createSelection(overrides: Partial<AdjustmentSelection> = {}): AdjustmentSelection {
  return {
    blockIndex: 0,
    blockType: "paragraph",
    messageId: "message-1",
    messageIndex: 0,
    messageRole: "assistant",
    selectedText: "Example content",
    textQuote: "Example content",
    ...overrides
  };
}

test("markdown replies explain portable limits and suggest broader label scopes", () => {
  const reply = buildAdjustmentAssistantReply({
    selection: createSelection({
      blockType: "markdown-lines",
      lineEnd: 8,
      lineStart: 8,
      messageId: "markdown:8-8",
      messageRole: "markdown",
      selectedText: "Important: check the logs",
      textQuote: "Important: check the logs"
    }),
    targetFormat: "markdown",
    userMessage: "Labels with a colon should always be bold everywhere."
  });

  assert.match(reply, /Markdown-safe/i);
  assert.match(reply, /similar label-style lines/i);
});

test("reader replies explain reusable heading spacing rules", () => {
  const reply = buildAdjustmentAssistantReply({
    selection: createSelection({
      blockType: "heading",
      selectedText: "Project plan",
      textQuote: "Project plan"
    }),
    targetFormat: "reader",
    userMessage: "Please add more spacing under headings here."
  });

  assert.match(reply, /Reader render rule/i);
  assert.match(reply, /other heading blocks/i);
});
