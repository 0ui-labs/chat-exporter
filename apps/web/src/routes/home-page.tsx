import { startTransition, useEffect, useState, type FormEvent } from "react";
import {
  Clock3,
  ExternalLink,
  LoaderCircle
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { Block, ImportJob } from "@chat-exporter/shared";

import { createImport, getImport, listImports } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ViewMode = "reader" | "markdown" | "handover" | "json";

const outputViews: { value: ViewMode; label: string }[] = [
  { value: "reader", label: "Reader" },
  { value: "markdown", label: "Markdown" },
  { value: "handover", label: "Handover" },
  { value: "json", label: "JSON" }
];

const importStages = {
  validate: {
    label: "Validating link",
    detail: "Checking the link and choosing the right importer."
  },
  fetch: {
    label: "Fetching page",
    detail: "Opening the shared page and capturing the source."
  },
  extract: {
    label: "Extracting messages",
    detail: "Pulling the conversation out of the provider markup."
  },
  normalize: {
    label: "Cleaning transcript",
    detail: "Converting the raw fragments into readable messages."
  },
  structure: {
    label: "Repairing structure",
    detail: "Fixing sections that need an extra cleanup pass."
  },
  render: {
    label: "Rendering outputs",
    detail: "Preparing the reader and export formats."
  },
  done: {
    label: "Ready",
    detail: "The transcript is ready."
  }
} as const;

function getSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function formatSourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    const value = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`.replace(/\/$/, "");
    return value.length > 46 ? `${value.slice(0, 43)}...` : value;
  } catch {
    return url.length > 46 ? `${url.slice(0, 43)}...` : url;
  }
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

function getActiveStage(job: ImportJob) {
  if (job.status === "queued") {
    return {
      label: "Waiting to start",
      detail: "The job is queued and will start as soon as a worker is free."
    };
  }

  if (job.status === "completed") {
    return importStages.done;
  }

  return importStages[job.currentStage];
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

function renderBlock(block: Block) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-7 text-foreground/90">{block.text}</p>;
    case "heading": {
      const Tag = `h${Math.min(block.level + 1, 6)}` as keyof JSX.IntrinsicElements;
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
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">{block.language}</p>
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
                    <td
                      key={`${rowIndex}-${cell}`}
                      className="px-4 py-3 align-top text-muted-foreground"
                    >
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

function renderArtifact(view: Exclude<ViewMode, "reader">, job: ImportJob | null) {
  if (!job?.artifacts) {
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

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeImportId = searchParams.get("import");

  const [url, setUrl] = useState("");
  const [hasEditedUrl, setHasEditedUrl] = useState(false);
  const [view, setView] = useState<ViewMode>("reader");
  const [error, setError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function refreshRecentJobs() {
      try {
        const jobs = await listImports();

        if (cancelled) {
          return;
        }

        setRecentJobs(
          jobs
            .slice()
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .slice(0, 2)
        );
      } catch {
        if (!cancelled) {
          setRecentJobs([]);
        }
      }
    }

    void refreshRecentJobs();

    return () => {
      cancelled = true;
    };
  }, [activeImportId]);

  useEffect(() => {
    setView("reader");
  }, [activeImportId]);

  useEffect(() => {
    if (!activeImportId) {
      setJob(null);
      setJobError(null);
      return;
    }

    const importId = activeImportId;
    let cancelled = false;
    let intervalId: number | undefined;

    async function refreshJob() {
      try {
        const nextJob = await getImport(importId);

        if (cancelled) {
          return;
        }

        setJob(nextJob);
        setJobError(null);

        if (nextJob.status === "completed" || nextJob.status === "failed") {
          if (intervalId) {
            window.clearInterval(intervalId);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setJobError(
            loadError instanceof Error ? loadError.message : "Import job could not be loaded."
          );
        }
      }
    }

    void refreshJob();
    intervalId = window.setInterval(() => {
      void refreshJob();
    }, 1200);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeImportId]);

  useEffect(() => {
    if (!job) {
      return;
    }

    if (!hasEditedUrl) {
      setUrl(job.sourceUrl);
    }
  }, [hasEditedUrl, job]);

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

  function setActiveImport(importId: string | null) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (importId) {
      nextSearchParams.set("import", importId);
    } else {
      nextSearchParams.delete("import");
    }

    setSearchParams(nextSearchParams);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const nextJob = await createImport({ url, mode: "archive" });

      setHasEditedUrl(false);
      setJob(nextJob);
      setJobError(null);
      startTransition(() => {
        setActiveImport(nextJob.id);
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "The import could not be started."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectJob(selectedJob: ImportJob) {
    setError(null);
    setJobError(null);
    setHasEditedUrl(false);
    setUrl(selectedJob.sourceUrl);
    setJob(selectedJob);
    startTransition(() => {
      setActiveImport(selectedJob.id);
    });
  }

  const activeStage = job ? getActiveStage(job) : null;
  const activeSourceUrl = getSafeExternalUrl(job?.sourceUrl ?? url);
  const createdAtMs = job ? Date.parse(job.createdAt) : Number.NaN;
  const elapsedTime = formatElapsed(now - createdAtMs);
  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  const showRecentJobs = !activeImportId && recentJobs.length > 0;
  const showInlineOriginalButton = Boolean(job && activeSourceUrl);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="overflow-hidden border-border/90 bg-card/92 shadow-panel">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-6">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Input
                    aria-label="Share link"
                    className={cn(
                      "h-12 pr-4 text-base",
                      showInlineOriginalButton ? "pr-24 sm:pr-40" : null
                    )}
                    inputMode="url"
                    placeholder="https://chatgpt.com/share/... or another public AI share link"
                    value={url}
                    onChange={(event) => {
                      setHasEditedUrl(true);
                      setUrl(event.target.value);
                    }}
                  />

                  {showInlineOriginalButton ? (
                    <a
                      className="absolute right-2 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg border border-border bg-background/95 px-3 text-xs font-medium text-foreground transition hover:bg-foreground/5"
                      href={activeSourceUrl ?? undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="sm:hidden">Open</span>
                      <span className="hidden sm:inline">Open original</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>

                <Button className="h-12 px-5 lg:min-w-[8rem]" disabled={submitting} type="submit">
                  {submitting ? "Importing..." : "Import"}
                </Button>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                  {error}
                </div>
              ) : null}
            </form>

            {showRecentJobs ? (
              <section className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Recent imports
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentJobs.map((recentJob) => (
                    <button
                      key={recentJob.id}
                      className={cn(
                        "inline-flex max-w-full items-center rounded-full border px-4 py-2 text-sm transition",
                        activeImportId === recentJob.id
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/80 bg-background/65 text-foreground hover:bg-foreground/5"
                      )}
                      type="button"
                      onClick={() => handleSelectJob(recentJob)}
                    >
                      <span className="max-w-[22rem] truncate">{formatSourceLabel(recentJob.sourceUrl)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {jobError ? (
              <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                {jobError}
              </div>
            ) : job ? (
              <section className="space-y-4 rounded-[1.9rem] border border-border/80 bg-background/70 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={job.status === "completed" ? "default" : "outline"}>
                    {job.status === "completed"
                      ? "Ready"
                      : job.status === "failed"
                        ? "Failed"
                        : job.status === "queued"
                          ? "Queued"
                          : "Importing"}
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
                    <div className="flex flex-wrap gap-2">
                      {outputViews.map((outputView) => (
                        <Button
                          key={outputView.value}
                          type="button"
                          size="sm"
                          variant={view === outputView.value ? "default" : "outline"}
                          onClick={() => setView(outputView.value)}
                        >
                          {outputView.label}
                        </Button>
                      ))}
                    </div>

                    {view === "reader" ? (
                      job.conversation?.messages?.length ? (
                        <div className="space-y-3">
                          {job.conversation.messages.map((message, index) => (
                            <article
                              key={message.id}
                              className={cn(
                                "rounded-[1.55rem] border border-border/80 px-4 py-5 sm:px-5",
                                message.role === "assistant"
                                  ? "bg-card/92"
                                  : "bg-secondary/30"
                              )}
                            >
                              <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                <span>{message.role}</span>
                                <span>{index + 1}</span>
                              </div>
                              <div className="space-y-4">
                                {message.blocks.map((block, blockIndex) => (
                                  <div key={`${message.id}-${block.type}-${blockIndex}`}>
                                    {renderBlock(block)}
                                  </div>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-border/80 bg-card/75 px-4 py-5 text-sm text-muted-foreground">
                          No transcript content is available for this import.
                        </div>
                      )
                    ) : (
                      <div className="rounded-[1.6rem] border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          <code>{artifact}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
