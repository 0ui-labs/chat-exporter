import type {
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  Block,
  FormatRule,
  ImportJob
} from "@chat-exporter/shared";

import { readAdjustmentAiConfig } from "./adjustment-ai-config.js";

const MAX_TOOL_ROUNDS = 3;

export class AdjustmentChatUnavailableError extends Error {}

type ApplyAdjustmentRuleArgs = {
  instruction: string;
};

export type ApplyAdjustmentRuleResult = {
  ok: boolean;
  error?: string;
  rationale?: string;
  ruleId?: string;
  summary?: string;
};

type FunctionCallItem = {
  arguments: string;
  callId: string;
  name: string;
};

type RunAdjustmentChatTurnInput = {
  activeRules: FormatRule[];
  executeApplyAdjustmentRule: (args: ApplyAdjustmentRuleArgs) => Promise<ApplyAdjustmentRuleResult>;
  job?: ImportJob;
  sessionDetail: AdjustmentSessionDetail;
};

export type AdjustmentChatTurnResult = {
  appliedRuleId?: string;
  assistantMessage: string;
  didApplyRule: boolean;
  didRequestClarification: boolean;
  toolMessages: string[];
};

type ResponsesPayload = {
  id?: string;
  output?: unknown;
  output_text?: unknown;
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

function summarizeSelection(sessionDetail: AdjustmentSessionDetail, job: ImportJob | undefined) {
  const { selection, targetFormat } = sessionDetail.session;

  if (targetFormat === "markdown") {
    const markdown = job?.artifacts?.markdown ?? "";
    const lines = markdown.split("\n");
    const lineStart = selection.lineStart ?? 1;
    const lineEnd = selection.lineEnd ?? lineStart;

    return {
      currentExcerpt: lines.slice(lineStart - 1, lineEnd).join("\n") || selection.selectedText,
      description: `Markdown-Zeilen ${lineStart}-${lineEnd}`,
      surrounding: {
        next: lines[lineEnd] ?? null,
        previous: lineStart > 1 ? lines[lineStart - 2] ?? null : null
      }
    };
  }

  const message = job?.conversation?.messages.find((entry) => entry.id === selection.messageId);
  const currentBlock = message?.blocks[selection.blockIndex];
  const previousBlock = selection.blockIndex > 0 ? message?.blocks[selection.blockIndex - 1] : undefined;
  const nextBlock = message?.blocks[selection.blockIndex + 1];

  return {
    currentExcerpt: currentBlock ? blockToPlainText(currentBlock) : selection.selectedText,
    description: `${selection.messageRole} message ${selection.messageIndex + 1}, ${selection.blockType}`,
    surrounding: {
      next: nextBlock ? blockToPlainText(nextBlock) : null,
      previous: previousBlock ? blockToPlainText(previousBlock) : null
    }
  };
}

function summarizeActiveRules(activeRules: FormatRule[]) {
  return activeRules
    .filter((rule) => rule.status === "active")
    .slice(0, 8)
    .map((rule) => ({
      compiledRule: rule.compiledRule,
      instruction: rule.instruction,
      kind: rule.kind,
      selector: rule.selector
    }));
}

function buildChatContext(input: RunAdjustmentChatTurnInput) {
  const { activeRules, job, sessionDetail } = input;
  const { selection, targetFormat } = sessionDetail.session;

  return JSON.stringify(
    {
      activeRules: summarizeActiveRules(activeRules),
      selection,
      selectionContext: summarizeSelection(sessionDetail, job),
      sessionMessages: sessionDetail.messages.map((message) => ({
        content: message.content,
        role: message.role
      })),
      targetFormat
    },
    null,
    2
  );
}

function buildSystemInstructions(targetFormat: AdjustmentTargetFormat) {
  const formatLabel = targetFormat === "reader" ? "Reader" : "Markdown";
  const formatSpecificInstruction =
    targetFormat === "reader"
      ? "Für Reader darfst du Darstellung und Hervorhebung anpassen, aber nicht den eigentlichen Wortlaut des Transkripts umschreiben."
      : "Für Markdown musst du bei portablen Struktur- und Inline-Anpassungen bleiben und darfst keine CSS- oder Layout-Versprechen machen.";

  return [
    "Du hilfst normalen Nutzern beim direkten Anpassen der Darstellung eines importierten Transkripts.",
    "Antworte immer auf Deutsch, kurz, freundlich und ohne Tech-Jargon.",
    `Ziel ist eine sofort wirkende ${formatLabel}-Anpassung.`,
    "Wenn die letzte Nutzeranfrage klar genug ist, rufe sofort das Tool apply_adjustment_rule auf.",
    "Wenn die Anfrage zu vage oder mehrdeutig ist, stelle genau eine kurze Rückfrage statt etwas zu unterstellen.",
    "Gehe nicht automatisch davon aus, dass etwas falsch ist; reagiere auf den tatsächlichen Wunsch des Nutzers.",
    "Zeige niemals JSON, Regel-Interna, Vorschau-Vergleiche oder technische Schritte.",
    "Nach einem erfolgreichen Tool-Call bestätigst du nur knapp, was jetzt sichtbar geändert wurde.",
    formatSpecificInstruction
  ].join("\n");
}

function buildTools(targetFormat: AdjustmentTargetFormat) {
  const formatLabel = targetFormat === "reader" ? "Reader" : "Markdown";

  return [
    {
      description: `Wendet sofort eine ${formatLabel}-Regel auf die aktuelle Auswahl an. Nutze das, sobald die gewünschte Änderung ohne weitere Rückfrage klar genug ist.`,
      name: "apply_adjustment_rule",
      parameters: {
        additionalProperties: false,
        properties: {
          instruction: {
            description:
              "Kurze deutsche Arbeitsanweisung für die gewünschte Formatänderung, konkret genug zum Ableiten der Regel.",
            type: "string"
          }
        },
        required: ["instruction"],
        type: "object"
      },
      strict: true,
      type: "function"
    }
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseApplyAdjustmentRuleArgs(value: unknown): ApplyAdjustmentRuleArgs {
  if (!isRecord(value) || typeof value.instruction !== "string" || !value.instruction.trim()) {
    throw new Error("Der Tool-Call apply_adjustment_rule enthält keine gültige instruction.");
  }

  return {
    instruction: value.instruction.trim()
  };
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

    return [
      {
        arguments: args,
        callId,
        name
      }
    ];
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
      if (!isRecord(item) || item.type !== "message" || item.role !== "assistant") {
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

        return typeof entry.text === "string" && entry.text.trim() ? [entry.text.trim()] : [];
      });
    })
    .join("\n")
    .trim();
}

async function requestOpenAiResponse(
  body: Record<string, unknown>,
  config: ReturnType<typeof readAdjustmentAiConfig>
) {
  const response = await fetch(`${config.openai!.apiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai!.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      reasoning: {
        effort: "minimal"
      },
      store: false,
      ...body
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AdjustmentChatUnavailableError(
      `Die Live-KI-Antwort war nicht verfügbar (${response.status}). ${errorText.slice(0, 240)}`
    );
  }

  return (await response.json()) as ResponsesPayload;
}

async function continueWithToolOutputs(
  payload: ResponsesPayload,
  input: RunAdjustmentChatTurnInput,
  config: ReturnType<typeof readAdjustmentAiConfig>,
  toolMessages: string[]
) {
  if (!payload.id) {
    throw new Error("Die KI-Antwort enthält keine Response-ID für den Tool-Loop.");
  }

  const functionCalls = extractFunctionCalls(payload);
  if (functionCalls.length === 0) {
    return payload;
  }

  const toolOutputs = [];

  for (const call of functionCalls) {
    if (call.name !== "apply_adjustment_rule") {
      throw new Error(`Unbekannter Tool-Call: ${call.name}`);
    }

    const args = parseApplyAdjustmentRuleArgs(JSON.parse(call.arguments) as unknown);
    const result = await input.executeApplyAdjustmentRule(args);

    toolMessages.push(
      result.ok
        ? `Regel direkt angewendet: ${result.summary ?? args.instruction}`
        : `Regel konnte nicht direkt angewendet werden: ${result.error ?? "Unbekannter Fehler."}`
    );

    toolOutputs.push({
      call_id: call.callId,
      output: JSON.stringify(result),
      type: "function_call_output"
    });
  }

  return requestOpenAiResponse(
    {
      input: toolOutputs,
      previous_response_id: payload.id,
      tool_choice: "auto",
      tools: buildTools(input.sessionDetail.session.targetFormat)
    },
    config
  );
}

export async function runAdjustmentChatTurn(
  input: RunAdjustmentChatTurnInput
): Promise<AdjustmentChatTurnResult> {
  const config = readAdjustmentAiConfig();

  if (!config.enabled || config.provider !== "openai" || !config.openai) {
    throw new AdjustmentChatUnavailableError(
      "Live-KI-Anpassungen sind aktuell nicht konfiguriert. Hinterlege einen OpenAI-Zugang, bevor du diesen Chat nutzt."
    );
  }

  const toolMessages: string[] = [];
  let appliedRuleId: string | undefined;
  let didApplyRule = false;
  let payload = await requestOpenAiResponse(
    {
      input: [
        {
          content: [
            {
              text: buildSystemInstructions(input.sessionDetail.session.targetFormat),
              type: "input_text"
            }
          ],
          role: "system"
        },
        {
          content: [
            {
              text: buildChatContext(input),
              type: "input_text"
            }
          ],
          role: "user"
        }
      ],
      tool_choice: "auto",
      tools: buildTools(input.sessionDetail.session.targetFormat)
    },
    config
  );

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = extractFunctionCalls(payload);

    if (functionCalls.length === 0) {
      break;
    }

    payload = await continueWithToolOutputs(payload, input, config, toolMessages);
    const lastToolMessage = toolMessages.at(-1);

    if (lastToolMessage?.startsWith("Regel direkt angewendet:")) {
      didApplyRule = true;
    }
  }

  const assistantMessage =
    extractAssistantMessage(payload) ||
    (didApplyRule
      ? "Die Änderung ist jetzt direkt in der Auswahl sichtbar."
      : "Ich brauche noch eine kurze Klarstellung, bevor ich das sicher anwenden kann.");

  if (toolMessages.length > 0) {
    const successfulToolMessage = toolMessages
      .slice()
      .reverse()
      .find((message) => message.startsWith("Regel direkt angewendet:"));

    if (successfulToolMessage) {
      didApplyRule = true;
      const matchedSummary = successfulToolMessage.replace("Regel direkt angewendet: ", "").trim();
      const matchingActiveRule = input.activeRules.find((rule) => rule.instruction === matchedSummary);
      appliedRuleId = matchingActiveRule?.id;
    }
  }

  return {
    appliedRuleId,
    assistantMessage,
    didApplyRule,
    didRequestClarification: !didApplyRule,
    toolMessages
  };
}
