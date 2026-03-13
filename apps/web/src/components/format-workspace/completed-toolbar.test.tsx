import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { useFormatRules } from "@/components/format-workspace/use-format-rules";

import { CompletedToolbar } from "./completed-toolbar";

// ---------------------------------------------------------------------------
// Mock RulesListModal (uses Radix, not relevant to toolbar tests)
// ---------------------------------------------------------------------------

vi.mock("@/components/format-workspace/rules-list-modal", () => ({
  RulesListModal: () => <div data-testid="rules-list-modal" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRules(): ReturnType<typeof useFormatRules> {
  return {
    activeRules: [],
    disablingRuleById: {},
    expandedRuleId: null,
    explanationErrorById: {},
    explanationLoadingById: {},
    hoveredRuleId: null,
    promotingRuleById: {},
    disableError: null,
    promoteError: null,
    getExplanationDetail: vi.fn(),
    handleDemoteRule: vi.fn(),
    handleDisableRule: vi.fn(),
    handlePromoteRule: vi.fn(),
    handleRejectLastChange: vi.fn(),
    handleToggleRuleExplanation: vi.fn(),
    setHoveredRuleId: vi.fn(),
  } as unknown as ReturnType<typeof useFormatRules>;
}

type RenderToolbarOptions = {
  view?: "reader" | "markdown" | "handover" | "json";
  adjustModeEnabled?: boolean;
  editMode?: "view" | "edit" | "adjust";
  isAdjustableView?: boolean;
  snapshotCount?: number;
  onEditModeChange?: () => void;
  onVersionsClick?: () => void;
};

function renderToolbar(options: RenderToolbarOptions = {}) {
  const {
    view = "reader",
    adjustModeEnabled = false,
    editMode = "view",
    isAdjustableView = true,
    snapshotCount,
    onEditModeChange = vi.fn(),
    onVersionsClick = vi.fn(),
  } = options;

  const props = {
    adjustModeEnabled,
    editMode,
    isAdjustableView,
    rules: createMockRules(),
    view,
    snapshotCount,
    onDownloadMarkdown: vi.fn(),
    onEditModeChange,
    onToggleAdjustMode: vi.fn(),
    onVersionsClick,
    onViewChange: vi.fn(),
  };

  return { ...render(<CompletedToolbar {...props} />), props };
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
// Tests
// ---------------------------------------------------------------------------

describe("CompletedToolbar", () => {
  describe("two-row layout", () => {
    test("renders format buttons row with all four view buttons", () => {
      renderToolbar();

      expect(screen.getByTestId("format-view-reader")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-markdown")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-handover")).toBeInTheDocument();
      expect(screen.getByTestId("format-view-json")).toBeInTheDocument();
    });

    test("renders action buttons row with download button", () => {
      renderToolbar();

      expect(screen.getByTestId("toolbar-download")).toBeInTheDocument();
    });

    test("renders format row and action row as separate containers", () => {
      renderToolbar();

      const formatRow = screen.getByTestId("toolbar-format-row");
      const actionRow = screen.getByTestId("toolbar-action-row");

      expect(formatRow).toBeInTheDocument();
      expect(actionRow).toBeInTheDocument();
    });
  });

  describe("edit button visibility", () => {
    test("shows edit button when view is reader", () => {
      renderToolbar({ view: "reader" });

      expect(screen.getByTestId("toggle-edit-mode")).toBeInTheDocument();
    });

    test("hides edit button when view is not reader", () => {
      renderToolbar({ view: "markdown" });

      expect(screen.queryByTestId("toggle-edit-mode")).not.toBeInTheDocument();
    });

    test("hides edit button for json view", () => {
      renderToolbar({ view: "json" });

      expect(screen.queryByTestId("toggle-edit-mode")).not.toBeInTheDocument();
    });
  });

  describe("versions button visibility", () => {
    test("shows versions button when snapshotCount > 0", () => {
      renderToolbar({ snapshotCount: 3 });

      expect(screen.getByTestId("toolbar-versions")).toBeInTheDocument();
    });

    test("hides versions button when snapshotCount is 0", () => {
      renderToolbar({ snapshotCount: 0 });

      expect(screen.queryByTestId("toolbar-versions")).not.toBeInTheDocument();
    });

    test("hides versions button when snapshotCount is undefined", () => {
      renderToolbar({ snapshotCount: undefined });

      expect(screen.queryByTestId("toolbar-versions")).not.toBeInTheDocument();
    });
  });

  describe("exclusive toggle logic", () => {
    test("clicking edit button calls onEditModeChange with 'edit'", async () => {
      const user = userEvent.setup();
      const onEditModeChange = vi.fn();
      renderToolbar({ view: "reader", editMode: "view", onEditModeChange });

      await user.click(screen.getByTestId("toggle-edit-mode"));

      expect(onEditModeChange).toHaveBeenCalledWith("edit");
    });

    test("clicking active edit button calls onEditModeChange with 'view'", async () => {
      const user = userEvent.setup();
      const onEditModeChange = vi.fn();
      renderToolbar({ view: "reader", editMode: "edit", onEditModeChange });

      await user.click(screen.getByTestId("toggle-edit-mode"));

      expect(onEditModeChange).toHaveBeenCalledWith("view");
    });

    test("clicking adjust button when edit is active calls onToggleAdjustMode", async () => {
      const user = userEvent.setup();
      const { props } = renderToolbar({
        view: "reader",
        editMode: "edit",
        isAdjustableView: true,
      });

      const adjustButton = screen.getByTestId("toggle-adjust-mode-reader");
      await user.click(adjustButton);

      expect(props.onToggleAdjustMode).toHaveBeenCalled();
    });
  });

  describe("versions button", () => {
    test("calls onVersionsClick when clicked", async () => {
      const user = userEvent.setup();
      const onVersionsClick = vi.fn();
      renderToolbar({ snapshotCount: 2, onVersionsClick });

      await user.click(screen.getByTestId("toolbar-versions"));

      expect(onVersionsClick).toHaveBeenCalledTimes(1);
    });
  });
});
