import type {
  Block,
  NormalizedSnapshotMessage,
  NormalizedSnapshotPayload
} from "@chat-exporter/shared";
import { blockSchema } from "@chat-exporter/shared";

import "../load-env.js";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_MESSAGES = 24;
const DEFAULT_MAX_MESSAGE_CHARS = 18_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_REPAIR_SCORE = 4;
const STRUCTURE_HINT_PATTERN =
  /(^|\n)([-*]\s+\S+|\d+\.\s+\S+|#{1,6}\s+\S+|>\s+\S+|```|`[^`]+`|\|.+\|)/m;
const PARAGRAPH_BLOCK_SYNTAX_PATTERN =
  /(^|\n)(#{1,6}\s+\S+|[-*]\s+\S+|\d+\.\s+\S+|>\s+\S+|```|\|.+\|)/gm;
const EMPHASIZED_STEP_PATTERN = /(?:^|\n\n)\*\*\d+\.\s+.+?\*\*(?=\n\n|$)/gm;

type StructuringMetadata = NonNullable<NormalizedSnapshotPayload["structuring"]>;
type StructuredSnapshotMessage = NormalizedSnapshotMessage & {
  parser: NonNullable<NormalizedSnapshotMessage["parser"]>;
};

type CandidateMessage = {
  kind: "message" | "block";
  index: number;
  message: StructuredSnapshotMessage;
  reasons: string[];
  score: number;
  blockIndex?: number;
};

type StructuringConfig = {
  apiKey?: string;
  apiBaseUrl: string;
  model: string;
  concurrency: number;
  maxMessages: number;
  maxMessageChars: number;
  timeoutMs: number;
  enabled: boolean;
  disabledReason?: string;
};

type RepairSuccess = {
  ok: true;
  index: number;
  message: StructuredSnapshotMessage;
};

type RepairFailure = {
  ok: false;
  index: number;
  reason: string;
};

type RepairResult = RepairSuccess | RepairFailure;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function readStructuringConfig(): StructuringConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const rawEnabled = process.env.OPENAI_STRUCTURING_ENABLED?.trim().toLowerCase();
  const explicitlyDisabled =
    rawEnabled === "0" || rawEnabled === "false" || rawEnabled === "off";
  const model = process.env.OPENAI_STRUCTURING_MODEL?.trim() || DEFAULT_MODEL;
  const apiBaseUrl =
    process.env.OPENAI_API_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_API_BASE_URL;

  if (explicitlyDisabled) {
    return {
      apiKey,
      apiBaseUrl,
      model,
      concurrency: readPositiveInteger(process.env.OPENAI_STRUCTURING_CONCURRENCY, DEFAULT_CONCURRENCY),
      maxMessages: readPositiveInteger(process.env.OPENAI_STRUCTURING_MAX_MESSAGES, DEFAULT_MAX_MESSAGES),
      maxMessageChars: readPositiveInteger(
        process.env.OPENAI_STRUCTURING_MAX_MESSAGE_CHARS,
        DEFAULT_MAX_MESSAGE_CHARS
      ),
      timeoutMs: readPositiveInteger(process.env.OPENAI_STRUCTURING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
      enabled: false,
      disabledReason: "OPENAI_STRUCTURING_ENABLED is disabled."
    };
  }

  return {
    apiKey,
    apiBaseUrl,
    model,
    concurrency: readPositiveInteger(process.env.OPENAI_STRUCTURING_CONCURRENCY, DEFAULT_CONCURRENCY),
    maxMessages: readPositiveInteger(process.env.OPENAI_STRUCTURING_MAX_MESSAGES, DEFAULT_MAX_MESSAGES),
    maxMessageChars: readPositiveInteger(
      process.env.OPENAI_STRUCTURING_MAX_MESSAGE_CHARS,
      DEFAULT_MAX_MESSAGE_CHARS
    ),
    timeoutMs: readPositiveInteger(process.env.OPENAI_STRUCTURING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    enabled: Boolean(apiKey),
    disabledReason: apiKey ? undefined : "OPENAI_API_KEY is not configured."
  };
}

function defaultParserStrategy(message: NormalizedSnapshotMessage) {
  const parser = message.parser ?? {};

  return {
    ...parser,
    blockCount: parser.blockCount ?? message.blocks.length,
    strategy:
      parser.strategy ??
      (parser.usedFallback ? "fallback" : "deterministic")
  } satisfies NonNullable<NormalizedSnapshotMessage["parser"]>;
}

function normalizeMessages(
  messages: NormalizedSnapshotPayload["messages"]
): StructuredSnapshotMessage[] {
  return messages.map((message) => ({
    ...message,
    parser: defaultParserStrategy(message)
  }));
}

function countMatches(value: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(value.matchAll(new RegExp(pattern.source, flags))).length;
}

function collectParagraphRepairSignals(message: StructuredSnapshotMessage) {
  const signals: Array<{
    blockIndex: number;
    reasons: string[];
    score: number;
  }> = [];

  for (const [blockIndex, block] of message.blocks.entries()) {
    if (block.type !== "paragraph" && block.type !== "quote") {
      continue;
    }

    const reasons = new Set<string>();
    let score = 0;

    if (countMatches(block.text, EMPHASIZED_STEP_PATTERN) >= 2) {
      reasons.add("markdown-step-paragraph");
      score += 4;
    }

    const syntaxMatches = countMatches(block.text, PARAGRAPH_BLOCK_SYNTAX_PATTERN);

    if (syntaxMatches >= 2 && block.text.includes("\n")) {
      reasons.add("block-markdown-leaked-into-paragraph");
      score += 4;
    }

    if (block.text.includes("```")) {
      reasons.add("code-fence-leaked-into-paragraph");
      score += 5;
    }

    if (countMatches(block.text, /\|.+\|/gm) >= 2) {
      reasons.add("table-markup-leaked-into-paragraph");
      score += 5;
    }

    if (score < MIN_REPAIR_SCORE) {
      continue;
    }

    signals.push({
      blockIndex,
      reasons: [...reasons],
      score
    });
  }

  return signals;
}

function collectRawHtmlRepairSignals(message: StructuredSnapshotMessage) {
  const reasons = new Set<string>();
  let score = 0;

  const hasCodeBlock = message.blocks.some((block) => block.type === "code");
  const hasTableBlock = message.blocks.some((block) => block.type === "table");
  const hasListBlock = message.blocks.some((block) => block.type === "list");
  const hasQuoteBlock = message.blocks.some((block) => block.type === "quote");

  if (message.rawHtml?.includes("<pre") && !hasCodeBlock) {
    reasons.add("raw-html-code-missing-in-blocks");
    score += 5;
  }

  if (message.rawHtml?.includes("<table") && !hasTableBlock) {
    reasons.add("raw-html-table-missing-in-blocks");
    score += 5;
  }

  if (
    (message.rawHtml?.includes("<ul") || message.rawHtml?.includes("<ol")) &&
    !hasListBlock
  ) {
    reasons.add("raw-html-list-missing-in-blocks");
    score += 4;
  }

  if (message.rawHtml?.includes("<blockquote") && !hasQuoteBlock) {
    reasons.add("raw-html-quote-missing-in-blocks");
    score += 4;
  }

  return {
    reasons: [...reasons],
    score
  };
}

function detectMessageRepairCandidate(message: StructuredSnapshotMessage) {
  if (message.role !== "assistant" || !message.rawText?.trim()) {
    return null;
  }

  const reasons = new Set<string>();
  let score = 0;

  if (message.parser.usedFallback) {
    reasons.add("fallback");
    score += 8;
  }

  if (
    message.blocks.length === 1 &&
    message.blocks[0]?.type === "paragraph" &&
    (
      STRUCTURE_HINT_PATTERN.test(message.rawText) ||
      message.rawHtml?.includes("<pre") ||
      message.rawHtml?.includes("<table") ||
      message.rawHtml?.includes("<ul") ||
      message.rawHtml?.includes("<ol") ||
      message.rawHtml?.includes("<blockquote")
    )
  ) {
    reasons.add("single-paragraph-structure-hints");
    score += 6;
  }

  const rawHtmlSignals = collectRawHtmlRepairSignals(message);

  for (const reason of rawHtmlSignals.reasons) {
    reasons.add(reason);
  }

  score += rawHtmlSignals.score;

  if (score < MIN_REPAIR_SCORE) {
    return null;
  }

  return {
    reasons: [...reasons],
    score
  };
}

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

function normalizeComparisonText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[|`>#*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function contentLooksPreserved(rawText: string, blocks: Block[]) {
  const original = normalizeComparisonText(rawText);
  const candidate = normalizeComparisonText(blocks.map(blockToPlainText).join("\n"));

  if (!original) {
    return candidate.length === 0;
  }

  if (!candidate) {
    return false;
  }

  const ratio = candidate.length / original.length;
  return ratio >= 0.45 && ratio <= 1.8;
}

function parseStructuredBlocks(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("blocks" in payload)) {
    throw new Error("Structured response did not contain a blocks array.");
  }

  const blocksValue = (payload as { blocks?: unknown }).blocks;

  if (!Array.isArray(blocksValue) || blocksValue.length === 0) {
    throw new Error("Structured response returned no blocks.");
  }

  const blocks: Block[] = [];

  for (const block of blocksValue) {
    const parsed = blockSchema.safeParse(block);

    if (!parsed.success) {
      throw new Error("Structured response returned an invalid block.");
    }

    blocks.push(parsed.data);
  }

  return blocks;
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

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
        items: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "text"],
              properties: {
                type: { type: "string", enum: ["paragraph"] },
                text: { type: "string" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "level", "text"],
              properties: {
                type: { type: "string", enum: ["heading"] },
                level: { type: "integer", minimum: 1, maximum: 6 },
                text: { type: "string" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "ordered", "items"],
              properties: {
                type: { type: "string", enum: ["list"] },
                ordered: { type: "boolean" },
                items: {
                  type: "array",
                  items: { type: "string" }
                }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "language", "text"],
              properties: {
                type: { type: "string", enum: ["code"] },
                language: { type: "string" },
                text: { type: "string" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "text"],
              properties: {
                type: { type: "string", enum: ["quote"] },
                text: { type: "string" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "headers", "rows"],
              properties: {
                type: { type: "string", enum: ["table"] },
                headers: {
                  type: "array",
                  items: { type: "string" }
                },
                rows: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          ]
        }
      }
    }
  } as const;
}

function excerptAround(value: string | undefined, needle: string, radius: number) {
  if (!value?.trim()) {
    return undefined;
  }

  const normalizedNeedle = needle.trim();
  if (!normalizedNeedle) {
    return value.slice(0, radius * 2);
  }

  const searchNeedle = normalizedNeedle.slice(0, 96);
  const matchIndex = value.indexOf(searchNeedle);

  if (matchIndex < 0) {
    return value.slice(0, radius * 2);
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(value.length, matchIndex + searchNeedle.length + radius);
  return value.slice(start, end);
}

function candidateInputSize(candidate: CandidateMessage) {
  if (candidate.kind === "block") {
    const block = candidate.message.blocks[candidate.blockIndex ?? 0];
    return block ? blockToPlainText(block).length : 0;
  }

  return candidate.message.rawText?.length ?? 0;
}

function buildPrompt(candidate: CandidateMessage) {
  if (candidate.kind === "block") {
    const blockIndex = candidate.blockIndex ?? 0;
    const block = candidate.message.blocks[blockIndex];

    return JSON.stringify(
      {
        scope: "single-block-repair",
        role: candidate.message.role,
        reasons: candidate.reasons,
        score: candidate.score,
        blockIndex,
        currentBlock: block,
        previousBlock: blockIndex > 0 ? candidate.message.blocks[blockIndex - 1] : null,
        nextBlock:
          blockIndex < candidate.message.blocks.length - 1
            ? candidate.message.blocks[blockIndex + 1]
            : null,
        rawTextExcerpt: block
          ? excerptAround(candidate.message.rawText, blockToPlainText(block), 900)
          : candidate.message.rawText?.slice(0, 1_800)
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      scope: "full-message-repair",
      role: candidate.message.role,
      reasons: candidate.reasons,
      score: candidate.score,
      rawText: candidate.message.rawText,
      rawHtml: candidate.message.rawHtml?.slice(0, 8_000),
      currentBlocks: candidate.message.blocks
    },
    null,
    2
  );
}

async function requestRepair(candidate: CandidateMessage, config: StructuringConfig) {
  const response = await fetch(`${config.apiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      reasoning: {
        effort: "minimal"
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                candidate.kind === "block"
                  ? "Repair one suspicious assistant block from an archived chat transcript. Return replacement blocks for that block only, not the whole message. Preserve wording, code, and ordering. Do not summarize, translate, or add content. Convert leaked block-level markdown, repeated step markers, code fences, or table markup into semantic blocks when clearly supported."
                  : "Repair assistant message structure for an archived chat transcript. Preserve wording, code, and ordering. Do not summarize, translate, or add content. Prefer paragraph blocks when structure is ambiguous. Use headings, lists, quotes, code, and tables only when they are clearly supported by the raw text or HTML. If block-level markdown or repeated step markers leaked into a single paragraph, split that paragraph into the correct semantic blocks."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(candidate)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "chat_exporter_blocks",
          strict: true,
          schema: buildSchema()
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
  const outputText = getOutputText(payload);
  return parseStructuredBlocks(JSON.parse(outputText) as unknown);
}

async function repairCandidate(candidate: CandidateMessage, config: StructuringConfig): Promise<RepairResult> {
  try {
    const repairedBlocks = await requestRepair(candidate, config);

    const comparisonSource =
      candidate.kind === "block"
        ? blockToPlainText(candidate.message.blocks[candidate.blockIndex ?? 0]!)
        : candidate.message.rawText ?? "";

    if (!contentLooksPreserved(comparisonSource, repairedBlocks)) {
      return {
        ok: false,
        index: candidate.index,
        reason: "AI repair changed the message too aggressively and was rejected."
      };
    }

    const nextBlocks =
      candidate.kind === "block"
        ? [
            ...candidate.message.blocks.slice(0, candidate.blockIndex),
            ...repairedBlocks,
            ...candidate.message.blocks.slice((candidate.blockIndex ?? 0) + 1)
          ]
        : repairedBlocks;

    return {
      ok: true,
      index: candidate.index,
      message: {
        ...candidate.message,
        blocks: nextBlocks,
        parser: {
          ...defaultParserStrategy(candidate.message),
          blockCount: nextBlocks.length,
          usedFallback: false,
          strategy: "ai-repair",
          model: config.model
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      index: candidate.index,
      reason:
        error instanceof Error
          ? error.message
          : "AI repair failed before a structured result could be validated."
    };
  }
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>
) {
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export async function applyOpenAiStructuring(
  messages: NormalizedSnapshotPayload["messages"]
): Promise<{
  messages: NormalizedSnapshotPayload["messages"];
  warnings: string[];
  structuring: StructuringMetadata;
}> {
  const normalizedMessages = normalizeMessages(messages);
  const candidateMessages: CandidateMessage[] = normalizedMessages.flatMap<CandidateMessage>(
    (message, index) => {
    const messageLevelCandidate = detectMessageRepairCandidate(message);

    if (messageLevelCandidate) {
      return [
        {
          kind: "message" as const,
          index,
          message,
          reasons: messageLevelCandidate.reasons,
          score: messageLevelCandidate.score
        }
      ];
    }

    const bestParagraphCandidate = collectParagraphRepairSignals(message)
      .sort((left, right) => right.score - left.score || left.blockIndex - right.blockIndex)[0];

    return bestParagraphCandidate
      ? [
          {
            kind: "block" as const,
            index,
            message,
            reasons: bestParagraphCandidate.reasons,
            score: bestParagraphCandidate.score,
            blockIndex: bestParagraphCandidate.blockIndex
          }
        ]
      : [];
    }
  ).sort((left, right) => right.score - left.score || left.index - right.index);

  if (candidateMessages.length === 0) {
    return {
      messages: normalizedMessages,
      warnings: [],
      structuring: {
        status: "skipped",
        provider: "deterministic",
        candidateCount: 0,
        attemptedCount: 0,
        repairedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        skippedReason: "No low-confidence assistant messages required AI repair."
      }
    };
  }

  const config = readStructuringConfig();

  if (!config.enabled) {
    return {
      messages: normalizedMessages,
      warnings: [],
      structuring: {
        status: "disabled",
        provider: "deterministic",
        model: config.model,
        candidateCount: candidateMessages.length,
        attemptedCount: 0,
        repairedCount: 0,
        failedCount: 0,
        skippedCount: candidateMessages.length,
        skippedReason: config.disabledReason
      }
    };
  }

  const eligibleCandidates = candidateMessages.filter(
    (candidate) => candidateInputSize(candidate) <= config.maxMessageChars
  );
  const oversizedCount = candidateMessages.length - eligibleCandidates.length;
  const attemptedCandidates = eligibleCandidates.slice(0, config.maxMessages);
  const cappedCount = Math.max(0, eligibleCandidates.length - attemptedCandidates.length);

  if (attemptedCandidates.length === 0) {
    const skippedReason =
      oversizedCount > 0
        ? `All low-confidence assistant messages exceeded the ${config.maxMessageChars}-character repair limit.`
        : "No assistant messages remained eligible for AI repair.";

    return {
      messages: normalizedMessages,
      warnings:
        oversizedCount > 0
          ? [
              `Skipped AI repair for ${oversizedCount} assistant message(s) because they exceeded the raw text size limit.`
            ]
          : [],
      structuring: {
        status: "skipped",
        provider: "openai",
        model: config.model,
        candidateCount: candidateMessages.length,
        attemptedCount: 0,
        repairedCount: 0,
        failedCount: 0,
        skippedCount: candidateMessages.length,
        skippedReason
      }
    };
  }

  const repairs = await mapWithConcurrency(
    attemptedCandidates,
    config.concurrency,
    (candidate) => repairCandidate(candidate, config)
  );

  const nextMessages = [...normalizedMessages];
  const failureReasons = new Set<string>();
  let repairedCount = 0;
  let failedCount = 0;

  for (const repair of repairs) {
    if (repair.ok) {
      nextMessages[repair.index] = repair.message;
      repairedCount += 1;
      continue;
    }

    failedCount += 1;
    failureReasons.add(repair.reason);
  }

  const warnings: string[] = [];

  if (oversizedCount > 0) {
    warnings.push(
      `Skipped AI repair for ${oversizedCount} assistant message(s) because they exceeded the raw text size limit.`
    );
  }

  if (cappedCount > 0) {
    warnings.push(
      `Skipped AI repair for ${cappedCount} assistant message(s) because the OPENAI_STRUCTURING_MAX_MESSAGES limit was reached.`
    );
  }

  if (failedCount > 0) {
    warnings.push(
      `AI repair failed for ${failedCount} assistant message(s). Deterministic blocks were kept.`
    );
  }

  for (const failureReason of failureReasons) {
    warnings.push(`AI repair detail: ${failureReason}`);
  }

  const status =
    repairedCount === 0 && failedCount > 0
      ? "failed"
      : failedCount > 0
        ? "partial"
        : "applied";

  return {
    messages: nextMessages,
    warnings,
    structuring: {
      status,
      provider: "openai",
      model: config.model,
      candidateCount: candidateMessages.length,
      attemptedCount: attemptedCandidates.length,
      repairedCount,
      failedCount,
      skippedCount: oversizedCount + cappedCount,
      skippedReason: oversizedCount + cappedCount > 0 ? "Some candidates were skipped before repair." : undefined
    }
  };
}
