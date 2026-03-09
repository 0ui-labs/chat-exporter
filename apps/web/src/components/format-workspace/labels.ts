import type { FormatRule, FormatRuleKind } from "@chat-exporter/shared";

import type { ViewMode } from "@/components/format-workspace/types";

const viewLabels: Record<ViewMode, string> = {
  reader: "Reader",
  markdown: "Markdown",
  handover: "Übergabe",
  json: "JSON",
};

const roleLabels: Record<string, string> = {
  assistant: "Assistent",
  markdown: "Markdown",
  system: "System",
  tool: "Werkzeug",
  user: "Nutzer",
};

const blockTypeLabels: Record<string, string> = {
  code: "Codeblock",
  heading: "Überschrift",
  list: "Liste",
  "markdown-lines": "Markdown-Zeilen",
  paragraph: "Absatz",
  quote: "Zitat",
  table: "Tabelle",
};

const ruleKindLabels: Record<FormatRuleKind, string> = {
  clipboard: "Zwischenablage",
  export_profile: "Export-Profil",
  inline_semantics: "Inline-Semantik",
  render: "Darstellung",
  structure: "Struktur",
};

export function getViewLabel(view: ViewMode) {
  return viewLabels[view];
}

export function getRoleLabel(role: string) {
  return roleLabels[role] ?? role;
}

export function getBlockTypeLabel(blockType: string) {
  return blockTypeLabels[blockType] ?? blockType;
}

export function getRuleKindLabel(kind: FormatRuleKind) {
  return ruleKindLabels[kind];
}

export function getRuleLabel(rule: FormatRule) {
  const summary = rule.instruction.trim();

  if (summary.length <= 72) {
    return summary;
  }

  return `${summary.slice(0, 69).trimEnd()}...`;
}
