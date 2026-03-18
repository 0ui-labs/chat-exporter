// @vitest-environment node
import { describe, expect, test } from "vitest";
import { getStatusVariant } from "./status-variant";

describe("getStatusVariant", () => {
  test.each([
    ["completed", "success"],
    ["failed", "error"],
    ["running", "warning"],
    ["queued", "info"],
  ] as const)("maps '%s' status to '%s' badge variant", (status, expected) => {
    expect(getStatusVariant(status)).toBe(expected);
  });
});
