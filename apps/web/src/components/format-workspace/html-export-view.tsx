import type { Conversation, FormatRule } from "@chat-exporter/shared";
import { useMemo } from "react";
import { buildReaderHtml } from "@/components/format-workspace/reader-html-export";
import { buildReaderEffectsMap } from "@/components/format-workspace/rule-engine";

export interface HtmlExportViewProps {
  conversation: Conversation | undefined;
  rules: FormatRule[];
}

// TODO: Wire into format plugin registry when HTML export view is ready
export function HtmlExportView({ conversation, rules }: HtmlExportViewProps) {
  const html = useMemo(() => {
    if (!conversation) return "";
    const effectsMap = buildReaderEffectsMap(rules, conversation);
    return buildReaderHtml(conversation, effectsMap, conversation.title);
  }, [conversation, rules]);

  if (!conversation) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Konversation verfügbar.
      </p>
    );
  }

  return (
    <iframe
      data-testid="html-export-preview"
      srcDoc={html}
      title="HTML Export Preview"
      sandbox=""
      className="w-full rounded-2xl border border-border"
      style={{ minHeight: "32rem" }}
    />
  );
}
