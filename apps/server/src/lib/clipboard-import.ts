import {
  type Conversation,
  conversationSchema,
  type SourcePlatform,
} from "@chat-exporter/shared";
import { JSDOM } from "jsdom";
import { DOM_KIT_SCRIPT } from "./parser-dom-kit.js";

export type ClipboardImportResult = {
  conversation: Conversation;
  warnings: string[];
  detectedPlatform: SourcePlatform;
};

/**
 * Import a conversation from clipboard content (HTML and/or plain text).
 * No browser required — uses JSDOM for HTML parsing.
 */
export async function importFromClipboard(input: {
  html?: string;
  plainText?: string;
}): Promise<ClipboardImportResult> {
  const warnings: string[] = [];

  if (input.html) {
    return importFromClipboardHtml(input.html, warnings);
  }

  if (input.plainText) {
    return importFromClipboardText(input.plainText, warnings);
  }

  throw new Error("Either html or plainText must be provided");
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function detectPlatformFromHtml(html: string): SourcePlatform {
  const lower = html.toLowerCase();

  if (lower.includes("data-message-author-role")) return "chatgpt";
  if (lower.includes("font-claude-message") || lower.includes("claude.ai"))
    return "claude";
  if (lower.includes("share-turn-viewer") || lower.includes("gemini"))
    return "gemini";
  if (lower.includes("grok")) return "grok";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("perplexity")) return "perplexity";
  if (lower.includes("mistral") || lower.includes("lechat")) return "lechat";

  return "unknown";
}

// ---------------------------------------------------------------------------
// HTML path
// ---------------------------------------------------------------------------

function importFromClipboardHtml(
  html: string,
  warnings: string[],
): ClipboardImportResult {
  const platform = detectPlatformFromHtml(html);

  if (platform === "unknown") {
    warnings.push("Could not detect platform from clipboard HTML");
  }

  const dom = new JSDOM(html, { runScripts: "outside-only" });
  const { window } = dom;

  // Inject DOM kit helpers via eval — "outside-only" prevents user-supplied
  // scripts from executing while allowing programmatic injection.
  window.eval(DOM_KIT_SCRIPT);

  // biome-ignore lint/suspicious/noExplicitAny: JSDOM global access requires dynamic typing
  const domKit = (window as any).__domKit as
    | {
        elementToBlocks: (el: Element) => Array<Record<string, unknown>>;
      }
    | undefined;

  if (!domKit) {
    warnings.push("DOM kit injection failed, falling back to basic extraction");
    const text = window.document.body?.textContent?.trim() ?? "";
    window.close();
    return createSingleMessageResult(text, platform, warnings);
  }

  const messages = extractMessagesFromDom(
    window.document,
    domKit,
    platform,
    warnings,
  );

  const title = extractTitleFromDom(window.document, platform) || "Pasted Chat";

  window.close();

  if (messages.length === 0) {
    warnings.push("No messages found in clipboard HTML");
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return createSingleMessageResult(text, platform, warnings);
  }

  const conversation = conversationSchema.parse({
    id: crypto.randomUUID(),
    title,
    source: { url: "clipboard://paste", platform },
    messages,
  });

  return { conversation, warnings, detectedPlatform: platform };
}

// ---------------------------------------------------------------------------
// DOM message extraction
// ---------------------------------------------------------------------------

function extractMessagesFromDom(
  document: Document,
  domKit: { elementToBlocks: (el: Element) => Array<Record<string, unknown>> },
  platform: SourcePlatform,
  warnings: string[],
): Array<{
  id: string;
  role: string;
  blocks: Array<Record<string, unknown>>;
}> {
  // Try platform-specific extraction
  const platformMessages = extractPlatformSpecific(
    document,
    domKit,
    platform,
    warnings,
  );
  if (platformMessages.length > 0) return platformMessages;

  if (platform !== "unknown") {
    warnings.push(
      `Detected ${platform} but could not extract messages, falling back to generic extraction`,
    );
  }

  // Generic: treat the entire body as a single assistant message
  return extractGeneric(document, domKit);
}

function extractPlatformSpecific(
  document: Document,
  domKit: { elementToBlocks: (el: Element) => Array<Record<string, unknown>> },
  platform: SourcePlatform,
  _warnings: string[],
): Array<{
  id: string;
  role: string;
  blocks: Array<Record<string, unknown>>;
}> {
  const messages: Array<{
    id: string;
    role: string;
    blocks: Array<Record<string, unknown>>;
  }> = [];

  if (platform === "chatgpt") {
    // ChatGPT uses data-message-author-role attribute
    const turns = document.querySelectorAll("[data-message-author-role]");
    for (const turn of turns) {
      const role =
        turn.getAttribute("data-message-author-role") === "user"
          ? "user"
          : "assistant";
      const blocks = domKit.elementToBlocks(turn as Element);
      if (blocks.length > 0) {
        messages.push({ id: crypto.randomUUID(), role, blocks });
      }
    }
  }

  // Additional platform-specific selectors can be added here

  return messages;
}

function extractGeneric(
  document: Document,
  domKit: { elementToBlocks: (el: Element) => Array<Record<string, unknown>> },
): Array<{
  id: string;
  role: string;
  blocks: Array<Record<string, unknown>>;
}> {
  const body = document.body;
  if (!body) return [];

  const blocks = domKit.elementToBlocks(body);
  if (blocks.length === 0) return [];

  return [
    {
      id: crypto.randomUUID(),
      role: "unknown",
      blocks,
    },
  ];
}

function extractTitleFromDom(
  document: Document,
  _platform: SourcePlatform,
): string | null {
  // Try <title> first
  const title = document.querySelector("title")?.textContent?.trim();
  if (title) return title;

  // Try first <h1>
  const h1 = document.querySelector("h1")?.textContent?.trim();
  if (h1) return h1;

  return null;
}

// ---------------------------------------------------------------------------
// Plain-text path
// ---------------------------------------------------------------------------

const ROLE_HEADERS: Record<string, "user" | "assistant"> = {
  you: "user",
  user: "user",
  human: "user",
  claude: "assistant",
  chatgpt: "assistant",
  assistant: "assistant",
  grok: "assistant",
  gemini: "assistant",
  deepseek: "assistant",
  perplexity: "assistant",
};

const PLATFORM_FROM_HEADER: Record<string, SourcePlatform> = {
  claude: "claude",
  chatgpt: "chatgpt",
  grok: "grok",
  gemini: "gemini",
  deepseek: "deepseek",
  perplexity: "perplexity",
};

function importFromClipboardText(
  text: string,
  warnings: string[],
): ClipboardImportResult {
  const lines = text.split("\n");
  const messages: Array<{
    id: string;
    role: string;
    blocks: Array<{ type: string; text: string }>;
  }> = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];
  let detectedPlatform: SourcePlatform = "unknown";

  for (const line of lines) {
    const trimmed = line.trim();
    const normalizedHeader = trimmed.toLowerCase().replace(/:$/, "");
    const headerRole = ROLE_HEADERS[normalizedHeader];

    if (headerRole) {
      // Flush previous message
      if (currentRole && currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content) {
          messages.push({
            id: crypto.randomUUID(),
            role: currentRole,
            blocks: [{ type: "paragraph", text: content }],
          });
        }
      }
      currentRole = headerRole;
      currentContent = [];

      // Detect platform from header
      if (
        detectedPlatform === "unknown" &&
        PLATFORM_FROM_HEADER[normalizedHeader]
      ) {
        detectedPlatform = PLATFORM_FROM_HEADER[normalizedHeader];
      }
    } else {
      currentContent.push(line);
    }
  }

  // Flush last message
  if (currentRole && currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content) {
      messages.push({
        id: crypto.randomUUID(),
        role: currentRole,
        blocks: [{ type: "paragraph", text: content }],
      });
    }
  }

  if (messages.length === 0) {
    warnings.push(
      "No role headers found in plain text. Creating single message.",
    );
    messages.push({
      id: crypto.randomUUID(),
      role: "unknown",
      blocks: [{ type: "paragraph", text: text.trim() }],
    });
  }

  warnings.push("Imported from plain text — formatting may be lost.");

  const conversation = conversationSchema.parse({
    id: crypto.randomUUID(),
    title: "Pasted Chat",
    source: { url: "clipboard://paste", platform: detectedPlatform },
    messages,
  });

  return {
    conversation,
    warnings,
    detectedPlatform,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSingleMessageResult(
  text: string,
  platform: SourcePlatform,
  warnings: string[],
): ClipboardImportResult {
  const conversation = conversationSchema.parse({
    id: crypto.randomUUID(),
    title: "Pasted Chat",
    source: { url: "clipboard://paste", platform },
    messages: [
      {
        id: crypto.randomUUID(),
        role: "unknown",
        blocks: text ? [{ type: "paragraph", text }] : [],
      },
    ],
  });

  return { conversation, warnings, detectedPlatform: platform };
}
