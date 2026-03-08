import { useEffect, useState } from "react";
import { Clock3, LoaderCircle, Settings2 } from "lucide-react";

import type { ImportJob } from "@chat-exporter/shared";

import { AdjustmentPanel } from "@/components/format-workspace/adjustment-panel";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import type {
  AdjustmentSelection,
  ViewMode
} from "@/components/format-workspace/types";
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
  const [adjustModeByView, setAdjustModeByView] = useState<Record<ViewMode, boolean>>({
    reader: false,
    markdown: false,
    handover: false,
    json: false
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
  const activeSelection = selectionByView[view];

  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled) {
      setAdjustModeByView((current) => ({
        ...current,
        [view]: false
      }));
    }
  }, [isAdjustModeEnabled, isAdjustableView, view]);

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

          {isAdjustModeEnabled ? (
            <AdjustmentPanel selection={activeSelection} view={view} />
          ) : null}

          {view === "reader" ? (
            <ReaderView
              conversation={job.conversation}
              adjustModeEnabled={isAdjustModeEnabled}
              selectedBlock={view === "reader" ? activeSelection : null}
              onSelectBlock={handleSelectionChange}
            />
          ) : view === "markdown" ? (
            <MarkdownView
              content={artifact}
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
