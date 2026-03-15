import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SaveIndicator } from "./save-indicator";

describe("SaveIndicator", () => {
  test("shows saving state when isSaving is true", () => {
    render(<SaveIndicator isSaving={true} hasEdits={true} />);

    expect(screen.getByText("Speichert...")).toBeInTheDocument();
  });

  test("shows saved state when not saving and has edits", () => {
    render(<SaveIndicator isSaving={false} hasEdits={true} />);

    expect(screen.getByText(/Gespeichert/)).toBeInTheDocument();
  });

  test("renders nothing when no edits exist", () => {
    const { container } = render(
      <SaveIndicator isSaving={false} hasEdits={false} />,
    );

    expect(container.textContent).toBe("");
  });
});
