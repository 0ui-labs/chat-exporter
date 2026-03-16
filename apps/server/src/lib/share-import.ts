import type { SourcePlatform } from "@chat-exporter/shared";
import { importChatGptSharePage } from "./chatgpt-share-import.js";
import { importClaudeSharePage } from "./claude-share-import.js";
import { importDeepSeekSharePage } from "./deepseek-share-import.js";
import { importGeminiSharePage } from "./gemini-share-import.js";
import { importGenericSharePage } from "./generic-share-import.js";
import type { PlatformParser, StageCallback } from "./parser-types.js";
import { classifySourcePlatform } from "./source-platform.js";

/** Registry of platform-specific parsers. Platforms not in this map use the generic fallback. */
const parserRegistry = new Map<SourcePlatform, PlatformParser>([
  ["chatgpt", importChatGptSharePage as PlatformParser],
  ["claude", importClaudeSharePage as PlatformParser],
  ["deepseek", importDeepSeekSharePage as PlatformParser],
  ["gemini", importGeminiSharePage as PlatformParser],
]);

export async function importSharePage(
  url: string,
  options?: {
    onStage?: StageCallback;
    sourcePlatform?: SourcePlatform;
  },
) {
  const sourcePlatform = options?.sourcePlatform ?? classifySourcePlatform(url);
  const parser = parserRegistry.get(sourcePlatform);

  if (parser) {
    return parser(url, { onStage: options?.onStage });
  }

  return importGenericSharePage(url, {
    onStage: options?.onStage,
    sourcePlatform,
  });
}
