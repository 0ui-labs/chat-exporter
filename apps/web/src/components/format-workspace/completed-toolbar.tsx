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

import { adjustmentLabels } from "@/components/format-workspace/labels";
import { RulesListModal } from "@/components/format-workspace/rules-list-modal";
import type { EditMode, ViewMode } from "@/components/format-workspace/types";
import type { useFormatRules } from "@/components/format-workspace/use-format-rules";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
      {/* Row 1: View selector pill group */}
      <div data-testid="toolbar-format-row" className="flex flex-wrap gap-2">
        <div
          data-testid="view-selector-pill-group"
          className="inline-flex rounded-xl border border-border/80 bg-background/60 p-1"
        >
          {outputViews.map((outputView) => {
            const isActive = view === outputView.value;
            return (
              <button
                key={outputView.value}
                data-testid={`format-view-${outputView.value}`}
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onViewChange(outputView.value)}
              >
                {outputView.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Action buttons */}
      <div
        data-testid="toolbar-action-row"
        className="flex flex-wrap items-center gap-2"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="toolbar-download"
              type="button"
              size="icon"
              variant="outline"
              disabled={!onDownloadMarkdown}
              onClick={onDownloadMarkdown}
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Markdown-Datei herunterladen</p>
          </TooltipContent>
        </Tooltip>

        <Button
          data-testid="toolbar-copy-all"
          type="button"
          size="icon"
          variant="outline"
          title={
            copySuccess
              ? adjustmentLabels.copyAllSuccess
              : adjustmentLabels.copyAllAction
          }
          disabled={!onCopyAll}
          onClick={onCopyAll}
        >
          {copySuccess ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>

        {snapshotCount && snapshotCount > 0 ? (
          <Button
            data-testid="toolbar-versions"
            type="button"
            size="icon"
            variant="outline"
            title={adjustmentLabels.versions}
            onClick={onVersionsClick}
          >
            <History className="h-4 w-4" />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid={`toggle-adjust-mode-${view}`}
                  type="button"
                  size="icon"
                  variant={adjustModeEnabled ? "default" : "outline"}
                  onClick={onToggleAdjustMode}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Einzelne Stellen im Text markieren und anpassen lassen</p>
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}

        {view === "reader" ? (
          <Button
            data-testid="toggle-edit-mode"
            type="button"
            size="icon"
            variant={editMode === "edit" ? "default" : "outline"}
            title={
              editMode === "edit"
                ? adjustmentLabels.endEdit
                : adjustmentLabels.edit
            }
            onClick={() =>
              onEditModeChange(editMode === "edit" ? "view" : "edit")
            }
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
