import {
  conversationSchema,
  normalizedSnapshotPayloadSchema,
} from "@chat-exporter/shared";
import { acquireContext, releaseContext } from "./browser-pool.js";
import { MAX_MESSAGE_COUNT, MAX_RAW_HTML_BYTES } from "./constants.js";
import { applyOpenAiStructuring } from "./openai-structuring.js";
import {
  blockNonEssentialResources,
  preparePageScripts,
  truncateMessagesIfNeeded,
  validateRawHtmlSize,
} from "./parser-page-utils.js";
import type { PlatformParserResult, StageCallback } from "./parser-types.js";

/* ── Claude share-import constants ─────────────────────────── */

/** Timeout for the initial page.goto() navigation. */
export const PAGE_LOAD_TIMEOUT_MS = 30_000;

/** Timeout for waiting until message elements appear in the DOM. */
export const MESSAGE_WAIT_TIMEOUT_MS = 20_000;

/** Extra delay after messages appear to let the page stabilize. */
export const PAGE_STABILIZATION_MS = 1_000;

/* ─────────────────────────────────────────────────────────── */

export async function importClaudeSharePage(
  url: string,
  options?: { onStage?: StageCallback },
): Promise<PlatformParserResult> {
  const context = await acquireContext();

  try {
    await blockNonEssentialResources(context);

    const page = await context.newPage();
    await preparePageScripts(page);

    options?.onStage?.("fetch");
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => {
        const root =
          document.querySelector("main, [role='main'], article, body") ??
          document.body;
        return (root.textContent ?? "").trim().length > 32;
      },
      {
        timeout: MESSAGE_WAIT_TIMEOUT_MS,
      },
    );
    await page.waitForTimeout(PAGE_STABILIZATION_MS);

    options?.onStage?.("extract");
    const extracted = await page.evaluate(() => {
      const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;

      function normalizeTitle(rawTitle: string) {
        return (
          rawTitle.replace(/^Claude\s*[-–—|]\s*/i, "").trim() || "Untitled Chat"
        );
      }

      const warnings: string[] = [];

      // Strategy 1: Look for data-testid based turn containers
      // Claude share pages typically use [data-testid] patterns
      const turnSelectors = [
        '[data-testid*="conversation-turn"]',
        '[data-testid*="chat-turn"]',
        '[data-testid*="message"]',
        ".conversation-turn",
        ".chat-message",
      ];

      let turnElements: Element[] = [];
      for (const selector of turnSelectors) {
        turnElements = Array.from(document.querySelectorAll(selector));
        if (turnElements.length >= 2) break;
      }

      // Strategy 2: If no explicit turns found, look for role-based containers
      if (turnElements.length < 2) {
        const allMessages = Array.from(
          document.querySelectorAll(
            '[class*="human"], [class*="user"], [data-role="human"], [data-role="user"], [class*="assistant"], [data-role="assistant"]',
          ),
        );
        if (allMessages.length >= 2) {
          turnElements = allMessages;
        }
      }

      // Strategy 3: Content-based heuristic
      if (turnElements.length < 2) {
        const mainContent = document.querySelector(
          'main, [role="main"], .conversation, .chat-content',
        );
        if (mainContent) {
          const candidates = Array.from(mainContent.children).filter(
            (child) => {
              const text = (child.textContent ?? "").trim();
              return text.length > 5 && child.children.length > 0;
            },
          );
          if (candidates.length >= 2) {
            turnElements = candidates;
            warnings.push(
              "Used content heuristic to identify messages — extraction quality may vary.",
            );
          }
        }
      }

      if (turnElements.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [],
          warnings: ["No conversation turns found on Claude share page."],
        };
      }

      let fallbackCount = 0;
      const messages = turnElements
        .map((turn, index) => {
          // Determine role
          const testId = turn.getAttribute("data-testid") ?? "";
          const dataRole = turn.getAttribute("data-role") ?? "";
          const className = String(turn.className ?? "").toLowerCase();

          let role = "unknown";
          if (
            dataRole === "human" ||
            dataRole === "user" ||
            className.includes("human") ||
            className.includes("user") ||
            testId.includes("user") ||
            testId.includes("human")
          ) {
            role = "user";
          } else if (
            dataRole === "assistant" ||
            className.includes("assistant") ||
            testId.includes("assistant")
          ) {
            role = "assistant";
          } else {
            // Alternating pattern: even indices = user, odd = assistant
            role = index % 2 === 0 ? "user" : "assistant";
            if (turnElements.length > 1) {
              warnings.push(
                `Inferred role for message ${index + 1} as "${role}" from position.`,
              );
            }
          }

          const messageId =
            turn.getAttribute("data-message-id") ??
            turn.getAttribute("data-testid") ??
            crypto.randomUUID();

          // Extract blocks
          const contentRoot =
            turn.querySelector(
              '.markdown, .prose, .message-content, [class*="content"]',
            ) ?? turn;
          const blocks = Array.from(contentRoot.childNodes).flatMap(
            (childNode) => {
              if (childNode.nodeType === Node.TEXT_NODE) {
                const text = normalizeWhitespace(childNode.textContent ?? "");
                return text ? [{ type: "paragraph" as const, text }] : [];
              }
              if (childNode.nodeType !== Node.ELEMENT_NODE) return [];
              return elementToBlocks(childNode as Element);
            },
          );

          const rawText = normalizeWhitespace(
            (turn as HTMLElement).innerText ?? turn.textContent ?? "",
          );

          if (blocks.length === 0 && rawText) {
            fallbackCount++;
            return {
              id: messageId,
              role,
              rawText,
              rawHtml: (turn as HTMLElement).innerHTML,
              blocks: [{ type: "paragraph" as const, text: rawText }],
              parser: {
                source: "claude-fallback",
                blockCount: 1,
                usedFallback: true,
                strategy: "fallback" as const,
              },
            };
          }

          if (blocks.length === 0) return null;

          return {
            id: messageId,
            role,
            rawText,
            rawHtml: (turn as HTMLElement).innerHTML,
            blocks,
            parser: {
              source: "claude-structured",
              blockCount: blocks.length,
              usedFallback: false,
              strategy: "deterministic" as const,
            },
          };
        })
        .filter(Boolean);

      if (fallbackCount > 0) {
        warnings.push(
          `${fallbackCount} message(s) fell back to plain paragraph.`,
        );
      }

      return { title: normalizeTitle(document.title), messages, warnings };
    });

    options?.onStage?.("normalize");
    const normalizedPayload = normalizedSnapshotPayloadSchema.parse(extracted);
    truncateMessagesIfNeeded(normalizedPayload, MAX_MESSAGE_COUNT);

    if (normalizedPayload.messages.length === 0) {
      throw new Error(
        "No importable messages were detected on this Claude share page.",
      );
    }

    options?.onStage?.("structure");
    const structured = await applyOpenAiStructuring(normalizedPayload.messages);
    const finalPayload = normalizedSnapshotPayloadSchema.parse({
      ...normalizedPayload,
      messages: structured.messages,
      warnings: [...normalizedPayload.warnings, ...structured.warnings],
      structuring: structured.structuring,
    });

    const rawHtml = await page.content();
    const rawHtmlBytes = validateRawHtmlSize(rawHtml, MAX_RAW_HTML_BYTES);
    const fetchedAt = new Date().toISOString();

    const conversation = conversationSchema.parse({
      id: crypto.randomUUID(),
      title: finalPayload.title,
      source: {
        url,
        platform: "claude",
      },
      messages: finalPayload.messages,
    });

    return {
      conversation,
      warnings: finalPayload.warnings,
      snapshot: {
        finalUrl: page.url(),
        fetchedAt,
        pageTitle: finalPayload.title,
        rawHtml,
        normalizedPayload: finalPayload,
        fetchMetadata: {
          articleCount: normalizedPayload.messages.length,
          messageCount: conversation.messages.length,
          rawHtmlBytes,
        },
      },
    };
  } finally {
    await releaseContext(context);
  }
}
