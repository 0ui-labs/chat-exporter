import assert from "node:assert/strict";
import test from "node:test";

import type {
  AdjustmentSelection,
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  Role
} from "@chat-exporter/shared";

import { buildAdjustmentPreview } from "./adjustment-preview.js";

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

function createSessionDetail(params: {
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
  userMessage: string;
}): AdjustmentSessionDetail {
  const { selection, targetFormat, userMessage } = params;

  return {
    messages: [
      {
        content: "Initial guidance",
        createdAt: "2026-03-08T12:00:00.000Z",
        id: "assistant-1",
        role: "assistant" satisfies Role,
        sessionId: "session-1"
      },
      {
        content: userMessage,
        createdAt: "2026-03-08T12:01:00.000Z",
        id: "user-1",
        role: "user" satisfies Role,
        sessionId: "session-1"
      }
    ],
    session: {
      createdAt: "2026-03-08T12:00:00.000Z",
      id: "session-1",
      importId: "import-1",
      selection,
      status: "open",
      targetFormat,
      updatedAt: "2026-03-08T12:01:00.000Z"
    }
  };
}

test("reader heading spacing generalizes to matching block types", () => {
  const preview = buildAdjustmentPreview(
    createSessionDetail({
      selection: createSelection({
        blockType: "heading",
        selectedText: "Project plan",
        textQuote: "Project plan"
      }),
      targetFormat: "reader",
      userMessage: "Please add more spacing under headings here."
    })
  );

  assert.equal(preview.targetFormat, "reader");
  assert.equal(preview.draftRule.kind, "render");
  assert.deepEqual(preview.draftRule.selector, {
    blockType: "heading",
    strategy: "block_type"
  });
  assert.deepEqual(preview.draftRule.effect, {
    amount: "lg",
    direction: "after",
    type: "adjust_block_spacing"
  });
});

test("markdown colon labels compile into a reusable inline rule", () => {
  const preview = buildAdjustmentPreview(
    createSessionDetail({
      selection: createSelection({
        blockIndex: 12,
        blockType: "markdown-lines",
        lineEnd: 8,
        lineStart: 8,
        messageId: "markdown:8-8",
        messageRole: "markdown",
        selectedText: "Important: check the logs",
        textQuote: "Important: check the logs"
      }),
      targetFormat: "markdown",
      userMessage: "Labels with a colon should always be bold."
    })
  );

  assert.equal(preview.targetFormat, "markdown");
  assert.equal(preview.draftRule.kind, "inline_semantics");
  assert.deepEqual(preview.draftRule.selector, {
    strategy: "prefix_before_colon"
  });
  assert.deepEqual(preview.draftRule.effect, {
    type: "bold_prefix_before_colon"
  });
});

test("markdown size requests are redirected into heading structure with limits", () => {
  const preview = buildAdjustmentPreview(
    createSessionDetail({
      selection: createSelection({
        blockType: "markdown-lines",
        lineEnd: 3,
        lineStart: 3,
        messageId: "markdown:3-3",
        messageRole: "markdown",
        selectedText: "Summary",
        textQuote: "Summary"
      }),
      targetFormat: "markdown",
      userMessage: "Make this title bigger."
    })
  );

  assert.equal(preview.draftRule.kind, "structure");
  assert.deepEqual(preview.draftRule.effect, {
    level: 2,
    type: "promote_to_heading"
  });
  assert.match(preview.limitations.join(" "), /font sizes are not portable in Markdown/i);
});
