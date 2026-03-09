import assert from "node:assert/strict";
import test from "node:test";

import type { AdjustmentSelection } from "@chat-exporter/shared";

import { buildAdjustmentAssistantReply } from "./adjustment-assistant.js";

function createSelection(
  overrides: Partial<AdjustmentSelection> = {},
): AdjustmentSelection {
  return {
    blockIndex: 0,
    blockType: "paragraph",
    messageId: "message-1",
    messageIndex: 0,
    messageRole: "assistant",
    selectedText: "Example content",
    textQuote: "Example content",
    ...overrides,
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
      textQuote: "Important: check the logs",
    }),
    targetFormat: "markdown",
    userMessage: "Labels with a colon should always be bold everywhere.",
  });

  assert.match(reply, /Markdown-sicher/i);
  assert.match(reply, /ähnliche labelartige Zeilen/i);
});

test("reader replies explain reusable heading spacing rules", () => {
  const reply = buildAdjustmentAssistantReply({
    selection: createSelection({
      blockType: "heading",
      selectedText: "Project plan",
      textQuote: "Project plan",
    }),
    targetFormat: "reader",
    userMessage: "Please add more spacing under headings here.",
  });

  assert.match(reply, /Reader-Darstellungsregel/i);
  assert.match(reply, /ähnliche Überschriften/i);
});

test("reader replies explain markdown bold marker rendering in German", () => {
  const reply = buildAdjustmentAssistantReply({
    selection: createSelection({
      selectedText:
        "**Normale Zusammenfassungen sind verlustbehaftet.** Für einen Endlos-Thread brauchst du stattdessen etwas wie:",
      textQuote:
        "**Normale Zusammenfassungen sind verlustbehaftet.** Für einen Endlos-Thread brauchst du stattdessen etwas wie:",
    }),
    targetFormat: "reader",
    userMessage: "Bold scheint fehlerhaft formatiert zu sein.",
  });

  assert.match(reply, /Markdown-Markierungen/i);
  assert.match(reply, /genau dieser Auswahl/i);
});
