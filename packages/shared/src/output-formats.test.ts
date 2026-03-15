import { describe, expect, test } from "vitest";

import {
  adjustmentTargetFormatSchema,
  ruleEffectSchema,
} from "./adjustments.js";
import {
  BUILTIN_FORMATS,
  defaultRegistry,
  FormatRegistry,
  type OutputFormatDescriptor,
} from "./output-formats.js";

// ---------------------------------------------------------------------------
// Step 0 — Dead enum values removed
// ---------------------------------------------------------------------------

describe("adjustmentTargetFormatSchema (cleaned)", () => {
  test("accepts valid format values", () => {
    for (const value of ["reader", "markdown", "handover", "json"]) {
      expect(adjustmentTargetFormatSchema.safeParse(value).success).toBe(true);
    }
  });

  test("rejects removed enum values", () => {
    for (const value of ["html", "rich_text", "clipboard_html"]) {
      expect(adjustmentTargetFormatSchema.safeParse(value).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Step 1 — OutputFormatDescriptor interface (tested via BUILTIN_FORMATS)
// ---------------------------------------------------------------------------

describe("BUILTIN_FORMATS", () => {
  test("contains exactly 4 formats", () => {
    expect(BUILTIN_FORMATS).toHaveLength(4);
  });

  test("all IDs are unique", () => {
    const ids = BUILTIN_FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("reader and markdown are adjustable", () => {
    const reader = BUILTIN_FORMATS.find((f) => f.id === "reader");
    const markdown = BUILTIN_FORMATS.find((f) => f.id === "markdown");
    expect(reader?.adjustable).toBe(true);
    expect(markdown?.adjustable).toBe(true);
  });

  test("handover and json are not adjustable", () => {
    const handover = BUILTIN_FORMATS.find((f) => f.id === "handover");
    const json = BUILTIN_FORMATS.find((f) => f.id === "json");
    expect(handover?.adjustable).toBe(false);
    expect(json?.adjustable).toBe(false);
  });

  test("adjustable formats include custom_style in supportedRuleKinds", () => {
    for (const format of BUILTIN_FORMATS.filter((f) => f.adjustable)) {
      expect(format.supportedRuleKinds).toContain("custom_style");
    }
  });

  test("all supportedRuleKinds are valid RuleEffect types", () => {
    const validTypes = ruleEffectSchema.options.map(
      (s) => s.shape.type._def.value,
    );

    for (const format of BUILTIN_FORMATS) {
      for (const kind of format.supportedRuleKinds) {
        expect(validTypes).toContain(kind);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Step 3 — FormatRegistry
// ---------------------------------------------------------------------------

describe("FormatRegistry", () => {
  const testFormat: OutputFormatDescriptor = {
    id: "test-format",
    label: "Test Format",
    adjustable: true,
    supportedRuleKinds: ["custom_style"],
    exportMimeType: "text/plain",
    exportExtension: ".txt",
  };

  test("register and get a format", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat);
    expect(registry.get("test-format")).toEqual(testFormat);
  });

  test("throws on duplicate IDs", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat);
    expect(() => registry.register(testFormat)).toThrow(
      'Format "test-format" is already registered.',
    );
  });

  test("get returns undefined for unknown ID", () => {
    const registry = new FormatRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  test("getAll returns all registered formats", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat);
    registry.register({ ...testFormat, id: "other", label: "Other" });
    expect(registry.getAll()).toHaveLength(2);
  });

  test("getAdjustable returns only adjustable formats", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat); // adjustable: true
    registry.register({
      ...testFormat,
      id: "non-adjustable",
      label: "Non-Adj",
      adjustable: false,
    });

    const adjustable = registry.getAdjustable();
    expect(adjustable).toHaveLength(1);
    expect(adjustable[0]?.id).toBe("test-format");
  });

  test("supportsRuleKind returns true for supported kind", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat);
    expect(registry.supportsRuleKind("test-format", "custom_style")).toBe(true);
  });

  test("supportsRuleKind returns false for unsupported kind", () => {
    const registry = new FormatRegistry();
    registry.register(testFormat);
    expect(
      registry.supportsRuleKind("test-format", "adjust_block_spacing"),
    ).toBe(false);
  });

  test("supportsRuleKind returns false for unknown format", () => {
    const registry = new FormatRegistry();
    expect(registry.supportsRuleKind("unknown", "custom_style")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defaultRegistry
// ---------------------------------------------------------------------------

describe("defaultRegistry", () => {
  test("contains all 4 built-in formats", () => {
    expect(defaultRegistry.getAll()).toHaveLength(4);
  });

  test("can retrieve each built-in format by ID", () => {
    for (const format of BUILTIN_FORMATS) {
      expect(defaultRegistry.get(format.id)).toEqual(format);
    }
  });

  test("getAdjustable returns reader and markdown", () => {
    const adjustable = defaultRegistry.getAdjustable();
    const ids = adjustable.map((f) => f.id);
    expect(ids).toContain("reader");
    expect(ids).toContain("markdown");
    expect(ids).toHaveLength(2);
  });

  test("supportsRuleKind works for reader + custom_style", () => {
    expect(defaultRegistry.supportsRuleKind("reader", "custom_style")).toBe(
      true,
    );
  });

  test("supportsRuleKind returns false for json + custom_style", () => {
    expect(defaultRegistry.supportsRuleKind("json", "custom_style")).toBe(
      false,
    );
  });
});
