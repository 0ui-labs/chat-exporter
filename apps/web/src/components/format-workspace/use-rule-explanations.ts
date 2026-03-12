import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { useState } from "react";
import { rpc } from "@/lib/rpc";

export function useRuleExplanations() {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [explanationCache, setExplanationCache] = useState<
    Record<string, AdjustmentSessionDetail>
  >({});
  const [explanationLoadingById, setExplanationLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [explanationErrorById, setExplanationErrorById] = useState<
    Record<string, string>
  >({});

  async function handleToggleRuleExplanation(rule: FormatRule) {
    if (expandedRuleId === rule.id) {
      setExpandedRuleId(null);
      return;
    }

    setExpandedRuleId(rule.id);

    const sourceSessionId = rule.sourceSessionId;

    if (!sourceSessionId || explanationCache[sourceSessionId]) {
      return;
    }

    setExplanationLoadingById((current) => ({ ...current, [rule.id]: true }));
    setExplanationErrorById((current) => {
      const next = { ...current };
      delete next[rule.id];
      return next;
    });

    try {
      const detail = await rpc.adjustments.getSession({ id: sourceSessionId });
      setExplanationCache((current) => ({
        ...current,
        [sourceSessionId]: detail,
      }));
    } catch (error) {
      setExplanationErrorById((current) => ({
        ...current,
        [rule.id]:
          error instanceof Error
            ? error.message
            : "Regelerklärung konnte nicht geladen werden.",
      }));
    } finally {
      setExplanationLoadingById((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
    }
  }

  function getExplanationDetail(
    rule: FormatRule,
  ): AdjustmentSessionDetail | null {
    return rule.sourceSessionId
      ? (explanationCache[rule.sourceSessionId] ?? null)
      : null;
  }

  return {
    expandedRuleId,
    explanationLoadingById,
    explanationErrorById,
    handleToggleRuleExplanation,
    getExplanationDetail,
  };
}
