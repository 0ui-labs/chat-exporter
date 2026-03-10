import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { vi } from "vitest";

import { ErrorBoundary } from "./error-boundary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

/**
 * Component that conditionally throws based on `shouldThrow` prop.
 * When used with a toggle, it allows testing reset behaviour.
 */
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>children rendered</div>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ErrorBoundary", () => {
  // Suppress React error boundary console.error noise in test output
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders children when no error occurs", () => {
    renderWithProviders(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("children rendered")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });

  test("renders fallback ReactNode when child throws", () => {
    renderWithProviders(
      <ErrorBoundary fallback={<div>something went wrong</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("something went wrong")).toBeInTheDocument();
    expect(screen.queryByText("children rendered")).not.toBeInTheDocument();
  });

  test("renders fallback function with error and reset when child throws", () => {
    renderWithProviders(
      <ErrorBoundary
        fallback={(error, _reset) => <div>Error: {error.message}</div>}
      >
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Error: Test error")).toBeInTheDocument();
  });

  test("calls onError callback with error and errorInfo when child throws", () => {
    const onError = vi.fn();

    renderWithProviders(
      <ErrorBoundary fallback={<div>fallback</div>} onError={onError}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Test error" }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  test("reset function clears error state and re-renders children", async () => {
    const user = userEvent.setup();

    /**
     * Wrapper that lets us toggle the throwing behaviour via a button
     * outside the error boundary, then click "retry" inside the fallback.
     */
    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);

      return (
        <>
          <button type="button" onClick={() => setShouldThrow(false)}>
            fix
          </button>
          <ErrorBoundary
            fallback={(error, reset) => (
              <div>
                <span>Error: {error.message}</span>
                <button type="button" onClick={reset}>
                  retry
                </button>
              </div>
            )}
          >
            <ThrowingComponent shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </>
      );
    }

    renderWithProviders(<Harness />);

    // Error boundary should show fallback
    expect(screen.getByText("Error: Test error")).toBeInTheDocument();

    // Fix the underlying issue, then click retry
    await user.click(screen.getByText("fix"));
    await user.click(screen.getByText("retry"));

    // Children should now render successfully
    expect(screen.getByText("children rendered")).toBeInTheDocument();
    expect(screen.queryByText("Error: Test error")).not.toBeInTheDocument();
  });
});
