import type { Conversation } from "@chat-exporter/shared";
import {
  conversationToHandover,
  conversationToMarkdown,
} from "./conversation-artifacts.js";

export interface ArtifactGenerator {
  formatId: string;
  generate(conversation: Conversation): string;
}

export const markdownGenerator: ArtifactGenerator = {
  formatId: "markdown",
  generate: conversationToMarkdown,
};

export const handoverGenerator: ArtifactGenerator = {
  formatId: "handover",
  generate: conversationToHandover,
};

export const jsonGenerator: ArtifactGenerator = {
  formatId: "json",
  generate: (conversation) => JSON.stringify(conversation, null, 2),
};

export class ArtifactGeneratorRegistry {
  private generators = new Map<string, ArtifactGenerator>();

  register(generator: ArtifactGenerator): void {
    if (this.generators.has(generator.formatId)) {
      throw new Error(
        `Artifact generator for format "${generator.formatId}" is already registered.`,
      );
    }
    this.generators.set(generator.formatId, generator);
  }

  generate(formatId: string, conversation: Conversation): string {
    const generator = this.generators.get(formatId);
    if (!generator) {
      throw new Error(
        `No artifact generator registered for format "${formatId}"`,
      );
    }
    return generator.generate(conversation);
  }

  getAll(): ArtifactGenerator[] {
    return [...this.generators.values()];
  }
}
