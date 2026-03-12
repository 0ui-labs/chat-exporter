import { describe, expect, test } from "vitest";

import {
  SELECTION_DEBOUNCE_MS,
  TEXT_PREVIEW_LIMIT,
  TEXT_TRUNCATION_LIMIT,
} from "./constants";

describe("format-workspace constants", () => {
  test("TEXT_TRUNCATION_LIMIT is 180", () => {
    expect(TEXT_TRUNCATION_LIMIT).toBe(180);
  });

  test("TEXT_PREVIEW_LIMIT is 177", () => {
    expect(TEXT_PREVIEW_LIMIT).toBe(177);
  });

  test("SELECTION_DEBOUNCE_MS is 250", () => {
    expect(SELECTION_DEBOUNCE_MS).toBe(250);
  });

  test("TEXT_PREVIEW_LIMIT is less than TEXT_TRUNCATION_LIMIT", () => {
    expect(TEXT_PREVIEW_LIMIT).toBeLessThan(TEXT_TRUNCATION_LIMIT);
  });
});
