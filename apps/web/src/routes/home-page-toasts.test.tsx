// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

// --- Toast Mocks ---

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

// --- ORPC Mocks ---

let createMutationFn: (...args: unknown[]) => Promise<unknown>;
let clipboardMutationFn: (...args: unknown[]) => Promise<unknown>;
let getQueryFn: (() => Promise<unknown>) | undefined;

vi.mock("@/lib/orpc", () => ({
  orpc: {
    imports: {
      list: {
        queryOptions: () => ({
          queryKey: ["imports", "list"],
          queryFn: () => Promise.resolve([]),
        }),
      },
      get: {
        queryOptions: (opts: { input: { id: string } }) => ({
          queryKey: ["imports", "get", opts.input.id],
          queryFn: () => (getQueryFn ? getQueryFn() : Promise.resolve(null)),
          enabled: Boolean(opts.input.id),
          refetchInterval: false,
        }),
      },
      create: {
        mutationOptions: (opts?: { onSuccess?: (data: unknown) => void }) => ({
          mutationFn: (...args: unknown[]) => createMutationFn(...args),
          onSuccess: opts?.onSuccess,
        }),
      },
      createFromClipboard: {
        mutationOptions: (opts?: { onSuccess?: (data: unknown) => void }) => ({
          mutationFn: (...args: unknown[]) => clipboardMutationFn(...args),
          onSuccess: opts?.onSuccess,
        }),
      },
      key: () => ["imports"],
    },
  },
}));

// --- Component Mocks ---

vi.mock("@/components/format-workspace/format-workspace", () => ({
  FormatWorkspace: () => <div data-testid="format-workspace" />,
}));

vi.mock("@/components/onboarding/welcome-card", () => ({
  WelcomeCard: () => null,
}));

vi.mock("@/hooks/use-placeholder-rotation", () => ({
  usePlaceholderRotation: () => ({
    placeholder: "https://example.com",
    visible: true,
    pause: vi.fn(),
    resume: vi.fn(),
  }),
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

function renderHomePage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePageLazy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Lazy import so mocks are set up first
let HomePageLazy: () => React.JSX.Element;

beforeAll(async () => {
  const mod = await import("./home-page");
  HomePageLazy = mod.HomePage;
});

// --- Polyfills ---

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi
    .fn()
    .mockReturnValue(false) as Element["hasPointerCapture"];
  Element.prototype.setPointerCapture ??=
    vi.fn() as Element["setPointerCapture"];
  Element.prototype.releasePointerCapture ??=
    vi.fn() as Element["releasePointerCapture"];
  Element.prototype.scrollIntoView ??= vi.fn() as Element["scrollIntoView"];
});

// --- Tests ---

describe("HomePage toast feedback", () => {
  beforeEach(() => {
    mockToastInfo.mockClear();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    getQueryFn = undefined;
    createMutationFn = vi.fn().mockResolvedValue({
      id: "import-1",
      sourceUrl: "https://chatgpt.com/share/abc",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    clipboardMutationFn = vi.fn().mockResolvedValue({
      id: "import-2",
      sourceUrl: "",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  test("shows info toast when link import is started", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const input = screen.getByLabelText("Freigabelink");
    await user.type(input, "https://chatgpt.com/share/abc");

    const button = screen.getByRole("button", { name: "Importieren" });
    await user.click(button);

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith("Import gestartet");
    });
  });

  test("shows success toast when import completes", async () => {
    getQueryFn = vi.fn().mockResolvedValue({
      id: "import-1",
      sourceUrl: "https://chatgpt.com/share/abc",
      status: "completed",
      currentStage: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/?import=import-1"]}>
          <HomePageLazy />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Import abgeschlossen");
    });
  });

  test("shows error toast when import fails", async () => {
    getQueryFn = vi.fn().mockResolvedValue({
      id: "import-1",
      sourceUrl: "https://chatgpt.com/share/abc",
      status: "failed",
      currentStage: "extract",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/?import=import-1"]}>
          <HomePageLazy />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Import fehlgeschlagen");
    });
  });
});
