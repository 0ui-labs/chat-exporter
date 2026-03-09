import type {
  AdjustmentSelection,
  AdjustmentSession,
  AdjustmentTargetFormat,
} from "@chat-exporter/shared";

import {
  hasLabelStylePrefix,
  hasMarkdownStrongMarkers,
  mentionsInlineEmphasisRequest,
  mentionsMarkdownStrongFormattingIssue,
  mentionsStructuralRequest,
  mentionsVisualStylingRequest,
  wantsBroadRule,
} from "./adjustment-heuristics.js";

function getRoleLabel(role: string) {
  switch (role) {
    case "assistant":
      return "Assistent";
    case "user":
      return "Nutzer";
    case "markdown":
      return "Markdown";
    case "tool":
      return "Werkzeug";
    case "system":
      return "System";
    default:
      return role;
  }
}

function getBlockTypeLabel(blockType: string) {
  switch (blockType) {
    case "paragraph":
      return "Absatz";
    case "heading":
      return "Überschrift";
    case "list":
      return "Liste";
    case "quote":
      return "Zitat";
    case "code":
      return "Codeblock";
    case "table":
      return "Tabelle";
    case "markdown-lines":
      return "Markdown-Zeilen";
    default:
      return blockType;
  }
}

function getReusableBlockTypeLabel(blockType: string) {
  switch (blockType) {
    case "heading":
      return "Überschriften";
    case "table":
      return "Tabellen";
    case "list":
      return "Listen";
    default:
      return "Inhalte dieses Typs";
  }
}

function getFormatLabel(targetFormat: AdjustmentTargetFormat) {
  switch (targetFormat) {
    case "reader":
      return "Reader";
    case "markdown":
      return "Markdown";
    case "handover":
      return "Übergabe";
    case "json":
      return "JSON";
    default:
      return targetFormat;
  }
}

function selectionDescriptor(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `Markdown-Zeilen ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${getRoleLabel(selection.messageRole)}-Nachricht ${selection.messageIndex + 1}, ${getBlockTypeLabel(selection.blockType)}`;
}

function buildMarkdownCapabilityHint(input: string) {
  if (mentionsVisualStylingRequest(input)) {
    return "Markdown trägt keine exakten Schriftgrößen oder Abstände zuverlässig. Ich kann das stattdessen als Überschrift, hervorgehobenes Label, Liste, Tabellenbereinigung oder klarere Struktur umsetzen.";
  }

  if (
    mentionsStructuralRequest(input) ||
    mentionsInlineEmphasisRequest(input)
  ) {
    return "Das sieht nach einer Markdown-tauglichen Anpassung aus. Im nächsten Schritt kann ich daraus eine Struktur- oder Inline-Regel für diese Ausgabe ableiten.";
  }

  return "Für Markdown kann ich bei Struktur, Überschriften, Listen, hervorgehobenen Labels, Tabellenbereinigung und Absatzform helfen.";
}

function buildReaderCapabilityHint(
  selection: AdjustmentSelection,
  input: string,
) {
  if (
    hasMarkdownStrongMarkers(selection.selectedText) &&
    mentionsMarkdownStrongFormattingIssue(input)
  ) {
    return "Das sieht nach wörtlich übernommenen Markdown-Markierungen wie **...** aus. Ich kann daraus eine Reader-Regel machen, die vorhandenen Fettdruck korrekt rendert.";
  }

  if (mentionsVisualStylingRequest(input)) {
    return "Das klingt nach einer Reader-Darstellungsregel. Im nächsten Schritt kann ich das in Abstand, Hervorhebung oder andere Präsentationslogik für die In-App-Ansicht übersetzen.";
  }

  if (
    mentionsStructuralRequest(input) ||
    mentionsInlineEmphasisRequest(input)
  ) {
    return "Das kann entweder eine Reader-Darstellungskorrektur oder eine Strukturregel sein. Im nächsten Schritt kann ich entscheiden, was besser zur Auswahl passt.";
  }

  return "Für Reader-Anpassungen kann ich bei Abstand, Hervorhebung und lokaler Darstellung der ausgewählten Stelle helfen.";
}

function buildClarifyingQuestion(
  targetFormat: AdjustmentTargetFormat,
  input: string,
) {
  if (targetFormat === "markdown" && mentionsVisualStylingRequest(input)) {
    return "Soll ich deine Anfrage als Markdown-Strukturänderung umsetzen, zum Beispiel als Überschrift oder hervorgehobenes Label?";
  }

  if (
    mentionsStructuralRequest(input) ||
    mentionsInlineEmphasisRequest(input)
  ) {
    return "Soll das nur für diese konkrete Auswahl gelten oder künftig auch für ähnliche Stellen in diesem Format?";
  }

  return "Was soll sich an der ausgewählten Stelle konkret ändern: Struktur, Hervorhebung oder Abstand?";
}

function buildScopeGuidance(params: {
  input: string;
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
}) {
  const { input, selection, targetFormat } = params;
  const lowerInput = input.toLowerCase();

  if (
    targetFormat === "reader" &&
    hasMarkdownStrongMarkers(selection.selectedText) &&
    mentionsMarkdownStrongFormattingIssue(lowerInput)
  ) {
    return wantsBroadRule(lowerInput)
      ? "Ich würde das zuerst sicher an dieser Auswahl verankern; wenn das gut aussieht, können wir es danach auf ähnliche Reader-Blöcke mit Markdown-Fettdruck ausweiten."
      : "Ich verankere das zunächst an genau dieser Auswahl, damit der Reader vorhandene Markdown-Hervorhebung dort sichtbar korrekt rendert.";
  }

  if (targetFormat === "reader" && mentionsVisualStylingRequest(lowerInput)) {
    if (selection.blockType === "heading" || selection.blockType === "table") {
      return `Ich kann daraus eine wiederverwendbare Reader-Regel für ähnliche ${getReusableBlockTypeLabel(selection.blockType).toLowerCase()} in diesem Import machen.`;
    }

    if (wantsBroadRule(lowerInput)) {
      return "Ich kann das importweit auf ähnliche Reader-Inhalte anwenden statt nur auf diesen einen Block.";
    }
  }

  if (
    targetFormat === "reader" &&
    mentionsInlineEmphasisRequest(lowerInput) &&
    (wantsBroadRule(lowerInput) || hasLabelStylePrefix(selection.selectedText))
  ) {
    return "Ich kann daraus eine wiederverwendbare Reader-Regel für ähnliche labelartige Präfixe in diesem Import machen.";
  }

  if (
    targetFormat === "markdown" &&
    mentionsInlineEmphasisRequest(lowerInput) &&
    (wantsBroadRule(lowerInput) || hasLabelStylePrefix(selection.selectedText))
  ) {
    return "Ich kann das Markdown-sicher halten und auf ähnliche labelartige Zeilen anwenden, nicht nur auf die aktuelle Auswahl.";
  }

  if (targetFormat === "markdown" && mentionsVisualStylingRequest(lowerInput)) {
    return "Wenn du exakte visuelle Abstände oder Größen brauchst, gehört das eher in Reader oder später in HTML/Rich-Text als in portables Markdown.";
  }

  return null;
}

export function buildInitialAdjustmentAssistantMessage(
  session: AdjustmentSession,
) {
  const selection = selectionDescriptor(session.selection);

  if (session.targetFormat === "markdown") {
    return `Markdown-Anpassung bereit für ${selection}. Beschreibe das Formatproblem in Alltagssprache, und ich bleibe wenn möglich bei Markdown-sicheren Änderungen.`;
  }

  if (session.targetFormat === "reader") {
    return `Reader-Anpassung bereit für ${selection}. Beschreibe, was in dieser Ansicht falsch aussieht, und ich übersetze das in eine darstellungsorientierte Regel.`;
  }

  return `Anpassung bereit für ${selection}. Beschreibe das Problem, das du in diesem Format beheben willst.`;
}

export function buildAdjustmentAssistantReply(params: {
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
  userMessage: string;
}) {
  const { selection, targetFormat, userMessage } = params;
  const trimmedMessage = userMessage.trim();

  if (trimmedMessage.length < 12) {
    return `Ich habe den Kontext für ${selectionDescriptor(selection)}. Beschreibe die gewünschte Änderung bitte etwas genauer, damit ich daraus eine für ${getFormatLabel(targetFormat)} passende Regel ableiten kann.`;
  }

  const capabilityHint =
    targetFormat === "markdown"
      ? buildMarkdownCapabilityHint(trimmedMessage)
      : buildReaderCapabilityHint(selection, trimmedMessage);
  const clarifyingQuestion = buildClarifyingQuestion(
    targetFormat,
    trimmedMessage,
  );
  const scopeGuidance = buildScopeGuidance({
    input: trimmedMessage,
    selection,
    targetFormat,
  });

  return [
    capabilityHint,
    `Ich verankere das an ${selectionDescriptor(selection)}.`,
    scopeGuidance,
    clarifyingQuestion,
  ]
    .filter(Boolean)
    .join("\n\n");
}
