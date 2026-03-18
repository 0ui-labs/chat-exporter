// @vitest-environment node
import { describe, expect, test } from "vitest";

import { getStageProgress } from "./stage-progress";

describe("getStageProgress", () => {
  test.each([
    { status: "queued", currentStage: "validate", expected: 0 },
    { status: "running", currentStage: "validate", expected: 10 },
    { status: "running", currentStage: "fetch", expected: 25 },
    { status: "running", currentStage: "extract", expected: 45 },
    { status: "running", currentStage: "normalize", expected: 60 },
    { status: "running", currentStage: "structure", expected: 75 },
    { status: "running", currentStage: "render", expected: 90 },
    { status: "running", currentStage: "done", expected: 100 },
    { status: "completed", currentStage: "done", expected: 100 },
    { status: "completed", currentStage: "validate", expected: 100 },
  ] as const)("returns $expected for status=$status stage=$currentStage", ({
    status,
    currentStage,
    expected,
  }) => {
    const job = { status, currentStage } as const;

    const result = getStageProgress(job);

    expect(result).toBe(expected);
  });

  test("returns 0 for unknown stage", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing unknown stage fallback
    const job = { status: "running" as const, currentStage: "unknown" as any };

    const result = getStageProgress(job);

    expect(result).toBe(0);
  });

  test("returns stage progress for failed status", () => {
    const job = { status: "failed" as const, currentStage: "extract" as const };

    const result = getStageProgress(job);

    expect(result).toBe(45);
  });
});
