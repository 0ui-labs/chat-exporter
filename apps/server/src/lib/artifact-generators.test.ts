import type { Conversation } from "@chat-exporter/shared";
import { describe, expect, test } from "vitest";
import {
  type ArtifactGenerator,
  ArtifactGeneratorRegistry,
  handoverGenerator,
  jsonGenerator,
  markdownGenerator,
} from "./artifact-generators.js";
import {
  conversationToHandover,
  conversationToMarkdown,
} from "./conversation-artifacts.js";

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
    ],
    ...overrides,
  };
}

describe("ArtifactGenerator implementations", () => {
  const conversation = createConversation();

  test("markdownGenerator produces identical output to conversationToMarkdown", () => {
    const expected = conversationToMarkdown(conversation);
    const actual = markdownGenerator.generate(conversation);
    expect(actual).toBe(expected);
  });

  test("markdownGenerator has formatId 'markdown'", () => {
    expect(markdownGenerator.formatId).toBe("markdown");
  });

  test("handoverGenerator produces identical output to conversationToHandover", () => {
    const expected = conversationToHandover(conversation);
    const actual = handoverGenerator.generate(conversation);
    expect(actual).toBe(expected);
  });

  test("handoverGenerator has formatId 'handover'", () => {
    expect(handoverGenerator.formatId).toBe("handover");
  });

  test("jsonGenerator produces pretty-printed JSON of the conversation", () => {
    const expected = JSON.stringify(conversation, null, 2);
    const actual = jsonGenerator.generate(conversation);
    expect(actual).toBe(expected);
  });

  test("jsonGenerator has formatId 'json'", () => {
    expect(jsonGenerator.formatId).toBe("json");
  });
});

describe("ArtifactGeneratorRegistry", () => {
  test("generate returns correct output for a registered format", () => {
    const registry = new ArtifactGeneratorRegistry();
    registry.register(markdownGenerator);

    const conversation = createConversation();
    const expected = conversationToMarkdown(conversation);
    const actual = registry.generate("markdown", conversation);

    expect(actual).toBe(expected);
  });

  test("generate throws a clear error for an unknown format", () => {
    const registry = new ArtifactGeneratorRegistry();

    expect(() =>
      registry.generate("unknown", createConversation()),
    ).toThrowError(/unknown/i);
  });

  test("register adds a custom generator that can be used via generate", () => {
    const registry = new ArtifactGeneratorRegistry();
    const customGenerator: ArtifactGenerator = {
      formatId: "custom",
      generate: () => "custom-output",
    };

    registry.register(customGenerator);
    const result = registry.generate("custom", createConversation());

    expect(result).toBe("custom-output");
  });

  test("getAll returns all registered generators", () => {
    const registry = new ArtifactGeneratorRegistry();
    registry.register(markdownGenerator);
    registry.register(jsonGenerator);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((g) => g.formatId)).toContain("markdown");
    expect(all.map((g) => g.formatId)).toContain("json");
  });

  test("registering a generator with duplicate formatId throws", () => {
    const registry = new ArtifactGeneratorRegistry();
    registry.register(markdownGenerator);
    expect(() => registry.register(markdownGenerator)).toThrow(
      'Artifact generator for format "markdown" is already registered.',
    );
  });
});
