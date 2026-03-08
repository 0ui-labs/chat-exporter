import type {
  AdjustmentPreview,
  AdjustmentSelection,
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  Block,
  FormatRule,
  ImportJob
} from "@chat-exporter/shared";
import { adjustmentPreviewSchema } from "@chat-exporter/shared";

import { readAdjustmentAiConfig } from "./adjustment-ai-config.js";
import { hasMarkdownStrongMarkers } from "./adjustment-heuristics.js";

type CompileAdjustmentPreviewInput = {
  activeRules: FormatRule[];
  job?: ImportJob;
  sessionDetail: AdjustmentSessionDetail;
};

function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join("\n");
    case "table":
      return [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n");
  }
}

function summarizeBlock(block: Block | undefined) {
  if (!block) {
    return null;
  }

  return {
    text: blockToPlainText(block),
    type: block.type
  };
}

function summarizeActiveRules(activeRules: FormatRule[]) {
  return activeRules
    .filter((rule) => rule.status === "active")
    .map((rule) => ({
      compiledRule: rule.compiledRule,
      instruction: rule.instruction,
      kind: rule.kind,
      selector: rule.selector
    }));
}

function buildReaderSelectionContext(selection: AdjustmentSelection, job: ImportJob | undefined) {
  const message = job?.conversation?.messages.find((entry) => entry.id === selection.messageId);
  const selectedBlock = message?.blocks[selection.blockIndex];

  return {
    currentBlock: summarizeBlock(selectedBlock),
    currentRenderedExcerpt: selectedBlock ? blockToPlainText(selectedBlock) : selection.selectedText,
    nextBlock: summarizeBlock(message?.blocks[selection.blockIndex + 1]),
    previousBlock: summarizeBlock(
      selection.blockIndex > 0 ? message?.blocks[selection.blockIndex - 1] : undefined
    )
  };
}

function buildMarkdownSelectionContext(selection: AdjustmentSelection, job: ImportJob | undefined) {
  const markdown = job?.artifacts?.markdown ?? "";
  const lines = markdown.split("\n");
  const lineStart = selection.lineStart ?? 1;
  const lineEnd = selection.lineEnd ?? lineStart;
  const currentLines = lines.slice(lineStart - 1, lineEnd);

  return {
    currentLines,
    currentRenderedExcerpt: currentLines.join("\n") || selection.selectedText,
    nextLine: lines[lineEnd] ?? null,
    previousLine: lineStart > 1 ? lines[lineStart - 2] ?? null : null
  };
}

function supportedRuleCatalog(targetFormat: AdjustmentTargetFormat) {
  if (targetFormat === "reader") {
    return [
      {
        effect: {
          amount: "sm | md | lg",
          direction: "after",
          type: "adjust_block_spacing"
        },
        kind: "render",
        selectors: ["exact selection", "block_type"]
      },
      {
        effect: {
          amount: "sm | md | lg",
          type: "increase_heading_emphasis"
        },
        kind: "render",
        selectors: ["exact selection", "block_type"]
      },
      {
        effect: {
          emphasis: "balanced | subtle | strong",
          type: "refine_selected_block_presentation"
        },
        kind: "render",
        selectors: ["exact selection"]
      },
      {
        effect: {
          type: "bold_prefix_before_colon"
        },
        kind: "inline_semantics",
        selectors: ["exact selection", "prefix_before_colon"]
      },
      {
        effect: {
          type: "render_markdown_strong"
        },
        kind: "inline_semantics",
        selectors: ["exact selection"]
      }
    ];
  }

  return [
    {
      effect: {
        level: "1-6",
        type: "promote_to_heading"
      },
      kind: "structure",
      selectors: ["exact selection"]
    },
    {
      effect: {
        type: "bold_prefix_before_colon"
      },
      kind: "inline_semantics",
      selectors: ["exact selection", "prefix_before_colon"]
    },
    {
      effect: {
        type: "normalize_list_structure"
      },
      kind: "structure",
      selectors: ["exact selection"]
    },
    {
      effect: {
        type: "normalize_markdown_table"
      },
      kind: "export_profile",
      selectors: ["exact selection", "markdown_table"]
    },
    {
      effect: {
        type: "reshape_markdown_block"
      },
      kind: "structure",
      selectors: ["exact selection"]
    }
  ];
}

function buildCompilationPrompt(input: CompileAdjustmentPreviewInput) {
  const { activeRules, job, sessionDetail } = input;
  const { selection, targetFormat } = sessionDetail.session;
  const latestUserMessage =
    [...sessionDetail.messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return JSON.stringify(
    {
      activeRules: summarizeActiveRules(activeRules),
      currentRequest: latestUserMessage,
      instructions: [
        "Return a single safe preview rule for the selected format.",
        "Stay inside the supported rule catalog exactly. Do not invent new effect or selector types.",
        "Prefer the narrowest selector unless the user explicitly asks for recurring behavior or the selected content clearly shows a reusable pattern.",
        "Write summary, rationale, and limitations in German.",
        targetFormat === "markdown"
          ? "Markdown cannot express exact font sizes, spacing, or CSS. When needed, reinterpret the request as heading, list, table, or inline emphasis and explain the limitation."
          : "Reader rules may adjust spacing or emphasis, but should not rewrite transcript wording.",
        targetFormat === "reader" && hasMarkdownStrongMarkers(selection.selectedText)
          ? "If the selected Reader content contains literal Markdown bold markers like **text**, prefer render_markdown_strong with the exact selection."
          : "Keep the compiled preview narrowly anchored unless clear reuse is justified."
      ],
      selection,
      selectionContext:
        targetFormat === "markdown"
          ? buildMarkdownSelectionContext(selection, job)
          : buildReaderSelectionContext(selection, job),
      sessionMessages: sessionDetail.messages.map((message) => ({
        content: message.content,
        role: message.role
      })),
      supportedRuleCatalog: supportedRuleCatalog(targetFormat),
      targetFormat
    },
    null,
    2
  );
}

function exactReaderSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      blockIndex: {
        minimum: 0,
        type: "integer"
      },
      blockType: {
        type: "string"
      },
      messageId: {
        type: "string"
      }
    },
    required: ["messageId", "blockIndex", "blockType"],
    type: "object"
  } as const;
}

function exactMarkdownSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      blockIndex: {
        minimum: 0,
        type: "integer"
      },
      blockType: {
        const: "markdown-lines",
        type: "string"
      },
      lineEnd: {
        minimum: 1,
        type: "integer"
      },
      lineStart: {
        minimum: 1,
        type: "integer"
      },
      messageId: {
        type: "string"
      }
    },
    required: ["messageId", "blockIndex", "blockType", "lineStart", "lineEnd"],
    type: "object"
  } as const;
}

function blockTypeSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      blockType: {
        type: "string"
      },
      strategy: {
        const: "block_type",
        type: "string"
      }
    },
    required: ["strategy", "blockType"],
    type: "object"
  } as const;
}

function readerPrefixSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      blockType: {
        type: "string"
      },
      strategy: {
        const: "prefix_before_colon",
        type: "string"
      }
    },
    required: ["strategy", "blockType"],
    type: "object"
  } as const;
}

function markdownPrefixSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      strategy: {
        const: "prefix_before_colon",
        type: "string"
      }
    },
    required: ["strategy"],
    type: "object"
  } as const;
}

function markdownTableSelectorSchema() {
  return {
    additionalProperties: false,
    properties: {
      strategy: {
        const: "markdown_table",
        type: "string"
      }
    },
    required: ["strategy"],
    type: "object"
  } as const;
}

function buildRuleVariant(params: {
  effect: Record<string, unknown>;
  kind: string;
  selector: Record<string, unknown>;
}) {
  return {
    additionalProperties: false,
    properties: {
      effect: params.effect,
      kind: {
        const: params.kind,
        type: "string"
      },
      scope: {
        const: "import_local",
        type: "string"
      },
      selector: params.selector
    },
    required: ["kind", "scope", "selector", "effect"],
    type: "object"
  } as const;
}

function buildPreviewSchema(targetFormat: AdjustmentTargetFormat) {
  const draftRuleVariants =
    targetFormat === "reader"
      ? [
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                amount: {
                  enum: ["sm", "md", "lg"],
                  type: "string"
                },
                direction: {
                  const: "after",
                  type: "string"
                },
                type: {
                  const: "adjust_block_spacing",
                  type: "string"
                }
              },
              required: ["type", "direction", "amount"],
              type: "object"
            },
            kind: "render",
            selector: {
              anyOf: [exactReaderSelectorSchema(), blockTypeSelectorSchema()]
            }
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                amount: {
                  enum: ["sm", "md", "lg"],
                  type: "string"
                },
                type: {
                  const: "increase_heading_emphasis",
                  type: "string"
                }
              },
              required: ["type", "amount"],
              type: "object"
            },
            kind: "render",
            selector: {
              anyOf: [exactReaderSelectorSchema(), blockTypeSelectorSchema()]
            }
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                emphasis: {
                  enum: ["balanced", "subtle", "strong"],
                  type: "string"
                },
                type: {
                  const: "refine_selected_block_presentation",
                  type: "string"
                }
              },
              required: ["type", "emphasis"],
              type: "object"
            },
            kind: "render",
            selector: exactReaderSelectorSchema()
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "bold_prefix_before_colon",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "inline_semantics",
            selector: {
              anyOf: [exactReaderSelectorSchema(), readerPrefixSelectorSchema()]
            }
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "render_markdown_strong",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "inline_semantics",
            selector: exactReaderSelectorSchema()
          })
        ]
      : [
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                level: {
                  maximum: 6,
                  minimum: 1,
                  type: "integer"
                },
                type: {
                  const: "promote_to_heading",
                  type: "string"
                }
              },
              required: ["type", "level"],
              type: "object"
            },
            kind: "structure",
            selector: exactMarkdownSelectorSchema()
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "bold_prefix_before_colon",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "inline_semantics",
            selector: {
              anyOf: [exactMarkdownSelectorSchema(), markdownPrefixSelectorSchema()]
            }
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "normalize_list_structure",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "structure",
            selector: exactMarkdownSelectorSchema()
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "normalize_markdown_table",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "export_profile",
            selector: {
              anyOf: [exactMarkdownSelectorSchema(), markdownTableSelectorSchema()]
            }
          }),
          buildRuleVariant({
            effect: {
              additionalProperties: false,
              properties: {
                type: {
                  const: "reshape_markdown_block",
                  type: "string"
                }
              },
              required: ["type"],
              type: "object"
            },
            kind: "structure",
            selector: exactMarkdownSelectorSchema()
          })
        ];

  return {
    additionalProperties: false,
    properties: {
      draftRule: {
        anyOf: draftRuleVariants
      },
      limitations: {
        items: {
          type: "string"
        },
        type: "array"
      },
      rationale: {
        type: "string"
      },
      summary: {
        type: "string"
      }
    },
    required: ["summary", "rationale", "limitations", "draftRule"],
    type: "object"
  } as const;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactReaderSelector(selector: Record<string, unknown>) {
  return (
    typeof selector.messageId === "string" &&
    typeof selector.blockIndex === "number" &&
    typeof selector.blockType === "string"
  );
}

function hasExactMarkdownSelector(selector: Record<string, unknown>) {
  return (
    typeof selector.messageId === "string" &&
    typeof selector.blockIndex === "number" &&
    selector.blockType === "markdown-lines" &&
    typeof selector.lineStart === "number" &&
    typeof selector.lineEnd === "number"
  );
}

function validateCompiledPreview(
  payload: unknown,
  sessionDetail: AdjustmentSessionDetail
): AdjustmentPreview {
  const preview = adjustmentPreviewSchema.parse({
    ...(isObjectRecord(payload) ? payload : {}),
    sessionId: sessionDetail.session.id,
    targetFormat: sessionDetail.session.targetFormat
  });
  const selector = isObjectRecord(preview.draftRule.selector) ? preview.draftRule.selector : null;
  const effect = isObjectRecord(preview.draftRule.effect) ? preview.draftRule.effect : null;

  if (!selector || !effect) {
    throw new Error("Compiled preview did not contain a supported selector and effect.");
  }

  const effectType = typeof effect.type === "string" ? effect.type : "";
  const selectorStrategy = typeof selector.strategy === "string" ? selector.strategy : "exact";

  if (preview.targetFormat === "reader") {
    if (effectType === "adjust_block_spacing") {
      if (
        preview.draftRule.kind !== "render" ||
        (selectorStrategy !== "block_type" && !hasExactReaderSelector(selector))
      ) {
        throw new Error("Compiled Reader spacing preview was invalid.");
      }
      return preview;
    }

    if (effectType === "increase_heading_emphasis") {
      if (
        preview.draftRule.kind !== "render" ||
        (selectorStrategy !== "block_type" && !hasExactReaderSelector(selector))
      ) {
        throw new Error("Compiled Reader emphasis preview was invalid.");
      }
      return preview;
    }

    if (effectType === "refine_selected_block_presentation") {
      if (preview.draftRule.kind !== "render" || !hasExactReaderSelector(selector)) {
        throw new Error("Compiled Reader presentation preview was invalid.");
      }
      return preview;
    }

    if (effectType === "bold_prefix_before_colon") {
      if (
        preview.draftRule.kind !== "inline_semantics" ||
        (selectorStrategy !== "prefix_before_colon" && !hasExactReaderSelector(selector))
      ) {
        throw new Error("Compiled Reader inline preview was invalid.");
      }
      return preview;
    }

    if (effectType === "render_markdown_strong") {
      if (preview.draftRule.kind !== "inline_semantics" || !hasExactReaderSelector(selector)) {
        throw new Error("Compiled Reader markdown emphasis preview was invalid.");
      }
      return preview;
    }

    throw new Error(`Unsupported Reader effect type: ${effectType}`);
  }

  if (effectType === "promote_to_heading") {
    if (preview.draftRule.kind !== "structure" || !hasExactMarkdownSelector(selector)) {
      throw new Error("Compiled Markdown heading preview was invalid.");
    }
    return preview;
  }

  if (effectType === "bold_prefix_before_colon") {
    if (
      preview.draftRule.kind !== "inline_semantics" ||
      (selectorStrategy !== "prefix_before_colon" && !hasExactMarkdownSelector(selector))
    ) {
      throw new Error("Compiled Markdown inline preview was invalid.");
    }
    return preview;
  }

  if (effectType === "normalize_list_structure") {
    if (preview.draftRule.kind !== "structure" || !hasExactMarkdownSelector(selector)) {
      throw new Error("Compiled Markdown list preview was invalid.");
    }
    return preview;
  }

  if (effectType === "normalize_markdown_table") {
    if (
      preview.draftRule.kind !== "export_profile" ||
      (selectorStrategy !== "markdown_table" && !hasExactMarkdownSelector(selector))
    ) {
      throw new Error("Compiled Markdown table preview was invalid.");
    }
    return preview;
  }

  if (effectType === "reshape_markdown_block") {
    if (preview.draftRule.kind !== "structure" || !hasExactMarkdownSelector(selector)) {
      throw new Error("Compiled Markdown reshape preview was invalid.");
    }
    return preview;
  }

  throw new Error(`Unsupported Markdown effect type: ${effectType}`);
}

function getOutputText(payload: unknown) {
  if (payload && typeof payload === "object" && "output_text" in payload) {
    const outputText = (payload as { output_text?: unknown }).output_text;
    if (typeof outputText === "string" && outputText.trim()) {
      return outputText;
    }
  }

  if (!payload || typeof payload !== "object" || !("output" in payload)) {
    throw new Error("Responses API payload did not include output text.");
  }

  const output = (payload as { output?: unknown }).output;

  if (!Array.isArray(output)) {
    throw new Error("Responses API payload did not include output items.");
  }

  const text = output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const maybeText = (entry as { text?: unknown }).text;
        return typeof maybeText === "string" && maybeText.trim() ? [maybeText] : [];
      });
    })
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Responses API payload did not contain structured JSON text.");
  }

  return text;
}

async function requestOpenAiPreview(
  prompt: string,
  sessionDetail: AdjustmentSessionDetail,
  config: ReturnType<typeof readAdjustmentAiConfig>
) {
  const response = await fetch(`${config.openai!.apiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai!.apiKey}`
    },
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text:
                "Compile one transcript adjustment request into a strict preview JSON object. Only use supported selectors and effect types from the provided catalog. Do not invent new fields.",
              type: "input_text"
            }
          ],
          role: "system"
        },
        {
          content: [
            {
              text: prompt,
              type: "input_text"
            }
          ],
          role: "user"
        }
      ],
      model: config.model,
      reasoning: {
        effort: "minimal"
      },
      text: {
        format: {
          name: `chat_exporter_${sessionDetail.session.targetFormat}_adjustment_preview`,
          schema: buildPreviewSchema(sessionDetail.session.targetFormat),
          strict: true,
          type: "json_schema"
        }
      }
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API returned ${response.status}: ${errorText.slice(0, 400)}`);
  }

  const payload = (await response.json()) as unknown;
  return validateCompiledPreview(JSON.parse(getOutputText(payload)) as unknown, sessionDetail);
}

async function requestCerebrasPreview(
  prompt: string,
  sessionDetail: AdjustmentSessionDetail,
  config: ReturnType<typeof readAdjustmentAiConfig>
) {
  const response = await fetch(`${config.cerebras!.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.cerebras!.apiKey}`
    },
    body: JSON.stringify({
      max_completion_tokens: config.cerebras!.maxCompletionTokens,
      messages: [
        {
          content:
            "Compile one transcript adjustment request into a strict preview JSON object. Only use supported selectors and effect types from the provided catalog. Do not invent new fields.",
          role: "system"
        },
        {
          content: prompt,
          role: "user"
        }
      ],
      model: config.model,
      reasoning_effort: config.cerebras!.reasoningEffort,
      response_format: {
        json_schema: {
          name: `chat_exporter_${sessionDetail.session.targetFormat}_adjustment_preview`,
          schema: buildPreviewSchema(sessionDetail.session.targetFormat),
          strict: true
        },
        type: "json_schema"
      },
      temperature: 0,
      top_p: 1
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cerebras Chat Completions returned ${response.status}: ${errorText.slice(0, 400)}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };
  const outputText = payload.choices?.[0]?.message?.content?.trim();

  if (!outputText) {
    throw new Error("Cerebras response did not contain structured JSON content.");
  }

  return validateCompiledPreview(JSON.parse(outputText) as unknown, sessionDetail);
}

export async function compileAdjustmentPreviewWithAi(
  input: CompileAdjustmentPreviewInput
): Promise<AdjustmentPreview | null> {
  const { job, sessionDetail } = input;
  const config = readAdjustmentAiConfig();

  if (
    !config.enabled ||
    !job ||
    (sessionDetail.session.targetFormat !== "reader" &&
      sessionDetail.session.targetFormat !== "markdown")
  ) {
    return null;
  }

  const prompt = buildCompilationPrompt(input);

  if (config.provider === "openai" && config.openai) {
    return requestOpenAiPreview(prompt, sessionDetail, config);
  }

  if (config.provider === "cerebras" && config.cerebras) {
    return requestCerebrasPreview(prompt, sessionDetail, config);
  }

  return null;
}
