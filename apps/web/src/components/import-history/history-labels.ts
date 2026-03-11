import type { ImportSummary } from "@chat-exporter/shared";

export function formatTitle(imp: ImportSummary): string {
  if (imp.pageTitle) return imp.pageTitle;
  try {
    const url = new URL(imp.sourceUrl);
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return imp.sourceUrl;
  }
}

export const platformLabels: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
  notebooklm: "NotebookLM",
  unknown: "Unbekannt",
};

export const defaultStatusConfig = {
  label: "Unbekannt",
  className: "border-gray-300/40 bg-gray-100/60 text-gray-700",
};

export const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  completed: {
    label: "Abgeschlossen",
    className: "border-green-300/40 bg-green-100/60 text-green-800",
  },
  failed: {
    label: "Fehlgeschlagen",
    className: "border-red-300/40 bg-red-100/60 text-red-800",
  },
  running: {
    label: "Läuft",
    className: "border-yellow-300/40 bg-yellow-100/60 text-yellow-800",
  },
  queued: {
    label: "Warteschlange",
    className: "border-gray-300/40 bg-gray-100/60 text-gray-700",
  },
};
