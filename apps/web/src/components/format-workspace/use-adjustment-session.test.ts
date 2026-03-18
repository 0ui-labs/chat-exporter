// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useAdjustmentSession } from "./use-adjustment-session";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToastSuccess = vi.fn();
const mockToastInfo = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Capture onSuccess/onError callbacks passed to mutationOptions
let appendMessageOnSuccess: ((detail: unknown) => void) | undefined;
let appendMessageOnError: ((error: unknown) => void) | undefined;
let discardOnSuccess: (() => void) | undefined;
let discardOnError: ((error: unknown) => void) | undefined;

const mockAppendMutate = vi.fn();
const mockDiscardMutate = vi.fn();
const mockCreateSessionMutate = vi.fn();

vi.mock("@/lib/orpc", () => ({
  orpc: {
    adjustments: {
      createSession: {
        mutationOptions: () => ({
          mutationFn: mockCreateSessionMutate,
        }),
      },
      appendMessage: {
        mutationOptions: (opts: {
          onSuccess?: (detail: unknown) => void;
          onError?: (error: unknown) => void;
        }) => {
          appendMessageOnSuccess = opts?.onSuccess;
          appendMessageOnError = opts?.onError;
          return {
            mutationFn: mockAppendMutate,
          };
        },
      },
      discard: {
        mutationOptions: (opts: {
          onSuccess?: () => void;
          onError?: (error: unknown) => void;
        }) => {
          discardOnSuccess = opts?.onSuccess;
          discardOnError = opts?.onError;
          return {
            mutationFn: mockDiscardMutate,
          };
        },
      },
      status: {
        queryOptions: () => ({
          queryKey: ["adjustments", "status"],
          queryFn: () =>
            Promise.resolve({
              available: true,
              provider: "anthropic",
            }),
        }),
      },
      setScope: {
        mutationOptions: () => ({
          mutationFn: vi.fn(),
        }),
      },
    },
    rules: {
      list: {
        key: () => ["rules", "list"],
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function createAppliedDetail() {
  return {
    session: { id: "sess-1", importId: "job-1", status: "applied" },
    messages: [],
  };
}

function createPendingDetail() {
  return {
    session: { id: "sess-1", importId: "job-1", status: "pending" },
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAdjustmentSession toast feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appendMessageOnSuccess = undefined;
    appendMessageOnError = undefined;
    discardOnSuccess = undefined;
    discardOnError = undefined;
  });

  test("shows success toast when appendMessage succeeds with applied status", () => {
    renderHook(() => useAdjustmentSession("markdown", "job-1"), {
      wrapper: createWrapper(),
    });

    // The hook registers onSuccess via mutationOptions — invoke it
    expect(appendMessageOnSuccess).toBeDefined();
    act(() => {
      appendMessageOnSuccess?.(createAppliedDetail());
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Anpassung übernommen");
  });

  test("shows success toast when appendMessage succeeds with non-applied status", () => {
    renderHook(() => useAdjustmentSession("markdown", "job-1"), {
      wrapper: createWrapper(),
    });

    expect(appendMessageOnSuccess).toBeDefined();
    act(() => {
      appendMessageOnSuccess?.(createPendingDetail());
    });

    // Even for non-applied status, the append succeeded — toast should fire
    expect(mockToastSuccess).toHaveBeenCalledWith("Anpassung übernommen");
  });

  test("shows error toast when appendMessage fails", () => {
    renderHook(() => useAdjustmentSession("markdown", "job-1"), {
      wrapper: createWrapper(),
    });

    expect(appendMessageOnError).toBeDefined();
    act(() => {
      appendMessageOnError?.(new Error("Network error"));
    });

    expect(mockToastError).toHaveBeenCalledWith("Anpassung fehlgeschlagen");
  });

  test("shows info toast when discard succeeds", () => {
    renderHook(() => useAdjustmentSession("markdown", "job-1"), {
      wrapper: createWrapper(),
    });

    expect(discardOnSuccess).toBeDefined();
    act(() => {
      discardOnSuccess?.();
    });

    expect(mockToastInfo).toHaveBeenCalledWith("Letzte Änderung verworfen");
  });

  test("does not show toast on discard error (existing inline error handles it)", () => {
    renderHook(() => useAdjustmentSession("markdown", "job-1"), {
      wrapper: createWrapper(),
    });

    expect(discardOnError).toBeDefined();
    act(() => {
      discardOnError?.(new Error("Discard failed"));
    });

    // Discard errors are handled by the inline error box, no additional toast
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
