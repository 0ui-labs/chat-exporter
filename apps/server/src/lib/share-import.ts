import type { SourcePlatform } from "@chat-exporter/shared";
import { importChatGptSharePage } from "./chatgpt-share-import.js";
import { importClaudeSharePage } from "./claude-share-import.js";
import { importDeepSeekSharePage } from "./deepseek-share-import.js";
import { importGeminiSharePage } from "./gemini-share-import.js";
import { importGrokSharePage } from "./grok-share-import.js";
import { importLeChatSharePage } from "./lechat-share-import.js";
import type { PlatformParser, StageCallback } from "./parser-types.js";
import { importPerplexitySharePage } from "./perplexity-share-import.js";
import { classifySourcePlatform } from "./source-platform.js";
import { importUnknownSharePage } from "./unknown-share-import.js";

// Note: aistudio is classified but not registered — no public share links as of 2026-03
// Note: kimi is classified but not registered — no public share links as of 2026-03
/** Registry of platform-specific parsers. Platforms not in this map use the unknown-platform fallback. */
const parserRegistry = new Map<SourcePlatform, PlatformParser>([
  ["chatgpt", importChatGptSharePage as PlatformParser],
  ["claude", importClaudeSharePage as PlatformParser],
  ["deepseek", importDeepSeekSharePage as PlatformParser],
  ["gemini", importGeminiSharePage as PlatformParser],
  ["grok", importGrokSharePage as PlatformParser],
  ["lechat", importLeChatSharePage as PlatformParser],
  ["perplexity", importPerplexitySharePage as PlatformParser],
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

  return importUnknownSharePage(url, {
    onStage: options?.onStage,
    sourcePlatform,
  });
}
