import type { Block, Conversation } from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";
import {
  type MessageEditEntry,
  mergeEditsIntoConversation,
} from "./conversation-merge.js";

function createConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: "conv-1",
    title: "Test Conversation",
    source: { url: "https://chatgpt.com/share/abc", platform: "chatgpt" },
    messages: [
      {
        id: "msg-1",
        role: "user",
        blocks: [{ id: "b1", type: "paragraph", text: "Hello" }],
      },
      {
        id: "msg-2",
        role: "assistant",
        blocks: [
          { id: "b2", type: "paragraph", text: "Hi there" },
          {
            id: "b3",
            type: "code",
            language: "typescript",
            text: "const x = 1;",
          },
        ],
      },
      {
        id: "msg-3",
        role: "user",
        blocks: [{ id: "b4", type: "paragraph", text: "Thanks" }],
      },
    ],
    ...overrides,
  };
}

function createEditEntry(
  messageId: string,
  blocks: Block[],
  overrides: Partial<MessageEditEntry> = {},
): MessageEditEntry {
  return {
    messageId,
    editedBlocksJson: JSON.stringify(blocks),
    ...overrides,
  };
}

describe("mergeEditsIntoConversation", () => {
  test("returns original conversation unchanged when edits are empty", () => {
    const conversation = createConversation();

    const result = mergeEditsIntoConversation(conversation, []);

    expect(result).toBe(conversation);
  });

  test("replaces blocks for a matching message", () => {
    const conversation = createConversation();
    const newBlocks: Block[] = [
      { id: "b5", type: "paragraph", text: "Edited greeting" },
    ];
    const edits = [createEditEntry("msg-1", newBlocks)];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.messages[0]?.blocks).toEqual(newBlocks);
  });

  test("leaves non-matching messages unchanged", () => {
    const conversation = createConversation();
    const newBlocks: Block[] = [
      { id: "b5", type: "paragraph", text: "Edited greeting" },
    ];
    const edits = [createEditEntry("msg-1", newBlocks)];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.messages[1]?.blocks).toEqual(
      conversation.messages[1]?.blocks,
    );
    expect(result.messages[2]?.blocks).toEqual(
      conversation.messages[2]?.blocks,
    );
  });

  test("applies multiple edits to different messages", () => {
    const conversation = createConversation();
    const editedBlocks1: Block[] = [
      { id: "b6", type: "paragraph", text: "Edited user msg" },
    ];
    const editedBlocks2: Block[] = [
      { id: "b7", type: "heading", level: 2, text: "New heading" },
      { id: "b8", type: "paragraph", text: "Edited assistant response" },
    ];
    const edits = [
      createEditEntry("msg-1", editedBlocks1),
      createEditEntry("msg-2", editedBlocks2),
    ];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.messages[0]?.blocks).toEqual(editedBlocks1);
    expect(result.messages[1]?.blocks).toEqual(editedBlocks2);
    expect(result.messages[2]?.blocks).toEqual(
      conversation.messages[2]?.blocks,
    );
  });

  test("does not mutate the original conversation", () => {
    const conversation = createConversation();
    const originalFirstBlocks = conversation.messages[0]?.blocks;
    const edits = [
      createEditEntry("msg-1", [
        { id: "b9", type: "paragraph", text: "Changed" },
      ]),
    ];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(conversation.messages[0]?.blocks).toBe(originalFirstBlocks);
    expect(result).not.toBe(conversation);
    expect(result.messages).not.toBe(conversation.messages);
  });

  test("preserves conversation metadata when edits are applied", () => {
    const conversation = createConversation();
    const edits = [
      createEditEntry("msg-1", [
        { id: "b10", type: "paragraph", text: "Changed" },
      ]),
    ];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.id).toBe(conversation.id);
    expect(result.title).toBe(conversation.title);
    expect(result.source).toBe(conversation.source);
  });

  test("ignores edits for non-existent message IDs", () => {
    const conversation = createConversation();
    const edits = [
      createEditEntry("non-existent-id", [
        { id: "b11", type: "paragraph", text: "Ghost edit" },
      ]),
    ];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.messages).toEqual(conversation.messages);
  });

  test("last edit wins when duplicate messageIds exist", () => {
    const conversation = createConversation();
    const edits = [
      createEditEntry("msg-1", [
        { id: "b12", type: "paragraph", text: "First edit" },
      ]),
      createEditEntry("msg-1", [
        { id: "b13", type: "paragraph", text: "Second edit" },
      ]),
    ];

    const result = mergeEditsIntoConversation(conversation, edits);

    expect(result.messages[0]?.blocks).toEqual([
      { id: "b13", type: "paragraph", text: "Second edit" },
    ]);
  });
});
