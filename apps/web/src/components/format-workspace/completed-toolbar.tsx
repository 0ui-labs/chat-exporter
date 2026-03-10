import { Settings2 } from "lucide-react";

import { getViewLabel } from "@/components/format-workspace/labels";
import { RulesListPopover } from "@/components/format-workspace/rules-list-popover";
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
  isAdjustableView: boolean;
  rules: ReturnType<typeof useFormatRules>;
  view: ViewMode;
  onToggleAdjustMode: () => void;
  onViewChange: (view: ViewMode) => void;
};

export function CompletedToolbar({
  adjustModeEnabled,
  isAdjustableView,
  rules,
  view,
  onToggleAdjustMode,
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

      {isAdjustableView ? (
        <div className="flex items-center gap-2">
          <RulesListPopover
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
              ? "Anpassungsmodus beenden"
              : `${getViewLabel(view)} anpassen`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
