// @vitest-environment happy-dom

import type { ImportSummary } from "@chat-exporter/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DeleteImportDialog } from "./delete-import-dialog";

// --- Toast Mocks ---

const mockToastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  }),
}));

// --- RPC Mock ---

const mockDelete = vi.fn();

vi.mock("@/lib/rpc", () => ({
  rpc: {
    imports: {
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
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

const fakeImport: ImportSummary = {
  id: "import-1",
  sourceUrl: "https://chatgpt.com/share/abc",
  pageTitle: "Test Chat",
  status: "completed",
  sourcePlatform: "chatgpt",
  mode: "archive",
  importMethod: "share-link",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  currentStage: "done",
  warnings: [],
};

function renderDialog(props?: {
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DeleteImportDialog
        import_={fakeImport}
        onClose={props?.onClose ?? vi.fn()}
        onDeleted={props?.onDeleted ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

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

describe("DeleteImportDialog toast feedback", () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
    mockDelete.mockReset();
  });

  test("shows success toast when import is deleted", async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue({ success: true });

    renderDialog();

    const deleteButton = screen.getByRole("button", { name: "Löschen" });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Import gelöscht");
    });
  });
});
