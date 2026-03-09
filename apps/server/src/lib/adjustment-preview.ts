import type {
  AdjustmentPreview,
  AdjustmentSelection,
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  FormatRule,
  FormatRuleKind,
  ImportJob,
} from "@chat-exporter/shared";
import { adjustmentPreviewSchema } from "@chat-exporter/shared";

import {
  hasLabelStylePrefix,
  hasMarkdownStrongMarkers,
  mentionsHeadingEmphasisRequest,
  mentionsInlineEmphasisRequest,
  mentionsMarkdownStrongFormattingIssue,
  mentionsSpacingRequest,
  wantsBroadRule,
} from "./adjustment-heuristics.js";
import { compileAdjustmentPreviewWithAi } from "./adjustment-rule-compiler.js";

type BuildAdjustmentPreviewInput = {
  activeRules: FormatRule[];
  job?: ImportJob;
  sessionDetail: AdjustmentSessionDetail;
};

function mentions(input: string, pattern: RegExp) {
  return pattern.test(input);
}

function getBlockTypeLabel(blockType: string) {
  switch (blockType) {
    case "heading":
      return "Überschriften";
    case "table":
      return "Tabellen";
    case "list":
      return "Listen";
    case "quote":
      return "Zitate";
    case "code":
      return "Codeblöcke";
    default:
      return "Blöcke";
  }
}

function toExactSelector(selection: AdjustmentSelection) {
  return {
    blockIndex: selection.blockIndex,
    blockType: selection.blockType,
    lineEnd: selection.lineEnd,
    lineStart: selection.lineStart,
    messageId: selection.messageId,
    strategy: "exact" as const,
  };
}

function toBlockTypeSelector(selection: AdjustmentSelection) {
  return {
    blockType: selection.blockType,
    strategy: "block_type",
  };
}

function toPrefixPatternSelector(selection: AdjustmentSelection) {
  return {
    blockType: selection.blockType,
    strategy: "prefix_before_colon",
  };
}

function toMarkdownPrefixPatternSelector() {
  return {
    strategy: "prefix_before_colon",
  };
}

function toMarkdownTableSelector() {
  return {
    strategy: "markdown_table",
  };
}

function markdownPreview(
  selection: AdjustmentSelection,
  userMessage: string,
): AdjustmentPreview {
  const lower = userMessage.toLowerCase();
  const limitations: string[] = [];
  let kind: FormatRuleKind = "structure";
  let selector: Record<string, unknown> = toExactSelector(selection);
  let summary =
    "Bereinige den ausgewählten Markdown-Block für ein tragfähigeres Exportformat.";
  let rationale =
    "Die Anfrage beschreibt ein Markdown-Problem, das sich am sichersten über Struktur statt über visuelle Feinsteuerung lösen lässt.";
  let effect: Record<string, unknown> = {
    type: "reshape_markdown_block",
  };

  if (mentionsHeadingEmphasisRequest(lower)) {
    summary =
      "Wandle die ausgewählte Markdown-Stelle in eine deutlichere Überschrift um.";
    rationale =
      "Die Anfrage zielt auf mehr visuelle Gewichtung, und Markdown bildet das am zuverlässigsten über Überschriftenstruktur statt über Schriftgrößen ab.";
    effect = {
      level: 2,
      type: "promote_to_heading",
    };
    limitations.push(
      "Exakte Schriftgrößen lassen sich in portablem Markdown nicht zuverlässig festlegen.",
    );
  } else if (mentionsInlineEmphasisRequest(lower)) {
    kind = "inline_semantics";
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (mentions(
        lower,
        /\b(labels?|headings?|titles?|labels|titel|überschriften|ueberschriften)\b/,
      ) &&
        mentions(lower, /\bcolon|doppelpunkt\b/)) ||
      hasLabelStylePrefix(selection.selectedText);

    summary = shouldGeneralize
      ? "Hebe labelartige Präfixe mit Doppelpunkt in passenden Markdown-Zeilen importweit hervor."
      : "Betone die ausgewählte Markdown-Stelle mit einer portablen Inline-Regel.";
    rationale = shouldGeneralize
      ? "Die Anfrage beschreibt ein wiederverwendbares Inline-Muster, daher kann dieselbe Regel ähnliche Markdown-Zeilen statt nur diese Auswahl treffen."
      : "Die Anfrage zielt auf lokale Hervorhebung, was sich in Markdown sauber als Inline-Semantik ausdrücken lässt.";
    selector = shouldGeneralize
      ? toMarkdownPrefixPatternSelector()
      : toExactSelector(selection);
    effect = {
      type: "bold_prefix_before_colon",
    };
  } else if (
    mentions(lower, /\b(list|bullet|steps?|liste|aufzählung|aufzaehlung)\b/)
  ) {
    summary =
      "Forme die ausgewählten Markdown-Zeilen in eine saubere Liste um.";
    rationale =
      "Die Anfrage deutet darauf hin, dass die Auswahl besser als strukturierte Liste statt als lose Textzeilen dargestellt werden sollte.";
    effect = {
      type: "normalize_list_structure",
    };
  } else if (mentions(lower, /\b(table|tabelle)\b/)) {
    kind = "export_profile";
    const shouldGeneralize = wantsBroadRule(lower);

    summary = shouldGeneralize
      ? "Bereinige die Tabellenformatierung in diesem Markdown-Export importweit."
      : "Bereinige die ausgewählte Markdown-Tabelle.";
    rationale = shouldGeneralize
      ? "Die Anfrage beschreibt eine wiederkehrende Tabellenkorrektur, daher können passende Markdown-Tabellen dieselbe exportorientierte Regel teilen."
      : "Markdown-Tabellen brauchen meist Exportbereinigung statt rein visueller Darstellung.";
    selector = shouldGeneralize
      ? toMarkdownTableSelector()
      : toExactSelector(selection);
    effect = {
      type: "normalize_markdown_table",
    };
  }

  return adjustmentPreviewSchema.parse({
    draftRule: {
      effect,
      kind,
      scope: "import_local",
      selector,
    },
    limitations,
    rationale,
    sessionId: "",
    summary,
    targetFormat: "markdown",
  });
}

function readerPreview(
  selection: AdjustmentSelection,
  userMessage: string,
): AdjustmentPreview {
  const lower = userMessage.toLowerCase();
  let kind: FormatRuleKind = "render";
  let selector: Record<string, unknown> = toExactSelector(selection);
  let summary = "Verfeinere die Darstellung des ausgewählten Reader-Blocks.";
  let rationale =
    "Die Anfrage betrifft die Darstellung im integrierten Reader, daher ist eine lokale Darstellungsregel der sicherste erste Schritt.";
  let effect: Record<string, unknown> = {
    emphasis: "balanced",
    type: "refine_selected_block_presentation",
  };

  if (
    hasMarkdownStrongMarkers(selection.selectedText) &&
    mentionsMarkdownStrongFormattingIssue(lower)
  ) {
    kind = "inline_semantics";
    summary =
      "Rendere vorhandene Markdown-Fettdruck-Markierungen im ausgewählten Reader-Block korrekt.";
    rationale =
      "Die Auswahl enthält wörtliche Markdown-Markierungen wie **...**, daher ist eine lokale Reader-Regel sinnvoll, die vorhandene Hervorhebung korrekt darstellt statt den Text umzuschreiben.";
    effect = {
      type: "render_markdown_strong",
    };
  } else if (mentionsSpacingRequest(lower)) {
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      selection.blockType === "heading" ||
      selection.blockType === "table";

    summary = shouldGeneralize
      ? `Vergrößere den Abstand rund um ähnliche ${getBlockTypeLabel(selection.blockType)} im Reader.`
      : "Vergrößere den Abstand rund um den ausgewählten Reader-Block.";
    rationale = shouldGeneralize
      ? "Die Anfrage passt sauber auf eine blocktypbasierte Darstellungsregel, damit ähnliche Reader-Blöcke dieselbe Abstandskorrektur teilen können."
      : "Die Anfrage nennt ausdrücklich Abstand, was direkt auf eine Reader-spezifische Darstellungsregel abbildbar ist.";
    selector = shouldGeneralize
      ? toBlockTypeSelector(selection)
      : toExactSelector(selection);
    effect = {
      amount: "lg",
      direction: "after",
      type: "adjust_block_spacing",
    };
  } else if (mentionsInlineEmphasisRequest(lower)) {
    kind = "inline_semantics";
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (mentions(
        lower,
        /\b(labels?|headings?|titles?|labels|titel|überschriften|ueberschriften)\b/,
      ) &&
        mentions(lower, /\bcolon|doppelpunkt\b/)) ||
      hasLabelStylePrefix(selection.selectedText);

    summary = shouldGeneralize
      ? "Hebe labelartige Präfixe mit Doppelpunkt in ähnlichen Reader-Blöcken hervor."
      : "Hebe ein labelartiges Präfix im ausgewählten Reader-Block hervor.";
    rationale = shouldGeneralize
      ? "Die Anfrage beschreibt ein wiederverwendbares Inline-Muster, daher kann die Regel ähnliche Reader-Blöcke statt nur eines einzelnen Ankers treffen."
      : "Die Anfrage zielt auf lokale Hervorhebung, was sich im Reader als Inline-Semantik darstellen lässt.";
    selector = shouldGeneralize
      ? toPrefixPatternSelector(selection)
      : toExactSelector(selection);
    effect = {
      type: "bold_prefix_before_colon",
    };
  } else if (mentionsHeadingEmphasisRequest(lower)) {
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (selection.blockType === "heading" &&
        mentions(
          lower,
          /\b(headings?|titles?|überschriften|ueberschriften|titel)\b/,
        ));

    summary = shouldGeneralize
      ? "Erhöhe die Überschriften-Betonung in ähnlichen Reader-Blöcken."
      : "Erhöhe die Überschriften-Betonung im ausgewählten Reader-Block.";
    rationale = shouldGeneralize
      ? "Die Anfrage klingt nach einer wiederverwendbaren Hierarchie-Anpassung, daher können passende Reader-Blöcke dieselbe Darstellungsregel teilen."
      : "Die Anfrage zielt auf stärkere visuelle Hierarchie, was gut zu Reader-Darstellungsregeln passt.";
    selector = shouldGeneralize
      ? toBlockTypeSelector(selection)
      : toExactSelector(selection);
    effect = {
      amount: "md",
      type: "increase_heading_emphasis",
    };
  }

  return adjustmentPreviewSchema.parse({
    draftRule: {
      effect,
      kind,
      scope: "import_local",
      selector,
    },
    limitations: [],
    rationale,
    sessionId: "",
    summary,
    targetFormat: "reader",
  });
}

export function buildDeterministicAdjustmentPreview(
  sessionDetail: AdjustmentSessionDetail,
): AdjustmentPreview {
  const lastUserMessage = [...sessionDetail.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!lastUserMessage) {
    throw new Error(
      "Für eine Vorschau braucht die Anpassungssession mindestens eine Nutzernachricht.",
    );
  }

  const basePreview =
    sessionDetail.session.targetFormat === "markdown"
      ? markdownPreview(
          sessionDetail.session.selection,
          lastUserMessage.content,
        )
      : readerPreview(sessionDetail.session.selection, lastUserMessage.content);

  return adjustmentPreviewSchema.parse({
    ...basePreview,
    sessionId: sessionDetail.session.id,
    targetFormat: sessionDetail.session.targetFormat as AdjustmentTargetFormat,
  });
}

export async function buildAdjustmentPreview(
  input: BuildAdjustmentPreviewInput,
): Promise<AdjustmentPreview> {
  try {
    const compiledPreview = await compileAdjustmentPreviewWithAi(input);

    if (compiledPreview) {
      return compiledPreview;
    }
  } catch (error) {
    console.warn(
      "[adjustment-preview] Falling back to deterministic preview compilation.",
      error,
    );
  }

  return buildDeterministicAdjustmentPreview(input.sessionDetail);
}
