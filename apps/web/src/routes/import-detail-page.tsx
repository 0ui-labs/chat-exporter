import { useEffect, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCode2,
  FileJson2,
  FileText,
  Layers3,
  LoaderCircle
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  Block,
  ImportJob,
  ImportSnapshot,
  NormalizedSnapshotMessage
} from "@chat-exporter/shared";

import { getImport, getImportSnapshot } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type ViewMode = "reader" | "markdown" | "handover" | "json" | "debug";
type DebugPanel = "compare" | "payload" | "raw-html";

const views: { value: ViewMode; label: string; icon: typeof Layers3 }[] = [
  { value: "reader", label: "Reader", icon: Layers3 },
  { value: "markdown", label: "Markdown", icon: FileText },
  { value: "handover", label: "Handover", icon: FileCode2 },
  { value: "json", label: "JSON", icon: FileJson2 },
  { value: "debug", label: "Debug", icon: Bug }
];

const debugPanels: { value: DebugPanel; label: string }[] = [
  { value: "compare", label: "Raw vs normalized" },
  { value: "payload", label: "Normalized payload" },
  { value: "raw-html", label: "Raw HTML" }
];

const importStages = [
  {
    value: "validate",
    label: "Validate link",
    description: "Check the URL and choose the correct importer.",
    cue: "checking the share link"
  },
  {
    value: "fetch",
    label: "Fetch page",
    description: "Open the share page and persist the raw HTML snapshot.",
    cue: "fetching the original page"
  },
  {
    value: "extract",
    label: "Extract messages",
    description: "Pull message candidates out of the provider-specific markup.",
    cue: "extracting message candidates"
  },
  {
    value: "normalize",
    label: "Normalize content",
    description: "Convert the raw fragments into stable conversation blocks.",
    cue: "normalizing the conversation"
  },
  {
    value: "structure",
    label: "Repair structure",
    description: "Apply optional cleanup when the source markup needs it.",
    cue: "repairing the structure"
  },
  {
    value: "render",
    label: "Render outputs",
    description: "Build the final reader, markdown, handover, and JSON artifacts.",
    cue: "rendering the final outputs"
  },
  {
    value: "done",
    label: "Ready",
    description: "Persist artifacts and unlock every output view.",
    cue: "finishing the last hand-off"
  }
] as const satisfies ReadonlyArray<{
  value: ImportJob["currentStage"];
  label: string;
  description: string;
  cue: string;
}>;

const outputPreviews = [
  {
    title: "Reader",
    body: "A clean transcript layout for reading and scanning the conversation."
  },
  {
    title: "Markdown",
    body: "Portable text you can paste into notes, docs, or a repository."
  },
  {
    title: "Handover",
    body: "A compact transcript optimized for continuing elsewhere."
  },
  {
    title: "JSON + Debug",
    body: "Structured payloads and raw extraction traces for inspection."
  }
] as const;

function getStatusCopy(status: ImportJob["status"]) {
  switch (status) {
    case "completed":
      return {
        badge: "Ready",
        message: "Your conversation is ready to read, copy, or continue elsewhere."
      };
    case "running":
      return {
        badge: "Importing",
        message: "We are preparing your conversation now. This page updates automatically."
      };
    case "queued":
      return {
        badge: "Queued",
        message: "Your conversation is in line and will appear here in a moment."
      };
    case "failed":
      return {
        badge: "Failed",
        message: "This conversation could not be prepared."
      };
  }
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getStageMeta(stage: ImportJob["currentStage"]) {
  return importStages.find((item) => item.value === stage) ?? importStages[0];
}

function getActiveStageMeta(job: ImportJob) {
  if (job.status === "queued") {
    return {
      label: "Waiting to start",
      description: "The import job exists and will begin as soon as the worker picks it up.",
      cue: "waiting for a worker slot"
    };
  }

  if (job.status === "completed") {
    return getStageMeta("done");
  }

  return getStageMeta(job.currentStage);
}

function getStageState(stage: ImportJob["currentStage"], job: ImportJob) {
  if (job.status === "completed") {
    return "complete";
  }

  const currentIndex = importStages.findIndex((item) => item.value === job.currentStage);
  const stageIndex = importStages.findIndex((item) => item.value === stage);

  if (stageIndex < currentIndex) {
    return "complete";
  }

  if (stageIndex === currentIndex) {
    return "active";
  }

  return "upcoming";
}

function formatElapsed(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "just now";
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [block.headers.join(" "), ...block.rows.map((row) => row.join(" "))].join(" ");
  }
}

function getMessagePreview(message: NormalizedSnapshotMessage) {
  const source = (message.rawText ?? message.blocks.map(blockToPlainText).join(" "))
    .replace(/\s+/g, " ")
    .trim();

  if (!source) {
    return "No preview text available.";
  }

  return source.length > 160 ? `${source.slice(0, 157)}…` : source;
}

function truncatePreview(value: string, limit: number) {
  if (value.length <= limit) {
    return {
      text: value,
      truncated: false
    };
  }

  return {
    text: `${value.slice(0, limit)}\n…`,
    truncated: true
  };
}

function renderBlock(block: Block) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-7 text-foreground/90">{block.text}</p>;
    case "heading": {
      const Tag = (`h${Math.min(block.level + 1, 6)}` as keyof JSX.IntrinsicElements);
      return <Tag className="font-semibold text-foreground">{block.text}</Tag>;
    }
    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-4 text-sm italic leading-7 text-foreground/80">
          {block.text}
        </blockquote>
      );
    case "code":
      return (
        <div className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-sm text-zinc-100">
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
            {block.language}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
            <code>{block.text}</code>
          </pre>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/70 text-secondary-foreground">
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${rowIndex}-${row.join("-")}`} className="border-t border-border/80">
                  {row.map((cell) => (
                    <td key={`${rowIndex}-${cell}`} className="px-4 py-3 align-top text-muted-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function ImportDetailPage() {
  const navigate = useNavigate();
  const { importId } = useParams();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("reader");
  const [debugPanel, setDebugPanel] = useState<DebugPanel>("compare");
  const [snapshot, setSnapshot] = useState<ImportSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [selectedCompareMessageId, setSelectedCompareMessageId] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setSnapshotError(null);
    setLoadingSnapshot(false);
    setSelectedCompareMessageId(null);
  }, [importId]);

  useEffect(() => {
    if (!importId) {
      setError("Import id missing.");
      return;
    }

    const jobId = importId;
    let cancelled = false;
    let intervalId: number | undefined;

    async function refresh() {
      try {
        const nextJob = await getImport(jobId);
        if (cancelled) {
          return;
        }

        setJob(nextJob);
        setError(null);

        if (nextJob.status === "completed" || nextJob.status === "failed") {
          if (intervalId) {
            window.clearInterval(intervalId);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Import job could not be loaded."
          );
        }
      }
    }

    void refresh();
    intervalId = window.setInterval(() => {
      void refresh();
    }, 1200);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [importId]);

  useEffect(() => {
    if (!importId || view !== "debug" || job?.status !== "completed" || snapshot || loadingSnapshot) {
      return;
    }

    let cancelled = false;

    setLoadingSnapshot(true);
    setSnapshotError(null);

    void getImportSnapshot(importId)
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSnapshotError(
            loadError instanceof Error
              ? loadError.message
              : "Import snapshot could not be loaded."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSnapshot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importId, job?.status, snapshot, view]);

  useEffect(() => {
    const messages = snapshot?.normalizedPayload.messages ?? [];

    if (messages.length === 0) {
      setSelectedCompareMessageId(null);
      return;
    }

    setSelectedCompareMessageId((currentSelection) => {
      if (currentSelection && messages.some((message) => message.id === currentSelection)) {
        return currentSelection;
      }

      return messages[0]?.id ?? null;
    });
  }, [snapshot]);

  useEffect(() => {
    setNow(Date.now());

    if (!job || job.status === "completed" || job.status === "failed") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [job]);

  const compareMessages = snapshot?.normalizedPayload.messages ?? [];
  const structuring = snapshot?.normalizedPayload.structuring;
  const selectedCompareMessage =
    compareMessages.find((message) => message.id === selectedCompareMessageId) ??
    compareMessages[0] ??
    null;
  const hasRawCompareData = compareMessages.some((message) => message.rawText || message.rawHtml);
  const selectedCompareRawText = selectedCompareMessage?.rawText
    ? truncatePreview(selectedCompareMessage.rawText, 8_000)
    : null;
  const selectedCompareRawHtml = selectedCompareMessage?.rawHtml
    ? truncatePreview(selectedCompareMessage.rawHtml, 6_000)
    : null;
  const isCompleted = job?.status === "completed";
  const activeStage = job ? getActiveStageMeta(job) : null;
  const createdAtMs = job ? Date.parse(job.createdAt) : Number.NaN;
  const updatedAtMs = job ? Date.parse(job.updatedAt) : Number.NaN;
  const elapsedTime = formatElapsed(now - createdAtMs);
  const updatedAgo = formatAge(now - updatedAtMs);

  const artifact =
    view === "markdown"
      ? job?.artifacts?.markdown ?? ""
      : view === "handover"
        ? job?.artifacts?.handover ?? ""
        : view === "json"
          ? job?.artifacts?.json ?? ""
          : "";

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/")}>Back to importer</Button>
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardHeader className="gap-5">
          <div className="flex items-start gap-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
            <div className="space-y-2">
              <CardTitle>Loading import</CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-foreground/80">
                The live status view is connecting to the import job now.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
            <div className="h-3 w-32 animate-pulse rounded-full bg-primary/15" />
            <div className="mt-4 space-y-2">
              <div className="h-3 animate-pulse rounded-full bg-border/80" />
              <div className="h-3 w-11/12 animate-pulse rounded-full bg-border/70" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-border/60" />
            </div>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
            <div className="h-3 w-24 animate-pulse rounded-full bg-primary/15" />
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-2xl border border-border/70 bg-card/70"
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import failed</CardTitle>
          <CardDescription>
            {job.error ?? "The import pipeline stopped before a conversation could be extracted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-4 text-amber-950">
              <p className="mb-2 font-medium">Import warnings</p>
              <ul className="space-y-2">
                {job.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button onClick={() => navigate("/")}>Back to importer</Button>
        </CardContent>
      </Card>
    );
  }

  const statusCopy = getStatusCopy(job.status);
  const sourceHost = getSourceHost(job.sourceUrl);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Conversation</CardTitle>
                <Badge variant={job.status === "completed" ? "default" : "outline"}>
                  {statusCopy.badge}
                </Badge>
              </div>
              <CardDescription className="max-w-3xl text-base leading-7 text-foreground/80">
                {statusCopy.message}
              </CardDescription>
              {!isCompleted && activeStage ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-primary">
                    {job.status === "queued" ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    )}
                    {activeStage.label}
                  </span>
                  <span>Started {elapsedTime} ago</span>
                  <span>Last update {updatedAgo}</span>
                </div>
              ) : null}
            </div>

            <Button className="w-full xl:w-auto" variant="outline" onClick={() => navigate("/")}>
              Create another import
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,1fr)]">
            <div className="rounded-2xl bg-secondary p-5 text-secondary-foreground">
              <p className="text-xs uppercase tracking-[0.18em] text-secondary-foreground/60">
                Original conversation
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-secondary-foreground/85">
                  Open the original share page on {sourceHost}.
                </p>
                <a
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/5"
                  href={job.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open original
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {job.summary ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Messages
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{job.summary.messageCount}</p>
                </div>
                <div className="rounded-2xl border border-border/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Words
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{job.summary.transcriptWords}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.75rem] border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-start gap-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-panel">
                    {job.status === "queued" ? (
                      <Clock3 className="h-5 w-5" />
                    ) : (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-primary/80">
                      Current step
                    </p>
                    <p className="text-lg font-semibold text-foreground">{activeStage?.label}</p>
                    <p className="text-sm leading-6 text-foreground/75">
                      {activeStage?.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-primary/15 bg-background/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Time since start
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{elapsedTime}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Visible proof that the job is still moving.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-primary/15 bg-background/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Live polling
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{updatedAgo}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Last server update seen by this page.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {importStages
                    .filter((stage) => stage.value !== "done")
                    .map((stage) => {
                      const stageState = getStageState(stage.value, job);

                      return (
                        <div
                          key={stage.value}
                          className={cn(
                            "rounded-2xl border p-3 transition-colors",
                            stageState === "active"
                              ? "border-primary/30 bg-primary/10"
                              : stageState === "complete"
                                ? "border-border/80 bg-background/80"
                                : "border-border/60 bg-background/60"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-full",
                                stageState === "active"
                                  ? "bg-primary text-primary-foreground"
                                  : stageState === "complete"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                              )}
                            >
                              {stageState === "active" ? (
                                job.status === "queued" ? (
                                  <Clock3 className="h-4 w-4" />
                                ) : (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                )
                              ) : stageState === "complete" ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <Clock3 className="h-4 w-4" />
                              )}
                            </span>
                            <p className="text-sm font-medium text-foreground">{stage.label}</p>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {stageState === "active"
                              ? stage.description
                              : stageState === "complete"
                                ? "Completed."
                                : "Waiting."}
                          </p>
                        </div>
                      );
                    })}
                </div>

                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  {job.status === "queued"
                    ? "The job is waiting for execution. This page keeps polling and will switch to the active pipeline as soon as the worker starts."
                    : "The page polls the server every 1.2 seconds and unlocks outputs as soon as rendering completes."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Outputs</CardTitle>
            <CardDescription>
              {isCompleted
                ? "Choose how you want to read, copy, or continue this conversation."
                : "Outputs unlock automatically after the import finishes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {views.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  disabled={!isCompleted}
                  variant={isCompleted && view === value ? "default" : "outline"}
                  onClick={() => setView(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>

            <Separator />

            {!isCompleted ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
                <div className="rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-background/85 to-background/65 p-5">
                  <div className="flex items-start gap-4">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-panel">
                      {job.status === "queued" ? (
                        <Clock3 className="h-5 w-5" />
                      ) : (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-primary/80">
                        Preparing outputs
                      </p>
                      <p className="text-xl font-semibold text-foreground">
                        We are still {activeStage?.cue}.
                      </p>
                      <p className="text-sm leading-6 text-foreground/75">
                        As soon as the pipeline reaches render, this area will unlock without a
                        page refresh.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-primary/15 bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Started
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{elapsedTime}</p>
                      <p className="mt-1 text-sm text-muted-foreground">elapsed</p>
                    </div>
                    <div className="rounded-2xl border border-primary/15 bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Last update
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{updatedAgo}</p>
                      <p className="mt-1 text-sm text-muted-foreground">from the server</p>
                    </div>
                    <div className="rounded-2xl border border-primary/15 bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Next unlock
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        Reader + exports
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">appear here automatically</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-background/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">Live placeholder</p>
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                        {job.status === "queued" ? "Queued" : "Running"}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="h-3 w-28 animate-pulse rounded-full bg-primary/15" />
                      <div className="h-4 animate-pulse rounded-full bg-border/80" />
                      <div className="h-4 w-11/12 animate-pulse rounded-full bg-border/70" />
                      <div className="h-4 w-4/5 animate-pulse rounded-full bg-border/60" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="h-20 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
                        <div className="h-20 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-dashed border-border/80 bg-background/55 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    What appears next
                  </p>
                  <div className="mt-4 space-y-3">
                    {outputPreviews.map((preview) => (
                      <div
                        key={preview.title}
                        className="rounded-2xl border border-border/70 bg-card/65 p-4"
                      >
                        <p className="text-sm font-medium text-foreground">{preview.title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {preview.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : view === "reader" ? (
              <div className="space-y-4">
                {job.conversation?.messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-[1.75rem] border border-border/80 p-5",
                      message.role === "user"
                        ? "bg-background/90"
                        : "bg-card/95"
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <Badge variant={message.role === "assistant" ? "default" : "outline"}>
                        {message.role}
                      </Badge>
                    </div>
                    <div className="space-y-4">
                      {message.blocks.map((block, index) => (
                        <div key={`${message.id}-${block.type}-${index}`}>{renderBlock(block)}</div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : view === "debug" ? (
              <div className="space-y-4">
                {loadingSnapshot ? (
                  <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                    Loading persisted snapshot…
                  </div>
                ) : snapshotError ? (
                  <div className="rounded-2xl border border-red-300/40 bg-red-100/60 p-5 text-sm text-red-900">
                    {snapshotError}
                  </div>
                ) : snapshot ? (
                  <>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <Database className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Snapshot size
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.rawHtmlBytes.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">bytes of raw HTML</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <Layers3 className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Article candidates
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.fetchMetadata.articleCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">seen during extraction</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <FileJson2 className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Persisted messages
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.fetchMetadata.messageCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">normalized into IR</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Snapshot metadata
                          </p>
                          <p className="mt-1 text-sm text-foreground">{snapshot.pageTitle}</p>
                        </div>
                        <a
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
                          href={`/api/imports/${snapshot.importId}/snapshot/raw-html`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open raw HTML
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="break-all">
                          <span className="font-medium text-foreground">Final URL:</span>{" "}
                          {snapshot.finalUrl}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Fetched at:</span>{" "}
                          {new Date(snapshot.fetchedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {structuring ? (
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Structuring pass
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{structuring.status}</Badge>
                          <Badge variant="outline">{structuring.provider}</Badge>
                          {structuring.model ? (
                            <Badge variant="outline">{structuring.model}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <div className="rounded-2xl border border-border/80 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Candidates
                            </p>
                            <p className="mt-2 text-xl font-semibold text-foreground">
                              {structuring.candidateCount}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/80 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Attempted
                            </p>
                            <p className="mt-2 text-xl font-semibold text-foreground">
                              {structuring.attemptedCount}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/80 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Repaired
                            </p>
                            <p className="mt-2 text-xl font-semibold text-foreground">
                              {structuring.repairedCount}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/80 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Skipped / failed
                            </p>
                            <p className="mt-2 text-xl font-semibold text-foreground">
                              {structuring.skippedCount + structuring.failedCount}
                            </p>
                          </div>
                        </div>
                        {structuring.skippedReason ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {structuring.skippedReason}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {snapshot.normalizedPayload.warnings.length > 0 ? (
                      <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-5 text-sm text-amber-950">
                        <p className="mb-2 font-medium">Normalization warnings</p>
                        <ul className="space-y-2">
                          {snapshot.normalizedPayload.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      {debugPanels.map((panel) => (
                        <Button
                          key={panel.value}
                          type="button"
                          variant={debugPanel === panel.value ? "default" : "outline"}
                          onClick={() => setDebugPanel(panel.value)}
                        >
                          {panel.label}
                        </Button>
                      ))}
                    </div>

                    {debugPanel === "compare" ? (
                      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Message compare
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Inspect the stored raw fragment beside the normalized block output for a
                            single message at a time.
                          </p>
                          <div className="mt-4 space-y-2">
                            {compareMessages.map((message, index) => (
                              <button
                                key={message.id}
                                type="button"
                                onClick={() => setSelectedCompareMessageId(message.id)}
                                className={cn(
                                  "w-full rounded-2xl border p-3 text-left transition",
                                  selectedCompareMessage?.id === message.id
                                    ? "border-primary bg-primary/10"
                                    : "border-border/80 bg-card/70 hover:bg-foreground/5"
                                )}
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <Badge
                                    variant={message.role === "assistant" ? "default" : "outline"}
                                  >
                                    {message.role}
                                  </Badge>
                                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    #{index + 1}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground/85">
                                  {getMessagePreview(message)}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {message.parser?.strategy === "ai-repair"
                                    ? `AI repaired to ${message.blocks.length} block${message.blocks.length === 1 ? "" : "s"}`
                                    : message.parser?.usedFallback
                                      ? "fallback paragraph"
                                      : `${message.blocks.length} normalized block${message.blocks.length === 1 ? "" : "s"}`}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4 min-w-0">
                          {!hasRawCompareData ? (
                            <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-5 text-sm text-amber-950">
                              This snapshot predates raw fragment capture. Re-import the page to
                              inspect stored raw text and HTML side by side.
                            </div>
                          ) : null}

                          {selectedCompareMessage ? (
                            <>
                              <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                      Selected message
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant={
                                          selectedCompareMessage.role === "assistant"
                                            ? "default"
                                            : "outline"
                                        }
                                      >
                                        {selectedCompareMessage.role}
                                      </Badge>
                                      <Badge variant="outline">
                                        {selectedCompareMessage.blocks.length} block
                                        {selectedCompareMessage.blocks.length === 1 ? "" : "s"}
                                      </Badge>
                                      {selectedCompareMessage.parser?.source ? (
                                        <Badge variant="outline">
                                          {selectedCompareMessage.parser.source}
                                        </Badge>
                                      ) : null}
                                      {selectedCompareMessage.parser?.strategy ? (
                                        <Badge variant="outline">
                                          {selectedCompareMessage.parser.strategy}
                                        </Badge>
                                      ) : null}
                                      {selectedCompareMessage.parser?.model ? (
                                        <Badge variant="outline">
                                          {selectedCompareMessage.parser.model}
                                        </Badge>
                                      ) : null}
                                      {selectedCompareMessage.parser?.usedFallback ? (
                                        <Badge variant="outline">fallback</Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Message id: {selectedCompareMessage.id}
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                                      Raw text
                                    </p>
                                    {selectedCompareRawText?.truncated ? (
                                      <Badge
                                        variant="outline"
                                        className="border-zinc-700 bg-zinc-900 text-zinc-300"
                                      >
                                        truncated preview
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {selectedCompareRawText?.text ??
                                        "No raw text stored for this snapshot message."}
                                    </code>
                                  </pre>
                                </div>

                                <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                                  <p className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    Normalized render
                                  </p>
                                  <div className="space-y-4">
                                    {selectedCompareMessage.blocks.map((block, index) => (
                                      <div
                                        key={`${selectedCompareMessage.id}-${block.type}-${index}`}
                                      >
                                        {renderBlock(block)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                                      Raw HTML fragment
                                    </p>
                                    {selectedCompareRawHtml?.truncated ? (
                                      <Badge
                                        variant="outline"
                                        className="border-zinc-700 bg-zinc-900 text-zinc-300"
                                      >
                                        truncated preview
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {selectedCompareRawHtml?.text ??
                                        "No raw HTML fragment stored for this snapshot message."}
                                    </code>
                                  </pre>
                                </div>

                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
                                    Normalized message JSON
                                  </p>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {JSON.stringify(selectedCompareMessage, null, 2)}
                                    </code>
                                  </pre>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                              No normalized messages were stored in this snapshot.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : debugPanel === "payload" ? (
                      <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                        <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
                          Normalized payload
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          <code>{JSON.stringify(snapshot.normalizedPayload, null, 2)}</code>
                        </pre>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                            Raw HTML preview
                          </p>
                          {snapshot.rawHtmlTruncated ? (
                            <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                              truncated preview
                            </Badge>
                          ) : null}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          <code>{snapshot.rawHtmlPreview}</code>
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                    Snapshot data will appear here after a completed import.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                  <code>{artifact || "Artifact not available yet."}</code>
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
