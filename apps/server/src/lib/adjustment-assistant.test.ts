import type { AdjustmentSelection } from "@chat-exporter/shared";
import { expect, test } from "vitest";

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

  expect(reply).toMatch(/Markdown-sicher/i);
  expect(reply).toMatch(/ähnliche labelartige Zeilen/i);
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

  expect(reply).toMatch(/Reader-Darstellungsregel/i);
  expect(reply).toMatch(/ähnliche Überschriften/i);
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

  expect(reply).toMatch(/Markdown-Markierungen/i);
  expect(reply).toMatch(/genau dieser Auswahl/i);
});
