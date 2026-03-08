import type {
  AdjustmentSelection as SharedAdjustmentSelection,
  AdjustmentTargetFormat
} from "@chat-exporter/shared";

export type ViewMode = Extract<
  AdjustmentTargetFormat,
  "reader" | "markdown" | "handover" | "json"
>;

export type AdjustmentSelection = SharedAdjustmentSelection;

export type FloatingAdjustmentAnchor = {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
};
