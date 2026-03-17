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
import { looksLikeSharedConversationUrl } from "./source-platform.js";

/* ── DeepSeek share-import constants ─────────────────────── */

/** Timeout for the initial page.goto() navigation. */
export const PAGE_LOAD_TIMEOUT_MS = 30_000;

/** Timeout for waiting until message elements appear in the DOM. */
export const MESSAGE_WAIT_TIMEOUT_MS = 20_000;

/** Extra delay after messages appear to let the page stabilize. */
export const PAGE_STABILIZATION_MS = 1_200;

/* ─────────────────────────────────────────────────────────── */

export async function importDeepSeekSharePage(
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

    // Wait for meaningful content to appear in the DOM
    await page
      .waitForFunction(
        () => {
          // Strategy 1: DeepSeek-specific selectors
          const specificSelectors = [
            "[data-testid*='message']",
            "[data-testid*='chat']",
            ".ds-message",
            ".chat-message",
            "[class*='message']",
            "[class*='Message']",
            "[role='article']",
          ];

          for (const selector of specificSelectors) {
            if (document.querySelectorAll(selector).length > 0) {
              return true;
            }
          }

          // Strategy 2: Look for substantial text content in main area
          const root =
            document.querySelector("main, [role='main'], article, #app") ??
            document.body;
          return (root.textContent ?? "").trim().length > 100;
        },
        { timeout: MESSAGE_WAIT_TIMEOUT_MS },
      )
      .catch(() => undefined);

    await page.waitForTimeout(PAGE_STABILIZATION_MS);

    options?.onStage?.("extract");
    const extracted = await page.evaluate(() => {
      const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;

      function normalizeTitle(rawTitle: string) {
        const title = rawTitle
          .replace(/\s*[-|]\s*DeepSeek.*$/i, "")
          .replace(/^DeepSeek\s*[-|:]\s*/i, "")
          .replace(/^shared\s+/i, "")
          .trim();

        return title || "Untitled Chat";
      }

      function isExcluded(element: Element) {
        return Boolean(
          element.closest(
            "nav,header,footer,aside,form,dialog,[role='navigation'],[aria-hidden='true']",
          ),
        );
      }

      function isVisible(element: Element) {
        const computed = globalThis.getComputedStyle(element as HTMLElement);

        if (
          computed.display === "none" ||
          computed.visibility === "hidden" ||
          computed.opacity === "0"
        ) {
          return false;
        }

        const rect = (element as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function contentRootFor(element: Element) {
        return (
          element.querySelector(
            ".markdown, [data-testid*='markdown'], [class*='markdown'], [data-testid*='response-content'], [data-testid*='message-content'], [data-message-content]",
          ) ?? element
        );
      }

      function extractBlocksFromElement(element: Element) {
        return Array.from(element.childNodes).flatMap((childNode) => {
          if (childNode.nodeType === Node.TEXT_NODE) {
            const text = normalizeWhitespace(childNode.textContent ?? "");
            return text ? [{ type: "paragraph" as const, text }] : [];
          }

          if (childNode.nodeType !== Node.ELEMENT_NODE) {
            return [];
          }

          return elementToBlocks(childNode as Element);
        });
      }

      /**
       * Extract thinking/reasoning blocks from DeepSeek-R1 responses.
       * These are rendered as collapsible or specially marked sections
       * showing the model's chain-of-thought reasoning.
       */
      function extractThinkingBlocks(
        element: Element,
      ): Array<Record<string, unknown>> {
        const thinkingSelectors = [
          "[class*='think']",
          "[class*='Think']",
          "[class*='reason']",
          "[class*='Reason']",
          "[data-testid*='think']",
          "[data-testid*='reason']",
          ".ds-think",
          ".ds-reasoning",
          "details.thinking",
          "[class*='chain-of-thought']",
        ];

        const blocks: Array<Record<string, unknown>> = [];

        for (const selector of thinkingSelectors) {
          const thinkingElements = element.querySelectorAll(selector);
          for (const thinkingEl of thinkingElements) {
            const text = normalizeWhitespace(
              (thinkingEl as HTMLElement).innerText,
            );
            if (text) {
              blocks.push({
                type: "quote" as const,
                text: `[Thinking] ${text}`,
              });
            }
          }
        }

        return blocks;
      }

      type MessageEntry = {
        id: string;
        role: "user" | "assistant";
        rawText: string;
        rawHtml: string;
        blocks: Array<Record<string, unknown>>;
        parser: {
          source: string;
          blockCount: number;
          usedFallback: boolean;
          strategy: "deterministic" | "fallback";
        };
      };

      const warnings: string[] = [];
      const messages: MessageEntry[] = [];
      let thinkingBlocksFound = 0;
      let strategy = "none";

      // Strategy 1: Look for DeepSeek-specific message containers
      // DeepSeek uses a React SPA — look for common patterns
      const strategy1Selectors = [
        "[data-testid*='message']",
        ".ds-message",
        "[class*='chatMessage']",
        "[class*='chat-message']",
      ];

      let turnElements: Element[] = [];

      for (const selector of strategy1Selectors) {
        const found = Array.from(document.querySelectorAll(selector)).filter(
          (el) => isVisible(el) && !isExcluded(el),
        );
        if (found.length > 0) {
          turnElements = found;
          strategy = `deepseek-specific(${selector})`;
          break;
        }
      }

      // Strategy 2: Look for role-based containers (common in chat UIs)
      if (turnElements.length === 0) {
        const roleSelectors = [
          "[data-role]",
          "[data-message-author-role]",
          "[role='article']",
          "[class*='user'][class*='message'], [class*='assistant'][class*='message']",
        ];

        for (const selector of roleSelectors) {
          const found = Array.from(document.querySelectorAll(selector)).filter(
            (el) => isVisible(el) && !isExcluded(el),
          );
          if (found.length > 0) {
            turnElements = found;
            strategy = `role-based(${selector})`;
            break;
          }
        }
      }

      // Strategy 3: Container heuristic fallback — look for alternating
      // user/assistant blocks in the main content area
      if (turnElements.length === 0) {
        const mainRoot =
          document.querySelector(
            "main, [role='main'], #app > div, #root > div, #__next > div",
          ) ?? document.body;

        // Look for direct children that could be message turns
        const candidates = Array.from(mainRoot.children).filter((el) => {
          if (!isVisible(el) || isExcluded(el)) return false;
          const text = normalizeWhitespace((el as HTMLElement).innerText ?? "");
          return text.length > 10;
        });

        if (candidates.length >= 2) {
          turnElements = candidates;
          strategy = "container-heuristic";
        }
      }

      if (turnElements.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [] as MessageEntry[],
          warnings: ["No DeepSeek message containers found on this page."],
        };
      }

      turnElements.forEach((element, index) => {
        const messageId =
          element.getAttribute("data-message-id") ??
          element.getAttribute("data-testid") ??
          `deepseek-msg-${index + 1}`;

        // Determine role from various possible indicators
        const roleAttr =
          element.getAttribute("data-role") ??
          element.getAttribute("data-message-author-role") ??
          "";
        const classList = (element.className ?? "").toLowerCase();

        let role: "user" | "assistant";

        if (
          roleAttr === "user" ||
          classList.includes("user") ||
          classList.includes("human")
        ) {
          role = "user";
        } else if (
          roleAttr === "assistant" ||
          roleAttr === "model" ||
          classList.includes("assistant") ||
          classList.includes("bot") ||
          classList.includes("model") ||
          classList.includes("deepseek")
        ) {
          role = "assistant";
        } else {
          // Fallback: alternate user/assistant based on position
          role = index % 2 === 0 ? "user" : "assistant";
        }

        // Check for thinking blocks in assistant messages
        let thinkingBlocks: Array<Record<string, unknown>> = [];
        if (role === "assistant") {
          thinkingBlocks = extractThinkingBlocks(element);
          if (thinkingBlocks.length > 0) {
            thinkingBlocksFound += thinkingBlocks.length;
          }
        }

        const contentRoot = contentRootFor(element);
        const rawText = normalizeWhitespace(
          (contentRoot as HTMLElement).innerText,
        );
        const rawHtml = (contentRoot as HTMLElement).innerHTML;

        if (!rawText) {
          return;
        }

        if (role === "user") {
          messages.push({
            id: messageId,
            role: "user",
            rawText,
            rawHtml,
            blocks: [{ type: "paragraph", text: rawText }],
            parser: {
              source: `deepseek-user(${strategy})`,
              blockCount: 1,
              usedFallback: false,
              strategy: "deterministic",
            },
          });
          return;
        }

        // Assistant message: extract rich blocks
        const contentBlocks = extractBlocksFromElement(contentRoot);

        // Remove thinking elements from content blocks to avoid duplication
        // (they were already extracted separately)
        const filteredContentBlocks = contentBlocks.filter(
          (block) =>
            block.type !== "quote" ||
            !String(block.text ?? "").startsWith("[Thinking]"),
        );
        // If all content blocks were thinking blocks (filteredContentBlocks is empty)
        // and we already have thinking blocks extracted, don't fall back to rawText
        // as that would duplicate the thinking content as a paragraph.
        const hasOnlyThinkingContent =
          contentBlocks.length > 0 && filteredContentBlocks.length === 0;
        const combinedBlocks = [
          ...thinkingBlocks,
          ...(filteredContentBlocks.length > 0
            ? filteredContentBlocks
            : hasOnlyThinkingContent
              ? []
              : [{ type: "paragraph" as const, text: rawText }]),
        ];

        const usedFallback = contentBlocks.length === 0;

        messages.push({
          id: messageId,
          role: "assistant",
          rawText,
          rawHtml,
          blocks: combinedBlocks,
          parser: {
            source: usedFallback
              ? `deepseek-assistant-fallback(${strategy})`
              : `deepseek-assistant(${strategy})`,
            blockCount: combinedBlocks.length,
            usedFallback,
            strategy: usedFallback ? "fallback" : "deterministic",
          },
        });
      });

      if (thinkingBlocksFound > 0) {
        warnings.push(
          `${thinkingBlocksFound} DeepSeek-R1 thinking/reasoning block(s) were converted to quote blocks prefixed with "[Thinking]".`,
        );
      }

      if (messages.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [] as MessageEntry[],
          warnings: [
            "DeepSeek message containers found but no extractable messages.",
          ],
        };
      }

      warnings.push(
        `Parsed ${messages.length} DeepSeek message(s) using strategy: ${strategy}.`,
      );

      return {
        title: normalizeTitle(document.title),
        messages,
        warnings,
      };
    });

    options?.onStage?.("normalize");
    const normalizedPayload = normalizedSnapshotPayloadSchema.parse(extracted);
    truncateMessagesIfNeeded(normalizedPayload, MAX_MESSAGE_COUNT);

    if (normalizedPayload.messages.length === 0) {
      throw new Error(
        "No importable messages were detected on this DeepSeek page.",
      );
    }

    options?.onStage?.("structure");
    const structured = await applyOpenAiStructuring(normalizedPayload.messages);
    const warnings = [...normalizedPayload.warnings, ...structured.warnings];

    if (!looksLikeSharedConversationUrl(url)) {
      warnings.push(
        "The URL does not look like a typical public share page path, so extraction may be noisier than usual.",
      );
    }

    const finalPayload = normalizedSnapshotPayloadSchema.parse({
      ...normalizedPayload,
      messages: structured.messages,
      warnings,
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
        platform: "deepseek",
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
