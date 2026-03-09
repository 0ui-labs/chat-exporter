import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ViewMode } from "@/components/format-workspace/types";
import { orpc } from "@/lib/orpc";
import { rpc } from "@/lib/rpc";

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

export function useFormatRules(
  view: ViewMode,
  jobId: string,
  activeSessionDetail: AdjustmentSessionDetail | null,
  onRejectSuccess: () => void,
) {
  const queryClient = useQueryClient();
  const isAdjustableView = adjustableViews.has(view);

  const rulesQuery = useQuery({
    ...orpc.rules.list.queryOptions({
      input: { importId: jobId, format: view },
    }),
    enabled: isAdjustableView,
  });
  const activeRules: FormatRule[] = rulesQuery.data ?? [];

  const [disablingRuleById, setDisablingRuleById] = useState<
    Record<string, boolean>
  >({});
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);

  async function handleDisableRule(ruleId: string): Promise<boolean> {
    setDisablingRuleById((current) => ({ ...current, [ruleId]: true }));

    try {
      await rpc.rules.disable({ id: ruleId });
      queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      setHoveredRuleId((current) => (current === ruleId ? null : current));
      return true;
    } catch {
      return false;
    } finally {
      setDisablingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  async function handleRejectLastChange() {
    if (!activeSessionDetail) return;

    let matchingRule = activeRules.find(
      (rule) =>
        rule.sourceSessionId === activeSessionDetail.session.id &&
        rule.status === "active",
    );

    if (!matchingRule) {
      try {
        const freshRules = await rpc.rules.list({
          importId: jobId,
          format: view,
        });
        queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
        matchingRule = freshRules.find(
          (rule) =>
            rule.sourceSessionId === activeSessionDetail.session.id &&
            rule.status === "active",
        );
      } catch {
        return;
      }
    }

    if (!matchingRule) return;

    const success = await handleDisableRule(matchingRule.id);
    if (success) {
      onRejectSuccess();
    }
  }

  return {
    activeRules,
    disablingRuleById,
    hoveredRuleId,
    setHoveredRuleId,
    handleDisableRule,
    handleRejectLastChange,
  };
}
