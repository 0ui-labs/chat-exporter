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
    return "Markdown cannot carry portable font sizes or exact spacing. I can instead turn this into a heading, bold label, list, or cleaner paragraph structure.";
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

  return `${capabilityHint}\n\nI am anchoring this to ${selectionDescriptor(selection)}.\n\n${clarifyingQuestion}`;
}
