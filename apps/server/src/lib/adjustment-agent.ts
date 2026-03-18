import type {
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  Block,
  FormatRule,
  ImportJob,
} from "@chat-exporter/shared";
import { customStyleEffectSchema } from "@chat-exporter/shared";

import { readAdjustmentAiConfig } from "./adjustment-ai-config.js";
import type {
  ClaudeContentBlock,
  ClaudeMessage,
  ClaudeResponse,
  ClaudeTool,
} from "./claude-client.js";
import { requestClaudeResponse } from "./claude-client.js";

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

type SessionEvent = {
  eventType: string;
  ruleId: string | null;
  createdAt: string;
};

type RunAgentTurnInput = {
  sessionDetail: AdjustmentSessionDetail;
  activeRules: FormatRule[];
  sessionEvents?: SessionEvent[];
  job?: ImportJob;
  screenshot?: string; // base64 PNG
  markup?: string; // HTML or Markdown of the block
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

  const readerGuide = `## Reader-Anpassungen (CSS-basiert)

Du änderst die **visuelle Darstellung** von Blöcken im Reader über CSS-Inline-Styles (camelCase).

Drei Style-Slots:
- **containerStyle** — Äußerer Block-Wrapper: paddingLeft, marginBottom, backgroundColor, borderLeft, borderRadius, ...
- **textStyle** — Text im Block: fontSize, fontWeight, lineHeight, color, fontStyle, letterSpacing, ...
- **itemStyle** — Kind-Elemente (<li>, <td>): paddingLeft, marginBottom, fontWeight, ...

Weitere Optionen:
- **textTransform**: 'bold_prefix_before_colon' | 'render_markdown_strong'
- **headingLevel**: 1-6 (überschreibt Ebene)
- **insertBefore** / **insertAfter**: 'hr' | 'spacer'

Basis-Styles: paragraph=text-sm/1.75, heading=font-semibold, list=list-disc/pl-1.25rem, quote=border-left+italic, code=bg-zinc-950+monospace, table=full-width/text-sm.

Erlaubte CSS-Properties: padding*, margin*, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, color, backgroundColor, opacity, border*, borderRadius, textDecoration, textTransform, gap, listStyleType.
Erlaubte Farben: hsl(var(--primary)), hsl(var(--foreground)), hsl(var(--accent)), hsl(var(--muted)), hsl(var(--border)).

Verboten: position, display, z-index, overflow, width/height, Animationen, Transforms, hardcoded hex-Farben, Pseudo-Elemente, Hover-States, Media-Queries.
Du kannst den Text-Inhalt NICHT umschreiben, nur dessen Darstellung ändern.

## Wann compound statt block_type?
- Wenn der Nutzer nach einem bestimmten Kontext fragt ("nach Überschriften", "in Assistenten-Antworten")
- Wenn mehrere Filterkriterien kombiniert werden ("Listen die 'Symptom' enthalten")
- block_type für einfache "alle X"-Anfragen, compound für alles mit Kontext`;

  const markdownGuide = `## Markdown-Anpassungen (nur strukturelle Transformationen)

Für Markdown sind nur strukturelle Text-Transformationen möglich. CSS hat keine Wirkung.

Verfügbare markdownTransform-Werte:
- **promote_to_heading** — Wandelt Zeile in Markdown-Überschrift um
- **normalize_list_structure** — Formt Zeilen in saubere Markdown-Liste um
- **normalize_markdown_table** — Bereinigt Markdown-Tabellen-Formatierung
- **reshape_markdown_block** — Bereinigt Whitespace in Markdown-Blöcken
- **bold_prefix_before_colon** — Fettet Text vor dem ersten Doppelpunkt (**Label:**)

Exakte Schriftgrößen, Farben, Abstände sind in Markdown nicht möglich.
Wenn der Nutzer nach unmöglichem Styling fragt, erkläre das kurz und ehrlich.`;

  const readerExamples = `## Beispiele

Nutzer wählt eine Liste aus und sagt: "Kannst du die Liste weiter einrücken?"
→ create_rule mit:
  selector: { strategy: "exact", messageId: "<aus Kontext>", blockId: "<aus Kontext>", blockIndex: <aus Kontext>, blockType: "list" }
  effect: { type: "custom_style", containerStyle: { paddingLeft: "2.5rem" } }
  description: "Liste weiter eingerückt"

Nutzer wählt eine Überschrift und sagt: "Die soll kleiner sein"
→ create_rule mit:
  selector: { strategy: "exact", messageId: "<aus Kontext>", blockId: "<aus Kontext>", blockIndex: <aus Kontext>, blockType: "heading" }
  effect: { type: "custom_style", textStyle: { fontSize: "1rem", fontWeight: "500" } }
  description: "Überschrift kleiner dargestellt"

Nutzer wählt einen Absatz und sagt: "Mehr Abstand nach unten"
→ create_rule mit:
  selector: { strategy: "exact", messageId: "<aus Kontext>", blockId: "<aus Kontext>", blockIndex: <aus Kontext>, blockType: "paragraph" }
  effect: { type: "custom_style", containerStyle: { marginBottom: "1.5rem" } }
  description: "Mehr Abstand unter dem Absatz"

Nutzer wählt einen Absatz und sagt: "Mach den Text fett"
→ create_rule mit:
  selector: { strategy: "exact", messageId: "<aus Kontext>", blockId: "<aus Kontext>", blockIndex: <aus Kontext>, blockType: "paragraph" }
  effect: { type: "custom_style", textStyle: { fontWeight: "700" } }
  description: "Text fett dargestellt"

Nutzer sagt: "Alle Listen sollen mehr Abstand haben"
→ create_rule mit:
  selector: { strategy: "block_type", blockType: "list" }
  effect: { type: "custom_style", containerStyle: { marginBottom: "1rem", marginTop: "1rem" } }
  description: "Mehr Abstand um alle Listen"

Nutzer sagt: "Alle Listen in Assistenten-Antworten sollen mehr Abstand haben"
→ create_rule mit:
  selector: { strategy: "compound", blockType: "list", messageRole: "assistant" }
  effect: { type: "custom_style", containerStyle: { marginBottom: "1rem" } }
  description: "Mehr Abstand unter Listen in Assistenten-Antworten"

Nutzer sagt: "Absätze nach Überschriften sollen eingerückt sein"
→ create_rule mit:
  selector: { strategy: "compound", blockType: "paragraph", context: { previousSibling: { blockType: "heading" } } }
  effect: { type: "custom_style", containerStyle: { paddingLeft: "1.5rem" } }
  description: "Absätze nach Überschriften eingerückt"`;

  const markdownExamples = `## Beispiele

Nutzer wählt eine Textzeile und sagt: "Das soll eine Überschrift werden"
→ create_rule mit:
  selector: { strategy: "exact", messageId: "<aus Kontext>", blockId: "<aus Kontext>", blockIndex: <aus Kontext>, blockType: "paragraph" }
  effect: { type: "custom_style", markdownTransform: "promote_to_heading" }
  description: "Zeile zur Überschrift gemacht"

Nutzer wählt Text mit "Label: Wert" und sagt: "Labels sollen fett sein"
→ create_rule mit:
  selector: { strategy: "prefix_before_colon" }
  effect: { type: "custom_style", markdownTransform: "bold_prefix_before_colon" }
  description: "Label-Präfixe fett dargestellt"`;

  return `## Kontext

Du arbeitest im **Chat Exporter** — einer Web-App, mit der Nutzer öffentlich geteilte KI-Chats (von ChatGPT, Claude, Gemini u.a.) importieren und in verschiedenen Formaten anzeigen können: Reader (schön formatiert), Markdown, Übergabe und JSON.

Du bist der KI-Agent hinter dem **Anpassungsmodus**. Der Nutzer hat im ${isReader ? "Reader" : "Markdown"}-Format einen bestimmten Block (Absatz, Überschrift, Liste, Zitat, Code oder Tabelle) ausgewählt und sieht jetzt ein Popover-Fenster, in dem er in Alltagssprache beschreiben kann, was er an der Darstellung ändern möchte. Du chattest direkt mit dem Nutzer in diesem Popover.

## Deine Aufgabe

Du übersetzt die Wünsche des Nutzers in **Darstellungsregeln**, die sofort sichtbar auf den ausgewählten Block angewendet werden. Du hast dafür drei Tools: create_rule (neue Regel), update_rule (bestehende Regel ändern), delete_rule (Regel entfernen).

## Verhalten

- Antworte auf Deutsch, kurz und freundlich, ohne Fachbegriffe.
- Wenn die Anfrage klar ist: rufe **sofort** das passende Tool auf. Nicht erst erklären, was du tun wirst — einfach machen.
- Wenn die Anfrage unklar ist: stelle **eine** konkrete Rückfrage. Nicht mehrere Fragen auf einmal, und nicht "Ich brauche eine Klarstellung" ohne die eigentliche Frage.
- Nach Tool-Calls: beschreibe die sichtbare Änderung in einem kurzen Satz (z.B. "Die Liste ist jetzt weiter eingerückt.").
- Zeige niemals JSON, Regel-IDs, CSS-Properties oder technische Details.
- Sei ehrlich — sage nur, dass etwas geändert wurde, wenn du tatsächlich ein Tool aufgerufen hast.
- Der Nutzer sieht die Änderung sofort live im Dokument. Du musst keine Vorschau beschreiben.
- Prüfe immer zuerst die bestehenden Regeln bevor du neue erstellst. Wenn eine bestehende Regel das gemeldete Problem verursacht, lösche sie mit delete_rule statt eine neue zu erstellen.
- Wenn du unsicher bist ob die Änderung das Problem löst, sage das ehrlich.
- Wenn das Problem außerhalb deiner Fähigkeiten liegt (z.B. ein Rendering-Bug im Code), sage das.
- Behaupte niemals dass eine Änderung funktioniert hat ohne visuelles Feedback geprüft zu haben.

${isReader ? readerGuide : markdownGuide}

${isReader ? readerExamples : markdownExamples}

## Renderer-Defaults (gelten immer, keine Regel nötig)

- Alle Reader-Blöcke verwenden automatisch \`textTransform: "render_markdown_strong"\` — Markdown **fett** und *kursiv* Syntax wird als echtes HTML gerendert.
- Du musst dafür keine Regel erstellen. Wenn der Nutzer fragt "warum werden Sternchen als fett angezeigt?" — erkläre dass das der Standard ist.
- Erstelle niemals eine Regel die nur den Default wiederholt (z.B. eine Regel die nur \`textTransform: "render_markdown_strong"\` setzt).

## Visuelles Feedback

- Du bekommst einen Screenshot des ausgewählten Blocks. Nutze ihn um das aktuelle Erscheinungsbild zu verstehen.
- Nach jeder Änderung bekommst du einen neuen Screenshot. Vergleiche ihn mit dem vorherigen um zu prüfen ob die Änderung den gewünschten Effekt hat.
- Melde erst Erfolg wenn du im Screenshot siehst, dass das Problem behoben ist.
- Wenn der Screenshot zeigt dass die Änderung nicht den gewünschten Effekt hatte, versuche einen anderen Ansatz.

## Scope (Geltungsbereich)

- Frage den Nutzer IMMER ob die Regel global (für alle Blöcke dieses Typs) oder lokal (nur dieser Block) gelten soll.
- Default-Empfehlung: global. Nur bei explizit block-spezifischen Anfragen lokal empfehlen.
- Stelle die Scope-Frage NACH dem erfolgreichen Anwenden der Regel, nicht vorher.
- Beispiel: "Die Änderung ist jetzt sichtbar. Soll sie für alle Listen gelten oder nur für diese eine?"`;
}

// ---------------------------------------------------------------------------
// Tool Definitions (OpenAI Responses API format)
// ---------------------------------------------------------------------------

function buildSelectorSchema(targetFormat: AdjustmentTargetFormat = "reader") {
  const isMarkdown = targetFormat === "markdown";

  // For Markdown, compound selectors only support textPattern (line-based matching).
  // blockType, messageRole, headingLevel, position, and context are block/message
  // concepts that do not exist in the flat line-based Markdown representation and
  // are silently ignored by applyMarkdownRules. Exposing them would mislead the AI
  // into generating selectors that appear meaningful but have no effect.
  const compoundProperties = isMarkdown
    ? {
        textPattern: {
          type: "string",
          description:
            "Nur für compound: Regex-Pattern das im Markdown-Text matchen muss.",
        },
      }
    : {
        messageRole: {
          type: "string",
          enum: ["user", "assistant", "system", "tool"],
          description: "Nur für compound: Nachrichten dieser Rolle matchen.",
        },
        headingLevel: {
          type: "number",
          description: "Nur für compound: Überschriften-Ebene 1-6.",
        },
        position: {
          type: "string",
          enum: ["first", "last"],
          description:
            "Nur für compound: Erster oder letzter Block einer Nachricht.",
        },
        textPattern: {
          type: "string",
          description:
            "Nur für compound: Regex-Pattern das im Block-Text matchen muss.",
        },
        context: {
          type: "object",
          description: "Nur für compound: Nachbar-Block-Filter.",
          properties: {
            previousSibling: {
              type: "object",
              properties: {
                blockType: { type: "string" },
                headingLevel: { type: "number" },
                textPattern: { type: "string" },
              },
            },
            nextSibling: {
              type: "object",
              properties: {
                blockType: { type: "string" },
                headingLevel: { type: "number" },
                textPattern: { type: "string" },
              },
            },
          },
        },
      };

  return {
    type: "object",
    properties: {
      strategy: {
        type: "string",
        enum: [
          "exact",
          "block_type",
          "prefix_before_colon",
          "markdown_table",
          "compound",
        ],
        description:
          "exact = nur dieser eine Block, block_type = alle Blöcke dieses Typs, compound = flexible Kombination aus Filtern.",
      },
      messageId: {
        type: "string",
        description: "ID der Nachricht (aus dem Kontext übernehmen).",
      },
      ...(targetFormat !== "markdown"
        ? {
            blockId: {
              type: "string",
              description: "ID des Blocks (aus dem Kontext übernehmen).",
            },
          }
        : {}),
      blockIndex: {
        type: "number",
        description: "Index des Blocks (aus dem Kontext übernehmen).",
      },
      blockType: {
        type: "string",
        enum: ["paragraph", "heading", "list", "quote", "code", "table"],
        description: "Typ des Blocks (aus dem Kontext übernehmen).",
      },
      lineStart: {
        type: "number",
        description: "Nur für Markdown: erste Zeile.",
      },
      lineEnd: {
        type: "number",
        description: "Nur für Markdown: letzte Zeile.",
      },
      ...compoundProperties,
    },
    required: ["strategy"],
  };
}

function buildEffectSchema() {
  return {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["custom_style"],
        description: "Immer 'custom_style'.",
      },
      containerStyle: {
        type: "object",
        description:
          "CSS für den äußeren Block-Wrapper (camelCase). Beispiele: { paddingLeft: '2rem', marginBottom: '1rem', backgroundColor: 'hsl(var(--accent))' }.",
      },
      textStyle: {
        type: "object",
        description:
          "CSS für den Text (camelCase). Beispiele: { fontSize: '1.25rem', fontWeight: '600', color: 'hsl(var(--primary))' }.",
      },
      itemStyle: {
        type: "object",
        description:
          "CSS für Kind-Elemente wie <li>, <td> (camelCase). Beispiele: { paddingLeft: '1rem', marginBottom: '0.5rem' }.",
      },
      textTransform: {
        type: "string",
        enum: ["bold_prefix_before_colon", "render_markdown_strong"],
      },
      markdownTransform: {
        type: "string",
        enum: [
          "promote_to_heading",
          "normalize_list_structure",
          "normalize_markdown_table",
          "reshape_markdown_block",
          "bold_prefix_before_colon",
        ],
      },
      headingLevel: {
        type: "number",
        description: "Überschriften-Ebene 1-6.",
      },
      insertBefore: { type: "string", enum: ["hr", "spacer"] },
      insertAfter: { type: "string", enum: ["hr", "spacer"] },
    },
    required: ["type"],
  };
}

function buildTools(targetFormat: AdjustmentTargetFormat = "reader") {
  return [
    {
      type: "function",
      name: "create_rule",
      description:
        "Erstellt eine neue Darstellungsregel für den ausgewählten Block.",
      parameters: {
        type: "object",
        properties: {
          selector: buildSelectorSchema(targetFormat),
          effect: buildEffectSchema(),
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
          effect: buildEffectSchema(),
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

function buildSelectionContext(input: RunAgentTurnInput) {
  const { activeRules, job, sessionDetail } = input;
  const { selection, targetFormat } = sessionDetail.session;
  const selectionContext = summarizeSelection(sessionDetail, job);
  const lines: string[] = [];

  lines.push("## Ausgewählter Block");
  lines.push(`Format: ${targetFormat}`);
  lines.push(
    `Block: ${selection.blockType} (messageId: "${selection.messageId}", blockId: "${selection.blockId ?? ""}", blockIndex: ${selection.blockIndex})`,
  );
  lines.push(
    `Rolle: ${selection.messageRole}, Nachricht ${selection.messageIndex + 1}`,
  );
  if (selection.lineStart != null) {
    lines.push(
      `Zeilen: ${selection.lineStart}-${selection.lineEnd ?? selection.lineStart}`,
    );
  }
  lines.push("");
  lines.push("Inhalt des ausgewählten Blocks:");
  lines.push("```");
  lines.push(selectionContext.currentExcerpt);
  lines.push("```");

  if (selectionContext.surrounding.previous) {
    lines.push("");
    lines.push("Block davor:");
    lines.push(`> ${selectionContext.surrounding.previous.slice(0, 200)}`);
  }
  if (selectionContext.surrounding.next) {
    lines.push("");
    lines.push("Block danach:");
    lines.push(`> ${selectionContext.surrounding.next.slice(0, 200)}`);
  }

  const active = activeRules
    .filter((rule) => rule.status === "active")
    .slice(0, 8);
  if (active.length > 0) {
    lines.push("");
    lines.push("## Bereits aktive Regeln");
    for (const rule of active) {
      const selectorStr = rule.selector
        ? JSON.stringify(rule.selector)
        : "(kein Selektor)";
      const effectStr = rule.compiledRule
        ? JSON.stringify(rule.compiledRule)
        : "(kein Effect)";
      lines.push(
        `- [${rule.id}] ${rule.instruction ?? "(keine Beschreibung)"}`,
      );
      lines.push(`  Selektor: ${selectorStr}`);
      lines.push(`  Effect: ${effectStr}`);
    }
  }

  // Renderer-Defaults section
  lines.push("");
  lines.push("## Renderer-Defaults (gelten immer, keine Regel nötig)");
  lines.push(
    '- Alle Reader-Blöcke: textTransform = "render_markdown_strong" (Markdown **bold** und *italic* werden gerendert)',
  );

  const actionHistory = buildActionHistory(
    input.sessionEvents ?? [],
    activeRules,
  );
  if (actionHistory) {
    lines.push("");
    lines.push(actionHistory);
  }

  return lines.join("\n");
}

function buildActionHistory(
  sessionEvents: SessionEvent[],
  activeRules: FormatRule[],
): string {
  if (sessionEvents.length === 0) return "";

  const ruleMap = new Map(activeRules.map((r) => [r.id, r]));
  const lines: string[] = ["## Deine bisherigen Aktionen in dieser Session"];

  for (const [i, event] of sessionEvents.entries()) {
    const num = i + 1;
    const ruleId = event.ruleId ?? "unknown";

    if (event.eventType === "rule_disabled") {
      lines.push(`${num}. Regel gelöscht (ID: ${ruleId})`);
    } else if (event.eventType === "rule_applied") {
      const rule = ruleMap.get(ruleId);
      const description = rule?.instruction ?? "(unbekannte Regel)";
      lines.push(`${num}. Regel erstellt: "${description}" (ID: ${ruleId})`);
    }
  }

  return lines.join("\n");
}

type InputMessage = {
  content: Array<{ text: string; type: "input_text" | "output_text" }>;
  role: "system" | "user" | "assistant";
};

function buildInputMessages(input: RunAgentTurnInput): InputMessage[] {
  const targetFormat = input.sessionDetail.session.targetFormat;
  const selectionContent: Array<{
    text: string;
    type: "input_text" | "output_text";
  }> = [{ text: buildSelectionContext(input), type: "input_text" }];

  // Include rendered markup when available (plaintext for OpenAI compatibility)
  if (input.markup) {
    selectionContent.push({
      text: `\n\nGerendetes Markup des Blocks:\n\`\`\`\n${input.markup}\n\`\`\``,
      type: "input_text",
    });
  }

  const messages: InputMessage[] = [
    {
      content: [{ text: buildSystemPrompt(targetFormat), type: "input_text" }],
      role: "system",
    },
    {
      content: selectionContent,
      role: "user",
    },
  ];

  // Add session messages as real multi-turn conversation so the model
  // understands the full dialog history and can reference prior turns.
  for (const msg of input.sessionDetail.messages) {
    const role = msg.role === "user" ? "user" : "assistant";
    messages.push({
      content: [
        {
          text: msg.content,
          type: role === "assistant" ? "output_text" : "input_text",
        },
      ],
      role,
    });
  }

  return messages;
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
      reasoning: { effort: "medium" },
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
// Claude/Anthropic Adapter
// ---------------------------------------------------------------------------

/** Convert OpenAI-format tools to Claude format */
function convertToolsToClaude(
  openAiTools: ReturnType<typeof buildTools>,
): ClaudeTool[] {
  return openAiTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/** Convert InputMessages to Claude message format (system extracted separately) */
function convertMessagesToClaude(
  inputMessages: InputMessage[],
  input: RunAgentTurnInput,
): { system: string; messages: ClaudeMessage[] } {
  const systemMsg = inputMessages.find((m) => m.role === "system");
  const system = systemMsg?.content.map((c) => c.text).join("\n") ?? "";

  const messages: ClaudeMessage[] = [];
  for (const msg of inputMessages) {
    if (msg.role === "system") continue;
    const role = msg.role === "user" ? "user" : "assistant";
    const content: ClaudeContentBlock[] = msg.content.map((c) => ({
      type: "text" as const,
      text: c.text,
    }));
    messages.push({ role, content });
  }

  // Add screenshot as image content block for Claude vision
  if (input.screenshot && messages.length > 0) {
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      firstUserMsg.content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: input.screenshot,
        },
      });
    }
  }

  return { system, messages };
}

/** Extract text content from a Claude response */
function extractClaudeTextContent(response: ClaudeResponse): string {
  return response.content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Extract tool_use blocks from a Claude response */
function extractClaudeToolCalls(response: ClaudeResponse): FunctionCallItem[] {
  return response.content
    .filter(
      (
        block,
      ): block is {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      } => block.type === "tool_use",
    )
    .map((block) => ({
      arguments: JSON.stringify(block.input),
      callId: block.id,
      name: block.name,
    }));
}

/** Run a full agent turn against the Claude/Anthropic API */
async function runClaudeAgentTurn(
  input: RunAgentTurnInput,
  config: ReturnType<typeof readAdjustmentAiConfig>,
): Promise<{
  assistantMessage: string;
  actions: ActionRecord[];
  awaitingVisualFeedback: boolean;
}> {
  const actions: ActionRecord[] = [];
  const targetFormat = input.sessionDetail.session.targetFormat;
  const inputMessages = buildInputMessages(input);
  const { system, messages } = convertMessagesToClaude(inputMessages, input);
  const claudeTools = convertToolsToClaude(buildTools(targetFormat));

  let claudeMessages = [...messages];

  let response = await requestClaudeResponse(
    {
      model: config.model,
      system,
      messages: claudeMessages,
      tools: claudeTools,
      max_tokens: 4096,
      tool_choice: { type: "auto" },
    },
    {
      apiKey: config.anthropic!.apiKey,
      timeoutMs: config.timeoutMs,
    },
  );

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const toolCalls = extractClaudeToolCalls(response);
    if (toolCalls.length === 0) {
      break;
    }

    // Add assistant response to conversation
    claudeMessages = [
      ...claudeMessages,
      { role: "assistant" as const, content: response.content },
    ];

    // Execute tool calls and build tool results
    const toolResults: ClaudeContentBlock[] = [];
    for (const call of toolCalls) {
      const result = await executeToolCall(call, input.callbacks, actions);
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.callId,
        content: result,
      });
    }

    // Add tool results as user message
    claudeMessages = [
      ...claudeMessages,
      { role: "user" as const, content: toolResults },
    ];

    response = await requestClaudeResponse(
      {
        model: config.model,
        system,
        messages: claudeMessages,
        tools: claudeTools,
        max_tokens: 4096,
        tool_choice: { type: "auto" },
      },
      {
        apiKey: config.anthropic!.apiKey,
        timeoutMs: config.timeoutMs,
      },
    );
  }

  const rawMessage = extractClaudeTextContent(response);
  let assistantMessage: string;

  if (rawMessage) {
    if (actions.length === 0 && !rawMessage.includes("?")) {
      assistantMessage =
        "Ich konnte die Änderung leider nicht umsetzen. Kannst du genauer beschreiben, was du ändern möchtest?";
    } else {
      assistantMessage = rawMessage;
    }
  } else if (actions.length > 0) {
    assistantMessage = "Die Änderung ist jetzt sichtbar.";
  } else {
    // Retry with nudge
    const retryResponse = await requestClaudeResponse(
      {
        model: config.model,
        system,
        messages: [
          ...claudeMessages,
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: "Du hast gerade keine Antwort gegeben. Bitte stelle dem Nutzer jetzt eine konkrete Rückfrage, damit du eine passende Regel erstellen kannst.",
              },
            ],
          },
        ],
        tools: claudeTools,
        max_tokens: 4096,
      },
      {
        apiKey: config.anthropic!.apiKey,
        timeoutMs: config.timeoutMs,
      },
    );

    assistantMessage =
      extractClaudeTextContent(retryResponse) ||
      "Ich konnte die Anfrage nicht verstehen. Kannst du bitte genauer beschreiben, was du ändern möchtest?";
  }

  const awaitingVisualFeedback = actions.length > 0;
  return { assistantMessage, actions, awaitingVisualFeedback };
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
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>;
  } catch {
    return JSON.stringify({
      ok: false,
      error: `Ungültige Tool-Argumente: ${call.arguments}`,
    });
  }

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
  awaitingVisualFeedback: boolean;
}> {
  const config = readAdjustmentAiConfig();

  // Dispatch to Anthropic/Claude path
  if (config.enabled && config.provider === "anthropic" && config.anthropic) {
    return runClaudeAgentTurn(input, config);
  }

  // OpenAI path (legacy)
  if (!config.enabled || config.provider !== "openai" || !config.openai) {
    throw new AgentUnavailableError(
      "Live-KI-Anpassungen sind aktuell nicht konfiguriert. Hinterlege einen OpenAI-Zugang, bevor du diesen Chat nutzt.",
    );
  }

  const actions: ActionRecord[] = [];
  const targetFormat = input.sessionDetail.session.targetFormat;

  const inputMessages = buildInputMessages(input);

  let payload = await requestOpenAiResponse(
    {
      input: inputMessages,
      tool_choice: "auto",
      tools: buildTools(targetFormat),
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
        tools: buildTools(targetFormat),
      },
      config,
    );
  }

  const rawMessage = extractAssistantMessage(payload);
  let assistantMessage: string;

  if (rawMessage) {
    if (actions.length === 0 && !rawMessage.includes("?")) {
      // AI claims success without tool call → use honest fallback
      assistantMessage =
        "Ich konnte die Änderung leider nicht umsetzen. Kannst du genauer beschreiben, was du ändern möchtest?";
    } else {
      assistantMessage = rawMessage;
    }
  } else if (actions.length > 0) {
    assistantMessage = "Die Änderung ist jetzt sichtbar.";
  } else {
    // The AI returned no text and took no actions — retry once with an
    // explicit nudge so the user sees an actual question instead of a
    // generic placeholder.
    const retryPayload = await requestOpenAiResponse(
      {
        input: [
          ...inputMessages,
          {
            content: [
              {
                text: "Du hast gerade keine Antwort gegeben. Bitte stelle dem Nutzer jetzt eine konkrete Rückfrage, damit du eine passende Regel erstellen kannst.",
                type: "input_text",
              },
            ],
            role: "user",
          },
        ],
        tool_choice: "none",
        tools: buildTools(targetFormat),
      },
      config,
    );

    assistantMessage =
      extractAssistantMessage(retryPayload) ||
      "Ich konnte die Anfrage nicht verstehen. Kannst du bitte genauer beschreiben, was du ändern möchtest?";
  }

  const awaitingVisualFeedback = actions.length > 0;

  return { assistantMessage, actions, awaitingVisualFeedback };
}

/** @internal — exported for testing only */
export const _internal = {
  buildActionHistory,
  buildSelectionContext,
  buildSelectorSchema,
  buildSystemPrompt,
};
