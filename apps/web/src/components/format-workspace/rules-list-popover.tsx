import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getRuleKindLabel,
  getRuleLabel,
} from "@/components/format-workspace/labels";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import type { ViewMode } from "@/components/format-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RulesListPopoverProps = {
  disablingRuleById: Record<string, boolean>;
  expandedRuleId: string | null;
  explanationErrorById: Record<string, string>;
  explanationLoadingById: Record<string, boolean>;
  promotingRuleById: Record<string, boolean>;
  rules: FormatRule[];
  view: ViewMode;
  getExplanationDetail: (rule: FormatRule) => AdjustmentSessionDetail | null;
  onDemoteRule: (ruleId: string) => void;
  onDisableRule: (ruleId: string) => void;
  onHoverRule: (ruleId: string) => void;
  onLeaveRule: () => void;
  onPromoteRule: (ruleId: string) => void;
  onToggleRuleExplanation: (rule: FormatRule) => void;
};

export function RulesListPopover({
  disablingRuleById,
  expandedRuleId,
  explanationErrorById,
  explanationLoadingById,
  promotingRuleById,
  rules,
  view,
  getExplanationDetail,
  onDemoteRule,
  onDisableRule,
  onHoverRule,
  onLeaveRule,
  onPromoteRule,
  onToggleRuleExplanation,
}: RulesListPopoverProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
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
            <ul className="list-none p-0 m-0">
              {activeRules.map((rule) => {
                const isExpanded = expandedRuleId === rule.id;
                const isLoading = Boolean(explanationLoadingById[rule.id]);
                const error = explanationErrorById[rule.id] ?? null;
                const detail = getExplanationDetail(rule);

                return (
                  <li
                    key={rule.id}
                    className="border-b border-border/60 last:border-b-0"
                    onMouseEnter={() => onHoverRule(rule.id)}
                    onMouseLeave={onLeaveRule}
                  >
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        className="flex-1 flex items-center gap-1.5 text-left text-sm font-medium text-foreground truncate"
                        data-testid="rules-list-expand-toggle"
                        type="button"
                        onClick={() => onToggleRuleExplanation(rule)}
                      >
                        {rule.scope === "format_profile" && (
                          <Globe
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            data-testid="rules-list-globe-icon"
                          />
                        )}
                        {getRuleLabel(rule)}
                      </button>
                      <Badge variant="secondary">
                        {getRuleKindLabel(rule.kind)}
                      </Badge>
                      {rule.scope === "import_local" ? (
                        <Button
                          data-testid="rules-list-promote"
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(promotingRuleById[rule.id])}
                          title="Für alle Imports"
                          onClick={() => onPromoteRule(rule.id)}
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                      ) : rule.scope === "format_profile" ? (
                        <Button
                          data-testid="rules-list-demote"
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(promotingRuleById[rule.id])}
                          title="Nur dieser Import"
                          onClick={() => onDemoteRule(rule.id)}
                        >
                          <Globe className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      ) : null}
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
                                scope: rule.scope,
                                selector:
                                  detail.session.previewArtifact?.draftRule
                                    .selector ?? rule.selector,
                                view,
                              })}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {rule.scope === "format_profile"
                              ? "Diese Regel gilt für alle Imports in diesem Format."
                              : "Diese Regel wurde aus einer früheren Anpassungssession für diesen Import erzeugt."}
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
