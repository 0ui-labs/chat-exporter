import { describe, expect, test } from "vitest";
import { getAdjustableViews } from "./types";

describe("getAdjustableViews", () => {
  test("contains reader and markdown", () => {
    const adjustableViews = getAdjustableViews();
    expect(adjustableViews.has("reader")).toBe(true);
    expect(adjustableViews.has("markdown")).toBe(true);
  });

  test("does not contain non-adjustable formats", () => {
    const adjustableViews = getAdjustableViews();
    expect(adjustableViews.has("json")).toBe(false);
    expect(adjustableViews.has("handover")).toBe(false);
  });

  test("is derived from defaultRegistry, not hardcoded", async () => {
    const { defaultRegistry } = await import("@chat-exporter/shared");
    const registryAdjustableIds = defaultRegistry
      .getAdjustable()
      .map((f) => f.id);

    const adjustableViews = getAdjustableViews();
    for (const id of registryAdjustableIds) {
      expect(adjustableViews.has(id)).toBe(true);
    }
    expect(adjustableViews.size).toBe(registryAdjustableIds.length);
  });
});
