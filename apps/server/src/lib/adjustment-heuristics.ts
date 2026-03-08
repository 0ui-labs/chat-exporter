function mentions(input: string, pattern: RegExp) {
  return pattern.test(input);
}

export function wantsBroadRule(input: string) {
  return mentions(
    input,
    /\b(always|whenever|every|all similar|same kind|all|immer|ueberall|überall|alle ähnlichen|aehnlichen|ähnlichen|ähnliche|aehnliche|ähnliche|generell|standardmäßig|standardmaessig|jeder|jede|jedes)\b/i
  );
}

export function hasLabelStylePrefix(text: string) {
  const firstLine = text.trim().split("\n")[0] ?? "";
  const match = firstLine.match(/^([^:\n]{1,48}:)(\s|$)/);

  if (!match) {
    return false;
  }

  const prefix = match[1].slice(0, -1).trim();

  if (!prefix || /[.!?]/.test(prefix)) {
    return false;
  }

  const words = prefix.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

export function hasMarkdownStrongMarkers(text: string) {
  return /(\*\*[^*\n][^*\n]*\*\*|__[^_\n][^_\n]*__)/.test(text);
}

export function mentionsSpacingRequest(input: string) {
  return mentions(
    input,
    /\b(space|spacing|gap|padding|margin|abstand|abstände|abstaende|luft|luftiger)\b/i
  );
}

export function mentionsHeadingEmphasisRequest(input: string) {
  return mentions(
    input,
    /\b(bigger|larger|heading|headline|title|größer|groesser|titel|überschrift|ueberschrift)\b/i
  );
}

export function mentionsInlineEmphasisRequest(input: string) {
  return mentions(
    input,
    /\b(bold|italic|emphasis|highlight|colon|label|fett|fettdruck|kursiv|hervorheben|doppelpunkt|label)\b/i
  );
}

export function mentionsStructuralRequest(input: string) {
  return mentions(
    input,
    /\b(heading|headline|title|list|bullet|table|code block|quote|paragraph|überschrift|ueberschrift|titel|liste|aufzählung|aufzaehlung|tabelle|codeblock|zitat|absatz)\b/i
  );
}

export function mentionsVisualStylingRequest(input: string) {
  return mentions(
    input,
    /\b(bigger|larger|smaller|spacing|space|gap|padding|margin|color|font|size|größer|groesser|kleiner|abstand|abstände|abstaende|farbe|schrift|schriftgröße|schriftgroesse|größe|groesse)\b/i
  );
}

export function mentionsMarkdownStrongFormattingIssue(input: string) {
  return mentions(
    input,
    /\b(bold|fett|fettdruck|markdown|asterisk|asterisks|sternchen|format|formatiert|formatierung|render|rendern|darstellung|darstellen)\b/i
  );
}
