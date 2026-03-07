import {
  conversationSchema,
  normalizedSnapshotPayloadSchema,
  type ImportStage,
  type SourcePlatform
} from "@chat-exporter/shared";
import { chromium, type Page } from "playwright";

import { applyOpenAiStructuring } from "./openai-structuring.js";
import { looksLikeSharedConversationUrl } from "./source-platform.js";

type StageCallback = (
  stage: Extract<ImportStage, "fetch" | "extract" | "normalize" | "structure">
) => void;

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isGoogleConsentUrl(urlString: string) {
  const url = new URL(urlString);
  const hostname = normalizeHostname(url.hostname);

  return hostname === "consent.google.com" || hostname.endsWith(".consent.google.com");
}

function isGoogleSourcePlatform(sourcePlatform: SourcePlatform) {
  return sourcePlatform === "gemini" || sourcePlatform === "notebooklm";
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
      timeout: 10_000
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

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!isGoogleConsentUrl(page.url())) {
      await page.waitForLoadState("domcontentloaded", {
        timeout: 15_000
      }).catch(() => undefined);
      return true;
    }

    await page.waitForTimeout(250);
  }

  return !isGoogleConsentUrl(page.url());
}

export async function importGenericSharePage(
  url: string,
  options: {
    onStage?: StageCallback;
    sourcePlatform: SourcePlatform;
  }
) {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();

    await context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();

      if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
        return route.abort();
      }

      return route.continue();
    });

    const page = await context.newPage();
    await page.addInitScript({
      content: "globalThis.__name = (value) => value;"
    });

    options.onStage?.("fetch");
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });

    if (isGoogleSourcePlatform(options.sourcePlatform)) {
      await maybeDismissGoogleConsentGate(page);
    }

    if (isGoogleConsentUrl(page.url())) {
      throw new Error(
        `Google showed a cookie consent gate instead of the ${options.sourcePlatform} share page.`
      );
    }

    await page
      .waitForFunction(
        () => {
          const root =
            document.querySelector("main, [role='main'], article, body") ?? document.body;
          return (root.textContent ?? "").trim().length > 32;
        },
        {
          timeout: 20_000
        }
      )
      .catch(() => undefined);

    await page.waitForLoadState("networkidle", {
      timeout: 5_000
    }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    options.onStage?.("extract");
    const extracted = await page.evaluate((platform) => {
      const wrapperTags = new Set([
        "ARTICLE",
        "SECTION",
        "DIV",
        "SPAN",
        "FIGURE",
        "MAIN"
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
        "HR"
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
        "yml"
      ]);

      function normalizeWhitespace(value: string | null | undefined) {
        return (value ?? "")
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

        const childText = Array.from(element.childNodes).map(inlineText).join("");

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
        return normalizeWhitespace(Array.from(element.childNodes).map(inlineText).join(""));
      }

      function extractListItems(listElement: Element, depth = 0): string[] {
        const items: string[] = [];
        const listItems = Array.from(listElement.children).filter(
          (child) => child.tagName === "LI"
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
            ["UL", "OL"].includes(child.tagName)
          );

          for (const nestedList of nestedLists) {
            items.push(...extractListItems(nestedList, depth + 1));
          }
        }

        return items;
      }

      function detectCodeLanguage(preElement: HTMLElement) {
        const firstLine = preElement.innerText.split("\n")[0]?.trim().toLowerCase() ?? "";

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
          if (!codeLanguageLabels.has(firstLine) && firstLine !== "kopieren" && firstLine !== "copy") {
            break;
          }
          lines.shift();
        }

        return lines.join("\n").trim();
      }

      function extractTable(tableElement: HTMLTableElement) {
        const headerRows = Array.from(tableElement.querySelectorAll("thead tr"));
        const bodyRows = Array.from(tableElement.querySelectorAll("tbody tr"));
        const fallbackRows = Array.from(tableElement.querySelectorAll("tr"));
        const firstHeaderRow = headerRows[0];

        const headers =
          firstHeaderRow
            ? Array.from(firstHeaderRow.querySelectorAll("th,td")).map((cell) =>
                inlineFromElement(cell)
              )
            : [];

        const rowSource = bodyRows.length > 0 ? bodyRows : fallbackRows.slice(headers.length > 0 ? 1 : 0);
        const rows = rowSource
          .map((row) =>
            Array.from(row.querySelectorAll("th,td")).map((cell) => inlineFromElement(cell))
          )
          .filter((row) => row.some(Boolean));

        if (headers.length === 0 && rows.length === 0) {
          return null;
        }

        return {
          type: "table" as const,
          headers,
          rows
        };
      }

      function elementToBlocks(element: Element): Array<Record<string, unknown>> {
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
                  items
                }
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
                  text
                }
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
          const childBlocks = Array.from(element.childNodes).flatMap((childNode) => {
            if (childNode.nodeType === Node.TEXT_NODE) {
              const text = normalizeWhitespace(childNode.textContent ?? "");
              return text ? [{ type: "paragraph" as const, text }] : [];
            }

            if (childNode.nodeType !== Node.ELEMENT_NODE) {
              return [];
            }

            return elementToBlocks(childNode as Element);
          });

          if (childBlocks.length > 0) {
            return childBlocks;
          }
        }

        const hasBlockChildren = Array.from(element.children).some((child) =>
          blockTags.has(child.tagName)
        );

        if (hasBlockChildren) {
          return Array.from(element.children).flatMap((child) => elementToBlocks(child));
        }

        const text = inlineFromElement(element);
        return text ? [{ type: "paragraph", text }] : [];
      }

      function normalizeTitle(rawTitle: string) {
        const title = rawTitle
          .replace(/\|\s*shared .*$/i, "")
          .replace(
            /^(chatgpt|claude|gemini|grok|deepseek|notebooklm)\s*[-|:]\s*/i,
            ""
          )
          .replace(/^shared\s+/i, "")
          .trim();

        return title || "Untitled Chat";
      }

      function pickExtractionRoot() {
        const candidates = [
          document.querySelector("main"),
          document.querySelector("[role='main']"),
          document.querySelector("article"),
          document.body
        ].filter(Boolean) as Element[];

        return (
          candidates.find((candidate) =>
            normalizeWhitespace((candidate as HTMLElement).innerText).length > 32
          ) ?? document.body
        );
      }

      function isExcluded(element: Element) {
        return Boolean(
          element.closest(
            "nav,header,footer,aside,form,dialog,[role='navigation'],[aria-hidden='true']"
          )
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

      function textContentLength(element: Element) {
        return normalizeWhitespace((element as HTMLElement).innerText).length;
      }

      function blockDescendantCount(element: Element) {
        return element.querySelectorAll(
          "p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table"
        ).length;
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
          typeof node.className === "string" ? node.className : ""
        ]
          .join(" ")
          .toLowerCase();
      }

      function hasConversationHints(element: Element) {
        return /(message|conversation|turn|chat|prompt|response|assistant|user|claude|gemini|grok|deepseek|notebooklm)/i.test(
          attributeHintText(element)
        );
      }

      function elementDepth(element: Element) {
        let depth = 0;
        let current = element.parentElement;

        while (current) {
          depth += 1;
          current = current.parentElement;
        }

        return depth;
      }

      function meaningfulDirectChildren(element: Element) {
        return Array.from(element.children).filter((child) => {
          if (!isVisible(child) || isExcluded(child)) {
            return false;
          }

          if (child.querySelector("nav,header,footer,aside,form,dialog")) {
            return false;
          }

          const textLength = textContentLength(child);
          if (textLength < 2) {
            return false;
          }

          const blockCount = blockDescendantCount(child);
          const buttonCount = child.querySelectorAll("button").length;

          return blockCount > 0 || textLength > 40 || buttonCount > 0;
        });
      }

      function scoreContainer(element: Element) {
        const children = meaningfulDirectChildren(element);

        if (children.length < 2) {
          return {
            score: Number.NEGATIVE_INFINITY,
            children
          };
        }

        const sampleChildren = children.slice(0, 48);
        const avgTextLength =
          sampleChildren.reduce(
            (sum, child) => sum + Math.min(textContentLength(child), 4_000),
            0
          ) / sampleChildren.length;
        const blockHeavyCount = sampleChildren.filter(
          (child) => blockDescendantCount(child) > 0
        ).length;
        const hintedCount = sampleChildren.filter(hasConversationHints).length;
        const actionBarCount = sampleChildren.filter(
          (child) => child.querySelectorAll("button").length > 0
        ).length;
        const tagCounts = new Map<string, number>();

        for (const child of sampleChildren) {
          tagCounts.set(child.tagName, (tagCounts.get(child.tagName) ?? 0) + 1);
        }

        const repeatedTagRatio =
          sampleChildren.length > 0
            ? Math.max(...Array.from(tagCounts.values())) / sampleChildren.length
            : 0;

        const formPenalty = element.querySelectorAll("input,textarea,select").length;

        return {
          score:
            sampleChildren.length * 16 +
            repeatedTagRatio * 12 +
            hintedCount * 8 +
            blockHeavyCount * 4 +
            actionBarCount * 2 +
            Math.min(avgTextLength / 35, 16) -
            elementDepth(element) * 1.5 -
            formPenalty * 10,
          children
        };
      }

      function dedupeCandidates(elements: Element[], maxRootTextLength: number) {
        const sorted = Array.from(new Set(elements)).sort(
          (left, right) => elementDepth(right) - elementDepth(left)
        );
        const unique: Element[] = [];
        const seenText = new Set<string>();

        for (const element of sorted) {
          if (!isVisible(element) || isExcluded(element)) {
            continue;
          }

          const text = normalizeWhitespace((element as HTMLElement).innerText);
          if (!text) {
            continue;
          }

          if (text.length >= maxRootTextLength * 0.95) {
            continue;
          }

          if (seenText.has(text)) {
            continue;
          }

          if (unique.some((existing) => existing.contains(element) || element.contains(existing))) {
            continue;
          }

          unique.push(element);
          seenText.add(text);
        }

        return unique.reverse();
      }

      function contentRootFor(element: Element) {
        return (
          element.querySelector(
            ".markdown, [data-testid*='markdown'], [class*='markdown'], [data-testid*='response-content'], [data-testid*='message-content'], [data-message-content]"
          ) ?? element
        );
      }

      function roleFromHints(element: Element) {
        const hints: string[] = [];
        let current: Element | null = element;

        for (let depth = 0; current && depth < 3; depth += 1) {
          hints.push(attributeHintText(current));
          current = current.parentElement;
        }

        hints.push(
          Array.from(element.querySelectorAll("[class]"))
            .slice(0, 24)
            .map((node) => ((node as HTMLElement).className || "").toString())
            .join(" ")
            .toLowerCase()
        );

        const hintText = hints.join(" ");

        if (
          /(^|\b)(user|human|prompt|question|author-user|from-user|self-end|justify-end|ml-auto|text-right|end-)(\b|$)/.test(
            hintText
          )
        ) {
          return "user" as const;
        }

        if (
          /(^|\b)(assistant|model|bot|claude|gemini|grok|deepseek|notebooklm|response|answer|self-start|justify-start|mr-auto|text-left|start-)(\b|$)/.test(
            hintText
          )
        ) {
          return "assistant" as const;
        }

        return null;
      }

      function roleFromLayout(element: Element, root: Element) {
        const rootRect = (root as HTMLElement).getBoundingClientRect();
        const target =
          (element.querySelector(
            "p,pre,ul,ol,blockquote,table,h1,h2,h3,h4,h5,h6"
          ) as HTMLElement | null) ?? (element as HTMLElement);
        const rect = target.getBoundingClientRect();

        if (rootRect.width <= 0 || rect.width <= 0) {
          return null;
        }

        const centerRatio =
          (rect.left + rect.width / 2 - rootRect.left) / Math.max(rootRect.width, 1);

        if (centerRatio >= 0.62) {
          return "user" as const;
        }

        if (centerRatio <= 0.38) {
          return "assistant" as const;
        }

        return null;
      }

      function oppositeRole(role: "user" | "assistant") {
        return role === "user" ? "assistant" : "user";
      }

      const warnings: string[] = [];
      const extractionRoot = pickExtractionRoot();
      const rootText = normalizeWhitespace((extractionRoot as HTMLElement).innerText);
      const containerCandidates = [
        extractionRoot,
        ...Array.from(extractionRoot.querySelectorAll("div,section,article,ol,ul,main"))
      ].slice(0, 500);

      let bestContainer: Element | null = null;
      let bestChildren: Element[] = [];
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of containerCandidates) {
        if (isExcluded(candidate) || !isVisible(candidate)) {
          continue;
        }

        const scored = scoreContainer(candidate);
        if (scored.score > bestScore) {
          bestScore = scored.score;
          bestContainer = candidate;
          bestChildren = scored.children;
        }
      }

      let messageElements = bestScore >= 42 ? bestChildren : [];

      if (messageElements.length < 2) {
        const explicitCandidates = [
          ...Array.from(extractionRoot.querySelectorAll("[data-message-author-role]")),
          ...Array.from(extractionRoot.querySelectorAll("[data-message-id]")),
          ...Array.from(extractionRoot.querySelectorAll("[data-testid*='conversation-turn']")),
          ...Array.from(extractionRoot.querySelectorAll("[data-testid*='chat-turn']")),
          ...Array.from(extractionRoot.querySelectorAll("[data-testid*='message']")),
          ...Array.from(extractionRoot.querySelectorAll("[data-testid*='response']")),
          ...Array.from(extractionRoot.querySelectorAll("article"))
        ];

        messageElements = dedupeCandidates(explicitCandidates, rootText.length);
      }

      if (messageElements.length < 2) {
        const fallbackCandidates = Array.from(
          extractionRoot.querySelectorAll("article,section,div")
        )
          .filter((element) => {
            if (!isVisible(element) || isExcluded(element)) {
              return false;
            }

            const textLength = textContentLength(element);
            if (textLength < 12 || textLength > 12_000) {
              return false;
            }

            const childCandidates = meaningfulDirectChildren(element);
            return blockDescendantCount(element) > 0 && childCandidates.length === 0;
          })
          .slice(0, 64);

        messageElements = dedupeCandidates(fallbackCandidates, rootText.length);
      }

      if (bestContainer && bestScore >= 42) {
        warnings.push(
          `Parsed ${messageElements.length} message candidate(s) from a repeating ${platform} share-page container.`
        );
      } else {
        warnings.push(
          `Parsed ${messageElements.length} message candidate(s) using generic ${platform} fallback heuristics.`
        );
      }

      const parsedMessages: Array<{
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

      messageElements.forEach((element, index) => {
          const messageId =
            element.getAttribute("data-message-id") ?? `${platform}-${index + 1}`;
          const rawText = normalizeWhitespace((element as HTMLElement).innerText);
          const rawHtml = (element as HTMLElement).innerHTML;

          if (!rawText) {
            return;
          }

          const contentRoot = contentRootFor(element);
          const blocks = Array.from(contentRoot.childNodes).flatMap((childNode) => {
            if (childNode.nodeType === Node.TEXT_NODE) {
              const text = normalizeWhitespace(childNode.textContent ?? "");
              return text ? [{ type: "paragraph" as const, text }] : [];
            }

            if (childNode.nodeType !== Node.ELEMENT_NODE) {
              return [];
            }

            return elementToBlocks(childNode as Element);
          });

          const hintedRole = roleFromHints(element) ?? roleFromLayout(element, extractionRoot);
          const finalBlocks =
            blocks.length > 0
              ? blocks
              : [{ type: "paragraph" as const, text: rawText }];

          parsedMessages.push({
            id: messageId,
            role: hintedRole ?? ("unknown" as const),
            rawText,
            rawHtml,
            blocks: finalBlocks,
            parser: {
              source:
                blocks.length > 0
                  ? `${platform}-generic-dom`
                  : `${platform}-generic-fallback`,
              blockCount: finalBlocks.length,
              usedFallback: blocks.length === 0,
              strategy:
                blocks.length > 0
                  ? ("deterministic" as const)
                  : ("fallback" as const)
            }
          });
        });

      if (parsedMessages.length === 0) {
        return {
          title: normalizeTitle(document.title),
          messages: [],
          warnings
        };
      }

      const resolvedRoles = parsedMessages.map((message) =>
        message.role === "unknown" ? null : message.role
      );
      const firstResolvedIndex = resolvedRoles.findIndex(Boolean);

      if (firstResolvedIndex === -1) {
        for (let index = 0; index < resolvedRoles.length; index += 1) {
          resolvedRoles[index] = index % 2 === 0 ? "user" : "assistant";
        }
      } else {
        for (let index = firstResolvedIndex - 1; index >= 0; index -= 1) {
          resolvedRoles[index] = oppositeRole(resolvedRoles[index + 1] as "user" | "assistant");
        }

        for (let index = firstResolvedIndex + 1; index < resolvedRoles.length; index += 1) {
          if (!resolvedRoles[index]) {
            resolvedRoles[index] = oppositeRole(
              resolvedRoles[index - 1] as "user" | "assistant"
            );
          }
        }
      }

      let inferredRoleCount = 0;
      const messages = parsedMessages.map((message, index) => {
        const resolvedRole = resolvedRoles[index] ?? "unknown";

        if (message.role === "unknown" && resolvedRole !== "unknown") {
          inferredRoleCount += 1;
        }

        return {
          ...message,
          role: resolvedRole
        };
      });

      if (inferredRoleCount > 0) {
        warnings.push(
          `${inferredRoleCount} message role(s) were inferred from layout or turn order because the page did not expose explicit author markers.`
        );
      }

      return {
        title: normalizeTitle(document.title),
        messages,
        warnings
      };
    }, options.sourcePlatform);

    options.onStage?.("normalize");
    const normalizedPayload = normalizedSnapshotPayloadSchema.parse(extracted);

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
            }
          })
          .filter(Boolean)
      )
      .join(" ")
      .slice(0, 2_000);

    if (
      isGoogleSourcePlatform(options.sourcePlatform) &&
      looksLikeGoogleConsentContent(normalizedPayload.title, previewText)
    ) {
      throw new Error(
        `Google returned a cookie consent screen instead of the ${options.sourcePlatform} conversation.`
      );
    }

    if (normalizedPayload.messages.length === 0) {
      throw new Error(
        `No importable messages were detected on this ${options.sourcePlatform} page.`
      );
    }

    options.onStage?.("structure");
    const structured = await applyOpenAiStructuring(normalizedPayload.messages);
    const warnings = [...normalizedPayload.warnings, ...structured.warnings];

    if (!looksLikeSharedConversationUrl(url)) {
      warnings.push(
        "The URL does not look like a typical public share page path, so extraction may be noisier than usual."
      );
    }

    const finalPayload = normalizedSnapshotPayloadSchema.parse({
      ...normalizedPayload,
      messages: structured.messages,
      warnings,
      structuring: structured.structuring
    });
    const rawHtml = await page.content();
    const fetchedAt = new Date().toISOString();

    const conversation = conversationSchema.parse({
      id: crypto.randomUUID(),
      title: finalPayload.title,
      source: {
        url,
        platform: options.sourcePlatform
      },
      messages: finalPayload.messages
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
          rawHtmlBytes: Buffer.byteLength(rawHtml, "utf8")
        }
      }
    };
  } finally {
    await browser.close();
  }
}
