import type { NormalizedSnapshotPayload } from "@chat-exporter/shared";
import type { BrowserContext, Page } from "playwright";
import { DOM_KIT_SCRIPT } from "./parser-dom-kit.js";

/** Block image, media, and font requests to reduce bandwidth. */
export async function blockNonEssentialResources(
  context: BrowserContext,
): Promise<void> {
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
}

/** Inject safety polyfill (__name) and DOM parsing kit into page. */
export async function preparePageScripts(page: Page): Promise<void> {
  await page.addInitScript({
    content: "globalThis.__name = (value) => value;",
  });
  await page.addInitScript({ content: DOM_KIT_SCRIPT });
}

/** Truncate messages if they exceed the limit, adding a warning. Returns a new payload without mutating the original. */
export function truncateMessagesIfNeeded(
  payload: NormalizedSnapshotPayload,
  maxCount: number,
): NormalizedSnapshotPayload {
  if (payload.messages.length <= maxCount) {
    return payload;
  }
  const originalCount = payload.messages.length;
  return {
    ...payload,
    messages: payload.messages.slice(-maxCount),
    warnings: [
      ...payload.warnings,
      `Nachrichtenlimit überschritten: ${originalCount} Nachrichten gefunden, auf die letzten ${maxCount} gekürzt.`,
    ],
  };
}

/** Validate raw HTML size against limit. Returns byte size. Throws if exceeded. */
export function validateRawHtmlSize(rawHtml: string, maxBytes: number): number {
  const rawHtmlBytes = Buffer.byteLength(rawHtml, "utf8");
  if (rawHtmlBytes > maxBytes) {
    const sizeMb = (rawHtmlBytes / (1024 * 1024)).toFixed(1);
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `HTML-Größe überschritten: ${sizeMb} MB (Limit: ${limitMb} MB).`,
    );
  }
  return rawHtmlBytes;
}
