import {
  conversationSchema,
  normalizedSnapshotPayloadSchema,
} from "@chat-exporter/shared";
import type { Page } from "playwright";

import { acquireContext, releaseContext } from "./browser-pool.js";
import { MAX_MESSAGE_COUNT, MAX_RAW_HTML_BYTES } from "./constants.js";
import { applyOpenAiStructuring } from "./openai-structuring.js";
import {
  preparePageScripts,
  truncateMessagesIfNeeded,
  validateRawHtmlSize,
} from "./parser-page-utils.js";
import type { PlatformParserResult, StageCallback } from "./parser-types.js";
import { looksLikeSharedConversationUrl } from "./source-platform.js";

/* ── Navigation Timeouts ──────────────────────────────────── */

/** Navigation timeout for Gemini pages (Google needs longer). */
export const GEMINI_NAVIGATION_TIMEOUT_MS = 60_000;

/** Timeout for domcontentloaded after initial load. */
export const GEMINI_DOM_CONTENT_LOADED_TIMEOUT_MS = 20_000;

/** Timeout for the waitForFunction that checks for meaningful content. */
export const GEMINI_FUNCTION_WAIT_TIMEOUT_MS = 20_000;

/** Timeout for networkidle wait after DOM is ready. */
export const GEMINI_NETWORK_IDLE_TIMEOUT_MS = 5_000;

/** Extra delay after network-idle to let JS-rendered content settle. */
export const GEMINI_PAGE_STABILIZATION_DELAY_MS = 1_200;

/* ── Google Consent Handling ──────────────────────────────── */

/** Timeout for waiting for Google consent buttons to appear. */
const GOOGLE_CONSENT_BUTTON_TIMEOUT_MS = 10_000;

/** Maximum polling iterations when waiting for navigation after consent dismiss. */
const GOOGLE_CONSENT_DISMISS_MAX_ATTEMPTS = 60;

/** Polling interval (ms) between checks after clicking the consent button. */
const GOOGLE_CONSENT_POLLING_INTERVAL_MS = 250;

/** Timeout for domcontentloaded after Google consent redirect. */
const GOOGLE_CONSENT_REDIRECT_TIMEOUT_MS = 15_000;

/* ── Consent Helpers ──────────────────────────────────────── */

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isGoogleConsentUrl(urlString: string) {
  const url = new URL(urlString);
  const hostname = normalizeHostname(url.hostname);

  return (
    hostname === "consent.google.com" ||
    hostname.endsWith(".consent.google.com")
  );
}

function looksLikeGoogleConsentContent(title: string, previewText: string) {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedPreview = previewText.trim().toLowerCase();

  return (
    normalizedTitle === "before you continue" ||
    (normalizedPreview.includes("we use cookies") &&
      normalizedPreview.includes("accept all") &&
      normalizedPreview.includes("reject all"))
  );
}

async function maybeDismissGoogleConsentGate(page: Page) {
  if (!isGoogleConsentUrl(page.url())) {
    return false;
  }

  await page
    .waitForSelector('button[jsname="tWT92d"], button[jsname="b3VHJd"]', {
      state: "visible",
      timeout: GOOGLE_CONSENT_BUTTON_TIMEOUT_MS,
    })
    .catch(() => undefined);

  const rejectAllButton = page.locator('button[jsname="tWT92d"]').first();
  const acceptAllButton = page.locator('button[jsname="b3VHJd"]').first();

  let actionButton = rejectAllButton;

  if (!(await actionButton.isVisible().catch(() => false))) {
    actionButton = acceptAllButton;
  }

  if (!(await actionButton.isVisible().catch(() => false))) {
    return false;
  }

  await actionButton.click();

  for (
    let attempt = 0;
    attempt < GOOGLE_CONSENT_DISMISS_MAX_ATTEMPTS;
    attempt += 1
  ) {
    if (!isGoogleConsentUrl(page.url())) {
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: GOOGLE_CONSENT_REDIRECT_TIMEOUT_MS,
        })
        .catch(() => undefined);
      return true;
    }

    await page.waitForTimeout(GOOGLE_CONSENT_POLLING_INTERVAL_MS);
  }

  return !isGoogleConsentUrl(page.url());
}

/* ── Preview Text ─────────────────────────────────────────── */

/** Maximum length of the preview text used for consent-screen detection. */
const MAX_PREVIEW_TEXT_LENGTH = 2_000;

/* ─────────────────────────────────────────────────────────── */

export async function importGeminiSharePage(
  url: string,
  options?: { onStage?: StageCallback },
): Promise<PlatformParserResult> {
  const context = await acquireContext();

  try {
    // Google pages need full CSS/JS loading — no resource blocking
    const page = await context.newPage();
    await preparePageScripts(page);

    options?.onStage?.("fetch");
    await page.goto(url, {
      waitUntil: "commit",
      timeout: GEMINI_NAVIGATION_TIMEOUT_MS,
    });
    await page
      .waitForLoadState("domcontentloaded", {
        timeout: GEMINI_DOM_CONTENT_LOADED_TIMEOUT_MS,
      })
      .catch(() => undefined);

    await maybeDismissGoogleConsentGate(page);

    if (isGoogleConsentUrl(page.url())) {
      throw new Error(
        "Google showed a cookie consent gate instead of the gemini share page.",
      );
    }

    await page
      .waitForFunction(
        () => {
          const root =
            document.querySelector("main, [role='main'], article, body") ??
            document.body;
          return (root.textContent ?? "").trim().length > 32;
        },
        {
          timeout: GEMINI_FUNCTION_WAIT_TIMEOUT_MS,
        },
      )
      .catch(() => undefined);

    await page
      .waitForLoadState("networkidle", {
        timeout: GEMINI_NETWORK_IDLE_TIMEOUT_MS,
      })
      .catch(() => undefined);
    await page.waitForTimeout(GEMINI_PAGE_STABILIZATION_DELAY_MS);

    options?.onStage?.("extract");
    const extracted = await page.evaluate(() => {
      const { normalizeWhitespace, elementToBlocks } = globalThis.__domKit;

      function normalizeTitle(rawTitle: string) {
        const title = rawTitle
          .replace(/\|\s*shared .*$/i, "")
          .replace(
            /^(chatgpt|claude|gemini|grok|deepseek|notebooklm)\s*[-|:]\s*/i,
            "",
          )
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

      function pickGeminiTitle() {
        const explicitTitle =
          document.querySelector(".share-landing-page_content h1") ??
          document.querySelector("main h1") ??
          document.querySelector("h1");

        if (explicitTitle) {
          const title = normalizeWhitespace(
            (explicitTitle as HTMLElement).innerText,
          );

          if (title) {
            return normalizeTitle(title);
          }
        }

        return normalizeTitle(document.title);
      }

      function normalizeGeminiUserQuery(text: string) {
        return normalizeWhitespace(text.replace(/^You said\n/i, ""));
      }

      const turnElements = Array.from(
        document.querySelectorAll(".share-turn-viewer"),
      ).filter((element) => isVisible(element) && !isExcluded(element));

      if (turnElements.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [] as Array<{
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
          }>,
          warnings: ["No Gemini share turn containers found on this page."],
        };
      }

      const messages: Array<{
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
      }> = [];

      turnElements.forEach((turnElement, index) => {
        const turnId =
          turnElement.getAttribute("data-turn-id") ??
          `gemini-turn-${index + 1}`;
        const userElement =
          turnElement.querySelector("user-query .user-query-container") ??
          turnElement.querySelector(".user-query-container");
        const responseElement =
          turnElement.querySelector(
            "response-container .response-container-with-gpi, response-container",
          ) ?? turnElement.querySelector("response-container");

        const userText = userElement
          ? normalizeGeminiUserQuery((userElement as HTMLElement).innerText)
          : "";

        if (userText) {
          messages.push({
            id: `${turnId}-user`,
            role: "user" as const,
            rawText: userText,
            rawHtml: (userElement as HTMLElement).innerHTML,
            blocks: [{ type: "paragraph", text: userText }],
            parser: {
              source: "gemini-user-query",
              blockCount: 1,
              usedFallback: false,
              strategy: "deterministic" as const,
            },
          });
        }

        if (!responseElement) {
          return;
        }

        const responseRoot = contentRootFor(responseElement);
        const responseText = normalizeWhitespace(
          (responseRoot as HTMLElement).innerText,
        );

        if (!responseText) {
          return;
        }

        const responseBlocks = Array.from(responseRoot.childNodes).flatMap(
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
        const finalBlocks =
          responseBlocks.length > 0
            ? responseBlocks
            : [{ type: "paragraph" as const, text: responseText }];

        messages.push({
          id: `${turnId}-assistant`,
          role: "assistant" as const,
          rawText: responseText,
          rawHtml: (responseRoot as HTMLElement).innerHTML,
          blocks: finalBlocks,
          parser: {
            source:
              responseBlocks.length > 0
                ? "gemini-response-container"
                : "gemini-response-fallback",
            blockCount: finalBlocks.length,
            usedFallback: responseBlocks.length === 0,
            strategy:
              responseBlocks.length > 0
                ? ("deterministic" as const)
                : ("fallback" as const),
          },
        });
      });

      if (messages.length === 0) {
        return {
          title: pickGeminiTitle(),
          messages: [],
          warnings: [
            "Gemini share turn containers found but no extractable messages.",
          ],
        };
      }

      return {
        title: pickGeminiTitle(),
        messages,
        warnings: [
          `Parsed ${turnElements.length} Gemini share turn(s) from provider-specific containers.`,
        ],
      };
    });

    options?.onStage?.("normalize");
    const normalizedPayload = normalizedSnapshotPayloadSchema.parse(extracted);
    truncateMessagesIfNeeded(normalizedPayload, MAX_MESSAGE_COUNT);

    const previewText = normalizedPayload.messages
      .slice(0, 3)
      .flatMap((message) =>
        message.blocks
          .map((block) => {
            switch (block.type) {
              case "paragraph":
              case "quote":
              case "code":
                return block.text;
              case "heading":
                return block.text;
              case "list":
                return block.items.join(" ");
              case "table":
                return [...block.headers, ...block.rows.flat()].join(" ");
              default:
                return undefined;
            }
          })
          .filter(Boolean),
      )
      .join(" ")
      .slice(0, MAX_PREVIEW_TEXT_LENGTH);

    if (looksLikeGoogleConsentContent(normalizedPayload.title, previewText)) {
      throw new Error(
        "Google returned a cookie consent screen instead of the gemini conversation.",
      );
    }

    if (normalizedPayload.messages.length === 0) {
      throw new Error(
        "No importable messages were detected on this gemini page.",
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
        platform: "gemini",
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
