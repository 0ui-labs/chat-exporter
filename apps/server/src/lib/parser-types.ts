import type {
  Conversation,
  ImportStage,
  NormalizedSnapshotPayload,
} from "@chat-exporter/shared";

/** Callback for reporting import stage progress. */
export type StageCallback = (
  stage: Extract<ImportStage, "fetch" | "extract" | "normalize" | "structure">,
) => void;

/** Standardized result returned by every platform parser. */
export type PlatformParserResult = {
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

/** Signature that every platform-specific parser function must implement. */
export type PlatformParser = (
  url: string,
  options?: { onStage?: StageCallback },
) => Promise<PlatformParserResult>;
