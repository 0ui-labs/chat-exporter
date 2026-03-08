import type {
  AdjustmentPreview,
  AdjustmentSelection,
  AdjustmentSessionDetail,
  AdjustmentTargetFormat,
  FormatRuleKind
} from "@chat-exporter/shared";
import { adjustmentPreviewSchema } from "@chat-exporter/shared";

function mentions(input: string, pattern: RegExp) {
  return pattern.test(input);
}

function wantsBroadRule(input: string) {
  return /\b(always|whenever|every|all similar|same kind|all)\b/i.test(input);
}

function hasPrefixBeforeColon(text: string) {
  return /^([^:\n]{1,120}:)/m.test(text.trim());
}

function toExactSelector(selection: AdjustmentSelection) {
  return {
    blockIndex: selection.blockIndex,
    blockType: selection.blockType,
    lineEnd: selection.lineEnd,
    lineStart: selection.lineStart,
    messageId: selection.messageId
  };
}

function toBlockTypeSelector(selection: AdjustmentSelection) {
  return {
    blockType: selection.blockType,
    strategy: "block_type"
  };
}

function toPrefixPatternSelector(selection: AdjustmentSelection) {
  return {
    blockType: selection.blockType,
    strategy: "prefix_before_colon"
  };
}

function toMarkdownPrefixPatternSelector() {
  return {
    strategy: "prefix_before_colon"
  };
}

function toMarkdownTableSelector() {
  return {
    strategy: "markdown_table"
  };
}

function markdownPreview(selection: AdjustmentSelection, userMessage: string): AdjustmentPreview {
  const lower = userMessage.toLowerCase();
  const limitations: string[] = [];
  let kind: FormatRuleKind = "structure";
  let selector: Record<string, unknown> = toExactSelector(selection);
  let summary = "Reshape the selected Markdown into a cleaner portable structure.";
  let rationale = "The request points at a Markdown output issue that is best handled as structure cleanup.";
  let effect: Record<string, unknown> = {
    type: "reshape_markdown_block"
  };

  if (mentions(lower, /\b(bigger|larger|title|heading|headline)\b/)) {
    summary = "Promote the selected Markdown into a heading-like structure.";
    rationale =
      "The request sounds like visual emphasis, which Markdown represents best through heading structure rather than font size.";
    effect = {
      level: 2,
      type: "promote_to_heading"
    };
    limitations.push("Exact font sizes are not portable in Markdown.");
  } else if (mentions(lower, /\b(bold|colon|label|highlight)\b/)) {
    kind = "inline_semantics";
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (mentions(lower, /\b(labels?|headings?|titles?)\b/) && mentions(lower, /\bcolon\b/)) ||
      hasPrefixBeforeColon(selection.selectedText);

    summary = shouldGeneralize
      ? "Bold label-style prefixes ending with a colon across matching Markdown lines."
      : "Apply inline emphasis to the selected Markdown text.";
    rationale = shouldGeneralize
      ? "The request describes a reusable inline Markdown pattern, so the rule can target similar lines instead of only this selection."
      : "The request targets local emphasis, which maps well to Markdown-safe inline semantics.";
    selector = shouldGeneralize ? toMarkdownPrefixPatternSelector() : toExactSelector(selection);
    effect = {
      type: "bold_prefix_before_colon"
    };
  } else if (mentions(lower, /\b(list|bullet|steps?)\b/)) {
    summary = "Normalize the selected Markdown into a proper list.";
    rationale =
      "The request suggests that the selected lines should be represented as a structured list.";
    effect = {
      type: "normalize_list_structure"
    };
  } else if (mentions(lower, /\b(table)\b/)) {
    kind = "export_profile";
    const shouldGeneralize = wantsBroadRule(lower);

    summary = shouldGeneralize
      ? "Clean up Markdown table formatting across this import."
      : "Clean up the selected Markdown table output.";
    rationale = shouldGeneralize
      ? "The request describes a reusable table cleanup rule, so matching Markdown tables can share one export-focused fix."
      : "Tables in Markdown often need export-specific cleanup instead of purely visual styling.";
    selector = shouldGeneralize ? toMarkdownTableSelector() : toExactSelector(selection);
    effect = {
      type: "normalize_markdown_table"
    };
  }

  return adjustmentPreviewSchema.parse({
    draftRule: {
      effect,
      kind,
      scope: "import_local",
      selector
    },
    limitations,
    rationale,
    sessionId: "",
    summary,
    targetFormat: "markdown"
  });
}

function readerPreview(selection: AdjustmentSelection, userMessage: string): AdjustmentPreview {
  const lower = userMessage.toLowerCase();
  let kind: FormatRuleKind = "render";
  let selector: Record<string, unknown> = toExactSelector(selection);
  let summary = "Refine the selected Reader block presentation.";
  let rationale =
    "The request points at presentation quality in the in-app Reader, so a render-focused rule is the safest first step.";
  let effect: Record<string, unknown> = {
    emphasis: "balanced",
    type: "refine_selected_block_presentation"
  };

  if (mentions(lower, /\b(space|spacing|gap|padding|margin)\b/)) {
    const shouldGeneralize =
      wantsBroadRule(lower) || selection.blockType === "heading" || selection.blockType === "table";

    summary = shouldGeneralize
      ? `Increase spacing around ${selection.blockType} blocks in the Reader.`
      : "Increase spacing around the selected Reader block.";
    rationale = shouldGeneralize
      ? "The request maps cleanly to a block-type render rule, so similar Reader blocks can share the same spacing fix."
      : "The request explicitly mentions spacing, which maps directly to a Reader-only render rule.";
    selector = shouldGeneralize ? toBlockTypeSelector(selection) : toExactSelector(selection);
    effect = {
      amount: "lg",
      direction: "after",
      type: "adjust_block_spacing"
    };
  } else if (mentions(lower, /\b(bold|colon|label|highlight)\b/)) {
    kind = "inline_semantics";
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (mentions(lower, /\b(labels?|headings?|titles?)\b/) && mentions(lower, /\bcolon\b/)) ||
      hasPrefixBeforeColon(selection.selectedText);

    summary = shouldGeneralize
      ? "Emphasize label-style prefixes ending with a colon in similar Reader blocks."
      : "Emphasize a label-style prefix inside the selected Reader block.";
    rationale = shouldGeneralize
      ? "The request describes a reusable inline pattern, so the rule can target similar Reader blocks instead of a single anchor."
      : "The request targets inline emphasis, which can be represented as local semantic styling in the Reader.";
    selector = shouldGeneralize ? toPrefixPatternSelector(selection) : toExactSelector(selection);
    effect = {
      type: "bold_prefix_before_colon"
    };
  } else if (mentions(lower, /\b(bigger|larger|heading|headline|title)\b/)) {
    const shouldGeneralize =
      wantsBroadRule(lower) ||
      (selection.blockType === "heading" && mentions(lower, /\b(headings?|titles?)\b/));

    summary = shouldGeneralize
      ? "Increase heading-style emphasis for similar Reader blocks."
      : "Increase heading-style emphasis for the selected Reader block.";
    rationale = shouldGeneralize
      ? "The request sounds like a reusable hierarchy adjustment, so matching Reader blocks can share one presentation rule."
      : "The request sounds like stronger visual hierarchy, which fits Reader presentation rules.";
    selector = shouldGeneralize ? toBlockTypeSelector(selection) : toExactSelector(selection);
    effect = {
      amount: "md",
      type: "increase_heading_emphasis"
    };
  }

  return adjustmentPreviewSchema.parse({
    draftRule: {
      effect,
      kind,
      scope: "import_local",
      selector
    },
    limitations: [],
    rationale,
    sessionId: "",
    summary,
    targetFormat: "reader"
  });
}

export function buildAdjustmentPreview(sessionDetail: AdjustmentSessionDetail) {
  const lastUserMessage = [...sessionDetail.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!lastUserMessage) {
    throw new Error("A preview needs at least one user message in the adjustment session.");
  }

  const basePreview =
    sessionDetail.session.targetFormat === "markdown"
      ? markdownPreview(sessionDetail.session.selection, lastUserMessage.content)
      : readerPreview(sessionDetail.session.selection, lastUserMessage.content);

  return adjustmentPreviewSchema.parse({
    ...basePreview,
    sessionId: sessionDetail.session.id,
    targetFormat: sessionDetail.session.targetFormat as AdjustmentTargetFormat
  });
}
