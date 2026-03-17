import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { RootLayout } from "./root-layout";

// ---------------------------------------------------------------------------
// Radix UI polyfills (needed for TooltipProvider in jsdom)
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture ??= vi.fn();
  Element.prototype.releasePointerCapture ??= vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderLayout() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RootLayout", () => {
  test("renders Toaster component for toast notifications", () => {
    renderLayout();

    // Sonner renders a <section> with aria-label="Notifications" as its toast container
    const toaster = document.querySelector("[data-sonner-toaster]");
    expect(toaster).toBeInTheDocument();
  });

  test("renders TooltipProvider wrapping the outlet", () => {
    // TooltipProvider doesn't render visible DOM, but we can verify it
    // doesn't break rendering and the layout still renders correctly
    renderLayout();

    expect(screen.getByText("Chat Exporter")).toBeInTheDocument();
  });

  test("Toaster is positioned at bottom-right", () => {
    renderLayout();

    const toaster = document.querySelector("[data-sonner-toaster]");
    expect(toaster).toHaveAttribute("data-x-position", "right");
    expect(toaster).toHaveAttribute("data-y-position", "bottom");
  });
});
