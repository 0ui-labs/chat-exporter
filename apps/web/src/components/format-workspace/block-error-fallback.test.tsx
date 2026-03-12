// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockErrorFallback } from "./block-error-fallback";

describe("BlockErrorFallback", () => {
  it("renders the block type in the fallback text", () => {
    // Arrange
    render(<BlockErrorFallback blockType="CodeBlock" />);

    // Act
    const message = screen.getByText(
      /Block \u201ECodeBlock\u201C konnte nicht dargestellt werden\./,
    );

    // Assert
    expect(message).toBeInTheDocument();
  });

  it("applies the correct error styling classes", () => {
    // Arrange
    const { container } = render(<BlockErrorFallback blockType="TextBlock" />);

    // Act
    const div = container.firstElementChild as HTMLElement;

    // Assert
    expect(div).toHaveClass(
      "border",
      "border-red-300/40",
      "bg-red-100/70",
      "text-red-900",
      "px-3",
      "py-2",
      "rounded",
      "text-sm",
    );
  });
});
