import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  describe("destructive variant", () => {
    test("renders with red background classes", () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole("button", { name: "Delete" });

      expect(button.className).toContain("bg-red-500");
      expect(button.className).toContain("text-white");
    });

    test("includes hover state class", () => {
      render(<Button variant="destructive">Remove</Button>);

      const button = screen.getByRole("button", { name: "Remove" });

      expect(button.className).toContain("hover:bg-red-600");
    });

    test("includes focus-visible ring class", () => {
      render(<Button variant="destructive">Confirm</Button>);

      const button = screen.getByRole("button", { name: "Confirm" });

      expect(button.className).toContain("focus-visible:ring-red-500");
    });
  });

  describe("destructive-outline variant", () => {
    test("renders with red border and text classes", () => {
      render(<Button variant="destructive-outline">Cancel</Button>);

      const button = screen.getByRole("button", { name: "Cancel" });

      expect(button.className).toContain("border-red-300");
      expect(button.className).toContain("text-red-600");
    });

    test("includes hover state classes", () => {
      render(<Button variant="destructive-outline">Undo</Button>);

      const button = screen.getByRole("button", { name: "Undo" });

      expect(button.className).toContain("hover:bg-red-50");
      expect(button.className).toContain("hover:text-red-700");
    });
  });
});
