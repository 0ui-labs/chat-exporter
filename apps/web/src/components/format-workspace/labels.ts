import type {
  FormatRule,
  FormatRuleKind,
  ImportStage,
} from "@chat-exporter/shared";

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

// ---------------------------------------------------------------------------
// Job Status Labels
// ---------------------------------------------------------------------------

const jobStatusLabels: Record<string, string> = {
  completed: "Bereit",
  failed: "Fehlgeschlagen",
  queued: "Warteschlange",
  processing: "Import läuft",
};

export function getJobStatusLabel(status: string) {
  return jobStatusLabels[status] ?? jobStatusLabels.processing;
}

// ---------------------------------------------------------------------------
// Import Stage Labels
// ---------------------------------------------------------------------------

const importStageLabels: Record<
  ImportStage | "queued",
  { label: string; detail: string }
> = {
  queued: {
    label: "Wartet auf Start",
    detail:
      "Der Job ist in der Warteschlange und startet, sobald ein Worker frei ist.",
  },
  validate: {
    label: "Link wird geprüft",
    detail: "Der Link wird geprüft und dem passenden Importer zugeordnet.",
  },
  fetch: {
    label: "Seite wird geladen",
    detail: "Die freigegebene Seite wird geöffnet und als Quelle erfasst.",
  },
  extract: {
    label: "Nachrichten werden extrahiert",
    detail: "Die Unterhaltung wird aus dem Markup des Anbieters extrahiert.",
  },
  normalize: {
    label: "Transkript wird bereinigt",
    detail: "Rohfragmente werden in lesbare Nachrichten umgewandelt.",
  },
  structure: {
    label: "Struktur wird repariert",
    detail: "Abschnitte mit zusätzlichem Bereinigungsbedarf werden korrigiert.",
  },
  render: {
    label: "Ausgaben werden erzeugt",
    detail: "Reader- und Exportformate werden vorbereitet.",
  },
  done: {
    label: "Bereit",
    detail: "Das Transkript ist bereit.",
  },
};

export function getImportStageLabel(stage: ImportStage | "queued") {
  return importStageLabels[stage]?.label ?? stage;
}

export function getImportStageDescription(stage: ImportStage | "queued") {
  return importStageLabels[stage]?.detail ?? "";
}

export function getImportStageEntry(stage: ImportStage | "queued") {
  return importStageLabels[stage] ?? { label: stage, detail: "" };
}

// ---------------------------------------------------------------------------
// Adjustment UI Labels
// ---------------------------------------------------------------------------

export const adjustmentLabels = {
  // Button labels
  send: "Senden",
  sendPending: "Wird gesendet...",
  cancel: "Abbrechen",
  discard: "Verwerfen",
  dismiss: "Verstanden",
  download: "Download",

  // Placeholders
  adjustmentPlaceholder: "Beschreibe kurz, wie diese Stelle aussehen soll.",
  followUpPlaceholder: "Noch etwas anpassen?",

  // Messages
  loadingMessage: "Ich bereite diese Stelle gerade für die Anpassung vor.",
  appliedHint:
    "Die Änderung ist schon sichtbar. Du kannst weiter anpassen oder eine neue Stelle markieren.",
  defaultHint:
    "Die KI antwortet kurz und setzt klare Änderungen sofort direkt in dieser Ansicht um.",
  closeLabel: "Anpassung schließen",
  inputLabel: "Anpassungsanfrage",

  // Guide
  guideInstruction:
    "Markiere die Stelle, die anders aussehen soll. Beschreibe dann kurz deinen Wunsch, und die Änderung erscheint direkt hier.",
  guideNote: "Du musst kein Regel-JSON lesen oder eine Vorschau vergleichen.",

  // Mode toggle
  endAdjustMode: "Anpassungsmodus beenden",
} as const;

export function getAdjustViewLabel(view: ViewMode) {
  return `${getViewLabel(view)} anpassen`;
}

export function getEndAdjustLabel() {
  return adjustmentLabels.endAdjustMode;
}

// ---------------------------------------------------------------------------
// View Labels
// ---------------------------------------------------------------------------

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
