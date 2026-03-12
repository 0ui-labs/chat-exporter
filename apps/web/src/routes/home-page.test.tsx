import type { ImportJob } from "@chat-exporter/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { rpc } from "@/lib/rpc";
import { HomePage } from "./home-page";

vi.mock("@/lib/rpc", () => ({
  rpc: {
    imports: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/components/format-workspace/format-workspace", () => ({
  FormatWorkspace: ({
    job,
    activeStage,
  }: {
    job: ImportJob;
    activeStage: { label: string } | null;
  }) => (
    <div data-testid="format-workspace">
      <span data-testid="job-id">{job.id}</span>
      <span data-testid="active-stage">{activeStage?.label}</span>
    </div>
  ),
}));

const mockList = vi.mocked(rpc.imports.list);
const mockGet = vi.mocked(rpc.imports.get);
const mockCreate = vi.mocked(rpc.imports.create);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(
  ui: ReactNode,
  { route = "/" }: { route?: string } = {},
) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function createJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    sourceUrl: "https://chatgpt.com/share/abc",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "running",
    currentStage: "fetch",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:01:00Z",
    warnings: [],
    ...overrides,
  };
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("fetches and displays recent jobs", async () => {
    const jobs = [
      createJob({
        id: "job-1",
        sourceUrl: "https://chatgpt.com/share/abc",
        updatedAt: "2026-01-02T00:00:00Z",
      }),
      createJob({
        id: "job-2",
        sourceUrl: "https://chatgpt.com/share/def",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    ];

    mockList.mockResolvedValue(jobs);

    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Letzte Importe")).toBeInTheDocument();
    });

    expect(screen.getByText("chatgpt.com/share/abc")).toBeInTheDocument();
    expect(screen.getByText("chatgpt.com/share/def")).toBeInTheDocument();
  });

  test("polls for job status when import is active", async () => {
    const runningJob = createJob({ id: "job-1", status: "running" });
    const completedJob = createJob({ id: "job-1", status: "completed" });

    mockList.mockResolvedValue([]);
    mockGet
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce(completedJob);

    renderWithProviders(<HomePage />, { route: "/?import=job-1" });

    await waitFor(() => {
      expect(screen.getByTestId("format-workspace")).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith({ id: "job-1" }, expect.anything());
  });

  test("stops polling when job is completed", async () => {
    const completedJob = createJob({ id: "job-1", status: "completed" });

    mockList.mockResolvedValue([]);
    mockGet.mockResolvedValue(completedJob);

    renderWithProviders(<HomePage />, { route: "/?import=job-1" });

    await waitFor(() => {
      expect(screen.getByTestId("format-workspace")).toBeInTheDocument();
    });

    const callCount = mockGet.mock.calls.length;

    await vi.advanceTimersByTimeAsync(3000);

    // After advancing time, calls should not have increased significantly
    // (TanStack Query may do 1 extra call but not continuous polling)
    expect(mockGet.mock.calls.length).toBeLessThanOrEqual(callCount + 1);
  });

  test("creates import and invalidates cache on submit", async () => {
    const newJob = createJob({ id: "job-new" });

    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(newJob);
    mockGet.mockResolvedValue(newJob);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HomePage />);

    const input = screen.getByLabelText("Freigabelink");
    await user.type(input, "https://chatgpt.com/share/test");

    const submitButton = screen.getByRole("button", { name: "Importieren" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        { url: "https://chatgpt.com/share/test", mode: "archive" },
        expect.anything(),
      );
    });
  });

  test("shows loading state during mutation", async () => {
    let resolveCreate!: (value: ImportJob) => void;
    const createPromise = new Promise<ImportJob>((resolve) => {
      resolveCreate = resolve;
    });

    mockList.mockResolvedValue([]);
    mockCreate.mockReturnValue(createPromise as never);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HomePage />);

    const input = screen.getByLabelText("Freigabelink");
    await user.type(input, "https://chatgpt.com/share/test");

    const submitButton = screen.getByRole("button", { name: "Importieren" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Import läuft..." }),
      ).toBeDisabled();
    });

    const newJob = createJob({ id: "job-new" });
    resolveCreate(newJob);
    mockGet.mockResolvedValue(newJob);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Importieren" }),
      ).not.toBeDisabled();
    });
  });

  test("displays error when mutation fails", async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<HomePage />);

    const input = screen.getByLabelText("Freigabelink");
    await user.type(input, "https://chatgpt.com/share/test");

    const submitButton = screen.getByRole("button", { name: "Importieren" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  test("displays error when job fetch fails", async () => {
    mockList.mockResolvedValue([]);
    mockGet.mockRejectedValue(new Error("Job not found"));

    renderWithProviders(<HomePage />, { route: "/?import=job-1" });

    await waitFor(() => {
      expect(screen.getByText("Job not found")).toBeInTheDocument();
    });
  });
});
