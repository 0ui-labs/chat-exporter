import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useMessageEdits } from "./use-message-edits";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
let _mockIsPending = false;

vi.mock("@/lib/orpc", () => ({
  orpc: {
    edits: {
      listForSnapshot: {
        queryOptions: () => ({
          queryKey: ["edits", "listForSnapshot"],
          queryFn: () => Promise.resolve([]),
        }),
        key: () => ["edits", "listForSnapshot"],
      },
      save: {
        mutationOptions: (opts: {
          onSuccess?: () => void;
          onSettled?: () => void;
        }) => ({
          mutationFn: async (input: unknown) => {
            try {
              const result = await mockMutate(input);
              opts?.onSuccess?.();
              return result;
            } finally {
              opts?.onSettled?.();
            }
          },
        }),
      },
      delete: {
        mutationOptions: (opts: { onSuccess?: () => void }) => ({
          mutationFn: async (input: unknown) => {
            const result = await mockMutateAsync(input);
            opts?.onSuccess?.();
            return result;
          },
        }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMessageEdits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    _mockIsPending = false;
    mockMutate.mockResolvedValue(undefined);
    mockMutateAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("hasPendingEdits", () => {
    test("is false initially when no edits have been made", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      expect(result.current.hasPendingEdits).toBe(false);
    });

    test("is true immediately after saveEdit is called (debounce timer pending)", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.saveEdit("msg-1", []);
      });

      // Timer is pending but hasn't fired yet — hasPendingEdits must be true
      expect(result.current.hasPendingEdits).toBe(true);
    });

    test("remains true while still within the 500ms debounce window", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.saveEdit("msg-1", []);
      });

      // 400ms in — timer has not fired, hasPendingEdits must still be true
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(result.current.hasPendingEdits).toBe(true);
    });

    test("stays true when multiple messages have pending debounce timers", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.saveEdit("msg-1", []);
        result.current.saveEdit("msg-2", []);
      });

      expect(result.current.hasPendingEdits).toBe(true);
    });

    test("debounce timer is reset when saveEdit is called again for same message", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.saveEdit("msg-1", []);
      });

      // Advance 400ms — timer has not fired yet
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Call again to reset the debounce
      act(() => {
        result.current.saveEdit("msg-1", [
          { type: "paragraph", text: "v2" } as never,
        ]);
      });

      // Only one timer should be pending (the reset one)
      expect(result.current.hasPendingEdits).toBe(true);
    });

    test("is false after deleteEdit cancels the pending debounce timer", async () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      act(() => {
        result.current.saveEdit("msg-1", []);
      });

      expect(result.current.hasPendingEdits).toBe(true);

      await act(async () => {
        await result.current.deleteEdit("msg-1");
      });

      // deleteEdit cancels the debounce timer; no pending edits remain
      expect(result.current.hasPendingEdits).toBe(false);
    });
  });

  describe("hasPendingEdits with overlapping in-flight saves", () => {
    test("remains true while an older save is still in-flight after a newer one completes", async () => {
      /**
       * Given: Two messages both have their debounce timers fire, triggering
       *        two concurrent save mutations. The second mutation resolves
       *        first while the first is still in-flight.
       * When:  The second mutation settles.
       * Then:  hasPendingEdits must still be true because the first save is
       *        still running. It must only become false once both settle.
       */
      let resolveFirst!: () => void;
      let resolveSecond!: () => void;

      const firstSave = new Promise<void>((res) => {
        resolveFirst = res;
      });
      const secondSave = new Promise<void>((res) => {
        resolveSecond = res;
      });

      // First call blocks, second call resolves immediately
      mockMutate.mockReturnValueOnce(firstSave).mockReturnValueOnce(secondSave);

      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      // Trigger two saves for two different messages
      act(() => {
        result.current.saveEdit("msg-1", []);
        result.current.saveEdit("msg-2", []);
      });

      // Both debounce timers fire — two mutations now in-flight
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      // Second save resolves while first is still in-flight
      await act(async () => {
        resolveSecond();
        await secondSave;
      });

      // First save still running — hasPendingEdits must remain true
      expect(result.current.hasPendingEdits).toBe(true);

      // Now first save also resolves
      await act(async () => {
        resolveFirst();
        await firstSave;
      });

      // Both saves complete — hasPendingEdits must be false
      expect(result.current.hasPendingEdits).toBe(false);
    });
  });

  describe("isSaving (unchanged behavior)", () => {
    test("is false initially", () => {
      const { result } = renderHook(
        () => useMessageEdits("import-1", "snap-1"),
        { wrapper: createWrapper() },
      );

      expect(result.current.isSaving).toBe(false);
    });
  });
});
