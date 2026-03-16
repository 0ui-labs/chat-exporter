import type { SourcePlatform } from "@chat-exporter/shared";

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function hasSupportedImportProtocol(urlString: string) {
  const url = new URL(urlString);
  return url.protocol === "https:" || url.protocol === "http:";
}

export function classifySourcePlatform(urlString: string): SourcePlatform {
  const url = new URL(urlString);
  const hostname = normalizeHostname(url.hostname);
  const pathname = url.pathname.toLowerCase();

  if (
    hostname === "chatgpt.com" ||
    hostname.endsWith(".chatgpt.com") ||
    hostname === "chat.openai.com"
  ) {
    return "chatgpt";
  }

  if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) {
    return "claude";
  }

  if (
    hostname === "gemini.google.com" ||
    hostname.endsWith(".gemini.google.com") ||
    (hostname === "g.co" && pathname.startsWith("/gemini"))
  ) {
    return "gemini";
  }

  if (
    hostname === "grok.com" ||
    hostname.endsWith(".grok.com") ||
    (hostname === "x.com" && pathname.includes("/grok"))
  ) {
    return "grok";
  }

  if (hostname.includes("deepseek")) {
    return "deepseek";
  }

  if (hostname.includes("notebooklm")) {
    return "notebooklm";
  }

  if (
    hostname === "aistudio.google.com" ||
    hostname.endsWith(".aistudio.google.com")
  ) {
    return "aistudio";
  }

  if (hostname === "perplexity.ai" || hostname.endsWith(".perplexity.ai")) {
    return "perplexity";
  }

  if (hostname === "chat.mistral.ai" || hostname.endsWith(".mistral.ai")) {
    return "lechat";
  }

  if (hostname === "kimi.moonshot.cn" || hostname.endsWith(".moonshot.cn")) {
    return "kimi";
  }

  return "unknown";
}

export function looksLikeSharedConversationUrl(urlString: string) {
  const url = new URL(urlString);
  const pathname = url.pathname.toLowerCase();

  return (
    pathname.includes("/share") ||
    pathname.includes("/shared") ||
    pathname.includes("/public") ||
    pathname.includes("/artifact")
  );
}
