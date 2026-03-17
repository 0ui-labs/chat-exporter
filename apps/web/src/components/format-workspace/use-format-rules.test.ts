// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useFormatRules } from "./use-format-rules";

// --- Mocks ---

const mockDisable = vi.fn();
const mockPromote = vi.fn();
const mockDemote = vi.fn();

const mockToastInfo = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: (...args: unknown[]) => mockToastInfo(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    rules: {
      list: {
        queryOptions: () => ({
          queryKey: ["rules", "list"],
          queryFn: () => Promise.resolve([]),
        }),
        key: () => ["rules", "list"],
      },
    },
  },
}));

vi.mock("@/lib/rpc", () => ({
  rpc: {
    rules: {
      disable: (...args: unknown[]) => mockDisable(...args),
      list: vi.fn().mockResolvedValue([]),
    },
  },
  promoteFormatRule: (...args: unknown[]) => mockPromote(...args),
  demoteFormatRule: (...args: unknown[]) => mockDemote(...args),
}));

vi.mock("@/components/format-workspace/use-rule-explanations", () => ({
  useRuleExplanations: () => ({}),
}));

vi.mock("@/components/format-workspace/types", () => ({
  getAdjustableViews: () => new Set(["markdown"]),
}));

// --- Helpers ---

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

function renderUseFormatRules() {
  return renderHook(() => useFormatRules("markdown", "job-1"), {
    wrapper: createWrapper(),
  });
}

// --- Tests ---

describe("useFormatRules toast feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDisable.mockResolvedValue(undefined);
    mockPromote.mockResolvedValue(undefined);
    mockDemote.mockResolvedValue(undefined);
  });

  describe("handleDisableRule", () => {
    test("shows info toast on successful disable", async () => {
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handleDisableRule("rule-1");
      });

      expect(mockToastInfo).toHaveBeenCalledWith("Regel deaktiviert");
    });

    test("shows error toast when disable fails", async () => {
      mockDisable.mockRejectedValue(new Error("Network error"));
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handleDisableRule("rule-1");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Regel konnte nicht geändert werden",
      );
    });
  });

  describe("handlePromoteRule", () => {
    test("shows success toast on successful promote", async () => {
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handlePromoteRule("rule-1");
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Regel gilt jetzt für alle Imports",
      );
    });

    test("shows error toast when promote fails", async () => {
      mockPromote.mockRejectedValue(new Error("Server error"));
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handlePromoteRule("rule-1");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Regel konnte nicht geändert werden",
      );
    });
  });

  describe("handleDemoteRule", () => {
    test("shows info toast on successful demote", async () => {
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handleDemoteRule("rule-1");
      });

      expect(mockToastInfo).toHaveBeenCalledWith(
        "Regel gilt jetzt nur für diesen Import",
      );
    });

    test("shows error toast when demote fails", async () => {
      mockDemote.mockRejectedValue(new Error("Server error"));
      const { result } = renderUseFormatRules();

      await act(async () => {
        await result.current.handleDemoteRule("rule-1");
      });

      expect(mockToastError).toHaveBeenCalledWith(
        "Regel konnte nicht geändert werden",
      );
    });
  });
});
