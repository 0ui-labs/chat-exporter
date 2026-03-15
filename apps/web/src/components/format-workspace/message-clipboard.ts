import type { Block, Message } from "@chat-exporter/shared";

// ---------------------------------------------------------------------------
// Block → Markdown
// ---------------------------------------------------------------------------

function blockToMarkdown(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return block.text;
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "code":
      return `\`\`\`${block.language}\n${block.text}\n\`\`\``;
    case "list":
      return block.items
        .map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`))
        .join("\n");
    case "quote":
      return `> ${block.text}`;
    case "table": {
      const header = `| ${block.headers.join(" | ")} |`;
      const separator = `| ${block.headers.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
      return `${header}\n${separator}\n${rows}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Block → HTML (for reader clipboard)
// ---------------------------------------------------------------------------

function blockToHtml(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return `<p style="margin:0 0 0.75em">${escapeHtml(block.text)}</p>`;
    case "heading": {
      const tag = `h${block.level}` as const;
      return `<${tag} style="margin:0 0 0.5em">${escapeHtml(block.text)}</${tag}>`;
    }
    case "code":
      return `<pre style="margin:0 0 0.75em;padding:0.75em;background:#f5f5f5;border-radius:6px;overflow-x:auto"><code>${escapeHtml(block.text)}</code></pre>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
      return `<${tag} style="margin:0 0 0.75em;padding-left:1.5em">${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote style="margin:0 0 0.75em;padding-left:1em;border-left:3px solid #ddd;color:#555">${escapeHtml(block.text)}</blockquote>`;
    case "table": {
      const headerCells = block.headers
        .map(
          (h) =>
            `<th style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(h)}</th>`,
        )
        .join("");
      const rows = block.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(cell)}</td>`).join("")}</tr>`,
        )
        .join("");
      return `<table style="margin:0 0 0.75em;border-collapse:collapse"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Block → Plain text (for handover)
// ---------------------------------------------------------------------------

function blockToPlainText(block: Block): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
      return block.text;
    case "code":
      return block.text;
    case "list":
      return block.items.join("\n");
    case "table":
      return [
        block.headers.join("\t"),
        ...block.rows.map((r) => r.join("\t")),
      ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function copyMessageToClipboard(
  message: Message,
  format: "reader" | "markdown" | "json" | "handover",
  blocks: Block[],
): Promise<void> {
  switch (format) {
    case "reader": {
      const html = blocks.map(blockToHtml).join("\n");
      const blob = new Blob([html], { type: "text/html" });
      const item = new ClipboardItem({ "text/html": blob });
      await navigator.clipboard.write([item]);
      break;
    }
    case "markdown": {
      const md = blocks.map(blockToMarkdown).join("\n\n");
      await navigator.clipboard.writeText(md);
      break;
    }
    case "json": {
      const json = JSON.stringify(message, null, 2);
      await navigator.clipboard.writeText(json);
      break;
    }
    case "handover": {
      const text = blocks.map(blockToPlainText).join("\n\n");
      await navigator.clipboard.writeText(text);
      break;
    }
  }
}
