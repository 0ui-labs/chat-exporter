import { Download, Eye, EyeOff, Settings2 } from "lucide-react";

import {
  adjustmentLabels,
  getAdjustViewLabel,
  getEndAdjustLabel,
  getViewLabel,
} from "@/components/format-workspace/labels";
import { RulesListModal } from "@/components/format-workspace/rules-list-modal";
import type { ViewMode } from "@/components/format-workspace/types";
import type { useFormatRules } from "@/components/format-workspace/use-format-rules";
import { Button } from "@/components/ui/button";

const outputViews: { value: ViewMode; label: string }[] = [
  { value: "reader", label: getViewLabel("reader") },
  { value: "markdown", label: getViewLabel("markdown") },
  { value: "handover", label: getViewLabel("handover") },
  { value: "json", label: getViewLabel("json") },
];

type CompletedToolbarProps = {
  adjustModeEnabled: boolean;
  deletionsCount?: number;
  isAdjustableView: boolean;
  rules: ReturnType<typeof useFormatRules>;
  showDeleted?: boolean;
  view: ViewMode;
  onDownloadMarkdown?: () => void;
  onToggleAdjustMode: () => void;
  onToggleShowDeleted?: () => void;
  onViewChange: (view: ViewMode) => void;
};

export function CompletedToolbar({
  adjustModeEnabled,
  deletionsCount,
  isAdjustableView,
  rules,
  showDeleted,
  view,
  onDownloadMarkdown,
  onToggleAdjustMode,
  onToggleShowDeleted,
  onViewChange,
}: CompletedToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
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

      <div className="flex items-center gap-2">
        {onDownloadMarkdown ? (
          <Button
            data-testid="download-markdown"
            type="button"
            size="sm"
            variant="outline"
            onClick={onDownloadMarkdown}
          >
            <Download className="mr-2 h-4 w-4" />
            {adjustmentLabels.download}
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
      </div>
    </div>
  );
}
