import type { ConversationSnapshot } from "@chat-exporter/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VersionsModal } from "./versions-modal";

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
// Helpers
// ---------------------------------------------------------------------------

function createSnapshot(
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    id: "snap-1",
    importId: "import-1",
    label: "Version 1",
    isActive: false,
    createdAt: "2026-03-10T10:00:00Z",
    updatedAt: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}

type RenderModalOptions = {
  open?: boolean;
  snapshots?: ConversationSnapshot[];
  activeSnapshotId?: string | null;
  onOpenChange?: (open: boolean) => void;
  onActivate?: (snapshotId: string) => void;
  onDeactivate?: () => void;
  onCreate?: (label: string) => void;
  onRename?: (snapshotId: string, label: string) => void;
  onDelete?: (snapshotId: string) => void;
};

function renderModal(options: RenderModalOptions = {}) {
  const {
    open = true,
    snapshots = [],
    activeSnapshotId = null,
    onOpenChange = vi.fn(),
    onActivate = vi.fn(),
    onDeactivate = vi.fn(),
    onCreate = vi.fn(),
    onRename = vi.fn(),
    onDelete = vi.fn(),
  } = options;

  const props = {
    open,
    snapshots,
    activeSnapshotId,
    onOpenChange,
    onActivate,
    onDeactivate,
    onCreate,
    onRename,
    onDelete,
  };

  return { ...render(<VersionsModal {...props} />), props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VersionsModal", () => {
  describe("rendering", () => {
    test("shows Original entry and all snapshots", () => {
      const snapshots = [
        createSnapshot({ id: "snap-1", label: "Version 1" }),
        createSnapshot({ id: "snap-2", label: "Version 2" }),
      ];

      renderModal({ snapshots });

      expect(screen.getByText("Original")).toBeInTheDocument();
      expect(screen.getByText("Version 1")).toBeInTheDocument();
      expect(screen.getByText("Version 2")).toBeInTheDocument();
    });

    test("highlights Original when no active snapshot", () => {
      renderModal({ activeSnapshotId: null });

      const originalItem = screen.getByTestId("version-original");
      expect(originalItem).toHaveAttribute("data-active", "true");
    });

    test("highlights active snapshot", () => {
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];

      renderModal({ snapshots, activeSnapshotId: "snap-1" });

      const originalItem = screen.getByTestId("version-original");
      expect(originalItem).toHaveAttribute("data-active", "false");

      const snapshotItem = screen.getByTestId("version-snap-1");
      expect(snapshotItem).toHaveAttribute("data-active", "true");
    });

    test("does not render when closed", () => {
      renderModal({ open: false });

      expect(screen.queryByText("Original")).not.toBeInTheDocument();
    });
  });

  describe("version activation", () => {
    test("clicking a snapshot calls onActivate and closes modal", async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      const onOpenChange = vi.fn();
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];

      renderModal({ snapshots, onActivate, onOpenChange });

      await user.click(screen.getByTestId("version-activate-snap-1"));

      expect(onActivate).toHaveBeenCalledWith("snap-1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test("clicking Original calls onDeactivate and closes modal", async () => {
      const user = userEvent.setup();
      const onDeactivate = vi.fn();
      const onOpenChange = vi.fn();

      renderModal({
        activeSnapshotId: "snap-1",
        snapshots: [createSnapshot({ id: "snap-1" })],
        onDeactivate,
        onOpenChange,
      });

      await user.click(screen.getByTestId("version-activate-original"));

      expect(onDeactivate).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("creating a new version", () => {
    test("shows inline input when clicking new version button", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByTestId("new-version-button"));

      expect(screen.getByTestId("new-version-input")).toBeInTheDocument();
    });

    test("calls onCreate with label when submitting", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      renderModal({ onCreate });

      await user.click(screen.getByTestId("new-version-button"));
      const input = screen.getByTestId("new-version-input");
      await user.type(input, "My new version{Enter}");

      expect(onCreate).toHaveBeenCalledWith("My new version");
    });

    test("hides input after creating", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByTestId("new-version-button"));
      const input = screen.getByTestId("new-version-input");
      await user.type(input, "Test{Enter}");

      expect(screen.queryByTestId("new-version-input")).not.toBeInTheDocument();
    });
  });

  describe("renaming", () => {
    test("shows inline input when clicking rename button", async () => {
      const user = userEvent.setup();
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];
      renderModal({ snapshots });

      await user.click(screen.getByTestId("rename-snap-1"));

      expect(screen.getByTestId("rename-input-snap-1")).toBeInTheDocument();
    });

    test("calls onRename with new label on submit", async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];
      renderModal({ snapshots, onRename });

      await user.click(screen.getByTestId("rename-snap-1"));
      const input = screen.getByTestId("rename-input-snap-1");
      await user.clear(input);
      await user.type(input, "Renamed{Enter}");

      expect(onRename).toHaveBeenCalledWith("snap-1", "Renamed");
    });
  });

  describe("deleting", () => {
    test("calls onDelete after confirmation", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];

      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderModal({ snapshots, onDelete });

      await user.click(screen.getByTestId("delete-snap-1"));

      expect(confirmSpy).toHaveBeenCalled();
      expect(onDelete).toHaveBeenCalledWith("snap-1");

      confirmSpy.mockRestore();
    });

    test("does not call onDelete when confirmation is cancelled", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      const snapshots = [createSnapshot({ id: "snap-1", label: "Version 1" })];

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderModal({ snapshots, onDelete });

      await user.click(screen.getByTestId("delete-snap-1"));

      expect(confirmSpy).toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });
});
