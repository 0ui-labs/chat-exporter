import {
  type Conversation,
  conversationSchema,
  type ImportStage,
  type NormalizedSnapshotPayload,
  normalizedSnapshotPayloadSchema,
} from "@chat-exporter/shared";
import { acquireContext, releaseContext } from "./browser-pool.js";
import { MAX_MESSAGE_COUNT, MAX_RAW_HTML_BYTES } from "./constants.js";
import { applyOpenAiStructuring } from "./openai-structuring.js";

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

type StageCallback = (
  stage: Extract<ImportStage, "fetch" | "extract" | "normalize" | "structure">,
) => void;

type ImportResult = {
  conversation: Conversation;
  warnings: string[];
  snapshot: {
    finalUrl: string;
    fetchedAt: string;
    pageTitle: string;
    rawHtml: string;
    normalizedPayload: NormalizedSnapshotPayload;
    fetchMetadata: {
      articleCount: number;
      messageCount: number;
      rawHtmlBytes: number;
    };
  };
};

export async function importChatGptSharePage(
  url: string,
  options?: {
    onStage?: StageCallback;
  },
): Promise<ImportResult> {
  const context = await acquireContext();

  try {
    await context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();

      if (
        resourceType === "image" ||
        resourceType === "media" ||
        resourceType === "font"
      ) {
        return route.abort();
      }

      return route.continue();
    });

    const page = await context.newPage();
    await page.addInitScript({
      content: "globalThis.__name = (value) => value;",
    });

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
      const __name = <T>(value: T) => value;
      const wrapperTags = new Set([
        "ARTICLE",
        "SECTION",
        "DIV",
        "SPAN",
        "FIGURE",
        "MAIN",
      ]);
      const blockTags = new Set([
        "P",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "UL",
        "OL",
        "PRE",
        "BLOCKQUOTE",
        "TABLE",
        "HR",
      ]);
      const codeLanguageLabels = new Set([
        "plain text",
        "text",
        "json",
        "javascript",
        "typescript",
        "ts",
        "js",
        "python",
        "bash",
        "shell",
        "sql",
        "html",
        "css",
        "markdown",
        "md",
        "yaml",
        "yml",
      ]);

      function normalizeWhitespace(value: string) {
        return value
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, "")
          .replace(/[ \t\f\v]+/g, " ")
          .replace(/ *\n */g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function inlineText(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? "";
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const element = node as HTMLElement;
        const tagName = element.tagName.toUpperCase();

        if (
          tagName === "BUTTON" ||
          tagName === "SVG" ||
          tagName === "PATH" ||
          tagName === "USE" ||
          tagName === "IMG" ||
          tagName === "NOSCRIPT"
        ) {
          return "";
        }

        if (tagName === "BR") {
          return "\n";
        }

        const childText = Array.from(element.childNodes)
          .map(inlineText)
          .join("");

        switch (tagName) {
          case "A": {
            const text = normalizeWhitespace(childText);
            const href = element.getAttribute("href");
            return href && text ? `[${text}](${href})` : text;
          }
          case "STRONG":
          case "B": {
            const text = normalizeWhitespace(childText);
            return text ? `**${text}**` : "";
          }
          case "EM":
          case "I": {
            const text = normalizeWhitespace(childText);
            return text ? `*${text}*` : "";
          }
          case "CODE": {
            if (element.closest("pre")) {
              return "";
            }

            const text = normalizeWhitespace(childText);
            return text ? `\`${text}\`` : "";
          }
          case "DEL":
          case "S": {
            const text = normalizeWhitespace(childText);
            return text ? `~~${text}~~` : "";
          }
          default:
            return childText;
        }
      }

      function inlineFromElement(element: Element) {
        return normalizeWhitespace(
          Array.from(element.childNodes).map(inlineText).join(""),
        );
      }

      function extractListItems(listElement: Element, depth = 0): string[] {
        const items: string[] = [];
        const listItems = Array.from(listElement.children).filter(
          (child) => child.tagName === "LI",
        );

        for (const listItem of listItems) {
          let ownText = "";

          for (const childNode of Array.from(listItem.childNodes)) {
            if (
              childNode.nodeType === Node.ELEMENT_NODE &&
              ["UL", "OL"].includes((childNode as Element).tagName)
            ) {
              continue;
            }

            ownText += inlineText(childNode);
          }

          const normalized = normalizeWhitespace(ownText);
          if (normalized) {
            items.push(`${"  ".repeat(depth)}${normalized}`);
          }

          const nestedLists = Array.from(listItem.children).filter((child) =>
            ["UL", "OL"].includes(child.tagName),
          );

          for (const nestedList of nestedLists) {
            items.push(...extractListItems(nestedList, depth + 1));
          }
        }

        return items;
      }

      function detectCodeLanguage(preElement: HTMLElement) {
        const firstLine =
          preElement.innerText.split("\n")[0]?.trim().toLowerCase() ?? "";

        if (codeLanguageLabels.has(firstLine)) {
          return firstLine === "plain text" ? "text" : firstLine;
        }

        const classHint = Array.from(preElement.querySelectorAll("[class]"))
          .map((element) => element.className)
          .join(" ");
        const languageMatch = classHint.match(/language-([a-z0-9#+-]+)/i);
        return languageMatch?.[1]?.toLowerCase() ?? "text";
      }

      function extractCodeText(preElement: HTMLElement) {
        const lines = preElement.innerText.replace(/\r/g, "").split("\n");

        while (lines.length > 1) {
          const firstLine = lines[0]?.trim().toLowerCase() ?? "";
          if (
            !codeLanguageLabels.has(firstLine) &&
            firstLine !== "kopieren" &&
            firstLine !== "copy"
          ) {
            break;
          }
          lines.shift();
        }

        return lines.join("\n").trim();
      }

      function extractTable(tableElement: HTMLTableElement) {
        const headerRows = Array.from(
          tableElement.querySelectorAll("thead tr"),
        );
        const bodyRows = Array.from(tableElement.querySelectorAll("tbody tr"));
        const fallbackRows = Array.from(tableElement.querySelectorAll("tr"));
        const firstHeaderRow = headerRows[0];

        const headers = firstHeaderRow
          ? Array.from(firstHeaderRow.querySelectorAll("th,td")).map((cell) =>
              inlineFromElement(cell),
            )
          : [];

        const rowSource =
          bodyRows.length > 0
            ? bodyRows
            : fallbackRows.slice(headers.length > 0 ? 1 : 0);
        const rows = rowSource
          .map((row) =>
            Array.from(row.querySelectorAll("th,td")).map((cell) =>
              inlineFromElement(cell),
            ),
          )
          .filter((row) => row.some(Boolean));

        if (headers.length === 0 && rows.length === 0) {
          return null;
        }

        return {
          type: "table" as const,
          headers,
          rows,
        };
      }

      function elementToBlocks(
        element: Element,
      ): Array<Record<string, unknown>> {
        const tagName = element.tagName.toUpperCase();

        if (tagName === "P") {
          const text = inlineFromElement(element);
          return text ? [{ type: "paragraph", text }] : [];
        }

        if (/^H[1-6]$/.test(tagName)) {
          const text = inlineFromElement(element);
          const level = Number(tagName.slice(1));
          return text ? [{ type: "heading", level, text }] : [];
        }

        if (tagName === "UL" || tagName === "OL") {
          const items = extractListItems(element);
          return items.length > 0
            ? [
                {
                  type: "list",
                  ordered: tagName === "OL",
                  items,
                },
              ]
            : [];
        }

        if (tagName === "PRE") {
          const text = extractCodeText(element as HTMLElement);
          return text
            ? [
                {
                  type: "code",
                  language: detectCodeLanguage(element as HTMLElement),
                  text,
                },
              ]
            : [];
        }

        if (tagName === "BLOCKQUOTE") {
          const text = inlineFromElement(element);
          return text ? [{ type: "quote", text }] : [];
        }

        if (tagName === "TABLE") {
          const table = extractTable(element as HTMLTableElement);
          return table ? [table] : [];
        }

        if (tagName === "HR") {
          return [];
        }

        if (wrapperTags.has(tagName)) {
          const childBlocks = Array.from(element.childNodes).flatMap(
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

          if (childBlocks.length > 0) {
            return childBlocks;
          }
        }

        const hasBlockChildren = Array.from(element.children).some((child) =>
          blockTags.has(child.tagName),
        );

        if (hasBlockChildren) {
          return Array.from(element.children).flatMap((child) =>
            elementToBlocks(child),
          );
        }

        const text = inlineFromElement(element);
        return text ? [{ type: "paragraph", text }] : [];
      }

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

    if (normalizedPayload.messages.length > MAX_MESSAGE_COUNT) {
      const originalCount = normalizedPayload.messages.length;
      normalizedPayload.messages = normalizedPayload.messages.slice(
        -MAX_MESSAGE_COUNT,
      );
      normalizedPayload.warnings.push(
        `Nachrichtenlimit überschritten: ${originalCount} Nachrichten gefunden, auf die letzten ${MAX_MESSAGE_COUNT} gekürzt.`,
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
    const rawHtmlBytes = Buffer.byteLength(rawHtml, "utf8");
    if (rawHtmlBytes > MAX_RAW_HTML_BYTES) {
      const sizeMb = (rawHtmlBytes / (1024 * 1024)).toFixed(1);
      const limitMb = (MAX_RAW_HTML_BYTES / (1024 * 1024)).toFixed(1);
      throw new Error(
        `HTML-Größe überschritten: ${sizeMb} MB (Limit: ${limitMb} MB).`,
      );
    }
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
          rawHtmlBytes: Buffer.byteLength(rawHtml, "utf8"),
        },
      },
    };
  } finally {
    await releaseContext(context);
  }
}
