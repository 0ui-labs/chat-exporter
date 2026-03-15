import type {
  Conversation,
  FormatRule,
  OutputFormatDescriptor,
} from "@chat-exporter/shared";
import { BUILTIN_FORMATS } from "@chat-exporter/shared";
import type { ComponentType } from "react";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { HtmlExportView } from "@/components/format-workspace/html-export-view";
import { applyMarkdownRules } from "@/components/format-workspace/rule-engine";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface FormatViewProps {
  conversation: Conversation;
  rules: FormatRule[];
  importId: string;
}

export interface FormatPlugin {
  descriptor: OutputFormatDescriptor;
  /** View component for rendering this format. Props vary per format. */
  // biome-ignore lint/suspicious/noExplicitAny: View components have format-specific props; unified in Step 12
  ViewComponent: ComponentType<any>;
  /** Optional client-side transformation for download export. */
  prepareDownload?: (content: string, rules: FormatRule[]) => string;
  /** Optional client-side transformation for copy-to-clipboard. */
  prepareCopy?: (content: string, rules: FormatRule[]) => string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class FormatPluginRegistry {
  private plugins = new Map<string, FormatPlugin>();

  register(plugin: FormatPlugin): void {
    if (this.plugins.has(plugin.descriptor.id)) {
      throw new Error(
        `Format plugin "${plugin.descriptor.id}" is already registered.`,
      );
    }
    this.plugins.set(plugin.descriptor.id, plugin);
  }

  get(id: string): FormatPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): FormatPlugin[] {
    return [...this.plugins.values()];
  }
}

// ---------------------------------------------------------------------------
// Default client registry with built-in formats
// ---------------------------------------------------------------------------

export const clientFormatRegistry = new FormatPluginRegistry();

for (const desc of BUILTIN_FORMATS) {
  switch (desc.id) {
    case "reader":
      clientFormatRegistry.register({
        descriptor: desc,
        ViewComponent: ArtifactView, // Placeholder — Step 12 wires up ReaderView
      });
      break;
    case "markdown":
      clientFormatRegistry.register({
        descriptor: desc,
        ViewComponent: ArtifactView, // Placeholder — Step 12 wires up MarkdownView
        prepareDownload: (content, rules) => applyMarkdownRules(content, rules),
        prepareCopy: (content, rules) => applyMarkdownRules(content, rules),
      });
      break;
    case "handover":
      clientFormatRegistry.register({
        descriptor: desc,
        ViewComponent: ArtifactView,
      });
      break;
    case "json":
      clientFormatRegistry.register({
        descriptor: desc,
        ViewComponent: ArtifactView,
      });
      break;
    case "html-export":
      clientFormatRegistry.register({
        descriptor: desc,
        ViewComponent: HtmlExportView,
      });
      break;
  }
}
