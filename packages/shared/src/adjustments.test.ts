import { describe, expect, test } from "vitest";

import {
  adjustmentSessionStatusSchema,
  blockTypeSelectorSchema,
  compoundSelectorSchema,
  customStyleEffectSchema,
  exactReaderSelectorSchema,
  normalizeLegacyEffect,
  type RuleEffect,
  readerPrefixSelectorSchema,
  readerRuleSelectorSchema,
} from "./adjustments.js";

// ---------------------------------------------------------------------------
// compoundSelectorSchema
// ---------------------------------------------------------------------------

describe("compoundSelectorSchema", () => {
  test("accepts minimal compound selector (strategy only)", () => {
    const result = compoundSelectorSchema.safeParse({ strategy: "compound" });
    expect(result.success).toBe(true);
  });

  test("accepts compound with all block-filter fields", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      blockType: "paragraph",
      messageRole: "assistant",
      headingLevel: 2,
      position: "first",
      textPattern: "^Introduction",
    });
    expect(result.success).toBe(true);
  });

  test("accepts compound with context.previousSibling", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      context: {
        previousSibling: { blockType: "heading", headingLevel: 1 },
      },
    });
    expect(result.success).toBe(true);
  });

  test("accepts compound with context.nextSibling", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      context: {
        nextSibling: { blockType: "code_block", textPattern: "import" },
      },
    });
    expect(result.success).toBe(true);
  });

  test("accepts compound with full context (both siblings)", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      blockType: "paragraph",
      context: {
        previousSibling: { blockType: "heading" },
        nextSibling: { blockType: "list" },
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects headingLevel > 6", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      headingLevel: 7,
    });
    expect(result.success).toBe(false);
  });

  test("rejects headingLevel < 1", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      headingLevel: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid messageRole", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      messageRole: "moderator",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid position", () => {
    const result = compoundSelectorSchema.safeParse({
      strategy: "compound",
      position: "middle",
    });
    expect(result.success).toBe(false);
  });

  test("existing selectors still parse (backward compatible)", () => {
    expect(
      exactReaderSelectorSchema.safeParse({
        strategy: "exact",
        messageId: "m1",
        blockIndex: 0,
        blockType: "paragraph",
      }).success,
    ).toBe(true);

    expect(
      blockTypeSelectorSchema.safeParse({
        strategy: "block_type",
        blockType: "heading",
      }).success,
    ).toBe(true);

    expect(
      readerPrefixSelectorSchema.safeParse({
        strategy: "prefix_before_colon",
        blockType: "paragraph",
      }).success,
    ).toBe(true);
  });

  test("readerRuleSelectorSchema accepts compound selectors", () => {
    const result = readerRuleSelectorSchema.safeParse({
      strategy: "compound",
      blockType: "list",
      messageRole: "assistant",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// customStyleEffectSchema
// ---------------------------------------------------------------------------

describe("customStyleEffectSchema", () => {
  test("accepts new fields headingLevel, insertBefore, insertAfter", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
      containerStyle: { paddingLeft: "2rem" },
      headingLevel: 3,
      insertBefore: "hr",
      insertAfter: "spacer",
    });
    expect(result.success).toBe(true);
  });

  test("rejects headingLevel > 6", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
      headingLevel: 7,
    });
    expect(result.success).toBe(false);
  });

  test("rejects headingLevel < 1", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
      headingLevel: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid insertBefore value", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
      insertBefore: "div",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid insertAfter value", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
      insertAfter: "br",
    });
    expect(result.success).toBe(false);
  });

  test("accepts minimal custom_style with only type", () => {
    const result = customStyleEffectSchema.safeParse({
      type: "custom_style",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeLegacyEffect
// ---------------------------------------------------------------------------

describe("normalizeLegacyEffect", () => {
  test("converts adjust_block_spacing to custom_style", () => {
    const legacy: RuleEffect = {
      type: "adjust_block_spacing",
      amount: "lg",
      direction: "after",
    };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.containerStyle).toBeDefined();
    expect(result.containerStyle?.marginBottom).toBe("2rem");
  });

  test("converts adjust_block_spacing sm/md amounts", () => {
    const sm = normalizeLegacyEffect({
      type: "adjust_block_spacing",
      amount: "sm",
      direction: "after",
    } as RuleEffect);
    expect(sm.containerStyle?.marginBottom).toBe("1rem");

    const md = normalizeLegacyEffect({
      type: "adjust_block_spacing",
      amount: "md",
      direction: "after",
    } as RuleEffect);
    expect(md.containerStyle?.marginBottom).toBe("1.5rem");
  });

  test("converts increase_heading_emphasis to custom_style", () => {
    const legacy: RuleEffect = {
      type: "increase_heading_emphasis",
      amount: "md",
    };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.textStyle).toBeDefined();
    expect(result.textStyle?.fontSize).toBe("1.125rem");
    expect(result.textStyle?.fontWeight).toBe("600");
  });

  test("converts refine_selected_block_presentation to custom_style", () => {
    const legacy: RuleEffect = {
      type: "refine_selected_block_presentation",
      emphasis: "balanced",
    };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.containerStyle).toBeDefined();
  });

  test("converts bold_prefix_before_colon to custom_style", () => {
    const legacy: RuleEffect = { type: "bold_prefix_before_colon" };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.textTransform).toBe("bold_prefix_before_colon");
  });

  test("converts render_markdown_strong to custom_style", () => {
    const legacy: RuleEffect = { type: "render_markdown_strong" };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.textTransform).toBe("render_markdown_strong");
  });

  test("converts promote_to_heading to custom_style", () => {
    const legacy: RuleEffect = { type: "promote_to_heading", level: 2 };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.markdownTransform).toBe("promote_to_heading");
  });

  test("converts normalize_list_structure to custom_style", () => {
    const legacy: RuleEffect = { type: "normalize_list_structure" };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.markdownTransform).toBe("normalize_list_structure");
  });

  test("converts normalize_markdown_table to custom_style", () => {
    const legacy: RuleEffect = { type: "normalize_markdown_table" };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.markdownTransform).toBe("normalize_markdown_table");
  });

  test("converts reshape_markdown_block to custom_style", () => {
    const legacy: RuleEffect = { type: "reshape_markdown_block" };
    const result = normalizeLegacyEffect(legacy);
    expect(result.type).toBe("custom_style");
    expect(result.markdownTransform).toBe("reshape_markdown_block");
  });

  test("returns custom_style unchanged", () => {
    const effect: RuleEffect = {
      type: "custom_style",
      containerStyle: { color: "red" },
    };
    const result = normalizeLegacyEffect(effect);
    expect(result).toEqual(effect);
  });
});

// ---------------------------------------------------------------------------
// adjustmentSessionStatusSchema — kein preview_ready
// ---------------------------------------------------------------------------

describe("adjustmentSessionStatusSchema", () => {
  test("accepts open, applied, discarded, failed", () => {
    for (const status of ["open", "applied", "discarded", "failed"]) {
      expect(adjustmentSessionStatusSchema.safeParse(status).success).toBe(
        true,
      );
    }
  });

  test("rejects preview_ready", () => {
    expect(
      adjustmentSessionStatusSchema.safeParse("preview_ready").success,
    ).toBe(false);
  });
});
