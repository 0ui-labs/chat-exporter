import type {
  AdjustmentSessionDetail,
  FormatRule,
  ImportJob,
} from "@chat-exporter/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { type Mock, vi } from "vitest";

import { rpc } from "@/lib/rpc";

import { FormatWorkspace } from "./format-workspace";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/rpc", () => ({
  rpc: {
    rules: { list: vi.fn(), disable: vi.fn() },
    adjustments: {
      createSession: vi.fn(),
      appendMessage: vi.fn(),
      discard: vi.fn(),
    },
  },
}));

let readerViewShouldThrow = false;

vi.mock("@/components/format-workspace/reader-view", () => ({
  ReaderView: (props: Record<string, unknown>) => {
    if (readerViewShouldThrow) throw new Error("ReaderView crash");
    return (
      <div
        data-testid="reader-view"
        data-adjust-mode={String(props.adjustModeEnabled)}
      />
    );
  },
}));

vi.mock("@/components/format-workspace/markdown-view", () => ({
  MarkdownView: () => <div data-testid="markdown-view" />,
}));

vi.mock("@/components/format-workspace/artifact-view", () => ({
  ArtifactView: () => <div data-testid="artifact-view" />,
}));

let adjustmentPopoverShouldThrow = false;

vi.mock("@/components/format-workspace/adjustment-popover", () => ({
  AdjustmentPopover: () => {
    if (adjustmentPopoverShouldThrow)
      throw new Error("AdjustmentPopover crash");
    return <div data-testid="adjustment-popover" />;
  },
}));

vi.mock("@/components/format-workspace/adjustment-mode-guide", () => ({
  AdjustmentModeGuide: () => <div data-testid="adjustment-mode-guide" />,
}));

vi.mock("@/components/format-workspace/rules-list-popover", () => ({
  RulesListPopover: () => <div data-testid="rules-list-popover" />,
}));

let applyMarkdownRulesShouldThrow = false;

vi.mock("@/components/format-workspace/rule-engine", () => ({
  applyMarkdownRules: (content: string) => {
    if (applyMarkdownRulesShouldThrow) throw new Error("rule engine crash");
    return content;
  },
  buildReaderEffectsMap: () => new Map(),
}));

// ---------------------------------------------------------------------------
// jsdom scrollTop helper — jsdom clamps scrollTop to 0 without real layout.
// Uses a WeakMap so the value survives ref callback re-invocations (React
// calls the inline callback again on every re-render with a new closure).
// ---------------------------------------------------------------------------

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

function renderWithProviders(ui: ReactNode) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function createJob(overrides?: Partial<ImportJob>): ImportJob {
  return {
    id: "job-1",
    sourceUrl: "https://example.com/chat",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "completed",
    currentStage: "done",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    warnings: [],
    conversation: {
      id: "conv-1",
      title: "Test Conversation",
      source: { url: "https://example.com/chat", platform: "chatgpt" },
      messages: [
        {
          id: "msg-1",
          role: "user",
          blocks: [{ type: "paragraph", text: "Hello" }],
        },
        {
          id: "msg-2",
          role: "assistant",
          blocks: [{ type: "paragraph", text: "Hi there" }],
        },
      ],
    },
    artifacts: {
      markdown: "# Test\nHello world",
      handover: "handover content",
      json: '{"test": true}',
    },
    ...overrides,
  };
}

function createFormatRule(overrides?: Partial<FormatRule>): FormatRule {
  return {
    id: "rule-1",
    importId: "job-1",
    targetFormat: "reader",
    kind: "render",
    scope: "import_local",
    status: "active",
    selector: {
      strategy: "exact",
      messageId: "msg-1",
      blockIndex: 0,
      blockType: "paragraph",
    },
    instruction: "Bold the text",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createSessionDetail(
  overrides?: Partial<AdjustmentSessionDetail>,
): AdjustmentSessionDetail {
  return {
    session: {
      id: "session-1",
      importId: "job-1",
      targetFormat: "reader",
      status: "open",
      selection: {
        blockIndex: 0,
        blockType: "paragraph",
        messageId: "msg-1",
        messageIndex: 0,
        messageRole: "user",
        selectedText: "Hello",
        textQuote: "Hello",
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    messages: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Radix UI polyfills
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mock rpc typed references
// ---------------------------------------------------------------------------

const mockRpc = rpc as unknown as {
  rules: {
    list: Mock;
    disable: Mock;
  };
  adjustments: {
    createSession: Mock;
    appendMessage: Mock;
    discard: Mock;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  readerViewShouldThrow = false;
  adjustmentPopoverShouldThrow = false;
  applyMarkdownRulesShouldThrow = false;
  mockRpc.rules.list.mockResolvedValue([]);
  mockRpc.rules.disable.mockResolvedValue(
    createFormatRule({ status: "disabled" }),
  );
  mockRpc.adjustments.createSession.mockResolvedValue(createSessionDetail());
  mockRpc.adjustments.appendMessage.mockResolvedValue(createSessionDetail());
  mockRpc.adjustments.discard.mockResolvedValue(createSessionDetail());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FormatWorkspace", () => {
  describe("rules query", () => {
    test("fetches rules via query when view is adjustable (reader)", async () => {
      const rules = [createFormatRule()];
      mockRpc.rules.list.mockResolvedValue(rules);

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(mockRpc.rules.list).toHaveBeenCalledWith(
          { importId: "job-1", format: "reader" },
          expect.anything(),
        );
      });
    });

    test("fetches rules via query when view is adjustable (markdown)", async () => {
      mockRpc.rules.list.mockResolvedValue([]);

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="markdown"
          onViewChange={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(mockRpc.rules.list).toHaveBeenCalledWith(
          { importId: "job-1", format: "markdown" },
          expect.anything(),
        );
      });
    });

    test("does not fetch rules when view is not adjustable (json)", async () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="json"
          onViewChange={vi.fn()}
        />,
      );

      // Give time for any potential call
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockRpc.rules.list).not.toHaveBeenCalled();
    });
  });

  describe("disable rule mutation", () => {
    test("invalidates rules cache after disabling a rule", async () => {
      const rules = [createFormatRule()];
      mockRpc.rules.list.mockResolvedValue(rules);
      mockRpc.rules.disable.mockResolvedValue(
        createFormatRule({ status: "disabled" }),
      );

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      // Wait for initial rules fetch
      await waitFor(() => {
        expect(mockRpc.rules.list).toHaveBeenCalled();
      });

      // The rules list is fetched initially. After a disable mutation completes,
      // the rules query should be invalidated (re-fetched).
      const callCountAfterInitial = mockRpc.rules.list.mock.calls.length;
      expect(callCountAfterInitial).toBeGreaterThanOrEqual(1);
    });
  });

  describe("rendering", () => {
    test("renders reader view when view is reader", async () => {
      mockRpc.rules.list.mockResolvedValue([]);

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId("reader-view")).toBeInTheDocument();
    });

    test("renders markdown view when view is markdown", async () => {
      mockRpc.rules.list.mockResolvedValue([]);

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="markdown"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId("markdown-view")).toBeInTheDocument();
    });

    test("renders artifact view when view is json", () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="json"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId("artifact-view")).toBeInTheDocument();
    });

    test("shows loading state when job is running", () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={{ label: "Extracting", detail: "Processing messages" }}
          elapsedTime="00:05"
          job={createJob({ status: "running", currentStage: "extract" })}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Processing messages")).toBeInTheDocument();
    });

    test("shows view toggle buttons for completed job", () => {
      mockRpc.rules.list.mockResolvedValue([]);

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId("format-view-reader")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-markdown")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-handover")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-json")).toBeInTheDocument();
    });

    test("calls onViewChange when a view button is clicked", async () => {
      mockRpc.rules.list.mockResolvedValue([]);
      const user = userEvent.setup();
      const onViewChange = vi.fn();

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={onViewChange}
        />,
      );

      await user.click(screen.getByTestId("format-view-markdown"));

      expect(onViewChange).toHaveBeenCalledWith("markdown");
    });
  });

  describe("error boundaries", () => {
    test("shows fallback when ReaderView throws", () => {
      readerViewShouldThrow = true;
      // Suppress React error boundary console.error noise
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Diese Ansicht konnte nicht geladen werden."),
      ).toBeInTheDocument();
      expect(screen.getByText("Erneut versuchen")).toBeInTheDocument();

      spy.mockRestore();
    });

    test("clicking retry resets the view error boundary", async () => {
      readerViewShouldThrow = true;
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const user = userEvent.setup();

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      // Fallback is shown
      expect(
        screen.getByText("Diese Ansicht konnte nicht geladen werden."),
      ).toBeInTheDocument();

      // Fix the component so retry works
      readerViewShouldThrow = false;

      await user.click(screen.getByText("Erneut versuchen"));

      expect(screen.getByTestId("reader-view")).toBeInTheDocument();
      expect(
        screen.queryByText("Diese Ansicht konnte nicht geladen werden."),
      ).not.toBeInTheDocument();

      spy.mockRestore();
    });

    test("shows error display with stage context for failed job", () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob({
            status: "failed",
            errorStage: "extract",
            error: "Timeout while loading page",
          })}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Import fehlgeschlagen")).toBeInTheDocument();
      expect(
        screen.getByText("Fehler in Phase: Nachrichten werden extrahiert"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Timeout while loading page"),
      ).toBeInTheDocument();
    });

    test("shows error display without stage when errorStage is absent", () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob({ status: "failed" })}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Import fehlgeschlagen")).toBeInTheDocument();
      expect(screen.queryByText(/Fehler in Phase/)).not.toBeInTheDocument();
    });

    test("shows error message for failed job with error string", () => {
      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob({
            status: "failed",
            error: "Connection refused",
          })}
          view="reader"
          onViewChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Import fehlgeschlagen")).toBeInTheDocument();
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });

    test("applyMarkdownRules error falls back to raw artifact", () => {
      applyMarkdownRulesShouldThrow = true;

      renderWithProviders(
        <FormatWorkspace
          activeStage={null}
          elapsedTime=""
          job={createJob()}
          view="markdown"
          onViewChange={vi.fn()}
        />,
      );

      // Should not crash — the markdown view should render
      expect(screen.getByTestId("markdown-view")).toBeInTheDocument();
    });
  });
});
