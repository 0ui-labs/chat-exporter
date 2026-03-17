import type { Block, Conversation, RuleEffect } from "@chat-exporter/shared";

const ROLE_LABELS: Record<string, string> = {
  assistant: "Assistent",
  system: "System",
  tool: "Werkzeug",
  user: "Nutzer",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownStrong(text: string): string {
  return escapeHtml(text).replace(
    /\*\*([^*\n][^*\n]*)\*\*/g,
    "<strong>$1</strong>",
  );
}

function renderBlockHtml(block: Block): string {
  switch (block.type) {
    case "paragraph": {
      const numberedBoldMatch = block.text.match(
        /^\*\*(\d+\.\s.+?)\*\*\s*([\s\S]*)$/,
      );
      if (numberedBoldMatch) {
        const heading = escapeHtml(numberedBoldMatch[1] ?? "");
        const rest = numberedBoldMatch[2]?.trim();
        let html = `<hr class="block-hr"><h2 class="block-heading">${heading}</h2>`;
        if (rest) {
          html += `<p class="block-paragraph">${renderMarkdownStrong(rest)}</p>`;
        }
        return html;
      }
      return `<p class="block-paragraph">${renderMarkdownStrong(block.text)}</p>`;
    }
    case "heading": {
      const level = Math.min(block.level, 6);
      return `<h${level} class="block-heading">${renderMarkdownStrong(block.text)}</h${level}>`;
    }
    case "list":
      return `<ul class="block-list">${block.items.map((item) => `<li>${renderMarkdownStrong(item)}</li>`).join("")}</ul>`;
    case "quote":
      return `<blockquote class="block-quote">${renderMarkdownStrong(block.text)}</blockquote>`;
    case "code":
      return `<div class="block-code">${block.language ? `<p class="code-lang">${escapeHtml(block.language)}</p>` : ""}<pre><code>${escapeHtml(block.text)}</code></pre></div>`;
    case "table":
      return `<div class="block-table-wrap"><table class="block-table"><thead><tr>${block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
}

function renderMessageHtml(
  message: Conversation["messages"][number],
  index: number,
  effectsMap: Map<string, RuleEffect[]>,
): string {
  const roleClass = message.role === "assistant" ? "msg-assistant" : "msg-user";
  const roleLabel = ROLE_LABELS[message.role] ?? message.role;

  const blocksHtml = message.blocks
    .map((block) => {
      const effects = effectsMap.get(`${message.id}:${block.id}`) ?? [];
      const style = collectContainerStyle(effects);
      const styleAttr = style ? ` style="${style}"` : "";
      return `<div class="block-wrapper"${styleAttr}>${renderBlockHtml(block)}</div>`;
    })
    .join("\n");

  return `<article class="message ${roleClass}">
  <div class="msg-header">
    <span>${escapeHtml(roleLabel)}</span>
    <span>${index + 1}</span>
  </div>
  <div class="msg-blocks">
${blocksHtml}
  </div>
</article>`;
}

function collectContainerStyle(effects: RuleEffect[]): string {
  const styles: Record<string, string> = {};
  for (const effect of effects) {
    if (effect.type !== "custom_style") continue;
    if (effect.containerStyle) Object.assign(styles, effect.containerStyle);
  }
  return escapeHtml(
    Object.entries(styles)
      .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
      .join("; "),
  );
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

const CSS = `
:root {
  --background: hsl(36 45% 97%);
  --foreground: hsl(195 28% 11%);
  --card: hsl(0 0% 100%);
  --secondary: hsl(38 40% 92%);
  --secondary-fg: hsl(192 30% 16%);
  --muted-fg: hsl(194 12% 42%);
  --primary: hsl(177 70% 26%);
  --accent: hsl(28 95% 58%);
  --border: hsl(192 24% 84%);
  --radius: 1.15rem;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  color-scheme: light;
}

body {
  font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
  color: var(--foreground);
  background:
    radial-gradient(circle at top left, hsl(28 95% 58% / 0.16), transparent 30%),
    radial-gradient(circle at 90% 10%, hsl(177 70% 26% / 0.16), transparent 24%),
    linear-gradient(180deg, var(--background), hsl(35 35% 94%));
  min-height: 100vh;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}

code, pre {
  font-family: "JetBrains Mono", "SFMono-Regular", "Menlo", monospace;
}

.container {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  border-radius: 1.55rem;
  border: 1px solid var(--border);
  padding: 1.25rem 1.25rem;
}

.msg-assistant {
  background: hsl(0 0% 100% / 0.92);
}

.msg-user {
  background: hsl(38 40% 92% / 0.3);
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--muted-fg);
}

.msg-blocks {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.block-wrapper {
  border-radius: calc(var(--radius) + 0.5rem);
  padding: 0.5rem 0.75rem;
}

.block-paragraph {
  font-size: 0.875rem;
  line-height: 1.75rem;
  color: hsl(195 28% 11% / 0.9);
}

.block-heading {
  font-weight: 600;
  color: var(--foreground);
}

h1.block-heading { font-size: 1.5rem; }
h2.block-heading { font-size: 1.25rem; }
h3.block-heading { font-size: 1.125rem; }
h4.block-heading { font-size: 1rem; }
h5.block-heading { font-size: 0.875rem; }
h6.block-heading { font-size: 0.8rem; }

.block-list {
  list-style: disc;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  line-height: 1.75rem;
  color: hsl(195 28% 11% / 0.9);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.block-quote {
  border-left: 2px solid var(--accent);
  padding-left: 1rem;
  font-size: 0.875rem;
  font-style: italic;
  line-height: 1.75rem;
  color: hsl(195 28% 11% / 0.8);
}

.block-code {
  border-radius: calc(var(--radius) + 0.5rem);
  border: 1px solid var(--border);
  background: hsl(240 6% 7%);
  padding: 1rem;
  font-size: 0.875rem;
  color: hsl(0 0% 96%);
}

.code-lang {
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: hsl(240 5% 65%);
}

.block-code pre {
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.block-table-wrap {
  overflow-x: auto;
  border-radius: calc(var(--radius) + 0.5rem);
  border: 1px solid var(--border);
}

.block-table {
  min-width: 100%;
  text-align: left;
  font-size: 0.875rem;
  border-collapse: collapse;
}

.block-table thead {
  background: hsl(38 40% 92% / 0.7);
  color: var(--secondary-fg);
}

.block-table th {
  padding: 0.75rem 1rem;
  font-weight: 500;
}

.block-table tbody tr {
  border-top: 1px solid var(--border);
}

.block-table td {
  padding: 0.75rem 1rem;
  vertical-align: top;
  color: var(--muted-fg);
}

.block-hr {
  margin-top: 2rem;
  border: none;
  border-top: 1px solid hsl(192 24% 84% / 0.4);
}

.export-footer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--muted-fg);
  padding: 2rem 0 1rem;
}
`;

export function buildReaderHtml(
  conversation: Conversation,
  effectsMap: Map<string, RuleEffect[]>,
  title?: string,
): string {
  const pageTitle = title ?? "Chat Export — Reader";

  const messagesHtml = conversation.messages
    .map((message, index) => renderMessageHtml(message, index, effectsMap))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
${messagesHtml}
  </div>
  <p class="export-footer">Exportiert mit Chat Exporter</p>
</body>
</html>`;
}
