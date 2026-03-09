import type { ImportStage, SourcePlatform } from "@chat-exporter/shared";

import { importChatGptSharePage } from "./chatgpt-share-import.js";
import { importGenericSharePage } from "./generic-share-import.js";
import { classifySourcePlatform } from "./source-platform.js";

type StageCallback = (
  stage: Extract<ImportStage, "fetch" | "extract" | "normalize" | "structure">,
) => void;

export async function importSharePage(
  url: string,
  options?: {
    onStage?: StageCallback;
    sourcePlatform?: SourcePlatform;
  },
) {
  const sourcePlatform = options?.sourcePlatform ?? classifySourcePlatform(url);

  if (sourcePlatform === "chatgpt") {
    return importChatGptSharePage(url, {
      onStage: options?.onStage,
    });
  }

  return importGenericSharePage(url, {
    onStage: options?.onStage,
    sourcePlatform,
  });
}
