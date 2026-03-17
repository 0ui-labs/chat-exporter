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

/* ── Grok share-import constants ──────────────────────────── */

/** Timeout for the initial page.goto() navigation. */
export const PAGE_LOAD_TIMEOUT_MS = 30_000;

/** Timeout for waiting until meaningful content appears in the DOM. */
export const GROK_CONTENT_WAIT_TIMEOUT_MS = 20_000;

/** Timeout for networkidle wait after DOM is ready. */
export const GROK_NETWORK_IDLE_TIMEOUT_MS = 5_000;

/** Extra delay after content appears to let the page stabilize (Grok is a heavy Next.js SPA). */
export const GROK_PAGE_STABILIZATION_MS = 1_500;

/* ─────────────────────────────────────────────────────────── */

export async function importGrokSharePage(
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

    // Grok is a heavy Next.js SPA — wait for meaningful text content to render
    await page
      .waitForFunction(
        () => {
          const root =
            document.querySelector("main, [role='main'], article, body") ??
            document.body;
          return (root.textContent ?? "").trim().length > 32;
        },
        { timeout: GROK_CONTENT_WAIT_TIMEOUT_MS },
      )
      .catch(() => undefined);

    await page
      .waitForLoadState("networkidle", {
        timeout: GROK_NETWORK_IDLE_TIMEOUT_MS,
      })
      .catch(() => undefined);
    await page.waitForTimeout(GROK_PAGE_STABILIZATION_MS);

    options?.onStage?.("extract");
    const extracted = await page.evaluate(() => {
      const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;

      function normalizeTitle(rawTitle: string) {
        const title = rawTitle
          .replace(/\|\s*shared .*$/i, "")
          .replace(/^(grok|xai)\s*[-|:]\s*/i, "")
          .replace(/^shared\s+/i, "")
          .replace(/\s*\|\s*Shared Grok Conversation$/i, "")
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

      function attributeHintText(element: Element) {
        const node = element as HTMLElement;
        return [
          element.getAttribute("data-message-author-role") ?? "",
          element.getAttribute("data-author-role") ?? "",
          element.getAttribute("data-role") ?? "",
          element.getAttribute("data-testid") ?? "",
          element.getAttribute("aria-label") ?? "",
          node.id ?? "",
          typeof node.className === "string" ? node.className : "",
        ]
          .join(" ")
          .toLowerCase();
      }

      function roleFromHints(element: Element): "user" | "assistant" | null {
        // Check the element and up to 3 ancestor levels for role hints
        const hints: string[] = [];
        let current: Element | null = element;

        for (let depth = 0; current && depth < 4; depth += 1) {
          hints.push(attributeHintText(current));
          current = current.parentElement;
        }

        // Also check child element classes
        hints.push(
          Array.from(element.querySelectorAll("[class]"))
            .slice(0, 24)
            .map((node) => ((node as HTMLElement).className || "").toString())
            .join(" ")
            .toLowerCase(),
        );

        const hintText = hints.join(" ");

        if (
          /(^|\b)(user|human|prompt|question|from-user|self-end|justify-end|ml-auto|text-right)(\b|$)/.test(
            hintText,
          )
        ) {
          return "user";
        }

        if (
          /(^|\b)(assistant|model|bot|grok|response|answer|self-start|justify-start|mr-auto|text-left)(\b|$)/.test(
            hintText,
          )
        ) {
          return "assistant";
        }

        return null;
      }

      const warnings: string[] = [];

      // Strategy 1: Look for explicit Grok turn/message containers
      // Grok share pages use Next.js with various possible selectors
      const turnSelectors = [
        "[data-testid*='conversation-turn']",
        "[data-testid*='chat-turn']",
        "[data-testid*='message']",
        "[data-message-id]",
        "[data-message-author-role]",
      ];

      let turnElements: Element[] = [];
      for (const selector of turnSelectors) {
        const found = Array.from(document.querySelectorAll(selector)).filter(
          (el) => isVisible(el) && !isExcluded(el),
        );
        if (found.length >= 2) {
          turnElements = found;
          break;
        }
      }

      // Strategy 2: Look for role-based containers common in chat UIs
      if (turnElements.length < 2) {
        const roleContainers = Array.from(
          document.querySelectorAll(
            "[class*='message'], [class*='turn'], [class*='chat'], [class*='response'], [class*='prompt']",
          ),
        ).filter((el) => {
          if (!isVisible(el) || isExcluded(el)) return false;
          const text = normalizeWhitespace((el as HTMLElement).innerText);
          return text.length > 2;
        });

        if (roleContainers.length >= 2) {
          turnElements = roleContainers;
        }
      }

      // Strategy 3: Container heuristic — find main content area and extract alternating children
      if (turnElements.length < 2) {
        const mainContent =
          document.querySelector("main") ??
          document.querySelector("[role='main']") ??
          document.querySelector("article") ??
          document.body;

        // Look for a repeating container pattern (common in chat UIs)
        const candidates = Array.from(
          mainContent.querySelectorAll("div,section,article"),
        ).filter((el) => {
          if (!isVisible(el) || isExcluded(el)) return false;
          const children = Array.from(el.children).filter(
            (child) =>
              isVisible(child) &&
              !isExcluded(child) &&
              normalizeWhitespace((child as HTMLElement).innerText).length > 10,
          );
          return children.length >= 2;
        });

        // Score candidates by number of meaningful direct children
        let bestContainer: Element | null = null;
        let bestChildCount = 0;

        for (const candidate of candidates.slice(0, 100)) {
          const children = Array.from(candidate.children).filter((child) => {
            if (!isVisible(child) || isExcluded(child)) return false;
            const text = normalizeWhitespace((child as HTMLElement).innerText);
            return text.length > 10;
          });

          // Prefer containers whose children have conversation-like hints
          const hintedCount = children.filter((child) =>
            /(message|turn|chat|prompt|response|assistant|user|grok|human)/i.test(
              attributeHintText(child),
            ),
          ).length;

          const score = children.length + hintedCount * 2;
          if (score > bestChildCount && children.length >= 2) {
            bestChildCount = score;
            bestContainer = candidate;
          }
        }

        if (bestContainer) {
          turnElements = Array.from(bestContainer.children).filter(
            (child) =>
              isVisible(child) &&
              !isExcluded(child) &&
              normalizeWhitespace((child as HTMLElement).innerText).length > 2,
          );
        }
      }

      // Filter out nested elements that are children of other matches
      turnElements = turnElements.filter(
        (el, _i, arr) =>
          !arr.some((other) => other !== el && other.contains(el)),
      );

      if (turnElements.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [] as Array<{
            id: string;
            role: "user" | "assistant" | "unknown";
            rawText: string;
            rawHtml: string;
            blocks: Array<Record<string, unknown>>;
            parser: {
              source: string;
              blockCount: number;
              usedFallback: boolean;
              strategy: "deterministic" | "fallback";
            };
          }>,
          warnings: ["No Grok share turn containers found on this page."],
        };
      }

      warnings.push(
        `Parsed ${turnElements.length} message candidate(s) from Grok share page.`,
      );

      const messages: Array<{
        id: string;
        role: "user" | "assistant" | "unknown";
        rawText: string;
        rawHtml: string;
        blocks: Array<Record<string, unknown>>;
        parser: {
          source: string;
          blockCount: number;
          usedFallback: boolean;
          strategy: "deterministic" | "fallback";
        };
      }> = [];

      turnElements.forEach((element, index) => {
        const messageId =
          element.getAttribute("data-message-id") ?? `grok-${index + 1}`;

        const contentRoot = contentRootFor(element);
        const rawText = normalizeWhitespace(
          (contentRoot as HTMLElement).innerText,
        );
        const rawHtml = (contentRoot as HTMLElement).innerHTML;

        if (!rawText) {
          return;
        }

        const blocks = Array.from(contentRoot.childNodes).flatMap(
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

        const hintedRole = roleFromHints(element);
        const finalBlocks =
          blocks.length > 0
            ? blocks
            : [{ type: "paragraph" as const, text: rawText }];

        messages.push({
          id: messageId,
          role: hintedRole ?? "unknown",
          rawText,
          rawHtml,
          blocks: finalBlocks,
          parser: {
            source: blocks.length > 0 ? "grok-dom" : "grok-fallback",
            blockCount: finalBlocks.length,
            usedFallback: blocks.length === 0,
            strategy: blocks.length > 0 ? "deterministic" : "fallback",
          },
        });
      });

      // Resolve unknown roles using alternating pattern
      if (messages.length > 0) {
        const resolvedRoles = messages.map((m) =>
          m.role === "unknown" ? null : m.role,
        );
        const firstResolvedIndex = resolvedRoles.findIndex(Boolean);

        if (firstResolvedIndex === -1) {
          // No roles detected — assume alternating user/assistant
          for (let i = 0; i < resolvedRoles.length; i += 1) {
            resolvedRoles[i] = i % 2 === 0 ? "user" : "assistant";
          }
        } else {
          // Propagate backward from first resolved role
          for (let i = firstResolvedIndex - 1; i >= 0; i -= 1) {
            const nextRole = resolvedRoles[i + 1] as "user" | "assistant";
            resolvedRoles[i] = nextRole === "user" ? "assistant" : "user";
          }
          // Propagate forward from first resolved role
          for (
            let i = firstResolvedIndex + 1;
            i < resolvedRoles.length;
            i += 1
          ) {
            if (!resolvedRoles[i]) {
              const prevRole = resolvedRoles[i - 1] as "user" | "assistant";
              resolvedRoles[i] = prevRole === "user" ? "assistant" : "user";
            }
          }
        }

        let inferredCount = 0;
        for (let i = 0; i < messages.length; i += 1) {
          const msg = messages[i];
          const resolved = resolvedRoles[i];
          if (msg && msg.role === "unknown" && resolved) {
            inferredCount += 1;
            messages[i] = {
              ...msg,
              role: resolved as "user" | "assistant",
            };
          }
        }

        if (inferredCount > 0) {
          warnings.push(
            `${inferredCount} message role(s) were inferred from turn order because the page did not expose explicit author markers.`,
          );
        }
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

    if (normalizedPayload.messages.length === 0) {
      throw new Error(
        "No importable messages were detected on this Grok share page.",
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
        platform: "grok",
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
