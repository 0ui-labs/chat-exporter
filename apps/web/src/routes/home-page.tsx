import { startTransition, useEffect, useState, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { ImportJob } from "@chat-exporter/shared";

import { FormatWorkspace } from "@/components/format-workspace/format-workspace";
import type { ViewMode } from "@/components/format-workspace/types";
import { createImport, getImport, listImports } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
              <FormatWorkspace
                activeStage={activeStage}
                elapsedTime={elapsedTime}
                job={job}
                view={view}
                onViewChange={setView}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
