import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getAdjustableViews,
  type ViewMode,
} from "@/components/format-workspace/types";
import { useRuleExplanations } from "@/components/format-workspace/use-rule-explanations";
import { orpc } from "@/lib/orpc";
import { demoteFormatRule, promoteFormatRule, rpc } from "@/lib/rpc";

function errorMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function removeKey(
  rec: Record<string, boolean>,
  key: string,
): Record<string, boolean> {
  const next = { ...rec };
  delete next[key];
  return next;
}

export function useFormatRules(view: ViewMode, jobId: string) {
  const queryClient = useQueryClient();
  const isAdjustableView = getAdjustableViews().has(view);
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
  const invalidateRules = () =>
    queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });

  async function handleDisableRule(ruleId: string): Promise<boolean> {
    setDisablingRuleById((c) => ({ ...c, [ruleId]: true }));
    setDisableError(null);
    try {
      await rpc.rules.disable({ id: ruleId });
      invalidateRules();
      setHoveredRuleId((c) => (c === ruleId ? null : c));
      return true;
    } catch (error) {
      setDisableError(
        errorMsg(error, "Regel konnte nicht deaktiviert werden."),
      );
      return false;
    } finally {
      setDisablingRuleById((c) => removeKey(c, ruleId));
    }
  }

  async function handleRejectLastChange(
    sessionDetail: AdjustmentSessionDetail,
  ): Promise<boolean> {
    const findMatch = (rules: FormatRule[]) =>
      rules.find(
        (r) =>
          r.sourceSessionId === sessionDetail.session.id &&
          r.status === "active",
      );
    let matchingRule = findMatch(activeRules);
    if (!matchingRule) {
      try {
        const freshRules = await rpc.rules.list({
          importId: jobId,
          format: view,
        });
        invalidateRules();
        matchingRule = findMatch(freshRules);
      } catch {
        return false;
      }
    }
    if (!matchingRule) return false;
    return handleDisableRule(matchingRule.id);
  }

  async function handlePromoteRule(ruleId: string): Promise<boolean> {
    setPromotingRuleById((c) => ({ ...c, [ruleId]: true }));
    setPromoteError(null);
    try {
      await promoteFormatRule(ruleId);
      invalidateRules();
      return true;
    } catch (error) {
      setPromoteError(
        errorMsg(error, "Regel konnte nicht hochgestuft werden."),
      );
      return false;
    } finally {
      setPromotingRuleById((c) => removeKey(c, ruleId));
    }
  }

  async function handleDemoteRule(ruleId: string): Promise<boolean> {
    setPromotingRuleById((c) => ({ ...c, [ruleId]: true }));
    setPromoteError(null);
    try {
      await demoteFormatRule(ruleId, jobId);
      invalidateRules();
      return true;
    } catch (error) {
      setPromoteError(
        errorMsg(error, "Regel konnte nicht herabgestuft werden."),
      );
      return false;
    } finally {
      setPromotingRuleById((c) => removeKey(c, ruleId));
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
    ...explanations,
  };
}
