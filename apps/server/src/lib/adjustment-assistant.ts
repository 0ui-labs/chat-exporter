import type {
  AdjustmentSelection,
  AdjustmentSession,
  AdjustmentTargetFormat
} from "@chat-exporter/shared";

function selectionDescriptor(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `lines ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${selection.messageRole} message ${selection.messageIndex + 1}, ${selection.blockType} block`;
}

function wantsBroadRule(input: string) {
  return /\b(always|whenever|every|all similar|same kind|all)\b/i.test(input);
}

function hasPrefixBeforeColon(text: string) {
  return /^([^:\n]{1,120}:)/m.test(text.trim());
}

function mentionsVisualStyling(input: string) {
  return /\b(bigger|larger|smaller|spacing|space|gap|padding|margin|color|font|size)\b/i.test(input);
}

function mentionsStructuralChange(input: string) {
  return /\b(heading|headline|title|list|bullet|table|code block|quote|paragraph)\b/i.test(input);
}

function mentionsInlineEmphasis(input: string) {
  return /\b(bold|italic|emphasis|highlight|colon)\b/i.test(input);
}

function buildMarkdownCapabilityHint(input: string) {
  if (mentionsVisualStyling(input)) {
    return "Markdown cannot carry portable font sizes or exact spacing. I can reinterpret this as a heading, bold label, list, table cleanup, or cleaner paragraph structure instead.";
  }

  if (mentionsStructuralChange(input) || mentionsInlineEmphasis(input)) {
    return "This looks like a Markdown-safe request. The next step can turn it into a structural or inline rule for this output.";
  }

  return "For Markdown I can help with structure, headings, lists, bold labels, table cleanup, and paragraph shaping.";
}

function buildReaderCapabilityHint(input: string) {
  if (mentionsVisualStyling(input)) {
    return "This sounds like a Reader render rule. The next step can turn it into spacing, emphasis, or presentation logic for the in-app view.";
  }

  if (mentionsStructuralChange(input) || mentionsInlineEmphasis(input)) {
    return "This may be either a Reader presentation tweak or a structure rule. The next step can decide which one fits the selected content better.";
  }

  return "For Reader adjustments I can help with spacing, emphasis, and local presentation changes on the selected content.";
}

function buildClarifyingQuestion(targetFormat: AdjustmentTargetFormat, input: string) {
  if (targetFormat === "markdown" && mentionsVisualStyling(input)) {
    return "Should I reinterpret your request as a Markdown structure change such as a heading or bold label?";
  }

  if (mentionsStructuralChange(input) || mentionsInlineEmphasis(input)) {
    return "Should this apply only to this exact selection, or should the future rule target similar content in this format?";
  }

  return "What should change in the selected content itself: structure, emphasis, or spacing?";
}

function buildScopeGuidance(params: {
  input: string;
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
}) {
  const { input, selection, targetFormat } = params;
  const lowerInput = input.toLowerCase();

  if (targetFormat === "reader" && mentionsVisualStyling(lowerInput)) {
    if (selection.blockType === "heading" || selection.blockType === "table") {
      return `I can treat this as a reusable Reader rule for other ${selection.blockType} blocks in this import.`;
    }

    if (wantsBroadRule(lowerInput)) {
      return "I can scope this broadly to similar Reader content in this import instead of only this exact block.";
    }
  }

  if (
    targetFormat === "reader" &&
    mentionsInlineEmphasis(lowerInput) &&
    (wantsBroadRule(lowerInput) || hasPrefixBeforeColon(selection.selectedText))
  ) {
    return "I can turn this into a reusable Reader rule for similar label-style prefixes in this import.";
  }

  if (
    targetFormat === "markdown" &&
    mentionsInlineEmphasis(lowerInput) &&
    (wantsBroadRule(lowerInput) || hasPrefixBeforeColon(selection.selectedText))
  ) {
    return "I can keep this Markdown-safe and target similar label-style lines, not just the current selection.";
  }

  if (targetFormat === "markdown" && mentionsVisualStyling(lowerInput)) {
    return "If you need exact visual spacing or sizing, that belongs in Reader or later HTML/Rich text output rather than portable Markdown.";
  }

  return null;
}

export function buildInitialAdjustmentAssistantMessage(session: AdjustmentSession) {
  const selection = selectionDescriptor(session.selection);

  if (session.targetFormat === "markdown") {
    return `Markdown adjustment session ready for ${selection}. Describe the formatting problem in plain language and I will stay within Markdown-safe changes when possible.`;
  }

  if (session.targetFormat === "reader") {
    return `Reader adjustment session ready for ${selection}. Describe what looks wrong in this view and I will translate that into a presentation-focused rule.`;
  }

  return `Adjustment session ready for ${selection}. Describe the issue you want to fix in this format.`;
}

export function buildAdjustmentAssistantReply(params: {
  selection: AdjustmentSelection;
  targetFormat: AdjustmentTargetFormat;
  userMessage: string;
}) {
  const { selection, targetFormat, userMessage } = params;
  const trimmedMessage = userMessage.trim();

  if (trimmedMessage.length < 12) {
    return `I have the selection context for ${selectionDescriptor(selection)}. Please describe the change a bit more specifically so I can turn it into a ${targetFormat}-specific rule.`;
  }

  const capabilityHint =
    targetFormat === "markdown"
      ? buildMarkdownCapabilityHint(trimmedMessage)
      : buildReaderCapabilityHint(trimmedMessage);
  const clarifyingQuestion = buildClarifyingQuestion(targetFormat, trimmedMessage);
  const scopeGuidance = buildScopeGuidance({
    input: trimmedMessage,
    selection,
    targetFormat
  });

  return [
    capabilityHint,
    `I am anchoring this to ${selectionDescriptor(selection)}.`,
    scopeGuidance,
    clarifyingQuestion
  ]
    .filter(Boolean)
    .join("\n\n");
}
