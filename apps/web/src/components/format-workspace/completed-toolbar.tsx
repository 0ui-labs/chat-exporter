import { defaultRegistry } from "@chat-exporter/shared";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  History,
  Pencil,
  Settings2,
} from "lucide-react";

import {
  adjustmentLabels,
  getAdjustViewLabel,
  getEndAdjustLabel,
} from "@/components/format-workspace/labels";
import { RulesListModal } from "@/components/format-workspace/rules-list-modal";
import type { EditMode, ViewMode } from "@/components/format-workspace/types";
import type { useFormatRules } from "@/components/format-workspace/use-format-rules";
import { Button } from "@/components/ui/button";

const outputViews = defaultRegistry.getAll().map((f) => ({
  value: f.id as ViewMode,
  label: f.label,
}));

type CompletedToolbarProps = {
  adjustModeEnabled: boolean;
  copySuccess?: boolean;
  deletionsCount?: number;
  editMode: EditMode;
  isAdjustableView: boolean;
  rules: ReturnType<typeof useFormatRules>;
  showDeleted?: boolean;
  snapshotCount?: number;
  view: ViewMode;
  onCopyAll?: () => void;
  onDownloadMarkdown?: () => void;
  onEditModeChange: (mode: EditMode) => void;
  onToggleAdjustMode: () => void;
  onToggleShowDeleted?: () => void;
  onVersionsClick?: () => void;
  onViewChange: (view: ViewMode) => void;
};

export function CompletedToolbar({
  adjustModeEnabled,
  copySuccess,
  deletionsCount,
  editMode,
  isAdjustableView,
  rules,
  showDeleted,
  snapshotCount,
  view,
  onCopyAll,
  onDownloadMarkdown,
  onEditModeChange,
  onToggleAdjustMode,
  onToggleShowDeleted,
  onVersionsClick,
  onViewChange,
}: CompletedToolbarProps) {
  return (
    <div className="space-y-2">
      {/* Row 1: Format buttons */}
      <div data-testid="toolbar-format-row" className="flex flex-wrap gap-2">
        {outputViews.map((outputView) => (
          <Button
            key={outputView.value}
            data-testid={`format-view-${outputView.value}`}
            type="button"
            size="sm"
            variant={view === outputView.value ? "default" : "outline"}
            onClick={() => onViewChange(outputView.value)}
          >
            {outputView.label}
          </Button>
        ))}
      </div>

      {/* Row 2: Action buttons */}
      <div
        data-testid="toolbar-action-row"
        className="flex flex-wrap items-center gap-2"
      >
        {onDownloadMarkdown ? (
          <Button
            data-testid="toolbar-download"
            type="button"
            size="sm"
            variant="outline"
            onClick={onDownloadMarkdown}
          >
            <Download className="mr-2 h-4 w-4" />
            {adjustmentLabels.downloadAction}
          </Button>
        ) : (
          <Button
            data-testid="toolbar-download"
            type="button"
            size="sm"
            variant="outline"
            disabled
          >
            <Download className="mr-2 h-4 w-4" />
            {adjustmentLabels.downloadAction}
          </Button>
        )}

        {onCopyAll ? (
          <Button
            data-testid="toolbar-copy-all"
            type="button"
            size="sm"
            variant="outline"
            onClick={onCopyAll}
          >
            {copySuccess ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copySuccess
              ? adjustmentLabels.copyAllSuccess
              : adjustmentLabels.copyAllAction}
          </Button>
        ) : (
          <Button
            data-testid="toolbar-copy-all"
            type="button"
            size="sm"
            variant="outline"
            disabled
          >
            <Copy className="mr-2 h-4 w-4" />
            {adjustmentLabels.copyAllAction}
          </Button>
        )}

        {snapshotCount && snapshotCount > 0 ? (
          <Button
            data-testid="toolbar-versions"
            type="button"
            size="sm"
            variant="outline"
            onClick={onVersionsClick}
          >
            <History className="mr-2 h-4 w-4" />
            {adjustmentLabels.versions}
          </Button>
        ) : null}

        {deletionsCount && deletionsCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={showDeleted ? "default" : "outline"}
            onClick={onToggleShowDeleted}
          >
            {showDeleted ? (
              <EyeOff className="mr-2 h-4 w-4" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {showDeleted
              ? "Gelöschte ausblenden"
              : `${deletionsCount} gelöscht`}
          </Button>
        ) : null}

        {isAdjustableView ? (
          <>
            <RulesListModal
              disablingRuleById={rules.disablingRuleById}
              expandedRuleId={rules.expandedRuleId}
              explanationErrorById={rules.explanationErrorById}
              explanationLoadingById={rules.explanationLoadingById}
              promotingRuleById={rules.promotingRuleById}
              rules={rules.activeRules}
              view={view}
              getExplanationDetail={rules.getExplanationDetail}
              onDemoteRule={(ruleId) => {
                void rules.handleDemoteRule(ruleId);
              }}
              onDisableRule={(ruleId) => {
                void rules.handleDisableRule(ruleId);
              }}
              onHoverRule={(ruleId) => rules.setHoveredRuleId(ruleId)}
              onLeaveRule={() => rules.setHoveredRuleId(null)}
              onPromoteRule={(ruleId) => {
                void rules.handlePromoteRule(ruleId);
              }}
              onToggleRuleExplanation={rules.handleToggleRuleExplanation}
            />
            <Button
              data-testid={`toggle-adjust-mode-${view}`}
              type="button"
              size="sm"
              variant={adjustModeEnabled ? "default" : "outline"}
              onClick={onToggleAdjustMode}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              {adjustModeEnabled
                ? getEndAdjustLabel()
                : getAdjustViewLabel(view)}
            </Button>
          </>
        ) : null}

        {view === "reader" ? (
          <Button
            data-testid="toggle-edit-mode"
            type="button"
            size="sm"
            variant={editMode === "edit" ? "default" : "outline"}
            onClick={() =>
              onEditModeChange(editMode === "edit" ? "view" : "edit")
            }
          >
            <Pencil className="mr-2 h-4 w-4" />
            {editMode === "edit"
              ? adjustmentLabels.endEdit
              : adjustmentLabels.edit}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
