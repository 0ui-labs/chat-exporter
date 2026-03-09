import type { ImportJob } from "@chat-exporter/shared";
import { Clock3, LoaderCircle, Settings2 } from "lucide-react";
import { useRef } from "react";

import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import {
  getBlockTypeLabel,
  getRoleLabel,
  getViewLabel,
} from "@/components/format-workspace/labels";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import { applyMarkdownRules } from "@/components/format-workspace/rule-engine";
import { RulesListPopover } from "@/components/format-workspace/rules-list-popover";
import type {
  AdjustmentSelection,
  ViewMode,
} from "@/components/format-workspace/types";
import { useAdjustmentPopover } from "@/components/format-workspace/use-adjustment-popover";
import { useAdjustmentSession } from "@/components/format-workspace/use-adjustment-session";
import { useFormatRules } from "@/components/format-workspace/use-format-rules";
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
  { value: "json", label: getViewLabel("json") },
];

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

function _describeSelectionLabel(selection: AdjustmentSelection) {
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
  onViewChange,
}: FormatWorkspaceProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isAdjustableView = adjustableViews.has(view);

  const session = useAdjustmentSession(view, job.id, sectionRef);

  const rules = useFormatRules(view, job.id, session.activeSessionDetail, () =>
    session.setReplyVisible(false),
  );

  const { containerDimensions } = useAdjustmentPopover(sectionRef);

  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  const displayedMarkdown =
    view === "markdown"
      ? applyMarkdownRules(artifact, rules.activeRules)
      : artifact;
  const showPopover =
    session.adjustModeEnabled &&
    Boolean(session.activeSelection) &&
    Boolean(session.activeAnchor);

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
            {job.summary.messageCount} Nachrichten ·{" "}
            {job.summary.transcriptWords} Wörter
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

      {job.status === "failed" ? null : job.status === "queued" ||
        job.status === "running" ? (
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
              <div className="flex items-center gap-2">
                <RulesListPopover
                  disablingRuleById={rules.disablingRuleById}
                  rules={rules.activeRules}
                  view={view}
                  onDisableRule={(ruleId) => {
                    void rules.handleDisableRule(ruleId);
                  }}
                  onHoverRule={(ruleId) => rules.setHoveredRuleId(ruleId)}
                  onLeaveRule={() => rules.setHoveredRuleId(null)}
                />
                <Button
                  data-testid={`toggle-adjust-mode-${view}`}
                  type="button"
                  size="sm"
                  variant={session.adjustModeEnabled ? "default" : "outline"}
                  onClick={session.toggleAdjustMode}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {session.adjustModeEnabled
                    ? "Anpassungsmodus beenden"
                    : `${getViewLabel(view)} anpassen`}
                </Button>
              </div>
            ) : null}
          </div>

          {session.activeSessionError && !session.adjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {session.activeSessionError}
            </div>
          ) : null}

          {view === "reader" ? (
            <ReaderView
              activeRules={rules.activeRules}
              conversation={job.conversation}
              adjustModeEnabled={session.adjustModeEnabled}
              highlightedRuleId={rules.hoveredRuleId}
              selectedBlock={view === "reader" ? session.activeSelection : null}
              onSelectBlock={session.handleSelectionChange}
            />
          ) : view === "markdown" ? (
            <MarkdownView
              activeRules={rules.activeRules}
              content={displayedMarkdown}
              adjustModeEnabled={session.adjustModeEnabled}
              highlightedRuleId={rules.hoveredRuleId}
              selectedRange={session.activeSelection}
              onSelectLines={session.handleSelectionChange}
            />
          ) : (
            <ArtifactView content={artifact} />
          )}

          {session.showGuide ? (
            <AdjustmentModeGuide
              view={view}
              onDismiss={() => session.setGuideDismissed(true)}
            />
          ) : null}

          {showPopover && session.activeSelection && session.activeAnchor ? (
            <AdjustmentPopover
              anchor={session.activeAnchor}
              containerDimensions={containerDimensions}
              containerScrollTop={sectionRef.current?.scrollTop ?? 0}
              draftMessage={session.activeDraftMessage}
              error={session.activeSessionError}
              isLoading={session.activeSessionLoading || session.isDiscarding}
              isSubmitting={session.isSubmitting}
              sessionDetail={session.activeSessionDetail}
              showReply={session.replyVisible}
              view={view}
              onClose={() => {
                session.handleDiscardSession();
              }}
              onDraftMessageChange={session.handleDraftMessageChange}
              onRejectLastChange={() => {
                void rules.handleRejectLastChange();
              }}
              onSubmitMessage={session.handleSubmitMessage}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
