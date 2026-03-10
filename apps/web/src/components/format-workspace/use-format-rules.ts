import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adjustableViews,
  type ViewMode,
} from "@/components/format-workspace/types";
import { useRuleExplanations } from "@/components/format-workspace/use-rule-explanations";
import { orpc } from "@/lib/orpc";
import { demoteFormatRule, promoteFormatRule, rpc } from "@/lib/rpc";

export function useFormatRules(view: ViewMode, jobId: string) {
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
  const [promotingRuleById, setPromotingRuleById] = useState<
    Record<string, boolean>
  >({});
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const explanations = useRuleExplanations();

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleDisableRule(ruleId: string): Promise<boolean> {
    setDisablingRuleById((current) => ({ ...current, [ruleId]: true }));
    setDisableError(null);

    try {
      await rpc.rules.disable({ id: ruleId });
      queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      setHoveredRuleId((current) => (current === ruleId ? null : current));
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Regel konnte nicht deaktiviert werden.";
      setDisableError(message);
      return false;
    } finally {
      setDisablingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  async function handleRejectLastChange(
    sessionDetail: AdjustmentSessionDetail,
  ): Promise<boolean> {
    let matchingRule = activeRules.find(
      (rule) =>
        rule.sourceSessionId === sessionDetail.session.id &&
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
            rule.sourceSessionId === sessionDetail.session.id &&
            rule.status === "active",
        );
      } catch {
        return false;
      }
    }

    if (!matchingRule) return false;

    return handleDisableRule(matchingRule.id);
  }

  async function handlePromoteRule(ruleId: string): Promise<boolean> {
    setPromotingRuleById((current) => ({ ...current, [ruleId]: true }));
    setPromoteError(null);

    try {
      await promoteFormatRule(ruleId);
      queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Regel konnte nicht hochgestuft werden.";
      setPromoteError(message);
      return false;
    } finally {
      setPromotingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  async function handleDemoteRule(ruleId: string): Promise<boolean> {
    setPromotingRuleById((current) => ({ ...current, [ruleId]: true }));
    setPromoteError(null);

    try {
      await demoteFormatRule(ruleId, jobId);
      queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Regel konnte nicht herabgestuft werden.";
      setPromoteError(message);
      return false;
    } finally {
      setPromotingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  return {
    activeRules,
    disablingRuleById,
    promotingRuleById,
    hoveredRuleId,
    disableError,
    promoteError,
    setHoveredRuleId,
    clearDisableError: () => setDisableError(null),
    clearPromoteError: () => setPromoteError(null),
    handleDisableRule,
    handlePromoteRule,
    handleDemoteRule,
    handleRejectLastChange,
    // Explanation state & handlers
    ...explanations,
  };
}
