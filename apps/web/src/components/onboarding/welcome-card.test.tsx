// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WelcomeCard } from "./welcome-card";

describe("WelcomeCard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders when visible is true and not previously dismissed", () => {
    render(<WelcomeCard visible onScrollToInput={vi.fn()} />);

    expect(
      screen.getByText("Conversations importieren und anpassen"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Probiere es aus/)).toBeInTheDocument();
  });

  test("does not render when visible is false", () => {
    render(<WelcomeCard visible={false} onScrollToInput={vi.fn()} />);

    expect(
      screen.queryByText("Conversations importieren und anpassen"),
    ).not.toBeInTheDocument();
  });

  test("does not render when previously dismissed via localStorage", () => {
    localStorage.setItem("onboarding-dismissed", "true");

    render(<WelcomeCard visible onScrollToInput={vi.fn()} />);

    expect(
      screen.queryByText("Conversations importieren und anpassen"),
    ).not.toBeInTheDocument();
  });

  test("dismiss button hides card and sets localStorage", async () => {
    const user = userEvent.setup();
    render(<WelcomeCard visible onScrollToInput={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /schließen/i }));

    expect(
      screen.queryByText("Conversations importieren und anpassen"),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("onboarding-dismissed")).toBe("true");
  });

  test("action button calls onScrollToInput", async () => {
    const user = userEvent.setup();
    const onScrollToInput = vi.fn();
    render(<WelcomeCard visible onScrollToInput={onScrollToInput} />);

    await user.click(screen.getByText(/Probiere es aus/));

    expect(onScrollToInput).toHaveBeenCalledOnce();
  });
});
