import { useEffect, useState, type FormEvent } from "react";
import { Clock3, LoaderCircle, Settings2 } from "lucide-react";

import type {
  AdjustmentMetrics,
  AdjustmentSessionDetail,
  FormatRule,
  ImportJob
} from "@chat-exporter/shared";

import { AdjustmentPanel } from "@/components/format-workspace/adjustment-panel";
import { AdjustmentPreviewRender } from "@/components/format-workspace/adjustment-preview-render";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import { applyMarkdownRules } from "@/components/format-workspace/rule-engine";
import type {
  AdjustmentSelection,
  ViewMode
} from "@/components/format-workspace/types";
import {
  getAdjustmentSessionDetail,
  getAdjustmentMetrics,
  applyAdjustmentSession,
  appendAdjustmentMessage,
  createAdjustmentSession,
  discardAdjustmentSession,
  disableFormatRule,
  generateAdjustmentPreview,
  getFormatRules
} from "@/lib/api";
import { describeSelectorScope } from "@/components/format-workspace/rule-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ActiveStage = {
  label: string;
  detail: string;
} | null;

type FormatWorkspaceProps = {
  activeStage: ActiveStage;
  elapsedTime: string;
  job: ImportJob;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
};

const outputViews: { value: ViewMode; label: string }[] = [
  { value: "reader", label: "Reader" },
  { value: "markdown", label: "Markdown" },
  { value: "handover", label: "Handover" },
  { value: "json", label: "JSON" }
];

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

function getRuleLabel(rule: FormatRule) {
  const summary = rule.instruction.trim();

  if (summary.length <= 72) {
    return summary;
  }

  return `${summary.slice(0, 69).trimEnd()}...`;
}

function formatMetricsSummary(metrics: AdjustmentMetrics) {
  const parts: string[] = [];

  if (metrics.counts.rulesApplied > 0) {
    parts.push(`${metrics.counts.rulesApplied} applied`);
  }

  if (metrics.counts.rulesDisabled > 0) {
    parts.push(`${metrics.counts.rulesDisabled} undone`);
  }

  if (metrics.counts.sessionsDiscarded > 0) {
    parts.push(`${metrics.counts.sessionsDiscarded} discarded`);
  }

  if (metrics.counts.clarifications > 0) {
    parts.push(`${metrics.counts.clarifications} clarifications`);
  }

  if (metrics.counts.previewFailures > 0) {
    parts.push(`${metrics.counts.previewFailures} preview failures`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No adjustments applied in this format yet.";
}

function describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `Markdown lines ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${selection.messageRole} message ${selection.messageIndex + 1} · ${selection.blockType}`;
}

function getStatusLabel(job: ImportJob) {
  if (job.status === "completed") {
    return "Ready";
  }

  if (job.status === "failed") {
    return "Failed";
  }

  if (job.status === "queued") {
    return "Queued";
  }

  return "Importing";
}

function renderArtifact(view: Exclude<ViewMode, "reader">, job: ImportJob) {
  if (!job.artifacts) {
    return "Artifact not available yet.";
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
  const [previewingByView, setPreviewingByView] = useState<Record<ViewMode, boolean>>({
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
  const [applyingByView, setApplyingByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
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
  const [metricsByView, setMetricsByView] = useState<Record<ViewMode, AdjustmentMetrics | null>>({
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
  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  const isAdjustableView = adjustableViews.has(view);
  const isAdjustModeEnabled = adjustModeByView[view];
  const activeDraftMessage = draftMessageByView[view];
  const activeSessionDetail = sessionDetailByView[view];
  const activeSessionError = sessionErrorByView[view];
  const activeSessionLoading = sessionLoadingByView[view];
  const activeSelection = selectionByView[view];
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
  const activeMetrics = metricsByView[view];
  const displayedMarkdown = view === "markdown" ? applyMarkdownRules(artifact, activeRules) : artifact;
  const isApplying = applyingByView[view];
  const isDiscarding = discardingByView[view];
  const isSubmittingMessage = submittingMessageByView[view];
  const isPreviewing = previewingByView[view];
  const previewContent =
    (view === "reader" || view === "markdown") &&
    activeSessionDetail?.session.previewArtifact ? (
      <AdjustmentPreviewRender
        activeRules={activeRules}
        conversation={job.conversation}
        markdownContent={view === "markdown" ? artifact : ""}
        preview={activeSessionDetail.session.previewArtifact}
        selection={activeSessionDetail.session.selection}
      />
    ) : null;

  async function refreshAdjustmentMetrics(targetView: ViewMode) {
    if (!adjustableViews.has(targetView)) {
      return;
    }

    try {
      const metrics = await getAdjustmentMetrics(job.id, targetView);
      setMetricsByView((current) => ({
        ...current,
        [targetView]: metrics
      }));
    } catch {
      setMetricsByView((current) => ({
        ...current,
        [targetView]: null
      }));
    }
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
    if (!isAdjustableView) {
      return;
    }

    void refreshAdjustmentMetrics(view);
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
        void refreshAdjustmentMetrics(view);
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
              : "Adjustment session could not be created."
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

    setAdjustModeByView((current) => ({
      ...current,
      [view]: !current[view]
    }));
  }

  function handleSelectionChange(selection: AdjustmentSelection | null) {
    setSelectionByView((current) => ({
      ...current,
      [view]: selection
    }));
  }

  function handleDraftMessageChange(value: string) {
    setDraftMessageByView((current) => ({
      ...current,
      [view]: value
    }));
  }

  function clearCurrentAdjustmentState() {
    setDraftMessageByView((current) => ({
      ...current,
      [view]: ""
    }));
    setSelectionByView((current) => ({
      ...current,
      [view]: null
    }));
    setSessionDetailByView((current) => ({
      ...current,
      [view]: null
    }));
    setSessionSelectionKeyByView((current) => ({
      ...current,
      [view]: null
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
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
      void refreshAdjustmentMetrics(view);
      setDraftMessageByView((current) => ({
        ...current,
        [view]: ""
      }));
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Adjustment message could not be saved."
      }));
    } finally {
      setSubmittingMessageByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }

  async function handleGeneratePreview() {
    if (!activeSessionDetail) {
      return;
    }

    setPreviewingByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    try {
      const nextDetail = await generateAdjustmentPreview(activeSessionDetail.session.id);

      setSessionDetailByView((current) => ({
        ...current,
        [view]: nextDetail
      }));
      void refreshAdjustmentMetrics(view);
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Adjustment preview could not be generated."
      }));
      void refreshAdjustmentMetrics(view);
    } finally {
      setPreviewingByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }

  async function handleApplyPreview() {
    if (!activeSessionDetail?.session.previewArtifact) {
      return;
    }

    setApplyingByView((current) => ({
      ...current,
      [view]: true
    }));
    setSessionErrorByView((current) => ({
      ...current,
      [view]: null
    }));

    try {
      const result = await applyAdjustmentSession(activeSessionDetail.session.id);

      setSessionDetailByView((current) => ({
        ...current,
        [view]: {
          ...activeSessionDetail,
          session: result.session
        }
      }));
      setRulesByView((current) => ({
        ...current,
        [view]: [result.rule, ...current[view]]
      }));
      void refreshAdjustmentMetrics(view);
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Adjustment rule could not be applied."
      }));
    } finally {
      setApplyingByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }

  async function handleDiscardSession() {
    if (!activeSessionDetail) {
      clearCurrentAdjustmentState();
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
      clearCurrentAdjustmentState();
      void refreshAdjustmentMetrics(view);
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]:
          error instanceof Error ? error.message : "Adjustment session could not be discarded."
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
      void refreshAdjustmentMetrics(view);
    } catch (error) {
      setSessionErrorByView((current) => ({
        ...current,
        [view]: error instanceof Error ? error.message : "Format rule could not be disabled."
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
          error instanceof Error ? error.message : "Rule explanation could not be loaded."
      }));
    } finally {
      setLoadingExplanationBySessionId((current) => ({
        ...current,
        [sourceSessionId]: false
      }));
    }
  }

  return (
    <section className="space-y-4 rounded-[1.9rem] border border-border/80 bg-background/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={job.status === "completed" ? "default" : "outline"}>
          {getStatusLabel(job)}
        </Badge>
        {job.summary ? (
          <p className="text-sm text-muted-foreground">
            {job.summary.messageCount} messages · {job.summary.transcriptWords} words
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
              {activeStage?.detail ?? "Preparing transcript"}
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
                {isAdjustModeEnabled ? "Exit adjust mode" : `Adjust ${view}`}
              </Button>
            ) : null}
          </div>

          {isAdjustableView && activeMetrics ? (
            <div className="rounded-2xl border border-border/80 bg-card/75 px-4 py-3 text-sm text-muted-foreground">
              {formatMetricsSummary(activeMetrics)}
            </div>
          ) : null}

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
                    {explainedRuleId === rule.id ? "Hide" : "Why"}
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
                    {disablingRuleById[rule.id] ? "Undoing..." : "Undo"}
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
                    Why this exists
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {explainedRule.instruction}
                  </p>
                </div>
                <Badge variant="secondary">{explainedRule.kind}</Badge>
              </div>

              {isExplainedRuleLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Loading the source adjustment session for this rule.
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
                      Reasoning
                    </p>
                    <p className="mt-2 text-foreground">
                      {explainedRuleDetail.session.previewArtifact?.rationale ??
                        "This rule was created from a previous adjustment session for this import."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-background/80 px-3 py-3 text-muted-foreground">
                    {describeSelectorScope({
                      blockType: explainedRuleDetail.session.selection.blockType,
                      exactLabel: "This rule applies only to the original selection.",
                      selector:
                        explainedRuleDetail.session.previewArtifact?.draftRule.selector ??
                        explainedRule.selector,
                      view
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  This rule was created from an earlier adjustment session for this import.
                </p>
              )}
            </div>
          ) : null}

          {activeSessionError && !isAdjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {activeSessionError}
            </div>
          ) : null}

          {isAdjustModeEnabled ? (
            <AdjustmentPanel
              draftMessage={activeDraftMessage}
              error={activeSessionError}
              isApplying={isApplying}
              isDiscarding={isDiscarding}
              isLoading={activeSessionLoading}
              isPreviewing={isPreviewing}
              isSubmitting={isSubmittingMessage}
              onApplyPreview={handleApplyPreview}
              onDiscardSession={handleDiscardSession}
              onDraftMessageChange={handleDraftMessageChange}
              onGeneratePreview={handleGeneratePreview}
              onSubmitMessage={handleSubmitMessage}
              previewContent={previewContent}
              selection={activeSelection}
              sessionDetail={activeSessionDetail}
              view={view}
            />
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
        </div>
      )}
    </section>
  );
}
