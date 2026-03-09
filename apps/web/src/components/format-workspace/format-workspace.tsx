import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clock3, LoaderCircle, Settings2 } from "lucide-react";

import type {
  AdjustmentSessionDetail,
  FormatRule,
  ImportJob
} from "@chat-exporter/shared";

import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import {
  getBlockTypeLabel,
  getRuleKindLabel,
  getRoleLabel,
  getViewLabel
} from "@/components/format-workspace/labels";
import { applyMarkdownRules } from "@/components/format-workspace/rule-engine";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import type {
  AdjustmentSelection,
  FloatingAdjustmentAnchor,
  ViewMode
} from "@/components/format-workspace/types";
import {
  appendAdjustmentMessage,
  createAdjustmentSession,
  disableFormatRule,
  discardAdjustmentSession,
  getAdjustmentSessionDetail,
  getFormatRules
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ActiveStage = {
  detail: string;
  label: string;
} | null;

type FormatWorkspaceProps = {
  activeStage: ActiveStage;
  elapsedTime: string;
  job: ImportJob;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
};

const outputViews: { value: ViewMode; label: string }[] = [
  { value: "reader", label: getViewLabel("reader") },
  { value: "markdown", label: getViewLabel("markdown") },
  { value: "handover", label: getViewLabel("handover") },
  { value: "json", label: getViewLabel("json") }
];

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

function getRuleLabel(rule: FormatRule) {
  const summary = rule.instruction.trim();

  if (summary.length <= 72) {
    return summary;
  }

  return `${summary.slice(0, 69).trimEnd()}...`;
}

function describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `Markdown-Zeilen ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${getRoleLabel(selection.messageRole)}-Nachricht ${selection.messageIndex + 1} · ${getBlockTypeLabel(selection.blockType)}`;
}

function getStatusLabel(job: ImportJob) {
  if (job.status === "completed") {
    return "Bereit";
  }

  if (job.status === "failed") {
    return "Fehlgeschlagen";
  }

  if (job.status === "queued") {
    return "Warteschlange";
  }

  return "Import läuft";
}

function renderArtifact(view: Exclude<ViewMode, "reader">, job: ImportJob) {
  if (!job.artifacts) {
    return "Artefakt ist noch nicht verfügbar.";
  }

  switch (view) {
    case "markdown":
      return job.artifacts.markdown;
    case "handover":
      return job.artifacts.handover;
    case "json":
      return job.artifacts.json;
  }
}

export function FormatWorkspace({
  activeStage,
  elapsedTime,
  job,
  view,
  onViewChange
}: FormatWorkspaceProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [draftMessageByView, setDraftMessageByView] = useState<Record<ViewMode, string>>({
    reader: "",
    markdown: "",
    handover: "",
    json: ""
  });
  const [adjustModeByView, setAdjustModeByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
  });
  const [guideDismissedByView, setGuideDismissedByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
  });
  const [sessionDetailByView, setSessionDetailByView] = useState<
    Record<ViewMode, AdjustmentSessionDetail | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [sessionErrorByView, setSessionErrorByView] = useState<Record<ViewMode, string | null>>({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [sessionLoadingByView, setSessionLoadingByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
  });
  const [sessionSelectionKeyByView, setSessionSelectionKeyByView] = useState<
    Record<ViewMode, string | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [submittingMessageByView, setSubmittingMessageByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
  });
  const [discardingByView, setDiscardingByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
  });
  const [explainedRuleIdByView, setExplainedRuleIdByView] = useState<Record<ViewMode, string | null>>({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [disablingRuleById, setDisablingRuleById] = useState<Record<string, boolean>>({});
  const [loadingExplanationBySessionId, setLoadingExplanationBySessionId] = useState<
    Record<string, boolean>
  >({});
  const [ruleExplanationBySessionId, setRuleExplanationBySessionId] = useState<
    Record<string, AdjustmentSessionDetail>
  >({});
  const [ruleExplanationErrorByView, setRuleExplanationErrorByView] = useState<
    Record<ViewMode, string | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [rulesByView, setRulesByView] = useState<Record<ViewMode, FormatRule[]>>({
    reader: [],
    markdown: [],
    handover: [],
    json: []
  });
  const [selectionByView, setSelectionByView] = useState<Record<ViewMode, AdjustmentSelection | null>>({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const [anchorByView, setAnchorByView] = useState<Record<ViewMode, FloatingAdjustmentAnchor | null>>({
    reader: null,
    markdown: null,
    handover: null,
    json: null
  });
  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  const isAdjustableView = adjustableViews.has(view);
  const isAdjustModeEnabled = adjustModeByView[view];
  const activeDraftMessage = draftMessageByView[view];
  const activeSessionDetail = sessionDetailByView[view];
  const activeSessionError = sessionErrorByView[view];
  const activeSessionLoading = sessionLoadingByView[view];
  const activeSelection = selectionByView[view];
  const activeAnchor = anchorByView[view];
  const activeSelectionKey = sessionSelectionKeyByView[view];
  const activeRules = rulesByView[view];
  const activeRuleChips = activeRules.filter((rule) => rule.status === "active");
  const explainedRuleId = explainedRuleIdByView[view];
  const explainedRule = explainedRuleId
    ? activeRuleChips.find((rule) => rule.id === explainedRuleId) ?? null
    : null;
  const explainedSessionId = explainedRule?.sourceSessionId;
  const explainedRuleDetail = explainedSessionId
    ? ruleExplanationBySessionId[explainedSessionId] ?? null
    : null;
  const isExplainedRuleLoading = explainedSessionId
    ? Boolean(loadingExplanationBySessionId[explainedSessionId])
    : false;
  const explainedRuleError = ruleExplanationErrorByView[view];
  const displayedMarkdown = view === "markdown" ? applyMarkdownRules(artifact, activeRules) : artifact;
  const isDiscarding = discardingByView[view];
  const isSubmittingMessage = submittingMessageByView[view];
  const showGuide = isAdjustModeEnabled && !activeSelection && !guideDismissedByView[view];
  const showPopover = isAdjustModeEnabled && Boolean(activeSelection) && Boolean(activeAnchor);
  const workspaceRect = sectionRef.current?.getBoundingClientRect() ?? null;

  async function refreshFormatRules(targetView: ViewMode) {
    if (!adjustableViews.has(targetView)) {
      return;
    }

    try {
      const rules = await getFormatRules(job.id, targetView);
      setRulesByView((current) => ({
        ...current,
        [targetView]: rules
      }));
    } catch {
      setRulesByView((current) => ({
        ...current,
        [targetView]: []
      }));
    }
  }

  function clearCurrentAdjustmentState(targetView: ViewMode) {
    setDraftMessageByView((current) => ({
      ...current,
      [targetView]: ""
    }));
    setSelectionByView((current) => ({
      ...current,
      [targetView]: null
    }));
    setAnchorByView((current) => ({
      ...current,
      [targetView]: null
    }));
    setSessionDetailByView((current) => ({
      ...current,
      [targetView]: null
    }));
    setSessionSelectionKeyByView((current) => ({
      ...current,
      [targetView]: null
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [targetView]: null
    }));
  }

  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled) {
      setAdjustModeByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }, [isAdjustModeEnabled, isAdjustableView, view]);

  useEffect(() => {
    if (!isAdjustableView) {
      return;
    }

    let cancelled = false;

    void getFormatRules(job.id, view)
      .then((rules) => {
        if (cancelled) {
          return;
        }

        setRulesByView((current) => ({
          ...current,
          [view]: rules
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRulesByView((current) => ({
          ...current,
          [view]: []
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [isAdjustableView, job.id, view]);

  useEffect(() => {
    if (!isAdjustModeEnabled || !isAdjustableView || !activeSelection) {
      return;
    }

    const nextSelectionKey = JSON.stringify(activeSelection);

    if (
      activeSelectionKey === nextSelectionKey &&
      activeSessionDetail &&
      activeSessionDetail.session.importId === job.id
    ) {
      return;
    }

    let cancelled = false;

    setSessionLoadingByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    void createAdjustmentSession(job.id, {
      selection: activeSelection,
      targetFormat: view
    })
      .then((detail) => {
        if (cancelled) {
          return;
        }

        setSessionDetailByView((current) => ({
          ...current,
          [view]: detail
        }));
        setSessionSelectionKeyByView((current) => ({
          ...current,
          [view]: nextSelectionKey
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSessionErrorByView((current) => ({
          ...current,
          [view]:
            error instanceof Error
              ? error.message
              : "Anpassungssession konnte nicht erstellt werden."
        }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setSessionLoadingByView((current) => ({
          ...current,
          [view]: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSelection,
    activeSelectionKey,
    activeSessionDetail,
    isAdjustModeEnabled,
    isAdjustableView,
    job.id,
    view
  ]);

  function toggleAdjustMode() {
    if (!isAdjustableView) {
      return;
    }

    const nextEnabled = !adjustModeByView[view];

    setAdjustModeByView((current) => ({
      ...current,
      [view]: nextEnabled
    }));
    setGuideDismissedByView((current) => ({
      ...current,
      [view]: false
    }));

    if (!nextEnabled) {
      clearCurrentAdjustmentState(view);
    }
  }

  function handleSelectionChange(
    selection: AdjustmentSelection,
    anchor: FloatingAdjustmentAnchor
  ) {
    setSelectionByView((current) => ({
      ...current,
      [view]: selection
    }));
    setAnchorByView((current) => ({
      ...current,
      [view]: anchor
    }));
    setGuideDismissedByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));
  }

  function handleDraftMessageChange(value: string) {
    setDraftMessageByView((current) => ({
      ...current,
      [view]: value
    }));
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSessionDetail) {
      return;
    }

    const content = activeDraftMessage.trim();

    if (!content) {
      return;
    }

    setSubmittingMessageByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    try {
      const nextDetail = await appendAdjustmentMessage(activeSessionDetail.session.id, {
        content
      });

      setSessionDetailByView((current) => ({
        ...current,
        [view]: nextDetail
      }));
      setDraftMessageByView((current) => ({
        ...current,
        [view]: ""
      }));

      if (nextDetail.session.status === "applied") {
        await refreshFormatRules(view);
      }
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Anpassungsnachricht konnte nicht gespeichert werden."
      }));
    } finally {
      setSubmittingMessageByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }

  async function handleDiscardSession() {
    if (!activeSessionDetail) {
      clearCurrentAdjustmentState(view);
      return;
    }

    if (activeSessionDetail.session.status === "applied") {
      clearCurrentAdjustmentState(view);
      return;
    }

    setDiscardingByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    try {
      await discardAdjustmentSession(activeSessionDetail.session.id);
      clearCurrentAdjustmentState(view);
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Anpassungssession konnte nicht verworfen werden."
      }));
    } finally {
      setDiscardingByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }

  async function handleDisableRule(ruleId: string) {
    setDisablingRuleById((current) => ({
      ...current,
      [ruleId]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    try {
      const nextRule = await disableFormatRule(ruleId);

      setRulesByView((current) => ({
        ...current,
        [view]: current[view].map((rule) => (rule.id === nextRule.id ? nextRule : rule))
      }));
      setExplainedRuleIdByView((current) => ({
        ...current,
        [view]: current[view] === ruleId ? null : current[view]
      }));
      setRuleExplanationErrorByView((current) => ({
        ...current,
        [view]: null
      }));
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]: error instanceof Error ? error.message : "Formatregel konnte nicht deaktiviert werden."
      }));
    } finally {
      setDisablingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  async function handleToggleRuleExplanation(rule: FormatRule) {
    if (explainedRuleId === rule.id) {
      setExplainedRuleIdByView((current) => ({
        ...current,
        [view]: null
      }));
      setRuleExplanationErrorByView((current) => ({
        ...current,
        [view]: null
      }));
      return;
    }

    setExplainedRuleIdByView((current) => ({
      ...current,
      [view]: rule.id
    }));
    setRuleExplanationErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    const sourceSessionId = rule.sourceSessionId;

    if (!sourceSessionId || ruleExplanationBySessionId[sourceSessionId]) {
      return;
    }

    setLoadingExplanationBySessionId((current) => ({
      ...current,
      [sourceSessionId]: true
    }));

    try {
      const detail = await getAdjustmentSessionDetail(sourceSessionId);

      setRuleExplanationBySessionId((current) => ({
        ...current,
        [sourceSessionId]: detail
      }));
    } catch (error) {
      setRuleExplanationErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Regelerklärung konnte nicht geladen werden."
      }));
    } finally {
      setLoadingExplanationBySessionId((current) => ({
        ...current,
        [sourceSessionId]: false
      }));
    }
  }

  return (
    <section
      ref={sectionRef}
      className="relative space-y-4 rounded-[1.9rem] border border-border/80 bg-background/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={job.status === "completed" ? "default" : "outline"}>
          {getStatusLabel(job)}
        </Badge>
        {job.summary ? (
          <p className="text-sm text-muted-foreground">
            {job.summary.messageCount} Nachrichten · {job.summary.transcriptWords} Wörter
          </p>
        ) : null}
        {job.status !== "completed" && activeStage ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            {job.status === "queued" ? (
              <Clock3 className="h-4 w-4" />
            ) : (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            )}
            <span>{activeStage.label}</span>
            <span>·</span>
            <span>{elapsedTime}</span>
          </div>
        ) : null}
      </div>

      {job.warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 px-4 py-3 text-sm text-amber-950">
          {job.warnings[0]}
        </div>
      ) : null}

      {job.status === "failed" ? null : job.status === "queued" || job.status === "running" ? (
        <div className="space-y-3">
          <div className="rounded-[1.6rem] border border-border/80 bg-card/75 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              {activeStage?.detail ?? "Transkript wird vorbereitet"}
            </div>
            <div className="space-y-3">
              <div className="h-3 w-40 animate-pulse rounded-full bg-primary/15" />
              <div className="h-4 animate-pulse rounded-full bg-border/80" />
              <div className="h-4 w-11/12 animate-pulse rounded-full bg-border/70" />
              <div className="h-4 w-4/5 animate-pulse rounded-full bg-border/60" />
              <div className="h-24 animate-pulse rounded-[1.4rem] border border-border/70 bg-background/80" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
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
              <Button
                data-testid={`toggle-adjust-mode-${view}`}
                type="button"
                size="sm"
                variant={isAdjustModeEnabled ? "default" : "outline"}
                onClick={toggleAdjustMode}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                {isAdjustModeEnabled ? "Anpassungsmodus beenden" : `${getViewLabel(view)} anpassen`}
              </Button>
            ) : null}
          </div>

          {activeRuleChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeRuleChips.map((rule) => (
                <div
                  key={rule.id}
                  data-testid="active-format-rule"
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                >
                  <span className="max-w-[24rem] truncate font-medium text-foreground">
                    {getRuleLabel(rule)}
                  </span>
                  <button
                    data-testid="active-format-rule-why"
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      void handleToggleRuleExplanation(rule);
                    }}
                  >
                    {explainedRuleId === rule.id ? "Ausblenden" : "Warum?"}
                  </button>
                  <button
                    data-testid="active-format-rule-undo"
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(disablingRuleById[rule.id])}
                    type="button"
                    onClick={() => {
                      void handleDisableRule(rule.id);
                    }}
                  >
                    {disablingRuleById[rule.id] ? "Wird rückgängig gemacht..." : "Rückgängig"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {explainedRule ? (
            <div
              data-testid="active-format-rule-explanation"
              className="rounded-2xl border border-border/80 bg-card/80 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Warum es diese Regel gibt
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {explainedRule.instruction}
                  </p>
                </div>
                <Badge variant="secondary">{getRuleKindLabel(explainedRule.kind)}</Badge>
              </div>

              {isExplainedRuleLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Zugehörige Anpassungssession für diese Regel wird geladen.
                </p>
              ) : explainedRuleError ? (
                <div className="mt-3 rounded-2xl border border-red-300/40 bg-red-100/70 px-3 py-3 text-sm text-red-900">
                  {explainedRuleError}
                </div>
              ) : explainedRuleDetail ? (
                <div className="mt-3 space-y-3 text-sm text-foreground">
                  <div>
                    <p className="font-medium text-foreground">
                      {describeSelectionLabel(explainedRuleDetail.session.selection)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {explainedRuleDetail.session.selection.textQuote}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-background/80 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Begründung
                    </p>
                    <p className="mt-2 text-foreground">
                      {explainedRuleDetail.session.previewArtifact?.rationale ??
                        "Diese Regel wurde aus einer früheren Anpassungssession für diesen Import erzeugt."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-background/80 px-3 py-3 text-muted-foreground">
                    {describeSelectorScope({
                      blockType: explainedRuleDetail.session.selection.blockType,
                      exactLabel: "Diese Regel gilt nur für die ursprüngliche Auswahl.",
                      selector:
                        explainedRuleDetail.session.previewArtifact?.draftRule.selector ??
                        explainedRule.selector,
                      view
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Diese Regel wurde aus einer früheren Anpassungssession für diesen Import erzeugt.
                </p>
              )}
            </div>
          ) : null}

          {activeSessionError && !isAdjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {activeSessionError}
            </div>
          ) : null}

          {view === "reader" ? (
            <ReaderView
              activeRules={activeRules}
              conversation={job.conversation}
              adjustModeEnabled={isAdjustModeEnabled}
              selectedBlock={view === "reader" ? activeSelection : null}
              onSelectBlock={handleSelectionChange}
            />
          ) : view === "markdown" ? (
            <MarkdownView
              content={displayedMarkdown}
              adjustModeEnabled={isAdjustModeEnabled}
              selectedRange={activeSelection}
              onSelectLines={handleSelectionChange}
            />
          ) : (
            <ArtifactView content={artifact} />
          )}

          {showGuide ? (
            <AdjustmentModeGuide
              view={view}
              onDismiss={() => {
                setGuideDismissedByView((current) => ({
                  ...current,
                  [view]: true
                }));
              }}
            />
          ) : null}

          {showPopover && activeSelection && activeAnchor ? (
            <AdjustmentPopover
              anchor={activeAnchor}
              containerRect={workspaceRect}
              draftMessage={activeDraftMessage}
              error={activeSessionError}
              isLoading={activeSessionLoading || isDiscarding}
              isSubmitting={isSubmittingMessage}
              selectionLabel={describeSelectionLabel(activeSelection)}
              selectionQuote={activeSelection.textQuote}
              sessionDetail={activeSessionDetail}
              view={view}
              onClose={() => {
                void handleDiscardSession();
              }}
              onDraftMessageChange={handleDraftMessageChange}
              onSubmitMessage={handleSubmitMessage}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
