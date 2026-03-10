import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { formatRelativeTime } from "./relative-time";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns 'gerade eben' for times less than a minute ago", () => {
    const result = formatRelativeTime("2026-03-10T11:59:30.000Z");

    expect(result).toBe("gerade eben");
  });

  test("returns minutes for times less than an hour ago", () => {
    const result = formatRelativeTime("2026-03-10T11:45:00.000Z");

    expect(result).toBe("vor 15 Min.");
  });

  test("returns hours for times less than a day ago", () => {
    const result = formatRelativeTime("2026-03-10T09:00:00.000Z");

    expect(result).toBe("vor 3 Std.");
  });

  test("returns 'gestern' for times between 1-2 days ago", () => {
    const result = formatRelativeTime("2026-03-09T10:00:00.000Z");

    expect(result).toBe("gestern");
  });

  test("returns days for times less than 30 days ago", () => {
    const result = formatRelativeTime("2026-03-03T12:00:00.000Z");

    expect(result).toBe("vor 7 Tagen");
  });

  test("returns formatted date for times older than 30 days", () => {
    const result = formatRelativeTime("2026-01-15T12:00:00.000Z");

    expect(result).toBe("15.01.2026");
  });
});
