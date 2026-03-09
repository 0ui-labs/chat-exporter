import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { useEffect, useRef, useState } from "react";
import {
  getRuleKindLabel,
  getRuleLabel,
} from "@/components/format-workspace/labels";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import type { ViewMode } from "@/components/format-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rpc } from "@/lib/rpc";

type RulesListPopoverProps = {
  disablingRuleById: Record<string, boolean>;
  rules: FormatRule[];
  view: ViewMode;
  onDisableRule: (ruleId: string) => void;
  onHoverRule: (ruleId: string) => void;
  onLeaveRule: () => void;
};

export function RulesListPopover({
  disablingRuleById,
  rules,
  view,
  onDisableRule,
  onHoverRule,
  onLeaveRule,
}: RulesListPopoverProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [explanationCache, setExplanationCache] = useState<
    Record<string, AdjustmentSessionDetail>
  >({});
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const activeRules = rules.filter((rule) => rule.status === "active");
  const activeCount = activeRules.length;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleMouseDown(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      onLeaveRule();
    };
  }, [open, onLeaveRule]);

  async function handleToggleExpand(rule: FormatRule) {
    if (expandedRuleId === rule.id) {
      setExpandedRuleId(null);
      return;
    }

    setExpandedRuleId(rule.id);

    const sourceSessionId = rule.sourceSessionId;

    if (!sourceSessionId || explanationCache[sourceSessionId]) {
      return;
    }

    setLoadingById((current) => ({ ...current, [rule.id]: true }));
    setErrorById((current) => {
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
      setErrorById((current) => ({
        ...current,
        [rule.id]:
          error instanceof Error
            ? error.message
            : "Regelerklärung konnte nicht geladen werden.",
      }));
    } finally {
      setLoadingById((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        data-testid="rules-list-trigger"
        size="sm"
        variant="outline"
        onClick={() => setOpen((prev) => !prev)}
      >
        {activeCount > 0 ? `${activeCount} Regeln aktiv` : "Regeln"}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-2xl border border-border bg-card shadow-lg">
          {activeRules.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Keine aktiven Regeln.
            </p>
          ) : (
            activeRules.map((rule) => {
              const isExpanded = expandedRuleId === rule.id;
              const isLoading = Boolean(loadingById[rule.id]);
              const error = errorById[rule.id] ?? null;
              const detail = rule.sourceSessionId
                ? (explanationCache[rule.sourceSessionId] ?? null)
                : null;

              return (
                <div
                  key={rule.id}
                  className="border-b border-border/60 last:border-b-0"
                  onMouseEnter={() => onHoverRule(rule.id)}
                  onMouseLeave={onLeaveRule}
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      className="flex-1 text-left text-sm font-medium text-foreground truncate"
                      data-testid="rules-list-expand-toggle"
                      type="button"
                      onClick={() => {
                        void handleToggleExpand(rule);
                      }}
                    >
                      {getRuleLabel(rule)}
                    </button>
                    <Badge variant="secondary">
                      {getRuleKindLabel(rule.kind)}
                    </Badge>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 px-4 pb-3">
                      {isLoading ? (
                        <p className="text-sm text-muted-foreground">
                          Wird geladen...
                        </p>
                      ) : error ? (
                        <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-2 text-sm text-red-900">
                          {error}
                        </div>
                      ) : detail ? (
                        <>
                          <div
                            className="rounded-2xl border border-border/80 bg-background/80 px-3 py-2"
                            data-testid="rules-list-explanation"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Begründung
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {detail.session.previewArtifact?.rationale ??
                                "Diese Regel wurde aus einer früheren Anpassungssession für diesen Import erzeugt."}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-border/80 bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                            {describeSelectorScope({
                              blockType: detail.session.selection.blockType,
                              exactLabel:
                                "Diese Regel gilt nur für die ursprüngliche Auswahl.",
                              selector:
                                detail.session.previewArtifact?.draftRule
                                  .selector ?? rule.selector,
                              view,
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Diese Regel wurde aus einer früheren Anpassungssession
                          für diesen Import erzeugt.
                        </p>
                      )}

                      <Button
                        data-testid="rules-list-undo"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(disablingRuleById[rule.id])}
                        onClick={() => onDisableRule(rule.id)}
                      >
                        {disablingRuleById[rule.id]
                          ? "Wird rückgängig gemacht..."
                          : "Rückgängig"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
