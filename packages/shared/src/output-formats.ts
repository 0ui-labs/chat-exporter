// ---------------------------------------------------------------------------
// OutputFormatDescriptor — Step 1
// ---------------------------------------------------------------------------

export interface OutputFormatDescriptor {
  /** Unique ID, e.g. "reader", "markdown" */
  id: string;
  /** Display name for the UI, e.g. "Reader View" */
  label: string;
  /** Whether this format supports adjustments/rules */
  adjustable: boolean;
  /** Which RuleEffect types this format supports */
  supportedRuleKinds: readonly string[];
  /** MIME type for export download */
  exportMimeType: string;
  /** File extension for export download */
  exportExtension: string;
}

// ---------------------------------------------------------------------------
// Built-in Format Descriptors — Step 2
// ---------------------------------------------------------------------------

export const BUILTIN_FORMATS: readonly OutputFormatDescriptor[] = [
  {
    id: "reader",
    label: "HTML",
    adjustable: true,
    supportedRuleKinds: [
      "adjust_block_spacing",
      "increase_heading_emphasis",
      "refine_selected_block_presentation",
      "bold_prefix_before_colon",
      "render_markdown_strong",
      "custom_style",
    ],
    exportMimeType: "text/html",
    exportExtension: ".html",
  },
  {
    id: "markdown",
    label: "Markdown",
    adjustable: true,
    supportedRuleKinds: [
      "promote_to_heading",
      "bold_prefix_before_colon",
      "normalize_list_structure",
      "normalize_markdown_table",
      "reshape_markdown_block",
      "custom_style",
    ],
    exportMimeType: "text/markdown",
    exportExtension: ".md",
  },
  {
    id: "handover",
    label: "Übergabe",
    adjustable: false,
    supportedRuleKinds: [],
    exportMimeType: "text/plain",
    exportExtension: ".txt",
  },
  {
    id: "json",
    label: "JSON",
    adjustable: false,
    supportedRuleKinds: [],
    exportMimeType: "application/json",
    exportExtension: ".json",
  },
];

// ---------------------------------------------------------------------------
// FormatRegistry — Step 3
// ---------------------------------------------------------------------------

export class FormatRegistry {
  private formats = new Map<string, OutputFormatDescriptor>();

  register(format: OutputFormatDescriptor): void {
    if (this.formats.has(format.id)) {
      throw new Error(`Format "${format.id}" is already registered.`);
    }
    this.formats.set(format.id, format);
  }

  get(id: string): OutputFormatDescriptor | undefined {
    return this.formats.get(id);
  }

  getAll(): OutputFormatDescriptor[] {
    return [...this.formats.values()];
  }

  getAdjustable(): OutputFormatDescriptor[] {
    return this.getAll().filter((f) => f.adjustable);
  }

  supportsRuleKind(formatId: string, ruleKind: string): boolean {
    const format = this.formats.get(formatId);
    if (!format) return false;
    return format.supportedRuleKinds.includes(ruleKind);
  }
}

export const defaultRegistry = new FormatRegistry();
for (const format of BUILTIN_FORMATS) {
  defaultRegistry.register(format);
}
