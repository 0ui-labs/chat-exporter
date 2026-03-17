import { describe, expect, test } from "vitest";
import type { DomKit } from "./parser-dom-kit.js";
import { DOM_KIT_SCRIPT } from "./parser-dom-kit.js";

describe("parser-dom-kit", () => {
  describe("DOM_KIT_SCRIPT", () => {
    test("is a non-empty string", () => {
      expect(typeof DOM_KIT_SCRIPT).toBe("string");
      expect(DOM_KIT_SCRIPT.length).toBeGreaterThan(0);
    });

    test("starts with an IIFE", () => {
      expect(DOM_KIT_SCRIPT.trimStart()).toMatch(/^\(function\(\)/);
    });

    test("ends the IIFE with invocation and semicolon", () => {
      expect(DOM_KIT_SCRIPT.trimEnd()).toMatch(/\}\)\(\);$/);
    });
  });

  describe("contains all expected function names", () => {
    test.each([
      "normalizeWhitespace",
      "inlineText",
      "inlineFromElement",
      "extractListItems",
      "detectCodeLanguage",
      "extractCodeText",
      "extractTable",
      "elementToBlocks",
    ])("contains function %s", (fnName) => {
      expect(DOM_KIT_SCRIPT).toContain(`function ${fnName}`);
    });
  });

  describe("contains all expected tag sets", () => {
    test.each([
      "wrapperTags",
      "blockTags",
      "codeLanguageLabels",
    ])("contains tag set %s", (setName) => {
      expect(DOM_KIT_SCRIPT).toContain(setName);
    });
  });

  describe("exposes all helpers on globalThis.__domKit", () => {
    test("assigns to globalThis.__domKit", () => {
      expect(DOM_KIT_SCRIPT).toContain("globalThis.__domKit");
    });

    test.each([
      "wrapperTags",
      "blockTags",
      "codeLanguageLabels",
      "normalizeWhitespace",
      "inlineText",
      "inlineFromElement",
      "extractListItems",
      "detectCodeLanguage",
      "extractCodeText",
      "extractTable",
      "elementToBlocks",
    ])("exports %s on __domKit", (name) => {
      const assignmentPattern = new RegExp(
        `globalThis\\.__domKit\\s*=\\s*\\{[^}]*${name}`,
      );
      expect(DOM_KIT_SCRIPT).toMatch(assignmentPattern);
    });
  });

  describe("DomKit interface", () => {
    test("is importable as a type", () => {
      // Type-level check: if this compiles, the interface is exported
      const _typeCheck: DomKit | undefined = undefined;
      expect(_typeCheck).toBeUndefined();
    });
  });

  describe("string escaping correctness", () => {
    test("regex unicode escape is double-escaped for string context", () => {
      expect(DOM_KIT_SCRIPT).toContain("\\u00a0");
    });

    test("regex character classes are properly escaped", () => {
      expect(DOM_KIT_SCRIPT).toContain("\\t");
      expect(DOM_KIT_SCRIPT).toContain("\\f");
      expect(DOM_KIT_SCRIPT).toContain("\\v");
    });

    test("newline literals in regex are escaped", () => {
      expect(DOM_KIT_SCRIPT).toContain("\\n");
    });
  });

  describe("script is valid JavaScript", () => {
    test("can be parsed by Function constructor without syntax errors", () => {
      // This validates the string is syntactically valid JavaScript.
      // The Function constructor parses but does not execute the code here.
      // biome-ignore lint/security/noGlobalEval: test-only validation of generated JS string
      expect(() => new Function(DOM_KIT_SCRIPT)).not.toThrow();
    });
  });
});
