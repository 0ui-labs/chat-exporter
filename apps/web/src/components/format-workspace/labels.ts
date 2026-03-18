import type {
  FormatRule,
  FormatRuleKind,
  ImportStage,
} from "@chat-exporter/shared";

import type { ViewMode } from "@/components/format-workspace/types";

const viewLabels: Record<ViewMode, string> = {
  reader: "HTML",
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
  "markdown-lines": "Textzeilen",
  paragraph: "Absatz",
  quote: "Zitat",
  table: "Tabelle",
};

const ruleKindLabels: Record<FormatRuleKind, string> = {
  clipboard: "Kopieren",
  export_profile: "Exportformat",
  inline_semantics: "Textformatierung",
  render: "Aussehen",
  structure: "Aufbau",
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
  createRuleLabel: "Regel erstellen",
  inputLabel: "Anpassungsanfrage",

  // Guide (S8)
  guideInstruction:
    "Klicke auf eine Stelle, beschreibe deine Änderung — sie wird direkt übernommen.",
  guideNote: "",

  // Mode toggle (S7)
  adjustLabel: "Anpassen",
  adjustDoneLabel: "Fertig",

  // Edit mode
  edit: "Bearbeiten",
  endEdit: "Bearbeitung beenden",

  // Clipboard
  copied: "Kopiert!",

  // Toolbar actions
  versions: "Versionen",
  downloadAction: "Herunterladen",
  copyAllAction: "Kopieren",
  copyAllSuccess: "Kopiert!",

  // Agent loop status
  agentThinking: "Agent analysiert...",

  // Scope dialog
  scopeQuestion: "Soll die Regel für alle Blöcke dieses Typs gelten?",
  scopeGlobal: "Global anwenden",
  scopeLocal: "Nur dieser Block",
} as const;

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

// ---------------------------------------------------------------------------
// Selection Formatter
// ---------------------------------------------------------------------------

export function formatMarkdownLinesLabel(start: number, end: number) {
  return `Textzeilen ${start}-${end}`;
}

export function formatMessageBlockLabel(
  role: string,
  index: number,
  blockType: string,
) {
  return `${getRoleLabel(role)}-Nachricht ${index} · ${getBlockTypeLabel(blockType)}`;
}

// ---------------------------------------------------------------------------
// Rules Labels
// ---------------------------------------------------------------------------

export const rulesLabels = {
  activeRulesCount: (count: number) =>
    count > 0 ? `${count} ${count === 1 ? "Regel" : "Regeln"} aktiv` : "Regeln",
  noActiveRules: "Keine aktiven Regeln.",
  allImports: "Überall anwenden",
  thisImportOnly: "Nur hier",
  loading: "Wird geladen...",
  rationale: "Begründung",
  defaultRationale:
    "Diese Regel wurde aus einer früheren Anpassungssession für diesen Import erzeugt.",
  exactScopeNote: "Diese Regel gilt nur für die ursprüngliche Auswahl.",
  globalScopeNote: "Diese Regel gilt für alle Imports in diesem Format.",
  undoPending: "Wird rückgängig gemacht...",
  undo: "Rückgängig",
} as const;

// ---------------------------------------------------------------------------
// Loading & Misc Labels
// ---------------------------------------------------------------------------

export const miscLabels = {
  transcriptLoading: "Transkript wird vorbereitet",
  importFailed: "Import fehlgeschlagen",
  errorInPhase: (phase: string) => `Fehler in Phase: ${phase}`,
  viewLoadError: "Diese Ansicht konnte nicht geladen werden.",
  retryButton: "Erneut versuchen",
  adjustmentLoadError: "Anpassungen konnten nicht geladen werden.",
} as const;

export function getRuleLabel(rule: FormatRule) {
  const summary = rule.instruction.trim();

  if (summary.length <= 72) {
    return summary;
  }

  return `${summary.slice(0, 69).trimEnd()}...`;
}
