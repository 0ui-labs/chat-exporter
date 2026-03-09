import assert from "node:assert/strict";
import test from "node:test";

import type {
  AdjustmentSelection,
  AdjustmentSessionDetail,
  FormatRule,
  ImportJob,
  Role
} from "@chat-exporter/shared";

import {
  conversationToHandover,
  conversationToMarkdown,
  conversationWordCount
} from "./conversation-artifacts.js";
import {
  buildAdjustmentPreview,
  buildDeterministicAdjustmentPreview
} from "./adjustment-preview.js";

const compilerEnvKeys = [
  "ADJUSTMENT_RULE_COMPILATION_ENABLED",
  "ADJUSTMENT_RULE_COMPILATION_PROVIDER",
  "ADJUSTMENT_RULE_COMPILATION_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_API_BASE_URL"
] as const;

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
  targetFormat: "reader" | "markdown";
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

function createImportJob(): ImportJob {
  const conversation = {
    id: "conversation-1",
    title: "Adjustment preview test fixture",
    source: {
      platform: "chatgpt" as const,
      url: "https://chatgpt.com/share/preview-test"
    },
    messages: [
      {
        blocks: [
          {
            text: "Please draft the rollout checklist.",
            type: "paragraph" as const
          }
        ],
        id: "user-1",
        role: "user" as const
      },
      {
        blocks: [
          {
            level: 2,
            text: "Project plan",
            type: "heading" as const
          },
          {
            text: "Important: check the logs before deploying.",
            type: "paragraph" as const
          }
        ],
        id: "assistant-1",
        role: "assistant" as const
      }
    ]
  };
  const createdAt = "2026-03-08T12:00:00.000Z";

  return {
    artifacts: {
      handover: conversationToHandover(conversation),
      json: JSON.stringify(conversation, null, 2),
      markdown: conversationToMarkdown(conversation)
    },
    conversation,
    createdAt,
    currentStage: "done",
    id: "import-1",
    mode: "archive",
    sourcePlatform: "chatgpt",
    sourceUrl: conversation.source.url,
    status: "completed",
    summary: {
      messageCount: conversation.messages.length,
      transcriptWords: conversationWordCount(conversation)
    },
    updatedAt: createdAt,
    warnings: []
  };
}

function restoreCompilerEnv(snapshot: Partial<Record<(typeof compilerEnvKeys)[number], string | undefined>>) {
  for (const key of compilerEnvKeys) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

test("reader heading spacing generalizes to matching block types", () => {
  const preview = buildDeterministicAdjustmentPreview(
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
  assert.match(preview.summary, /Abstand/i);
});

test("markdown colon labels compile into a reusable inline rule", () => {
  const preview = buildDeterministicAdjustmentPreview(
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
  assert.match(preview.summary, /Doppelpunkt/i);
});

test("markdown size requests are redirected into heading structure with limits", () => {
  const preview = buildDeterministicAdjustmentPreview(
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
  assert.match(preview.limitations.join(" "), /Schriftgrößen/i);
});

test("reader markdown bold markers compile into an exact inline rule", () => {
  const preview = buildDeterministicAdjustmentPreview(
    createSessionDetail({
      selection: createSelection({
        selectedText:
          "**Normale Zusammenfassungen sind verlustbehaftet.** Für einen Endlos-Thread brauchst du stattdessen etwas wie:",
        textQuote:
          "**Normale Zusammenfassungen sind verlustbehaftet.** Für einen Endlos-Thread brauchst du stattdessen etwas wie:"
      }),
      targetFormat: "reader",
      userMessage: "Bold scheint fehlerhaft formatiert zu sein."
    })
  );

  assert.equal(preview.targetFormat, "reader");
  assert.equal(preview.draftRule.kind, "inline_semantics");
  assert.equal((preview.draftRule.selector as { messageId?: string }).messageId, "message-1");
  assert.equal((preview.draftRule.selector as { blockType?: string }).blockType, "paragraph");
  assert.deepEqual(preview.draftRule.effect, {
    type: "render_markdown_strong"
  });
  assert.match(preview.rationale, /Markdown-Markierungen/i);
});

test("preview compilation uses AI output when a provider is configured", async () => {
  const sessionDetail = createSessionDetail({
    selection: createSelection({
      blockIndex: 8,
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
  const activeRules: FormatRule[] = [
    {
      compiledRule: {
        amount: "md",
        direction: "after" as const,
        type: "adjust_block_spacing" as const
      },
      createdAt: "2026-03-08T12:00:00.000Z",
      id: "rule-1",
      importId: "import-1",
      instruction: "Keep extra space under headings",
      kind: "render",
      scope: "import_local",
      selector: {
        blockType: "heading",
        strategy: "block_type"
      },
      sourceSessionId: "session-0",
      status: "active",
      targetFormat: "markdown",
      updatedAt: "2026-03-08T12:00:00.000Z"
    }
  ];
  const envSnapshot = Object.fromEntries(
    compilerEnvKeys.map((key) => [key, process.env[key]])
  ) as Partial<Record<(typeof compilerEnvKeys)[number], string | undefined>>;
  const originalFetch = globalThis.fetch;

  process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED = "1";
  process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "openai";
  process.env.ADJUSTMENT_RULE_COMPILATION_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_BASE_URL = "https://example.test/v1";
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://example.test/v1/responses");
    const body = JSON.parse(String(init?.body));
    const prompt = body.input[1].content[0].text as string;

    assert.match(prompt, /Labels with a colon should always be bold everywhere\./);
    assert.match(prompt, /Keep extra space under headings/);
    assert.match(prompt, /Important: check the logs/);
    assert.match(prompt, /Write summary, rationale, and limitations in German\./);

    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          draftRule: {
            effect: {
              type: "bold_prefix_before_colon"
            },
            kind: "inline_semantics",
            scope: "import_local",
            selector: {
              strategy: "prefix_before_colon"
            }
          },
          limitations: [],
          rationale: "Die ausgewählte Zeile ist ein wiederverwendbares Markdown-Labelmuster.",
          summary: "Hebe labelartige Präfixe mit Doppelpunkt in passenden Markdown-Zeilen importweit hervor."
        })
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  try {
    const preview = await buildAdjustmentPreview({
      activeRules,
      job: createImportJob(),
      sessionDetail
    });

    assert.equal(
      preview.summary,
      "Hebe labelartige Präfixe mit Doppelpunkt in passenden Markdown-Zeilen importweit hervor."
    );
    assert.deepEqual(preview.draftRule.selector, {
      strategy: "prefix_before_colon"
    });
    assert.deepEqual(preview.draftRule.effect, {
      type: "bold_prefix_before_colon"
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreCompilerEnv(envSnapshot);
  }
});

test("preview compilation falls back to deterministic rules when AI output is invalid", async () => {
  const sessionDetail = createSessionDetail({
    selection: createSelection({
      blockType: "heading",
      selectedText: "Project plan",
      textQuote: "Project plan"
    }),
    targetFormat: "reader",
    userMessage: "Please add more spacing under headings here."
  });
  const envSnapshot = Object.fromEntries(
    compilerEnvKeys.map((key) => [key, process.env[key]])
  ) as Partial<Record<(typeof compilerEnvKeys)[number], string | undefined>>;
  const originalFetch = globalThis.fetch;

  process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED = "1";
  process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "openai";
  process.env.ADJUSTMENT_RULE_COMPILATION_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_BASE_URL = "https://example.test/v1";
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          draftRule: {
            effect: {
              type: "not_supported"
            },
            kind: "render",
            scope: "import_local",
            selector: {
              messageId: "assistant-1"
            }
          },
          limitations: [],
          rationale: "Invalid for test fallback.",
          summary: "Broken rule"
        })
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );

  try {
    const preview = await buildAdjustmentPreview({
      activeRules: [],
      job: createImportJob(),
      sessionDetail
    });

    assert.equal(preview.summary, "Vergrößere den Abstand rund um ähnliche Überschriften im Reader.");
    assert.deepEqual(preview.draftRule.selector, {
      blockType: "heading",
      strategy: "block_type"
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreCompilerEnv(envSnapshot);
  }
});
