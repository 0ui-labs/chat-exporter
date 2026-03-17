import type { Block, Conversation } from "@chat-exporter/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useResolvedConversation } from "./use-resolved-conversation";

function createConversation(
  messages: Array<{ id: string; role: "user" | "assistant"; blocks: Block[] }>,
): Conversation {
  return {
    id: "conv-1",
    title: "Test Conversation",
    source: { url: "https://example.com/chat", platform: "chatgpt" },
    messages,
  };
}

function textBlock(id: string, text: string): Block {
  return { id, type: "paragraph", text };
}

describe("useResolvedConversation", () => {
  test("returns original messages when editedMessagesMap is empty", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b1", "Hello")] },
      { id: "m2", role: "assistant", blocks: [textBlock("b2", "Hi there")] },
    ]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, new Map()),
    );

    expect(result.current).toHaveLength(2);
    expect(result.current.at(0)?.blocks).toEqual([textBlock("b1", "Hello")]);
    expect(result.current.at(1)?.blocks).toEqual([textBlock("b2", "Hi there")]);
  });

  test("marks non-edited messages with isEdited: false", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b3", "Hello")] },
    ]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, new Map()),
    );

    expect(result.current.at(0)?.isEdited).toBe(false);
  });

  test("replaces blocks for edited messages", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b4", "Original")] },
      {
        id: "m2",
        role: "assistant",
        blocks: [textBlock("b5", "Original reply")],
      },
    ]);
    const editedBlocks: Block[] = [textBlock("b6", "Edited content")];
    const editsMap = new Map<string, Block[]>([["m1", editedBlocks]]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, editsMap),
    );

    expect(result.current.at(0)?.blocks).toEqual([
      textBlock("b6", "Edited content"),
    ]);
    expect(result.current.at(1)?.blocks).toEqual([
      textBlock("b5", "Original reply"),
    ]);
  });

  test("marks edited messages with isEdited: true", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b7", "Original")] },
      { id: "m2", role: "assistant", blocks: [textBlock("b8", "Reply")] },
    ]);
    const editsMap = new Map<string, Block[]>([
      ["m1", [textBlock("b9", "Edited")]],
    ]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, editsMap),
    );

    expect(result.current.at(0)?.isEdited).toBe(true);
    expect(result.current.at(1)?.isEdited).toBe(false);
  });

  test("handles undefined conversation gracefully", () => {
    const { result } = renderHook(() =>
      useResolvedConversation(undefined, new Map()),
    );

    expect(result.current).toEqual([]);
  });

  test("handles empty messages array", () => {
    const conversation = createConversation([]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, new Map()),
    );

    expect(result.current).toEqual([]);
  });

  test("preserves message id and role in resolved output", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b10", "Hello")] },
    ]);
    const editsMap = new Map<string, Block[]>([
      ["m1", [textBlock("b11", "Edited")]],
    ]);

    const { result } = renderHook(() =>
      useResolvedConversation(conversation, editsMap),
    );

    expect(result.current.at(0)?.id).toBe("m1");
    expect(result.current.at(0)?.role).toBe("user");
  });

  test("memoizes result when inputs do not change", () => {
    const conversation = createConversation([
      { id: "m1", role: "user", blocks: [textBlock("b12", "Hello")] },
    ]);
    const editsMap = new Map<string, Block[]>();

    const { result, rerender } = renderHook(() =>
      useResolvedConversation(conversation, editsMap),
    );

    const firstResult = result.current;
    rerender();
    expect(result.current).toBe(firstResult);
  });
});
