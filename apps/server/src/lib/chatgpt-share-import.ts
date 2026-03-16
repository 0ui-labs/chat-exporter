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

/* ── ChatGPT share-import constants ─────────────────────────── */

/** Timeout for the initial page.goto() navigation. */
export const PAGE_LOAD_TIMEOUT_MS = 30_000;

/** Timeout for waiting until message elements appear in the DOM. */
export const MESSAGE_WAIT_TIMEOUT_MS = 20_000;

/** Extra delay after messages appear to let the page stabilize. */
export const PAGE_STABILIZATION_MS = 800;

/** CSS selector that identifies ChatGPT share-page message elements. */
export const CHATGPT_SHARE_SELECTOR = "article [data-message-author-role]";

/* ─────────────────────────────────────────────────────────── */

export async function importChatGptSharePage(
  url: string,
  options?: {
    onStage?: StageCallback;
  },
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
      (selector) => document.querySelectorAll(selector).length > 0,
      CHATGPT_SHARE_SELECTOR,
      {
        timeout: MESSAGE_WAIT_TIMEOUT_MS,
      },
    );
    await page.waitForTimeout(PAGE_STABILIZATION_MS);

    options?.onStage?.("extract");
    const extracted = await page.evaluate(() => {
      const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;

      function normalizeTitle(rawTitle: string) {
        const title = rawTitle.replace(/^ChatGPT\s*-\s*/i, "").trim();
        return title || "Untitled Chat";
      }

      const warnings: string[] = [];
      const articles = Array.from(document.querySelectorAll("article"));
      let fallbackCount = 0;

      const messages = articles
        .map((article) => {
          const messageElement = article.querySelector(
            "[data-message-author-role]",
          ) as HTMLElement | null;
          if (!messageElement) {
            return null;
          }

          const role =
            messageElement.getAttribute("data-message-author-role") ??
            "unknown";
          const messageId =
            messageElement.getAttribute("data-message-id") ??
            crypto.randomUUID();

          if (role === "assistant") {
            const markdownRoot =
              (messageElement.querySelector(
                ".markdown",
              ) as HTMLElement | null) ?? messageElement;
            const blocks = Array.from(markdownRoot.childNodes).flatMap(
              (childNode) => {
                if (childNode.nodeType === Node.TEXT_NODE) {
                  const text = normalizeWhitespace(childNode.textContent ?? "");
                  return text ? [{ type: "paragraph" as const, text }] : [];
                }

                if (childNode.nodeType !== Node.ELEMENT_NODE) {
                  return [];
                }

                return elementToBlocks(childNode as Element);
              },
            );

            const rawText = normalizeWhitespace(messageElement.innerText);
            const rawHtml = messageElement.innerHTML;

            if (blocks.length === 0) {
              fallbackCount += 1;
              return rawText
                ? {
                    id: messageId,
                    role,
                    rawText,
                    rawHtml,
                    blocks: [{ type: "paragraph" as const, text: rawText }],
                    parser: {
                      source: "assistant-fallback",
                      blockCount: 1,
                      usedFallback: true,
                      strategy: "fallback" as const,
                    },
                  }
                : null;
            }

            return {
              id: messageId,
              role,
              rawText,
              rawHtml,
              blocks,
              parser: {
                source: "assistant-markdown",
                blockCount: blocks.length,
                usedFallback: false,
                strategy: "deterministic" as const,
              },
            };
          }

          const textSource =
            (messageElement.querySelector(
              ".whitespace-pre-wrap",
            ) as HTMLElement | null) ?? messageElement;
          const text = normalizeWhitespace(textSource.innerText);
          const rawHtml = textSource.innerHTML;

          return text
            ? {
                id: messageId,
                role,
                rawText: text,
                rawHtml,
                blocks: [{ type: "paragraph" as const, text }],
                parser: {
                  source:
                    textSource === messageElement
                      ? "user-message"
                      : "user-whitespace-pre-wrap",
                  blockCount: 1,
                  usedFallback: false,
                  strategy: "deterministic" as const,
                },
              }
            : null;
        })
        .filter(Boolean);

      if (fallbackCount > 0) {
        warnings.push(
          `${fallbackCount} assistant message(s) fell back to a plain paragraph because no richer block structure was detected.`,
        );
      }

      return {
        title: normalizeTitle(document.title),
        messages,
        warnings,
      };
    });

    options?.onStage?.("normalize");
    const normalizedPayload = normalizedSnapshotPayloadSchema.parse(extracted);

    truncateMessagesIfNeeded(normalizedPayload, MAX_MESSAGE_COUNT);

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
        platform: "chatgpt",
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
