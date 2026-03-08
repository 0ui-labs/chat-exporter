import { getBlockTypeLabel, getViewLabel } from "@/components/format-workspace/labels";
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
  const viewLabel = getViewLabel(view);
  const blockLabel = selectorBlockType ? getBlockTypeLabel(selectorBlockType) : null;

  switch (strategy) {
    case "block_type":
      return blockLabel
        ? `Diese Regel wirkt auf ähnliche Blöcke vom Typ ${blockLabel} in der ${viewLabel}-Ausgabe dieses Imports.`
        : `Diese Regel wirkt auf ähnliche Blöcke in der ${viewLabel}-Ausgabe dieses Imports.`;
    case "prefix_before_colon":
      return `Diese Regel wirkt auf ähnliche labelartige Präfixe in der ${viewLabel}-Ausgabe dieses Imports.`;
    case "markdown_table":
      return "Diese Regel wirkt auf passende Markdown-Tabellen in diesem Import.";
    default:
      return exactLabel;
  }
}
