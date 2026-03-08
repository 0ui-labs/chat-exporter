import type { ViewMode } from "@/components/format-workspace/types";

type DescribeSelectorScopeParams = {
  blockType?: string;
  exactLabel: string;
  selector: unknown;
  view: ViewMode;
};

export function describeSelectorScope(params: DescribeSelectorScopeParams) {
  const { blockType, exactLabel, selector, view } = params;
  const parsedSelector =
    selector && typeof selector === "object" ? (selector as Record<string, unknown>) : null;
  const strategy = typeof parsedSelector?.strategy === "string" ? parsedSelector.strategy : "exact";
  const selectorBlockType =
    typeof parsedSelector?.blockType === "string" ? parsedSelector.blockType : blockType;

  switch (strategy) {
    case "block_type":
      return `This rule affects similar ${selectorBlockType ?? "matching"} blocks in the ${view} output for this import.`;
    case "prefix_before_colon":
      return `This rule affects similar label-style prefixes in the ${view} output for this import.`;
    case "markdown_table":
      return "This rule affects matching Markdown tables in this import.";
    default:
      return exactLabel;
  }
}
