import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useElementScreenshot } from "./use-element-screenshot";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(),
}));

import { toPng } from "html-to-image";

const mockToPng = vi.mocked(toPng);

describe("useElementScreenshot", () => {
  test("returns a capture function", () => {
    const { result } = renderHook(() => useElementScreenshot());

    expect(result.current.capture).toBeTypeOf("function");
  });

  test("capture() calls toPng with correct options (width capped at 800, pixelRatio: 1)", async () => {
    const fakeElement = {
      scrollWidth: 1200,
    } as HTMLElement;

    mockToPng.mockResolvedValue("data:image/png;base64,abc123");

    const { result } = renderHook(() => useElementScreenshot());
    await result.current.capture(fakeElement);

    expect(mockToPng).toHaveBeenCalledWith(fakeElement, {
      width: 800,
      pixelRatio: 1,
      cacheBust: true,
    });
  });

  test("capture() uses element scrollWidth when under 800px", async () => {
    const fakeElement = {
      scrollWidth: 500,
    } as HTMLElement;

    mockToPng.mockResolvedValue("data:image/png;base64,abc123");

    const { result } = renderHook(() => useElementScreenshot());
    await result.current.capture(fakeElement);

    expect(mockToPng).toHaveBeenCalledWith(fakeElement, {
      width: 500,
      pixelRatio: 1,
      cacheBust: true,
    });
  });

  test("capture() returns base64 string without data URL prefix", async () => {
    const fakeElement = {
      scrollWidth: 600,
    } as HTMLElement;

    mockToPng.mockResolvedValue("data:image/png;base64,SGVsbG8gV29ybGQ=");

    const { result } = renderHook(() => useElementScreenshot());
    const base64 = await result.current.capture(fakeElement);

    expect(base64).toBe("SGVsbG8gV29ybGQ=");
  });
});
