import type {
  AdjustmentTargetFormat,
  AdjustmentSelection as SharedAdjustmentSelection,
} from "@chat-exporter/shared";

export type ViewMode = Extract<
  AdjustmentTargetFormat,
  "reader" | "markdown" | "handover" | "json"
>;

export type AdjustmentSelection = SharedAdjustmentSelection;

/**
 * Viewport-relative anchor coordinates as returned by `getBoundingClientRect()`.
 * Produced by child views (`ReaderView`, `MarkdownView`) and converted to
 * `FloatingAdjustmentAnchor` (container-relative) in `FormatWorkspace`.
 */
export type ViewportAnchor = {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
};

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
