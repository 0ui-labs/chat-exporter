import { afterEach, describe, expect, test, vi } from "vitest";

// Hoist mock variables so they're available when vi.mock factories run
const { mockContext, mockAcquireContext, mockReleaseContext } = vi.hoisted(
  () => {
    const mockContext = {
      close: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn(),
    };

    return {
      mockContext,
      mockAcquireContext: vi.fn().mockResolvedValue(mockContext),
      mockReleaseContext: vi.fn().mockResolvedValue(undefined),
    };
  },
);

vi.mock("./browser-pool.js", () => ({
  acquireContext: mockAcquireContext,
  releaseContext: mockReleaseContext,
}));

import {
  CANDIDATE_DEDUP_THRESHOLD,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DOM_CONTENT_LOADED_TIMEOUT_MS,
  FUNCTION_WAIT_TIMEOUT_MS,
  GOOGLE_CONSENT_BUTTON_TIMEOUT_MS,
  GOOGLE_CONSENT_DISMISS_MAX_ATTEMPTS,
  GOOGLE_CONSENT_POLLING_INTERVAL_MS,
  GOOGLE_CONSENT_REDIRECT_TIMEOUT_MS,
  GOOGLE_NAVIGATION_TIMEOUT_MS,
  MAX_CONTAINER_CANDIDATES,
  MAX_FALLBACK_CANDIDATES,
  MAX_FALLBACK_TEXT_LENGTH,
  MAX_HINT_CLASSES,
  MAX_HINT_DEPTH,
  MAX_PREVIEW_TEXT_LENGTH,
  MAX_SAMPLE_CHILDREN,
  MAX_TEXT_LENGTH_FOR_AVERAGING,
  MIN_CHILD_TEXT_LENGTH,
  MIN_CONTAINER_SCORE_THRESHOLD,
  MIN_CONTENT_TEXT_LENGTH,
  MIN_FALLBACK_TEXT_LENGTH,
  MIN_MEANINGFUL_CHILDREN,
  MIN_TEXT_LENGTH_FOR_MEANINGFUL_CHILDREN,
  NETWORK_IDLE_TIMEOUT_MS,
  PAGE_STABILIZATION_DELAY_MS,
  SCORE_ACTION_WEIGHT,
  SCORE_AVG_TEXT_DIVISOR,
  SCORE_AVG_TEXT_MAX,
  SCORE_BLOCK_WEIGHT,
  SCORE_CHILDREN_WEIGHT,
  SCORE_DEPTH_PENALTY,
  SCORE_FORM_PENALTY,
  SCORE_HINTED_WEIGHT,
  SCORE_TAG_RATIO_WEIGHT,
} from "./unknown-share-import.js";

describe("unknown-share-import constants", () => {
  describe("Navigation Timeouts", () => {
    test.each([
      [
        "GOOGLE_CONSENT_BUTTON_TIMEOUT_MS",
        GOOGLE_CONSENT_BUTTON_TIMEOUT_MS,
        10_000,
      ],
      ["GOOGLE_NAVIGATION_TIMEOUT_MS", GOOGLE_NAVIGATION_TIMEOUT_MS, 60_000],
      ["DEFAULT_NAVIGATION_TIMEOUT_MS", DEFAULT_NAVIGATION_TIMEOUT_MS, 30_000],
      ["DOM_CONTENT_LOADED_TIMEOUT_MS", DOM_CONTENT_LOADED_TIMEOUT_MS, 20_000],
      ["NETWORK_IDLE_TIMEOUT_MS", NETWORK_IDLE_TIMEOUT_MS, 5_000],
      ["PAGE_STABILIZATION_DELAY_MS", PAGE_STABILIZATION_DELAY_MS, 1_200],
      ["FUNCTION_WAIT_TIMEOUT_MS", FUNCTION_WAIT_TIMEOUT_MS, 20_000],
    ])("%s is exported with value %d", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe("Consent Handling", () => {
    test.each([
      [
        "GOOGLE_CONSENT_DISMISS_MAX_ATTEMPTS",
        GOOGLE_CONSENT_DISMISS_MAX_ATTEMPTS,
        60,
      ],
      [
        "GOOGLE_CONSENT_POLLING_INTERVAL_MS",
        GOOGLE_CONSENT_POLLING_INTERVAL_MS,
        250,
      ],
      [
        "GOOGLE_CONSENT_REDIRECT_TIMEOUT_MS",
        GOOGLE_CONSENT_REDIRECT_TIMEOUT_MS,
        15_000,
      ],
    ])("%s is exported with value %d", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe("Content Thresholds", () => {
    test.each([
      ["MIN_CONTENT_TEXT_LENGTH", MIN_CONTENT_TEXT_LENGTH, 32],
      ["MIN_MEANINGFUL_CHILDREN", MIN_MEANINGFUL_CHILDREN, 2],
      ["MIN_CHILD_TEXT_LENGTH", MIN_CHILD_TEXT_LENGTH, 2],
      [
        "MIN_TEXT_LENGTH_FOR_MEANINGFUL_CHILDREN",
        MIN_TEXT_LENGTH_FOR_MEANINGFUL_CHILDREN,
        40,
      ],
      ["MAX_SAMPLE_CHILDREN", MAX_SAMPLE_CHILDREN, 48],
      ["MAX_TEXT_LENGTH_FOR_AVERAGING", MAX_TEXT_LENGTH_FOR_AVERAGING, 4_000],
      ["MAX_CONTAINER_CANDIDATES", MAX_CONTAINER_CANDIDATES, 500],
    ])("%s is exported with value %d", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe("Scoring Weights", () => {
    test.each([
      ["SCORE_CHILDREN_WEIGHT", SCORE_CHILDREN_WEIGHT, 16],
      ["SCORE_TAG_RATIO_WEIGHT", SCORE_TAG_RATIO_WEIGHT, 12],
      ["SCORE_HINTED_WEIGHT", SCORE_HINTED_WEIGHT, 8],
      ["SCORE_BLOCK_WEIGHT", SCORE_BLOCK_WEIGHT, 4],
      ["SCORE_ACTION_WEIGHT", SCORE_ACTION_WEIGHT, 2],
      ["SCORE_AVG_TEXT_DIVISOR", SCORE_AVG_TEXT_DIVISOR, 35],
      ["SCORE_AVG_TEXT_MAX", SCORE_AVG_TEXT_MAX, 16],
      ["SCORE_DEPTH_PENALTY", SCORE_DEPTH_PENALTY, 1.5],
      ["SCORE_FORM_PENALTY", SCORE_FORM_PENALTY, 10],
      ["CANDIDATE_DEDUP_THRESHOLD", CANDIDATE_DEDUP_THRESHOLD, 0.95],
      ["MIN_CONTAINER_SCORE_THRESHOLD", MIN_CONTAINER_SCORE_THRESHOLD, 42],
    ])("%s is exported with value %s", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe("Fallback", () => {
    test.each([
      ["MIN_FALLBACK_TEXT_LENGTH", MIN_FALLBACK_TEXT_LENGTH, 12],
      ["MAX_FALLBACK_TEXT_LENGTH", MAX_FALLBACK_TEXT_LENGTH, 12_000],
      ["MAX_FALLBACK_CANDIDATES", MAX_FALLBACK_CANDIDATES, 64],
      ["MAX_PREVIEW_TEXT_LENGTH", MAX_PREVIEW_TEXT_LENGTH, 2_000],
    ])("%s is exported with value %d", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe("Hint Traversal", () => {
    test.each([
      ["MAX_HINT_DEPTH", MAX_HINT_DEPTH, 3],
      ["MAX_HINT_CLASSES", MAX_HINT_CLASSES, 24],
    ])("%s is exported with value %d", (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });
});

describe("importUnknownSharePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("acquires context from browser-pool instead of launching chromium", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importUnknownSharePage } = await import(
      "./unknown-share-import.js"
    );

    // Act
    await importUnknownSharePage("https://example.com/share/test", {
      sourcePlatform: "unknown",
    }).catch(() => {});

    // Assert
    expect(mockAcquireContext).toHaveBeenCalledOnce();
  });

  test("releases context in finally block on error path", async () => {
    // Arrange
    const mockPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://example.com/share/test"),
      content: vi.fn().mockResolvedValue("<html></html>"),
      evaluate: vi.fn().mockRejectedValue(new Error("stub: skip processing")),
    };
    mockContext.newPage.mockResolvedValue(mockPage);

    const { importUnknownSharePage } = await import(
      "./unknown-share-import.js"
    );

    // Act
    await importUnknownSharePage("https://example.com/share/test", {
      sourcePlatform: "unknown",
    }).catch(() => {});

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledOnce();
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });

  test("releases context even when page creation fails", async () => {
    // Arrange
    mockContext.newPage.mockRejectedValueOnce(
      new Error("page creation failed"),
    );

    const { importUnknownSharePage } = await import(
      "./unknown-share-import.js"
    );

    // Act
    await expect(
      importUnknownSharePage("https://example.com/share/test", {
        sourcePlatform: "unknown",
      }),
    ).rejects.toThrow("page creation failed");

    // Assert
    expect(mockReleaseContext).toHaveBeenCalledWith(mockContext);
  });
});
