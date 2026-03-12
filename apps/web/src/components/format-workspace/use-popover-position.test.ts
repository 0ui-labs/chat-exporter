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

  it("positions with bottom edge above the anchor (stable top for translateY(-100%))", () => {
    const anchor = { top: 300, left: 200 };
    const result = getPopoverPosition(anchor, container, 0);

    // top = anchor.top - gap = 300 - 12 = 288
    expect(result.top).toBe(288);
    expect(result.left).toBe(200);
  });

  it("clamps left to the margin", () => {
    const anchor = { top: 300, left: 5 };
    const result = getPopoverPosition(anchor, container, 0);

    expect(result.left).toBe(16); // margin
  });

  it("clamps left so popover stays within container", () => {
    const anchor = { top: 300, left: 750 };
    const result = getPopoverPosition(anchor, container, 0);

    // maxWidth = min(448, 800-32) = 448, max left = 800 - 448 - 16 = 336
    expect(result.left).toBe(336);
  });

  it("provides maxHeight to prevent overflow above visible area", () => {
    const anchor = { top: 100, left: 200 };
    const result = getPopoverPosition(anchor, container, 0);

    // top = 100 - 12 = 88, maxHeight = max(200, 88 - 0 - 16) = max(200, 72) = 200
    expect(result.maxHeight).toBe(200);
  });

  it("accounts for containerScrollTop in maxHeight", () => {
    const anchor = { top: 500, left: 200 };
    const result = getPopoverPosition(anchor, container, 200);

    // top = 500 - 12 = 488, maxHeight = max(200, 488 - 200 - 16) = max(200, 272) = 272
    expect(result.maxHeight).toBe(272);
  });

  it("computes maxWidth respecting container width", () => {
    const anchor = { top: 300, left: 200 };
    const result = getPopoverPosition(anchor, container, 0);

    // min(448, 800 - 32) = 448
    expect(result.maxWidth).toBe(448);
  });

  it("limits maxWidth for narrow containers", () => {
    const narrowContainer = { width: 300, height: 600 };
    const anchor = { top: 300, left: 100 };
    const result = getPopoverPosition(anchor, narrowContainer, 0);

    // min(448, 300 - 32) = 268
    expect(result.maxWidth).toBe(268);
  });
});
