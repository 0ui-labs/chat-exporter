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

function toSelector(selection: AdjustmentSelection) {
  return {
    blockIndex: selection.blockIndex,
    blockType: selection.blockType,
    lineEnd: selection.lineEnd,
    lineStart: selection.lineStart,
    messageId: selection.messageId
  };
}

function markdownPreview(selection: AdjustmentSelection, userMessage: string): AdjustmentPreview {
  const lower = userMessage.toLowerCase();
  const limitations: string[] = [];
  let kind: FormatRuleKind = "structure";
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
    summary = "Apply inline emphasis to the selected Markdown text.";
    rationale =
      "The request targets local emphasis, which maps well to Markdown-safe inline semantics.";
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
    summary = "Clean up the selected Markdown table output.";
    rationale =
      "Tables in Markdown often need export-specific cleanup instead of purely visual styling.";
    effect = {
      type: "normalize_markdown_table"
    };
  }

  return adjustmentPreviewSchema.parse({
    draftRule: {
      effect,
      kind,
      scope: "import_local",
      selector: toSelector(selection)
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
  let summary = "Refine the selected Reader block presentation.";
  let rationale =
    "The request points at presentation quality in the in-app Reader, so a render-focused rule is the safest first step.";
  let effect: Record<string, unknown> = {
    emphasis: "balanced",
    type: "refine_selected_block_presentation"
  };

  if (mentions(lower, /\b(space|spacing|gap|padding|margin)\b/)) {
    summary = "Increase spacing around the selected Reader block.";
    rationale =
      "The request explicitly mentions spacing, which maps directly to a Reader-only render rule.";
    effect = {
      amount: "lg",
      direction: "after",
      type: "adjust_block_spacing"
    };
  } else if (mentions(lower, /\b(bold|colon|label|highlight)\b/)) {
    kind = "inline_semantics";
    summary = "Emphasize a label-style prefix inside the selected Reader block.";
    rationale =
      "The request targets inline emphasis, which can be represented as local semantic styling in the Reader.";
    effect = {
      type: "bold_prefix_before_colon"
    };
  } else if (mentions(lower, /\b(bigger|larger|heading|headline|title)\b/)) {
    summary = "Increase heading-style emphasis for the selected Reader block.";
    rationale =
      "The request sounds like stronger visual hierarchy, which fits Reader presentation rules.";
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
      selector: toSelector(selection)
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
