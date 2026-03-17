// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { usePlaceholderRotation } from "./use-placeholder-rotation";

describe("usePlaceholderRotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const examples = [
    "https://chatgpt.com/share/abc123...",
    "https://claude.ai/share/xyz789...",
    "https://gemini.google.com/share/def456...",
  ];

  // The hook uses a 150ms fade-out delay before swapping the text,
  // so a full cycle needs intervalMs + 150ms to complete.
  const FADE_DELAY = 150;
  const INTERVAL = 4000;
  const FULL_CYCLE = INTERVAL + FADE_DELAY;

  test("returns the first example initially", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    expect(result.current.placeholder).toBe(examples[0]);
  });

  test("cycles to the next example after the interval plus fade delay", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE);
    });

    expect(result.current.placeholder).toBe(examples[1]);
  });

  test("sets visible to false during fade-out phase", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    // Advance to trigger the interval but not the inner setTimeout
    act(() => {
      vi.advanceTimersByTime(INTERVAL);
    });

    expect(result.current.visible).toBe(false);
    expect(result.current.placeholder).toBe(examples[0]);

    // Complete the fade
    act(() => {
      vi.advanceTimersByTime(FADE_DELAY);
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.placeholder).toBe(examples[1]);
  });

  test("wraps around to the first example after the last one", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE * 3);
    });

    expect(result.current.placeholder).toBe(examples[0]);
  });

  test("stops cycling when paused", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    act(() => {
      result.current.pause();
    });

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE * 3);
    });

    expect(result.current.placeholder).toBe(examples[0]);
  });

  test("resumes cycling from current position when unpaused", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE);
    });
    expect(result.current.placeholder).toBe(examples[1]);

    act(() => {
      result.current.pause();
    });

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE * 3);
    });
    expect(result.current.placeholder).toBe(examples[1]);

    act(() => {
      result.current.resume();
    });

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE);
    });
    expect(result.current.placeholder).toBe(examples[2]);
  });

  test("returns visible flag as true initially", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    expect(result.current.visible).toBe(true);
  });

  test("cleans up interval on unmount", () => {
    const { unmount } = renderHook(() =>
      usePlaceholderRotation(examples, INTERVAL),
    );

    unmount();

    // Should not throw — interval was cleared
    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE * 5);
    });
  });

  test("handles single-item array without cycling", () => {
    const { result } = renderHook(() =>
      usePlaceholderRotation(["only-one"], INTERVAL),
    );

    act(() => {
      vi.advanceTimersByTime(FULL_CYCLE * 3);
    });

    expect(result.current.placeholder).toBe("only-one");
  });
});
