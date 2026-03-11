import type {
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  Block,
  FormatRule,
  ImportJob,
} from "@chat-exporter/shared";
import { customStyleEffectSchema } from "@chat-exporter/shared";

import { readAdjustmentAiConfig } from "./adjustment-ai-config.js";

export const MAX_TOOL_ROUNDS = 3;

export class AgentUnavailableError extends Error {}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FunctionCallItem = {
  arguments: string;
  callId: string;
  name: string;
};

type ResponsesPayload = {
  id?: string;
  output?: unknown;
  output_text?: unknown;
};

type ActionRecord = {
  type: "created" | "updated" | "deleted";
  ruleId: string;
};

type RunAgentTurnInput = {
  sessionDetail: AdjustmentSessionDetail;
  activeRules: FormatRule[];
  job?: ImportJob;
  callbacks: {
    onCreateRule: (params: {
      selector: Record<string, unknown>;
      effect: Record<string, unknown>;
      description: string;
    }) => Promise<{ ruleId: string }>;
    onUpdateRule: (params: {
      ruleId: string;
      effect: Record<string, unknown>;
      description?: string;
    }) => Promise<void>;
    onDeleteRule: (ruleId: string) => Promise<void>;
  };
};

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(targetFormat: AdjustmentTargetFormat) {
  const isReader = targetFormat === "reader";

  const readerGuide = [
    "## Reader-Anpassungen",
    "Du kannst CSS-Inline-Styles (camelCase) auf drei Slots anwenden:",
    "- **containerStyle**: Äußerer Block-Wrapper (paddingLeft, marginBottom, backgroundColor, borderLeft, borderRadius, ...)",
    "- **textStyle**: Text-Element im Block (fontSize, fontWeight, lineHeight, color, fontStyle, letterSpacing, ...)",
    "- **itemStyle**: Kind-Elemente wie <li>, <td> (paddingLeft, marginBottom, fontWeight, ...)",
    "",
    "Weitere Reader-Optionen:",
    "- **textTransform**: 'bold_prefix_before_colon' | 'render_markdown_strong'",
    "- **headingLevel**: 1-6, überschreibt die Überschriften-Ebene",
    "- **insertBefore** / **insertAfter**: 'hr' | 'spacer'",
    "",
    "Basis-Styles: paragraph=text-sm/1.75, heading=font-semibold, list=list-disc/pl-1.25rem, quote=border-left+italic, code=bg-zinc-950+monospace, table=full-width/text-sm.",
    "",
    "Sichere Properties: padding*, margin*, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, color, backgroundColor, opacity, border*, borderRadius, textDecoration, textTransform, gap, listStyleType.",
    "Farben: hsl(var(--primary)), hsl(var(--foreground)), hsl(var(--accent)), hsl(var(--muted)), hsl(var(--border)).",
    "",
    "Verboten: position, display, z-index, overflow, width/height, Animationen, Transforms, hardcoded hex-Farben, Pseudo-Elemente, Hover-States, Media-Queries.",
    "Du kannst den Text-Inhalt NICHT umschreiben, nur dessen Darstellung ändern.",
  ].join("\n");

  const markdownGuide = [
    "## Markdown-Anpassungen",
    "Für Markdown sind nur strukturelle Text-Transformationen möglich. CSS hat keine Wirkung.",
    "Verfügbare markdownTransform-Werte:",
    "- **promote_to_heading**: Wandelt Zeile in Markdown-Überschrift um",
    "- **normalize_list_structure**: Formt Zeilen in saubere Markdown-Liste um",
    "- **normalize_markdown_table**: Bereinigt Markdown-Tabellen-Formatierung",
    "- **reshape_markdown_block**: Bereinigt Whitespace in Markdown-Blöcken",
    "- **bold_prefix_before_colon**: Fettet Text vor dem ersten Doppelpunkt (**Label:**)",
    "",
    "Exakte Schriftgrößen, Farben, Abstände sind in Markdown nicht möglich.",
    "Wenn der Nutzer nach unmöglichem Styling fragt, erkläre das kurz und ehrlich.",
  ].join("\n");

  return [
    "Du bist ein Anpassungs-Agent für importierte Chat-Transkripte.",
    "Antworte auf Deutsch, kurz und freundlich, ohne Tech-Jargon.",
    "",
    "Wenn die Nutzeranfrage klar ist, erstelle/ändere/lösche Regeln mit den verfügbaren Tools.",
    "Wenn sie unklar ist, stelle eine kurze Rückfrage.",
    "Zeige niemals JSON, Regel-Interna oder technische Details.",
    "Nach Tool-Calls: beschreibe die sichtbare Änderung konkret.",
    "Sei ehrlich — sage nur, dass etwas geändert wurde, wenn es tatsächlich so ist.",
    "",
    isReader ? readerGuide : markdownGuide,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool Definitions (OpenAI Responses API format)
// ---------------------------------------------------------------------------

function buildTools() {
  return [
    {
      type: "function",
      name: "create_rule",
      description:
        "Erstellt eine neue Darstellungsregel für den ausgewählten Block.",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "object",
            description:
              "Selektor: strategy (exact|block_type|prefix_before_colon|markdown_table), messageId, blockIndex, blockType, lineStart, lineEnd.",
          },
          effect: {
            type: "object",
            description:
              "Effect mit type='custom_style'. Optionale Felder: containerStyle, textStyle, itemStyle, textTransform, markdownTransform, headingLevel, insertBefore, insertAfter.",
          },
          description: {
            type: "string",
            description: "Kurze deutsche Beschreibung der sichtbaren Änderung.",
          },
        },
        required: ["selector", "effect", "description"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "update_rule",
      description: "Ändert eine bestehende Regel anhand ihrer ID.",
      parameters: {
        type: "object",
        properties: {
          ruleId: {
            type: "string",
            description: "ID der zu ändernden Regel.",
          },
          effect: {
            type: "object",
            description: "Neuer Effect (type='custom_style').",
          },
          description: {
            type: "string",
            description: "Aktualisierte Beschreibung (optional).",
          },
        },
        required: ["ruleId", "effect"],
        additionalProperties: false,
      },
      strict: false,
    },
    {
      type: "function",
      name: "delete_rule",
      description: "Löscht eine bestehende Regel anhand ihrer ID.",
      parameters: {
        type: "object",
        properties: {
          ruleId: {
            type: "string",
            description: "ID der zu löschenden Regel.",
          },
        },
        required: ["ruleId"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// Context Builder
// ---------------------------------------------------------------------------

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
      return [
        block.headers.join(" | "),
        ...block.rows.map((row) => row.join(" | ")),
      ].join("\n");
  }
}

function summarizeSelection(
  sessionDetail: AdjustmentSessionDetail,
  job: ImportJob | undefined,
) {
  const { selection, targetFormat } = sessionDetail.session;

  if (targetFormat === "markdown") {
    const markdown = job?.artifacts?.markdown ?? "";
    const lines = markdown.split("\n");
    const lineStart = selection.lineStart ?? 1;
    const lineEnd = selection.lineEnd ?? lineStart;

    return {
      currentExcerpt:
        lines.slice(lineStart - 1, lineEnd).join("\n") ||
        selection.selectedText,
      description: `Markdown-Zeilen ${lineStart}-${lineEnd}`,
      surrounding: {
        next: lines[lineEnd] ?? null,
        previous: lineStart > 1 ? (lines[lineStart - 2] ?? null) : null,
      },
    };
  }

  const message = job?.conversation?.messages.find(
    (entry) => entry.id === selection.messageId,
  );
  const currentBlock = message?.blocks[selection.blockIndex];
  const previousBlock =
    selection.blockIndex > 0
      ? message?.blocks[selection.blockIndex - 1]
      : undefined;
  const nextBlock = message?.blocks[selection.blockIndex + 1];

  return {
    currentExcerpt: currentBlock
      ? blockToPlainText(currentBlock)
      : selection.selectedText,
    description: `${selection.messageRole} message ${selection.messageIndex + 1}, ${selection.blockType}`,
    surrounding: {
      next: nextBlock ? blockToPlainText(nextBlock) : null,
      previous: previousBlock ? blockToPlainText(previousBlock) : null,
    },
  };
}

function summarizeActiveRules(activeRules: FormatRule[]) {
  return activeRules
    .filter((rule) => rule.status === "active")
    .slice(0, 8)
    .map((rule) => ({
      ruleId: rule.id,
      compiledRule: rule.compiledRule,
      instruction: rule.instruction,
      kind: rule.kind,
      selector: rule.selector,
    }));
}

function buildChatContext(input: RunAgentTurnInput) {
  const { activeRules, job, sessionDetail } = input;
  const { selection, targetFormat } = sessionDetail.session;

  return JSON.stringify(
    {
      targetFormat,
      selection,
      selectionContext: summarizeSelection(sessionDetail, job),
      activeRules: summarizeActiveRules(activeRules),
      sessionMessages: sessionDetail.messages.map((message) => ({
        content: message.content,
        role: message.role,
      })),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// OpenAI helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractFunctionCalls(payload: ResponsesPayload): FunctionCallItem[] {
  if (!Array.isArray(payload.output)) {
    return [];
  }

  return payload.output.flatMap((item) => {
    if (!isRecord(item) || item.type !== "function_call") {
      return [];
    }

    const callId = typeof item.call_id === "string" ? item.call_id : null;
    const name = typeof item.name === "string" ? item.name : null;
    const args = typeof item.arguments === "string" ? item.arguments : null;

    if (!callId || !name || !args) {
      return [];
    }

    return [{ arguments: args, callId, name }];
  });
}

function extractAssistantMessage(payload: ResponsesPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (
        !isRecord(item) ||
        item.type !== "message" ||
        item.role !== "assistant"
      ) {
        return [];
      }

      const content = item.content;
      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((entry) => {
        if (!isRecord(entry) || entry.type !== "output_text") {
          return [];
        }

        return typeof entry.text === "string" && entry.text.trim()
          ? [entry.text.trim()]
          : [];
      });
    })
    .join("\n")
    .trim();
}

async function requestOpenAiResponse(
  body: Record<string, unknown>,
  config: ReturnType<typeof readAdjustmentAiConfig>,
) {
  const response = await fetch(`${config.openai?.apiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai?.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      reasoning: { effort: "minimal" },
      store: true,
      ...body,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AgentUnavailableError(
      `Die Live-KI-Antwort war nicht verfügbar (${response.status}). ${errorText.slice(0, 240)}`,
    );
  }

  return (await response.json()) as ResponsesPayload;
}

// ---------------------------------------------------------------------------
// Tool execution with validation
// ---------------------------------------------------------------------------

function validateEffect(effect: unknown): {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
} {
  const result = customStyleEffectSchema.safeParse(effect);
  if (result.success) {
    return { ok: true, data: result.data as Record<string, unknown> };
  }

  const issues = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Effect-Validierung fehlgeschlagen: ${issues}` };
}

async function executeToolCall(
  call: FunctionCallItem,
  callbacks: RunAgentTurnInput["callbacks"],
  actions: ActionRecord[],
): Promise<string> {
  const args = JSON.parse(call.arguments) as Record<string, unknown>;

  if (call.name === "create_rule") {
    const effectValidation = validateEffect(args.effect);
    if (!effectValidation.ok) {
      return JSON.stringify({ ok: false, error: effectValidation.error });
    }

    try {
      const { ruleId } = await callbacks.onCreateRule({
        selector: args.selector as Record<string, unknown>,
        effect: effectValidation.data as Record<string, unknown>,
        description: String(args.description ?? ""),
      });
      actions.push({ type: "created", ruleId });
      return JSON.stringify({ ok: true, ruleId });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    }
  }

  if (call.name === "update_rule") {
    const effectValidation = validateEffect(args.effect);
    if (!effectValidation.ok) {
      return JSON.stringify({ ok: false, error: effectValidation.error });
    }

    const ruleId = String(args.ruleId ?? "");

    try {
      await callbacks.onUpdateRule({
        ruleId,
        effect: effectValidation.data as Record<string, unknown>,
        description:
          typeof args.description === "string" ? args.description : undefined,
      });
      actions.push({ type: "updated", ruleId });
      return JSON.stringify({ ok: true, ruleId });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    }
  }

  if (call.name === "delete_rule") {
    const ruleId = String(args.ruleId ?? "");

    try {
      await callbacks.onDeleteRule(ruleId);
      actions.push({ type: "deleted", ruleId });
      return JSON.stringify({ ok: true, ruleId });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    }
  }

  return JSON.stringify({
    ok: false,
    error: `Unbekannter Tool-Call: ${call.name}`,
  });
}

// ---------------------------------------------------------------------------
// Main agent turn
// ---------------------------------------------------------------------------

export async function runAgentTurn(input: RunAgentTurnInput): Promise<{
  assistantMessage: string;
  actions: ActionRecord[];
}> {
  const config = readAdjustmentAiConfig();

  if (!config.enabled || config.provider !== "openai" || !config.openai) {
    throw new AgentUnavailableError(
      "Live-KI-Anpassungen sind aktuell nicht konfiguriert. Hinterlege einen OpenAI-Zugang, bevor du diesen Chat nutzt.",
    );
  }

  const actions: ActionRecord[] = [];
  const targetFormat = input.sessionDetail.session.targetFormat;

  let payload = await requestOpenAiResponse(
    {
      input: [
        {
          content: [
            { text: buildSystemPrompt(targetFormat), type: "input_text" },
          ],
          role: "system",
        },
        {
          content: [{ text: buildChatContext(input), type: "input_text" }],
          role: "user",
        },
      ],
      tool_choice: "auto",
      tools: buildTools(),
    },
    config,
  );

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = extractFunctionCalls(payload);
    if (functionCalls.length === 0) {
      break;
    }

    if (!payload.id) {
      throw new Error(
        "Die KI-Antwort enthält keine Response-ID für den Tool-Loop.",
      );
    }

    const toolOutputs = [];

    for (const call of functionCalls) {
      const result = await executeToolCall(call, input.callbacks, actions);
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: result,
      });
    }

    payload = await requestOpenAiResponse(
      {
        input: toolOutputs,
        previous_response_id: payload.id,
        tool_choice: "auto",
        tools: buildTools(),
      },
      config,
    );
  }

  const assistantMessage =
    extractAssistantMessage(payload) ||
    (actions.length > 0
      ? "Die Änderung ist jetzt sichtbar."
      : "Ich brauche noch eine kurze Klarstellung.");

  return { assistantMessage, actions };
}
