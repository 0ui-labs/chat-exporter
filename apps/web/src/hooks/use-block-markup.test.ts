import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useBlockMarkup } from "./use-block-markup";

describe("useBlockMarkup", () => {
  test("returns getMarkup function", () => {
    const { result } = renderHook(() =>
      useBlockMarkup({ element: null, targetFormat: "reader" }),
    );

    expect(result.current.getMarkup).toBeTypeOf("function");
  });

  test("returns innerHTML for reader format blocks", () => {
    const mockElement = {
      innerHTML: "<strong>Hello</strong> world",
    } as unknown as HTMLElement;

    const { result } = renderHook(() =>
      useBlockMarkup({ element: mockElement, targetFormat: "reader" }),
    );

    expect(result.current.getMarkup()).toBe("<strong>Hello</strong> world");
  });

  test("returns markdown source string for markdown format when provided", () => {
    const mockElement = {
      innerHTML: "<strong>Hello</strong> world",
    } as unknown as HTMLElement;

    const { result } = renderHook(() =>
      useBlockMarkup({
        element: mockElement,
        targetFormat: "markdown",
        markdownSource: "**Hello** world",
      }),
    );

    expect(result.current.getMarkup()).toBe("**Hello** world");
  });

  test("returns empty string when element is null", () => {
    const { result } = renderHook(() =>
      useBlockMarkup({ element: null, targetFormat: "reader" }),
    );

    expect(result.current.getMarkup()).toBe("");
  });

  test("falls back to innerHTML when markdown format but no source provided", () => {
    const mockElement = {
      innerHTML: "<em>fallback</em>",
    } as unknown as HTMLElement;

    const { result } = renderHook(() =>
      useBlockMarkup({ element: mockElement, targetFormat: "markdown" }),
    );

    expect(result.current.getMarkup()).toBe("<em>fallback</em>");
  });
});
