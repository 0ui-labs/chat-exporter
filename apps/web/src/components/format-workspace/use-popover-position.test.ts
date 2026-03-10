import { describe, expect, it } from "vitest";
import { clamp, getPopoverPosition } from "./use-popover-position";

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("returns max when value is above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns min when max <= min", () => {
    expect(clamp(5, 10, 10)).toBe(10);
    expect(clamp(5, 10, 3)).toBe(10);
  });
});

describe("getPopoverPosition", () => {
  const container = { width: 800, height: 600 };

  it("positions above the anchor with a gap", () => {
    const anchor = { top: 300, left: 200 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    // preferredTop = 300 - 100 - 12 = 188
    expect(result.top).toBe(188);
    expect(result.left).toBe(200);
  });

  it("clamps left to the margin", () => {
    const anchor = { top: 300, left: 5 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    expect(result.left).toBe(16); // margin
  });

  it("clamps left so popover stays within container", () => {
    const anchor = { top: 300, left: 750 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    // max left = 800 - 320 - 16 = 464
    expect(result.left).toBe(464);
  });

  it("clamps top to prevent going above container scroll area", () => {
    const anchor = { top: 20, left: 200 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    // preferredTop = 20 - 100 - 12 = -92, clamped to 0 + 16 = 16
    expect(result.top).toBe(16);
  });

  it("accounts for containerScrollTop", () => {
    const anchor = { top: 50, left: 200 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 200);

    // preferredTop = 50 - 100 - 12 = -62
    // min = 200 + 16 = 216
    expect(result.top).toBe(216);
  });

  it("computes maxWidth respecting container width", () => {
    const anchor = { top: 300, left: 200 };
    const dimensions = { height: 100, width: 320 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    // min(352, 800 - 32) = 352
    expect(result.maxWidth).toBe(352);
  });

  it("limits maxWidth for narrow containers", () => {
    const narrowContainer = { width: 300, height: 600 };
    const anchor = { top: 300, left: 100 };
    const dimensions = { height: 100, width: 250 };
    const result = getPopoverPosition(anchor, dimensions, narrowContainer, 0);

    // min(352, 300 - 32) = 268
    expect(result.maxWidth).toBe(268);
  });

  it("uses maxWidth when dimensions.width is 0", () => {
    const anchor = { top: 300, left: 200 };
    const dimensions = { height: 100, width: 0 };
    const result = getPopoverPosition(anchor, dimensions, container, 0);

    // width fallback = maxWidth = 352, left clamped to max = 800 - 352 - 16 = 432
    expect(result.left).toBe(200); // 200 < 432 so no clamp
  });
});
