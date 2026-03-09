import type {
  AdjustmentSelection as SharedAdjustmentSelection,
  AdjustmentTargetFormat
} from "@chat-exporter/shared";

export type ViewMode = Extract<
  AdjustmentTargetFormat,
  "reader" | "markdown" | "handover" | "json"
>;

export type AdjustmentSelection = SharedAdjustmentSelection;

/**
 * Anchor coordinates for the floating adjustment popover.
 * All positional values (`top`, `bottom`, `left`) are **container-relative**,
 * i.e. relative to the `<section>` element rendered by `FormatWorkspace`,
 * not to the viewport.
 */
export type FloatingAdjustmentAnchor = {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
};
