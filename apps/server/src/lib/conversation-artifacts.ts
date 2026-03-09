import type { Block, Conversation } from "@chat-exporter/shared";

function escapePipe(value: string) {
  return value.replaceAll("|", "\\|");
}

function blocksToWords(blocks: Block[]) {
  return blocks.reduce((count, block) => {
    const text =
      block.type === "table"
        ? `${block.headers.join(" ")} ${block.rows.flat().join(" ")}`
        : block.type === "list"
          ? block.items.join(" ")
          : block.text;

    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return count + words;
  }, 0);
}

export function conversationToMarkdown(conversation: Conversation) {
  return conversation.messages
    .map((message) => {
      const heading =
        message.role.charAt(0).toUpperCase() + message.role.slice(1);
      const body = message.blocks
        .map((block) => {
          switch (block.type) {
            case "paragraph":
              return block.text;
            case "heading":
              return `${"#".repeat(block.level)} ${block.text}`;
            case "list":
              return block.items
                .map((item, index) =>
                  block.ordered ? `${index + 1}. ${item}` : `- ${item}`,
                )
                .join("\n");
            case "quote":
              return block.text
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");
            case "code":
              return `\`\`\`${block.language}\n${block.text}\n\`\`\``;
            case "table": {
              const header = `| ${block.headers.map(escapePipe).join(" | ")} |`;
              const divider = `| ${block.headers.map(() => "---").join(" | ")} |`;
              const rows = block.rows.map(
                (row) => `| ${row.map(escapePipe).join(" | ")} |`,
              );
              return [header, divider, ...rows].join("\n");
            }
          }
        })
        .join("\n\n");

      return `## ${heading}\n\n${body}`;
    })
    .join("\n\n");
}

export function conversationToHandover(conversation: Conversation) {
  const transcript = conversation.messages
    .map((message) => {
      const label = message.role.toUpperCase();
      const body = message.blocks
        .map((block) => {
          switch (block.type) {
            case "paragraph":
            case "quote":
              return block.text;
            case "heading":
              return block.text;
            case "list":
              return block.items.map((item) => `- ${item}`).join("\n");
            case "code":
              return `${block.language} code:\n${block.text}`;
            case "table":
              return [
                block.headers.join(" | "),
                ...block.rows.map((row) => row.join(" | ")),
              ].join("\n");
          }
        })
        .join("\n\n");

      return `[${label}]\n${body}`;
    })
    .join("\n\n");

  return `${transcript}\n\n[USER]\nContinue from this imported transcript and preserve the existing context and structure.`;
}

export function conversationWordCount(conversation: Conversation) {
  return conversation.messages.reduce(
    (count, message) => count + blocksToWords(message.blocks),
    0,
  );
}
