// @vitest-environment node
import { describe, expect, test } from "vitest";
import { badgeVariants } from "./badge";

describe("Badge", () => {
  describe("success variant", () => {
    test("includes emerald border, background, and text classes", () => {
      const classes = badgeVariants({ variant: "success" });

      expect(classes).toContain("border-emerald-200");
      expect(classes).toContain("bg-emerald-50");
      expect(classes).toContain("text-emerald-700");
    });
  });

  describe("error variant", () => {
    test("includes red border, background, and text classes", () => {
      const classes = badgeVariants({ variant: "error" });

      expect(classes).toContain("border-red-200");
      expect(classes).toContain("bg-red-50");
      expect(classes).toContain("text-red-700");
    });
  });

  describe("warning variant", () => {
    test("includes amber border, background, and text classes", () => {
      const classes = badgeVariants({ variant: "warning" });

      expect(classes).toContain("border-amber-200");
      expect(classes).toContain("bg-amber-50");
      expect(classes).toContain("text-amber-700");
    });
  });

  describe("info variant", () => {
    test("includes blue border, background, and text classes", () => {
      const classes = badgeVariants({ variant: "info" });

      expect(classes).toContain("border-blue-200");
      expect(classes).toContain("bg-blue-50");
      expect(classes).toContain("text-blue-700");
    });
  });
});
