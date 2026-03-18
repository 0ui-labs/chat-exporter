import type {
  AdjustmentSessionDetail,
  FormatRule,
} from "@chat-exporter/shared";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  getBlockTypeLabel,
  getRuleLabel,
  rulesLabels,
} from "@/components/format-workspace/labels";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import type { ViewMode } from "@/components/format-workspace/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SortKey = "title" | "scope" | "date";
type SortDir = "asc" | "desc";

type RulesListModalProps = {
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

const modalLabels = {
  title: "Formatierungsregeln",
  description: "Alle aktiven Regeln für diesen Import verwalten.",
  searchPlaceholder: "Regeln durchsuchen...",
  noResults: "Keine Regeln gefunden.",
  scopeAll: "Alle Imports",
  scopeLocal: "Nur dieser Import",
  disable: "Deaktivieren",
  disabling: "Wird deaktiviert...",
  delete: "Löschen",
  deleting: "Wird gelöscht...",
  colRule: "Regel",
  colScope: "Geltungsbereich",
  colActions: "Aktionen",
} as const;

const scopeOrder: Record<string, number> = {
  import_local: 0,
  format_profile: 1,
};

function sortRules(
  rules: FormatRule[],
  sortKey: SortKey,
  sortDir: SortDir,
): FormatRule[] {
  return [...rules].sort((a, b) => {
    let cmp: number;
    switch (sortKey) {
      case "title":
        cmp = a.instruction.localeCompare(b.instruction, "de");
        break;
      case "scope":
        cmp = (scopeOrder[a.scope] ?? 2) - (scopeOrder[b.scope] ?? 2);
        break;
      default:
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
}

function describeSelectorStrategy(selector: unknown): string {
  const s =
    selector && typeof selector === "object"
      ? (selector as Record<string, unknown>)
      : null;
  if (!s) return "Unbekannter Selektor";

  const strategy = s.strategy as string | undefined;
  const blockType =
    typeof s.blockType === "string" ? getBlockTypeLabel(s.blockType) : null;

  switch (strategy) {
    case "exact":
      return blockType
        ? `Exakter Block: ${blockType} #${(s.blockIndex as number) + 1}`
        : "Exakter Block";
    case "block_type":
      return blockType
        ? `Alle Blöcke vom Typ: ${blockType}`
        : "Alle Blöcke eines Typs";
    case "prefix_before_colon":
      return blockType
        ? `Präfix vor Doppelpunkt in: ${blockType}`
        : "Präfix vor Doppelpunkt";
    case "markdown_table":
      return "Alle Markdown-Tabellen";
    case "compound": {
      const parts: string[] = [];

      if (blockType) parts.push(blockType);

      const role = typeof s.messageRole === "string" ? s.messageRole : null;
      if (role) parts.push(`Rolle: ${role}`);

      const level = typeof s.headingLevel === "number" ? s.headingLevel : null;
      if (level) parts.push(`H${level}`);

      const pos = typeof s.position === "string" ? s.position : null;
      if (pos) parts.push(pos === "first" ? "Erster Block" : "Letzter Block");

      const pattern = typeof s.textPattern === "string" ? s.textPattern : null;
      if (pattern) parts.push(`Pattern: "${pattern}"`);

      const ctx =
        s.context && typeof s.context === "object"
          ? (s.context as Record<string, unknown>)
          : null;
      if (ctx?.previousSibling) parts.push("nach bestimmtem Block");
      if (ctx?.nextSibling) parts.push("vor bestimmtem Block");

      return parts.length > 0
        ? `Compound: ${parts.join(", ")}`
        : "Compound-Filter (alle Blöcke)";
    }
    default:
      return `Strategie: ${strategy ?? "unbekannt"}`;
  }
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  );
}

export function RulesListModal({
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
}: RulesListModalProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const searchRef = useRef<HTMLInputElement>(null);

  const activeRules = rules.filter((rule) => rule.status === "active");
  const activeCount = activeRules.length;

  const filteredRules = useMemo(() => {
    const query = search.toLowerCase().trim();
    const filtered = query
      ? activeRules.filter((rule) =>
          rule.instruction.toLowerCase().includes(query),
        )
      : activeRules;
    return sortRules(filtered, sortKey, sortDir);
  }, [activeRules, search, sortKey, sortDir]);

  const showSearch = activeRules.length >= 50;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          onLeaveRule();
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              data-testid="rules-list-trigger"
              size="sm"
              variant="outline"
            >
              {rulesLabels.activeRulesCount(activeCount)}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Aktive Formatierungsregeln anzeigen</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="flex min-h-[min(80vh,700px)] w-full max-w-[min(90vw,1152px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{modalLabels.title}</DialogTitle>
          <DialogDescription>{modalLabels.description}</DialogDescription>
        </DialogHeader>

        {/* Search bar — only visible with 6+ active rules */}
        {showSearch && (
          <div className="shrink-0 border-b border-border bg-muted/80 px-6 py-2">
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="h-8 pl-8 text-sm"
                data-testid="rules-search"
                placeholder={modalLabels.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredRules.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {search ? modalLabels.noResults : rulesLabels.noActiveRules}
            </p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[55%]" />
                <col className="w-[25%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5">
                    <button
                      className="inline-flex items-center hover:text-foreground"
                      type="button"
                      onClick={() => handleSort("title")}
                    >
                      {modalLabels.colRule}
                      <SortIndicator
                        active={sortKey === "title"}
                        dir={sortDir}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-2.5">
                    <button
                      className="inline-flex items-center hover:text-foreground"
                      type="button"
                      onClick={() => handleSort("scope")}
                    >
                      {modalLabels.colScope}
                      <SortIndicator
                        active={sortKey === "scope"}
                        dir={sortDir}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-2.5">{modalLabels.colActions}</th>
                </tr>
              </thead>
              <tbody className="bg-background">
                {filteredRules.map((rule) => (
                  <RuleTableRow
                    key={rule.id}
                    detail={getExplanationDetail(rule)}
                    disabling={Boolean(disablingRuleById[rule.id])}
                    error={explanationErrorById[rule.id] ?? null}
                    expanded={expandedRuleId === rule.id}
                    loading={Boolean(explanationLoadingById[rule.id])}
                    promoting={Boolean(promotingRuleById[rule.id])}
                    rule={rule}
                    view={view}
                    onDemote={() => onDemoteRule(rule.id)}
                    onDisable={() => onDisableRule(rule.id)}
                    onHover={() => onHoverRule(rule.id)}
                    onLeave={onLeaveRule}
                    onPromote={() => onPromoteRule(rule.id)}
                    onToggle={() => onToggleRuleExplanation(rule)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Single rule table row
// ---------------------------------------------------------------------------

type RuleTableRowProps = {
  detail: AdjustmentSessionDetail | null;
  disabling: boolean;
  error: string | null;
  expanded: boolean;
  loading: boolean;
  promoting: boolean;
  rule: FormatRule;
  view: ViewMode;
  onDemote: () => void;
  onDisable: () => void;
  onHover: () => void;
  onLeave: () => void;
  onPromote: () => void;
  onToggle: () => void;
};

function RuleTableRow({
  detail,
  disabling,
  error,
  expanded,
  loading,
  promoting,
  rule,
  view,
  onDemote,
  onDisable,
  onHover,
  onLeave,
  onPromote,
  onToggle,
}: RuleTableRowProps) {
  return (
    <>
      <tr
        className="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
      >
        {/* Regel */}
        <td className="truncate px-6 py-3">
          <button
            className="flex max-w-full items-center gap-2 text-left font-medium text-foreground"
            data-testid="rules-list-expand-toggle"
            type="button"
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{getRuleLabel(rule)}</span>
          </button>
        </td>

        {/* Geltungsbereich */}
        <td className="whitespace-nowrap px-4 py-3">
          {rule.scope === "import_local" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="rules-list-promote"
                  size="sm"
                  variant="ghost"
                  disabled={promoting}
                  onClick={onPromote}
                >
                  <Globe className="mr-1.5 h-3.5 w-3.5" />
                  {modalLabels.scopeLocal}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Regel auf alle Imports übertragen</p>
              </TooltipContent>
            </Tooltip>
          ) : rule.scope === "format_profile" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="rules-list-demote"
                  size="sm"
                  variant="ghost"
                  disabled={promoting}
                  onClick={onDemote}
                >
                  <Globe className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  {modalLabels.scopeAll}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Regel auf diesen Import beschränken</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </td>

        {/* Aktionen */}
        <td className="whitespace-nowrap px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="rules-list-disable"
                size="sm"
                variant="destructive-outline"
                disabled={disabling}
                onClick={onDisable}
              >
                {disabling ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {modalLabels.disabling}
                  </>
                ) : (
                  modalLabels.disable
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Regel deaktivieren</p>
            </TooltipContent>
          </Tooltip>
        </td>
      </tr>

      {/* Expanded description row */}
      {expanded && (
        <tr className="border-b border-border/60 bg-muted/80">
          <td className="px-6 py-3" colSpan={3}>
            <div className="space-y-2 pl-6">
              {loading ? (
                <p className="text-sm text-muted-foreground">
                  {rulesLabels.loading}
                </p>
              ) : error ? (
                <div className="rounded-lg border border-red-300/40 bg-red-100/70 px-3 py-2 text-sm text-red-900">
                  {error}
                </div>
              ) : detail ? (
                <>
                  <div data-testid="rules-list-explanation">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {rulesLabels.rationale}
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {rule.instruction ?? rulesLabels.defaultRationale}
                    </p>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">
                        Matching:{" "}
                      </span>
                      {describeSelectorStrategy(rule.selector)}
                    </p>
                    <p>
                      {describeSelectorScope({
                        blockType: detail.session.selection.blockType,
                        exactLabel: rulesLabels.exactScopeNote,
                        scope: rule.scope,
                        selector: rule.selector,
                        view,
                      })}
                    </p>
                  </div>

                  {rule && (
                    <pre className="overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                      <code>{JSON.stringify(rule, null, 2)}</code>
                    </pre>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">
                        Matching:{" "}
                      </span>
                      {describeSelectorStrategy(rule.selector)}
                    </p>
                    <p>
                      {rule.scope === "format_profile"
                        ? rulesLabels.globalScopeNote
                        : rulesLabels.defaultRationale}
                    </p>
                  </div>
                  {rule && (
                    <pre className="overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                      <code>{JSON.stringify(rule, null, 2)}</code>
                    </pre>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
