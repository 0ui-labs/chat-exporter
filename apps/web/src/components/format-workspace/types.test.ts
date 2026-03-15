import { describe, expect, test } from "vitest";
import { adjustableViews } from "./types";

describe("adjustableViews", () => {
  test("contains reader and markdown", () => {
    expect(adjustableViews.has("reader")).toBe(true);
    expect(adjustableViews.has("markdown")).toBe(true);
  });

  test("does not contain non-adjustable formats", () => {
    expect(adjustableViews.has("json")).toBe(false);
    expect(adjustableViews.has("handover")).toBe(false);
  });

  test("is derived from defaultRegistry, not hardcoded", async () => {
    const { defaultRegistry } = await import("@chat-exporter/shared");
    const registryAdjustableIds = defaultRegistry
      .getAdjustable()
      .map((f) => f.id);

    for (const id of registryAdjustableIds) {
      expect(adjustableViews.has(id)).toBe(true);
    }
    expect(adjustableViews.size).toBe(registryAdjustableIds.length);
  });
});
